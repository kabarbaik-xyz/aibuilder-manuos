import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';
import {
  ApproveRecoveryInput,
  ApproveRecoverySchema,
  ProposeRecoveryInput,
  ProposeRecoverySchema,
  RecoveryProposalDTO,
} from './recovery-contracts';
import { generateRecoveryOptions } from '@/engines/recovery';
import { addWorkDays, DEFAULT_CALENDAR } from '@/engines/calendar';


export class RecoveryService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Generates realistic, constraint-checked recovery plan alternatives for an affected order.
   */
  async proposeRecovery(
    principal: Principal,
    rawInput: unknown
  ): Promise<RecoveryProposalDTO> {
    requireAnyPermission(principal, [
      'planning.read',
      'planning.write',
      'order.read',
    ]);

    const input: ProposeRecoveryInput = ProposeRecoverySchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    const order = await this.db.order.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.orderId,
        },
      },
      include: {
        item: true,
        lines: true,
        manufacturingOrders: {
          include: {
            jobsheets: {
              include: {
                tasks: {
                  include: {
                    productionOutputs: {
                      include: {
                        inspections: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order '${input.orderId}' not found`);
    }

    // Compute actual ready QC-passed quantity from inspection records
    let passedAtoms = 0n;
    for (const mo of order.manufacturingOrders) {
      for (const js of mo.jobsheets) {
        for (const task of js.tasks) {
          for (const out of task.productionOutputs) {
            // Recovery is a customer-delivery decision. Intermediate-operation QC
            // does not represent finished goods that can be promised for shipment.
            if (!out.isFinal) continue;
            for (const insp of out.inspections) {
              if (insp.status === 'FINALIZED') {
                passedAtoms += insp.passedAtoms;
              }
            }
          }
        }
      }
    }

    if (order.lines.length > 1) {
      throw new BadRequestError(
        'Recovery proposals currently support single-line orders only; per-line schedule and shipment allocation is required for multi-line orders.'
      );
    }
    if (passedAtoms % 1_000_000n !== 0n || order.orderedAtoms % 1_000_000n !== 0n) {
      throw new BadRequestError(
        'Recovery proposals currently support whole-unit quantities only; fractional quantities cannot be represented safely by this simulator.'
      );
    }
    const readyQtyAtoms = passedAtoms / 1_000_000n;
    const totalQtyAtoms = order.orderedAtoms / 1_000_000n;
    if (readyQtyAtoms > BigInt(Number.MAX_SAFE_INTEGER) || totalQtyAtoms > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestError('Order quantities exceed the safe range supported by this recovery simulator.');
    }
    if (readyQtyAtoms > totalQtyAtoms) {
      throw new BadRequestError('Final QC-passed quantity cannot exceed the order quantity. Reconcile QC evidence before proposing recovery.');
    }
    const readyQcPassedQty = Number(readyQtyAtoms);
    const totalQty = Number(totalQtyAtoms);
    const originalPromisedDate = order.promisedDate
      ? order.promisedDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const projectedDelayedDate = addWorkDays(
      originalPromisedDate,
      input.delayDays,
      DEFAULT_CALENDAR
    );

    const materialArrivesDate =
      input.materialArrivesDate ||
      addWorkDays(originalPromisedDate, Math.max(1, input.delayDays - 1), DEFAULT_CALENDAR);

    const options = generateRecoveryOptions({
      orderId: order.id,
      totalQty,
      readyQcPassedQty,
      disruptionType: input.disruptionType,
      materialArrivesDate,
      originalPromisedDate,
      projectedDelayedDate,
    });

    const proposalId = crypto.randomUUID();
    const proposal: RecoveryProposalDTO = {
      id: proposalId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalQty,
      readyQcPassedQty,
      originalPromisedDate,
      projectedDelayedDate,
      options,
      createdAt: new Date().toISOString(),
    };

    await this.db.recoveryProposal.create({
      data: {
        id: proposalId,
        workspaceId,
        orderId: order.id,
        orderVersion: order.version,
        proposalJson: JSON.stringify(proposal),
      },
    });
    return proposal;
  }

  /**
   * Commits an atomic recovery decision (e.g. split batch delivery promise),
   * updating order promised date/tranches and creating audit trails without fabricating fake production.
   */
  async approveRecovery(
    principal: Principal,
    rawInput: unknown,
    _idempotencyKey?: string
  ) {
    requireAnyPermission(principal, [
      'planning.write',
      'order.release',
      'order.create',
    ]);

    const input: ApproveRecoveryInput = ApproveRecoverySchema.parse(rawInput);
    const workspaceId = principal.workspaceId;

    // Validate order status first
    const preOrder = await this.db.order.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.orderId,
        },
      },
    });

    if (!preOrder) {
      throw new NotFoundError(`Order '${input.orderId}' not found for recovery approval`);
    }

    if (preOrder.status === 'DELIVERED' || preOrder.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot approve recovery for order in status ${preOrder.status}`);
    }

    // Resolve and re-validate persisted recovery proposal
    const persistedProposal = await this.db.recoveryProposal.findFirst({
      where: { id: input.proposalId, workspaceId, orderId: input.orderId },
    });
    if (!persistedProposal) {
      throw new NotFoundError(`Recovery proposal '${input.proposalId}' not found or expired`);
    }
    if (persistedProposal.status !== 'PROPOSED') {
      throw new BadRequestError(`Recovery proposal '${input.proposalId}' is already ${persistedProposal.status.toLowerCase()}`);
    }
    if (persistedProposal.orderVersion !== preOrder.version) {
      throw new BadRequestError(
        `Recovery proposal '${input.proposalId}' is stale because order '${input.orderId}' changed after it was generated.`
      );
    }
    const proposal = JSON.parse(persistedProposal.proposalJson) as RecoveryProposalDTO;
    if (proposal.orderId !== input.orderId) {
      throw new BadRequestError(`Recovery proposal does not match order '${input.orderId}'`);
    }

    const chosenOption = proposal.options.find((o) => o.id === input.optionId);
    if (!chosenOption) {
      throw new NotFoundError(`Option '${input.optionId}' not found in recovery proposal`);
    }
    if (!chosenOption.feasible) {
      throw new BadRequestError(
        `Cannot approve infeasible recovery option: ${chosenOption.infeasibleReason || 'Option is not feasible'}`
      );
    }

    if (!chosenOption.allocation) {
      throw new BadRequestError(`Recovery option '${input.optionId}' has no persisted tranche allocation`);
    }
    if (
      input.tranche1Qty !== chosenOption.allocation.tranche1Qty ||
      input.tranche1Date !== chosenOption.allocation.tranche1Date ||
      (input.tranche2Qty ?? 0) !== chosenOption.allocation.tranche2Qty ||
      (input.tranche2Date ?? '') !== chosenOption.allocation.tranche2Date
    ) {
      throw new BadRequestError('Approved recovery tranches must exactly match the selected persisted option.');
    }

    const totalTranches = input.tranche1Qty + (input.tranche2Qty || 0);
    if (totalTranches !== proposal.totalQty) {
      throw new BadRequestError(
        `Recovery tranches must strictly conserve total ordered quantity (${proposal.totalQty}), but got ${totalTranches}`
      );
    }

    throw new BadRequestError(
      `Recovery proposal '${proposal.id}' is saved for review, but it cannot be applied because this service does not yet create a schedule change or shipment reservation.`
    );
  }
}
