import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
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


interface PersistedRecoveryProposal extends RecoveryProposalDTO {
  workspaceId: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __manuos_recovery_proposals: Map<string, PersistedRecoveryProposal> | undefined;
}

function getRecoveryStore(): Map<string, PersistedRecoveryProposal> {
  if (!globalThis.__manuos_recovery_proposals) {
    globalThis.__manuos_recovery_proposals = new Map<string, PersistedRecoveryProposal>();
  }
  return globalThis.__manuos_recovery_proposals;
}

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
            for (const insp of out.inspections) {
              if (insp.status === 'FINALIZED') {
                passedAtoms += insp.passedAtoms;
              }
            }
          }
        }
      }
    }

    const readyQcPassedQty = Number(passedAtoms / 1_000_000n);
    const totalQty = Number(order.orderedAtoms / 1_000_000n);
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
    const proposal: PersistedRecoveryProposal = {
      id: proposalId,
      workspaceId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalQty,
      readyQcPassedQty,
      originalPromisedDate,
      projectedDelayedDate,
      options,
      createdAt: new Date().toISOString(),
    };

    getRecoveryStore().set(proposalId, proposal);
    return proposal;
  }

  /**
   * Commits an atomic recovery decision (e.g. split batch delivery promise),
   * updating order promised date/tranches and creating audit trails without fabricating fake production.
   */
  async approveRecovery(
    principal: Principal,
    rawInput: unknown,
    idempotencyKey?: string
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
    const proposal = getRecoveryStore().get(input.proposalId);
    if (!proposal || proposal.workspaceId !== workspaceId) {
      throw new NotFoundError(`Recovery proposal '${input.proposalId}' not found or expired`);
    }
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

    const totalTranches = input.tranche1Qty + (input.tranche2Qty || 0);
    if (totalTranches !== proposal.totalQty) {
      throw new BadRequestError(
        `Recovery tranches must strictly conserve total ordered quantity (${proposal.totalQty}), but got ${totalTranches}`
      );
    }

    return executeCommand<any, any>({
      principal,
      commandType: 'recovery.plan.approve',
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
      payload: input,
      prismaClient: this.db,
      handler: async (tx, { requestId }) => {
        // Re-validate order presence
        const order = await tx.order.findUnique({
          where: {
            workspaceId_id: {
              workspaceId,
              id: input.orderId,
            },
          },
        });

        if (!order) {
          throw new NotFoundError(`Order '${input.orderId}' not found for recovery approval`);
        }

        if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
          throw new BadRequestError(`Cannot approve recovery for order in status ${order.status}`);
        }

        // Update order promise date to reflect the initial tranche recovery
        const updatedOrder = await tx.order.update({
          where: { id: order.id },
          data: {
            promisedDate: new Date(input.tranche1Date),
            customerAcknowledged: false, // Reset acknowledgment for customer to re-confirm
            customerAcknowledgedAt: null,
          },
        });

        return {
          data: {
            orderId: updatedOrder.id,
            status: 'APPLIED',
            approvedTranche1Qty: input.tranche1Qty,
            approvedTranche1Date: input.tranche1Date,
            approvedTranche2Qty: input.tranche2Qty,
            approvedTranche2Date: input.tranche2Date,
            notes: input.notes,
          },
          aggregateType: 'ORDER',
          aggregateId: updatedOrder.id,
          resourceVersion: updatedOrder.version,
        };
      },
    });
  }
}
