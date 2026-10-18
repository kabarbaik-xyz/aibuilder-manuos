import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand } from '@/server/db/transaction';
import { BadRequestError, ConflictError, NotFoundError } from '@/domain/errors';
import { randomUUID } from 'crypto';
import { postMovement } from '../inventory/ledger';
import { MovementType, MovementReferenceType } from '../inventory/contracts';
import { assertRequiredFormsFinalized } from '../forms/completion';
import { executionTaskScope } from '../execution/scope';
import {
  CreateInspectionSchema,
  FinalizeInspectionSchema,
  AuthorizeReworkSchema,
  RecordReinspectionSchema,
  InspectionDisposition,
} from './contracts';
import {
  findInspectionById,
  findDefaultLocationByKind,
} from './repository';
import { parseAtomInput, parseQuantity, MAX_UOM_PRECISION } from '@/domain/quantity';
import { completeLifecycleAction } from '@/server/modules/order-lifecycle/service';
import { isQualityLifecycleComplete } from '@/domain/quality-lifecycle';

async function isOrderQualityLifecycleComplete(tx: any, workspaceId: string, orderId: string): Promise<boolean> {
  const outputs = await tx.productionOutput.findMany({
    where: { workspaceId, task: { instance: { orderId } } },
    select: {
      inspections: {
        where: { reinspectionOfId: null },
        select: {
          status: true,
          reworkAtoms: true,
          reinspections: { where: { status: 'FINALIZED' }, select: { passedAtoms: true, scrappedAtoms: true } },
          reworkAttempts: { where: { status: { in: ['PENDING', 'IN_PROGRESS'] } }, select: { id: true } },
        },
      },
    },
  });
  return isQualityLifecycleComplete(outputs.map((output: any) => output.inspections.map((inspection: any) => ({
    status: inspection.status,
    reworkAtoms: inspection.reworkAtoms,
    reinspectedAtoms: inspection.reinspections.reduce((total: bigint, reinspection: any) => total + reinspection.passedAtoms + reinspection.scrappedAtoms, 0n),
    openReworkAttempts: inspection.reworkAttempts.length,
  }))));
}

async function materializeLifecycleQcForms(tx: any, workspaceId: string, orderId: string, inspectionId: string): Promise<void> {
  const order = await tx.order.findFirst({
    where: { workspaceId, id: orderId },
    select: { lifecycleWorkflowVersionId: true },
  });
  if (!order?.lifecycleWorkflowVersionId) return;
  const lifecycleVersion = await tx.workflowVersion.findFirst({
    where: { workspaceId, id: order.lifecycleWorkflowVersionId },
    select: { definitionJson: true },
  });
  if (!lifecycleVersion) throw new BadRequestError('The order lifecycle version pinned to this reinspection is unavailable.');

  let pins: Array<{ formVersionId: string; contentHash: string; required: boolean; completionPoint: 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION' }>;
  try {
    const definition = JSON.parse(lifecycleVersion.definitionJson) as { stages?: Array<{ action?: string; forms?: typeof pins }> };
    pins = (definition.stages ?? []).filter((stage) => stage.action === 'FINALIZE_QC').flatMap((stage) => stage.forms ?? []);
  } catch {
    throw new BadRequestError('The order lifecycle version contains invalid pinned QC form configuration.');
  }

  for (const pin of pins) {
    const version = await tx.formVersion.findFirst({
      where: { workspaceId, id: pin.formVersionId, contentHash: pin.contentHash },
      include: { template: { select: { purpose: true } } },
    });
    if (!version || version.template.purpose !== 'QC_EVIDENCE') {
      throw new BadRequestError('A lifecycle QC form pin is unavailable or incompatible with this reinspection.');
    }
    await tx.formInstance.createMany({
      data: [{
        workspaceId,
        formVersionId: pin.formVersionId,
        subjectType: 'INSPECTION',
        subjectId: inspectionId,
        required: pin.required,
        completionPoint: pin.completionPoint,
        status: 'PENDING',
      }],
      skipDuplicates: true,
    });
  }
}

export async function maybeCompleteOrderQualityLifecycle(tx: any, workspaceId: string, orderId: string, actorUserId: string, commandId: string) {
  const remainingTasks = await tx.task.count({
    where: { workspaceId, instance: { orderId }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
  });
  if (remainingTasks > 0 || !await isOrderQualityLifecycleComplete(tx, workspaceId, orderId)) return;

  const lifecycle = await tx.orderLifecycleInstance.findFirst({
    where: { workspaceId, orderId, status: 'ACTIVE' },
    include: { stages: true },
  });
  const qcStages = (lifecycle?.stages ?? []).filter((stage: any) => stage.action === 'FINALIZE_QC' && ['READY', 'ACTIVE'].includes(stage.state));
  const qualityInspections = await tx.inspection.findMany({
    where: { workspaceId, productionOutput: { task: { instance: { orderId } } } },
    select: { id: true },
  });
  for (const stage of qcStages) {
    const pins = JSON.parse(stage.formPinsJson) as Array<{ formVersionId: string; required: boolean }>;
    for (const pin of pins.filter((candidate) => candidate.required)) {
      if (qualityInspections.length === 0) return;
      const submittedCount = await tx.formInstance.count({
        where: {
          workspaceId,
          subjectType: 'INSPECTION',
          subjectId: { in: qualityInspections.map((inspection: { id: string }) => inspection.id) },
          formVersionId: pin.formVersionId,
          status: 'SUBMITTED',
        },
      });
      if (submittedCount !== qualityInspections.length) return;
    }
  }

  await completeLifecycleAction(tx, {
    workspaceId,
    orderId,
    action: 'FINALIZE_QC',
    actorUserId,
    commandId,
  });
}

/**
 * Exact signed-decimal parsing for QC readings and checklist limits.
 * Tolerances may be negative, which parseQuantity alone rejects.
 */
function parseSignedDecimalToAtoms(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const magnitude = parseQuantity(negative ? trimmed.slice(1) : trimmed, MAX_UOM_PRECISION);
  return negative ? -magnitude : magnitude;
}

interface QcNumericLimits {
  min: bigint | null;
  max: bigint | null;
}

function parseQcNumericLimits(checkCode: string, limitsJson: string): QcNumericLimits | null {
  const trimmed = (limitsJson || '').trim();
  if (!trimmed || trimmed === '{}') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new BadRequestError(`Checklist check '${checkCode}' has malformed limits JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;
  const parseBound = (bound: unknown, label: string): bigint | null => {
    if (bound === null || bound === undefined || bound === '') return null;
    if (typeof bound === 'number') {
      if (!Number.isFinite(bound)) {
        throw new BadRequestError(`Checklist check '${checkCode}' has a non-finite ${label} limit.`);
      }
      return parseSignedDecimalToAtoms(bound.toString());
    }
    if (typeof bound === 'string') return parseSignedDecimalToAtoms(bound);
    throw new BadRequestError(`Checklist check '${checkCode}' has an unsupported ${label} limit.`);
  };
  const min = parseBound(raw.min ?? raw.minValue, 'minimum');
  const max = parseBound(raw.max ?? raw.maxValue, 'maximum');
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min > max) {
    throw new BadRequestError(`Checklist check '${checkCode}' has a minimum limit above its maximum.`);
  }
  return { min, max };
}

function readingToAtoms(checkCode: string, reading: string): bigint {
  try {
    return parseSignedDecimalToAtoms(reading);
  } catch {
    throw new BadRequestError(
      `Check '${checkCode}' requires a numeric decimal reading (up to ${MAX_UOM_PRECISION} decimals); got '${reading}'.`
    );
  }
}

interface ChecklistWithChecks {
  checks: Array<{
    code: string;
    description: string;
    method: string;
    limitsJson: string;
    isRequired: boolean;
    requiresEvidence: boolean;
  }>;
}

interface RecordedCheckResult {
  checkCode: string;
  measuredValue?: string;
  isPassed: boolean;
  evidenceDocumentId?: string;
}

/**
 * Enforces the pinned QC plan for a finalize/reinspection submission:
 * required checks must be recorded, measurement-class checks must carry a
 * numeric reading, and a passing reading must sit inside published limits.
 * A failing reading may legitimately sit outside limits (defect evidence).
 */
function assertChecklistReadings(
  checklist: ChecklistWithChecks | null | undefined,
  results: RecordedCheckResult[]
): void {
  if (!checklist || checklist.checks.length === 0) return;
  for (const check of checklist.checks.filter((c) => c.isRequired)) {
    const recorded = results.find((r) => r.checkCode === check.code);
    if (!recorded) {
      throw new BadRequestError(
        `Missing required check measurement for '${check.code}' (${check.description})`
      );
    }
    if (check.requiresEvidence && !recorded.evidenceDocumentId) {
      throw new BadRequestError(`Check '${check.code}' requires an evidence document.`);
    }
    const readsMeasurement = check.method === 'MEASUREMENT' || check.method === 'GAUGE';
    const reading = recorded.measuredValue?.trim();
    if (readsMeasurement) {
      if (!reading) {
        throw new BadRequestError(
          `Required check '${check.code}' (${check.method}) must record a numeric measured value.`
        );
      }
      readingToAtoms(check.code, reading);
    }
    if (!reading || !recorded.isPassed) continue;
    const limits = parseQcNumericLimits(check.code, check.limitsJson);
    if (!limits) continue;
    const readingAtoms = readingToAtoms(check.code, reading);
    if (limits.min !== null && readingAtoms < limits.min) {
      throw new BadRequestError(
        `Check '${check.code}' cannot pass: reading ${reading} is below the required minimum.`
      );
    }
    if (limits.max !== null && readingAtoms > limits.max) {
      throw new BadRequestError(
        `Check '${check.code}' cannot pass: reading ${reading} is above the allowed maximum.`
      );
    }
  }
}

async function assertEvidenceDocumentsInWorkspace(
  tx: any,
  workspaceId: string,
  results: RecordedCheckResult[]
): Promise<void> {
  const ids = [...new Set(results.flatMap((result) => result.evidenceDocumentId ? [result.evidenceDocumentId] : []))];
  if (ids.length === 0) return;
  const documents = await tx.document.findMany({
    where: { workspaceId, id: { in: ids } },
    select: { id: true },
  });
  if (documents.length !== ids.length) {
    throw new BadRequestError('QC evidence must reference an existing document in this workspace.');
  }
}

async function assertActiveLocationKind(
  tx: any,
  workspaceId: string,
  locationId: string | undefined,
  expectedKind: 'RAW' | 'FG' | 'SCRAP'
): Promise<void> {
  if (!locationId) {
    throw new BadRequestError(`A destination ${expectedKind} location is required for this QC disposition.`);
  }
  const location = await tx.location.findFirst({
    where: { workspaceId, id: locationId, isActive: true, archivedAt: null },
    select: { id: true, kind: true },
  });
  if (!location || location.kind !== expectedKind) {
    throw new BadRequestError(`QC disposition destination must be an active ${expectedKind} location.`);
  }
}

export async function createInspection(
  db: PrismaClient,
  principal: Principal,
  rawInput: unknown,
  idempotencyKey?: string
) {
  requireAnyPermission(principal, ['quality.inspect', 'quality.configure', 'owner']);
  const input = CreateInspectionSchema.parse(rawInput);
  const workspaceId = principal.workspaceId;

  let productionOutput: any = null;
  let supplyReceiptLine: any = null;
  let inspectedAtoms: bigint | undefined = input.inspectedAtoms === undefined
    ? undefined
    : parseAtomInput(input.inspectedAtoms);

  if (input.sourceType === 'GOODS_RECEIPT') {
    if (!input.supplyReceiptLineId || input.productionOutputId) {
      throw new BadRequestError('Incoming-material QC must target exactly one supplyReceiptLineId.');
    }
    supplyReceiptLine = await db.supplyReceiptLine.findFirst({
      where: { workspaceId, id: input.supplyReceiptLineId },
      include: { location: { select: { kind: true } } },
    });
    if (!supplyReceiptLine) throw new NotFoundError(`Receipt line '${input.supplyReceiptLineId}' not found`);
    if (input.supplyReceiptId && input.supplyReceiptId !== supplyReceiptLine.receiptId) {
      throw new BadRequestError('The receipt line does not belong to the supplied receipt.');
    }
    if (supplyReceiptLine.location.kind !== 'QUARANTINE') {
      throw new BadRequestError('Incoming-material QC can only be started for receipt lines held in QUARANTINE.');
    }
    if (inspectedAtoms !== undefined && inspectedAtoms !== supplyReceiptLine.receivedAtoms) {
      throw new BadRequestError('Incoming-material QC must inspect the full receipt line as one controlled batch.');
    }
    inspectedAtoms = supplyReceiptLine.receivedAtoms;
    if (await db.inspection.findFirst({ where: { workspaceId, supplyReceiptLineId: supplyReceiptLine.id } })) {
      throw new BadRequestError('This receipt line already has an inspection record.');
    }
  } else if (input.supplyReceiptLineId || input.supplyReceiptId || !input.productionOutputId) {
    throw new BadRequestError('Production-output QC must target a productionOutputId only.');
  }

  if (input.productionOutputId) {
    productionOutput = await db.productionOutput.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.productionOutputId,
        },
        task: { is: executionTaskScope(principal) },
      },
      include: {
        item: true,
        lot: true,
      },
    });

    if (!productionOutput) {
      throw new NotFoundError(`Production output '${input.productionOutputId}' not found`);
    }

    if (!inspectedAtoms) inspectedAtoms = parseAtomInput(productionOutput.outputAtoms);
  }

  if (!inspectedAtoms || inspectedAtoms <= 0n) {
    throw new BadRequestError('Inspected atoms must be strictly positive (> 0)');
  }

  // Verify QC checklist if specified
  let checklistRevision = 1;
  if (input.qcChecklistId) {
    const checklist = await db.qcChecklist.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.qcChecklistId,
        },
      },
    });
    if (!checklist) {
      throw new NotFoundError(`QC Checklist '${input.qcChecklistId}' not found`);
    }
    checklistRevision = checklist.revision;
  }

  return executeCommand<any, any>({
    principal,
    commandType: 'quality.inspection.create',
    idempotencyKey: idempotencyKey || randomUUID(),
    payload: input,
    prismaClient: db,
    handler: async (tx, { requestId }) => {
      let committedInspectedAtoms: bigint = inspectedAtoms!;
      let currentReceiptLine: any = null;
      if (input.sourceType === 'GOODS_RECEIPT') {
        currentReceiptLine = await tx.supplyReceiptLine.findFirst({
          where: { workspaceId, id: input.supplyReceiptLineId },
          include: { location: { select: { kind: true } } },
        });
        if (!currentReceiptLine || currentReceiptLine.location.kind !== 'QUARANTINE') {
          throw new BadRequestError('Receipt line is no longer held in QUARANTINE.');
        }
        if (currentReceiptLine.receivedAtoms !== committedInspectedAtoms || await tx.inspection.findFirst({ where: { workspaceId, supplyReceiptLineId: currentReceiptLine.id } })) {
          throw new ConflictError('Receipt line quantity or inspection state changed; refresh before starting QC.');
        }
      }
      if (input.productionOutputId) {
        const currentOutput = await tx.productionOutput.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.productionOutputId }, task: { is: executionTaskScope(principal) } },
          select: { id: true, outputAtoms: true, status: true, serialId: true, task: { select: { instanceId: true } } },
        });
        if (!currentOutput || currentOutput.status === 'REJECTED') {
          throw new NotFoundError(`Production output '${input.productionOutputId}' is not available for inspection`);
        }
        const priorInitialInspections = await tx.inspection.aggregate({
          where: {
            workspaceId,
            productionOutputId: currentOutput.id,
            reinspectionOfId: null,
          },
          _sum: { inspectedAtoms: true },
        });
        const alreadyAllocatedAtoms = parseAtomInput(priorInitialInspections._sum.inspectedAtoms ?? 0n);
        const remainingAtoms = parseAtomInput(currentOutput.outputAtoms) - alreadyAllocatedAtoms;
        if (remainingAtoms <= 0n) {
          throw new BadRequestError('All produced atoms for this output are already allocated to QC inspections.');
        }
        if (input.inspectedAtoms !== undefined && input.inspectedAtoms > remainingAtoms) {
          throw new BadRequestError(
            `Inspection quantity ${input.inspectedAtoms} exceeds the ${remainingAtoms} atoms remaining for QC on this output.`
          );
        }
        committedInspectedAtoms = input.inspectedAtoms === undefined
          ? remainingAtoms
          : parseAtomInput(input.inspectedAtoms);
        if (currentOutput.serialId && committedInspectedAtoms !== 1_000_000n) throw new BadRequestError('Serialized QC must inspect one complete unit');
      }

      const inspection = await tx.inspection.create({
        data: {
          workspaceId,
          sourceType: input.sourceType,
          productionOutputId: input.productionOutputId,
          supplyReceiptId: currentReceiptLine?.receiptId,
          supplyReceiptLineId: currentReceiptLine?.id,
          qcChecklistId: input.qcChecklistId,
          checklistRevision,
          inspectedAtoms: committedInspectedAtoms,
          status: 'DRAFT',
          inspectorUserId: principal.userId,
          notes: input.notes,
        },
      });

      if (inspection.qcChecklistId) {
        const checklistBindings = await tx.formBinding.findMany({
          where: {
            workspaceId,
            context: 'QC_CHECKLIST',
            qcChecklistId: inspection.qcChecklistId,
            formVersion: { status: 'PUBLISHED' },
          },
          select: { id: true, formVersionId: true, required: true },
        });
        if (checklistBindings.length) {
          await tx.formInstance.createMany({
            data: checklistBindings.map((binding: { id: string; formVersionId: string; required: boolean }) => ({
              workspaceId,
              formVersionId: binding.formVersionId,
              formBindingId: binding.id,
              subjectType: 'INSPECTION',
              subjectId: inspection.id,
              required: binding.required,
              completionPoint: 'BEFORE_ACTION',
              status: 'PENDING',
            })),
            skipDuplicates: true,
          });
        }
      }

      if (input.productionOutputId) {
        const task = await tx.productionOutput.findUnique({
          where: { workspaceId_id: { workspaceId, id: input.productionOutputId } },
          select: { task: { select: { instance: { select: { orderId: true } } } } },
        });
        const order = task?.task.instance?.orderId
          ? await tx.order.findFirst({ where: { workspaceId, id: task.task.instance.orderId }, select: { id: true, lifecycleWorkflowVersionId: true } })
          : null;
        const lifecycleVersion = order?.lifecycleWorkflowVersionId
          ? await tx.workflowVersion.findFirst({ where: { workspaceId, id: order.lifecycleWorkflowVersionId, status: 'PUBLISHED' }, select: { definitionJson: true } })
          : null;
        if (lifecycleVersion) {
          let qcPins: Array<{ formVersionId: string; contentHash: string; required: boolean; completionPoint: 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION' }> = [];
          try {
            const definition = JSON.parse(lifecycleVersion.definitionJson) as { stages?: Array<{ action?: string; forms?: Array<{ formVersionId: string; contentHash: string; required: boolean; completionPoint: 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION' }> }> };
            qcPins = (definition.stages ?? []).filter((stage) => stage.action === 'FINALIZE_QC').flatMap((stage) => stage.forms ?? []);
          } catch {
            throw new BadRequestError('The order lifecycle version contains invalid pinned QC form configuration.');
          }
          for (const pin of qcPins) {
            const pinnedVersion = await tx.formVersion.findFirst({
              where: { workspaceId, id: pin.formVersionId, status: 'PUBLISHED', contentHash: pin.contentHash },
              include: { template: { select: { purpose: true } } },
            });
            if (!pinnedVersion || pinnedVersion.template.purpose !== 'QC_EVIDENCE') {
              throw new BadRequestError('A lifecycle QC form pin is unpublished, changed, or incompatible.');
            }
            await tx.formInstance.createMany({
              data: [{ workspaceId, formVersionId: pin.formVersionId, subjectType: 'INSPECTION', subjectId: inspection.id, required: pin.required, completionPoint: pin.completionPoint, status: 'PENDING' }],
              skipDuplicates: true,
            });
          }
        }
      }

      return {
        data: inspection,
        aggregateType: 'INSPECTION',
        aggregateId: inspection.id,
        resourceVersion: inspection.version,
      };
    },
  });
}

export async function finalizeInspection(
  db: PrismaClient,
  principal: Principal,
  rawInput: unknown,
  idempotencyKey?: string
) {
  requireAnyPermission(principal, ['quality.inspect', 'owner']);
  const input = FinalizeInspectionSchema.parse(rawInput);
  const workspaceId = principal.workspaceId;

  const inspection = await findInspectionById(db, workspaceId, input.inspectionId);
  if (!inspection) {
    throw new NotFoundError(`Inspection '${input.inspectionId}' not found`);
  }

  if (inspection.status !== 'DRAFT') {
    throw new BadRequestError(
      `Cannot finalize inspection in status '${inspection.status}'. Only DRAFT inspections can be finalized.`
    );
  }

  // 1. Invariant: Conservation of quantity
  const totalAllocated = input.passedAtoms + input.reworkAtoms + input.scrappedAtoms;
  if (totalAllocated !== inspection.inspectedAtoms) {
    throw new BadRequestError(
      `Conservation of quantity violated: passed (${input.passedAtoms}) + rework (${input.reworkAtoms}) + scrapped (${input.scrappedAtoms}) = ${totalAllocated} atoms, must equal inspected (${inspection.inspectedAtoms}) atoms.`
    );
  }

  // 2. Validate checklist required checks if a checklist was assigned
  assertChecklistReadings(inspection.qcChecklist, input.results);

  // 3. Resolve destination locations
  let destFgLocationId = input.destinationFgLocationId;
  let destRawLocationId = input.destinationRawLocationId;
  let destScrapLocationId = input.destinationScrapLocationId;

  if (inspection.sourceType === 'GOODS_RECEIPT') {
    if (!inspection.supplyReceiptLine || input.reworkAtoms > 0n) {
      throw new BadRequestError('Incoming-material QC requires a receipt-line inspection; rework remains held until a material reinspection flow is available.');
    }
    if (inspection.supplyReceiptLine.location.kind !== 'QUARANTINE') {
      throw new BadRequestError('Incoming-material QC can only release stock from QUARANTINE.');
    }
    if (input.passedAtoms > 0n && !destRawLocationId) {
      const defaultRaw = await findDefaultLocationByKind(db, workspaceId, 'RAW');
      if (!defaultRaw) throw new BadRequestError('No default Raw Materials (RAW) location found. Please specify destinationRawLocationId.');
      destRawLocationId = defaultRaw.id;
    }
  } else if (input.passedAtoms > 0n && !destFgLocationId) {
    const defaultFg = await findDefaultLocationByKind(db, workspaceId, 'FG');
    if (!defaultFg) {
      throw new BadRequestError(
        'No default Finished Goods (FG) location found. Please specify destinationFgLocationId.'
      );
    }
    destFgLocationId = defaultFg.id;
  }

  if (input.scrappedAtoms > 0n && !destScrapLocationId) {
    const defaultScrap = await findDefaultLocationByKind(db, workspaceId, 'SCRAP');
    if (!defaultScrap) {
      throw new BadRequestError(
        'No default SCRAP location found. Please specify destinationScrapLocationId.'
      );
    }
    destScrapLocationId = defaultScrap.id;
  }

  return executeCommand<any, any>({
    principal,
    commandType: 'quality.inspection.finalize',
    idempotencyKey: idempotencyKey || randomUUID(),
    payload: input,
    prismaClient: db,
    handler: async (tx, { requestId }) => {
      // Re-read inspection inside tx
      const currentInspection = await tx.inspection.findUnique({
        where: { workspaceId_id: { workspaceId, id: input.inspectionId } },
        include: {
          qcChecklist: { include: { checks: true } },
          productionOutput: {
            include: {
              item: true,
              lot: true,
              task: true,
            },
          },
          supplyReceiptLine: {
            include: {
              item: true,
              lot: true,
              location: true,
              demandAllocations: { include: { demand: true }, orderBy: { createdAt: 'asc' } },
            },
          },
        },
      });
      if (!currentInspection) {
        throw new NotFoundError(`Inspection '${input.inspectionId}' not found`);
      }
      if (currentInspection.status !== 'DRAFT') {
        throw new BadRequestError(
          `Cannot finalize inspection in status '${currentInspection.status}'. Inspection must be DRAFT.`
        );
      }
      if (input.passedAtoms + input.reworkAtoms + input.scrappedAtoms !== currentInspection.inspectedAtoms) {
        throw new BadRequestError(
          `Conservation of mass violated: passed (${input.passedAtoms}) + rework (${input.reworkAtoms}) + scrap (${input.scrappedAtoms}) != inspected (${currentInspection.inspectedAtoms})`
        );
      }
      if (currentInspection.productionOutput) {
        const task = await tx.task.findFirst({ where: { ...executionTaskScope(principal), id: currentInspection.productionOutput.taskId }, select: { id: true } });
        if (!task) throw new NotFoundError('Inspection not found in your facility scope');
        if (currentInspection.productionOutput.serialId && [input.passedAtoms, input.reworkAtoms, input.scrappedAtoms].some((atoms) => atoms !== 0n && atoms !== 1_000_000n)) {
          throw new BadRequestError('A serialized unit cannot be split between QC dispositions');
        }
      }
      assertChecklistReadings(currentInspection.qcChecklist, input.results);
      await assertEvidenceDocumentsInWorkspace(tx, workspaceId, input.results);
      if (currentInspection.sourceType === 'GOODS_RECEIPT' && input.passedAtoms > 0n) {
        await assertActiveLocationKind(tx, workspaceId, destRawLocationId, 'RAW');
        if (destRawLocationId === currentInspection.supplyReceiptLine?.locationId) {
          throw new BadRequestError('QC destination RAW location must differ from the source QUARANTINE location.');
        }
        if (currentInspection.supplyReceiptLine?.receivedAtoms !== currentInspection.inspectedAtoms) {
          throw new ConflictError('Receipt line quantity changed after inspection was created.');
        }
      } else if (currentInspection.sourceType !== 'GOODS_RECEIPT' && input.passedAtoms > 0n) {
        await assertActiveLocationKind(tx, workspaceId, destFgLocationId, 'FG');
      }
      if (input.scrappedAtoms > 0n) {
        await assertActiveLocationKind(tx, workspaceId, destScrapLocationId, 'SCRAP');
      }

      if (currentInspection.productionOutput && !currentInspection.reinspectionOfId) {
        const priorFinalizedInitialInspections = await tx.inspection.aggregate({
          where: {
            workspaceId,
            productionOutputId: currentInspection.productionOutput.id,
            reinspectionOfId: null,
            status: 'FINALIZED',
            id: { not: currentInspection.id },
          },
          _sum: { inspectedAtoms: true },
        });
        const finalizedBefore = priorFinalizedInitialInspections._sum.inspectedAtoms ?? 0n;
        if (finalizedBefore + currentInspection.inspectedAtoms > currentInspection.productionOutput.outputAtoms) {
          throw new BadRequestError(
            `QC inspection total would exceed production output: ${finalizedBefore + currentInspection.inspectedAtoms} inspected atoms for ${currentInspection.productionOutput.outputAtoms} produced atoms.`
          );
        }
      }

      // Gate: Verify all required QC evidence forms are finalized before inspection finalization
      await assertRequiredFormsFinalized(tx, {
        workspaceId,
        subjectType: 'INSPECTION',
        subjectId: currentInspection.id,
      });

      const output = currentInspection.productionOutput;
      const receiptLine = currentInspection.supplyReceiptLine;
      const itemId = output?.itemId ?? receiptLine?.itemId;
      const lotId = output?.lotId ?? receiptLine?.lotId;
      const sourceLocationId = output?.destinationLocationId ?? receiptLine?.locationId;

      // Post QC_DISPOSITION movements
      if (receiptLine && input.reworkAtoms > 0n) {
        throw new BadRequestError('Incoming-material rework remains held until a material reinspection flow is available.');
      }
      if (receiptLine && input.passedAtoms > 0n && itemId && sourceLocationId && destRawLocationId) {
        await postMovement(tx, principal, {
          movementType: MovementType.QC_DISPOSITION,
          itemId,
          sourceLocationId,
          destinationLocationId: destRawLocationId,
          sourceLotId: lotId,
          destinationLotId: lotId,
          atoms: input.passedAtoms,
          referenceType: MovementReferenceType.QC_INSPECTION,
          referenceId: currentInspection.id,
          notes: `Incoming QC: ${input.passedAtoms} atoms accepted to RAW`,
        }, requestId);

        let remainingPassedAtoms = input.passedAtoms;
        for (const receiptAllocation of receiptLine.demandAllocations) {
          if (remainingPassedAtoms <= 0n) break;
          const coveredAtoms = receiptAllocation.receivedAtoms < remainingPassedAtoms
            ? receiptAllocation.receivedAtoms
            : remainingPassedAtoms;
          const activeDemandReservations = await tx.stockReservation.aggregate({
            where: { workspaceId, demandId: receiptAllocation.demandId, status: 'ACTIVE' },
            _sum: { reservedAtoms: true },
          });
          const activeDemandAtoms = activeDemandReservations._sum.reservedAtoms ?? 0n;
          const remainingDemandAtoms = receiptAllocation.demand.requiredAtoms > activeDemandAtoms
            ? receiptAllocation.demand.requiredAtoms - activeDemandAtoms
            : 0n;
          const reserveAtoms = coveredAtoms < remainingDemandAtoms ? coveredAtoms : remainingDemandAtoms;
          remainingPassedAtoms -= coveredAtoms;
          if (reserveAtoms === 0n || !['OPEN', 'ALLOCATED'].includes(receiptAllocation.demand.status)) continue;
          const bucketKey = `${itemId}:${destRawLocationId}:${lotId || '__NO_LOT__'}`;
          const balance = await tx.stockBalance.findUnique({ where: { workspaceId_bucketKey: { workspaceId, bucketKey } } });
          if (!balance || balance.onHandAtoms - balance.reservedAtoms < reserveAtoms) {
            throw new BadRequestError(`QC-passed stock is not available to reserve for demand '${receiptAllocation.demandId}'.`);
          }
          const updatedBalance = await tx.stockBalance.updateMany({
            where: { id: balance.id, version: balance.version },
            data: { reservedAtoms: { increment: reserveAtoms }, version: { increment: 1 } },
          });
          if (updatedBalance.count !== 1) throw new ConflictError(`Concurrent reservation conflict for QC-passed stock bucket '${bucketKey}'.`);
          const reservation = await tx.stockReservation.create({
            data: {
              workspaceId,
              demandId: receiptAllocation.demandId,
              orderId: receiptAllocation.demand.orderId,
              taskId: receiptAllocation.demand.taskId,
              itemId,
              locationId: destRawLocationId,
              lotId,
              reservedAtoms: reserveAtoms,
              status: 'ACTIVE',
            },
          });
          await tx.materialSupplyReceiptAllocation.update({
            where: { workspaceId_id: { workspaceId, id: receiptAllocation.id } },
            data: { reservedAtoms: reserveAtoms, stockReservationId: reservation.id },
          });
          await tx.materialSupplyAllocation.update({
            where: { workspaceId_id: { workspaceId, id: receiptAllocation.supplyAllocationId } },
            data: { reservedAtoms: { increment: reserveAtoms }, version: { increment: 1 } },
          });
          const allActiveReservations = await tx.stockReservation.aggregate({
            where: { workspaceId, demandId: receiptAllocation.demandId, status: 'ACTIVE' },
            _sum: { reservedAtoms: true },
          });
          if ((allActiveReservations._sum.reservedAtoms ?? 0n) >= receiptAllocation.demand.requiredAtoms && receiptAllocation.demand.status === 'OPEN') {
            await tx.materialDemand.update({ where: { id: receiptAllocation.demandId }, data: { status: 'ALLOCATED', version: { increment: 1 } } });
          }
        }
      } else if (input.passedAtoms > 0n && itemId && sourceLocationId && destFgLocationId) {
        // Only transfer if source location is different from dest FG location
        if (sourceLocationId !== destFgLocationId) {
          await postMovement(
            tx,
            principal,
            {
              movementType: MovementType.QC_DISPOSITION,
              itemId,
              sourceLocationId,
              destinationLocationId: destFgLocationId,
              sourceLotId: lotId,
              destinationLotId: lotId,
              atoms: input.passedAtoms,
              referenceType: MovementReferenceType.QC_INSPECTION,
              referenceId: inspection.id,
              notes: `QC Disposition: ${input.passedAtoms} atoms accepted to FG`,
            },
            requestId
          );
        }
      }

      if (input.scrappedAtoms > 0n && itemId && sourceLocationId && destScrapLocationId) {
        await postMovement(
          tx,
          principal,
          {
            movementType: MovementType.QC_DISPOSITION,
            itemId,
            sourceLocationId,
            destinationLocationId: destScrapLocationId,
            sourceLotId: lotId,
            destinationLotId: null,
            atoms: input.scrappedAtoms,
            referenceType: MovementReferenceType.QC_INSPECTION,
            referenceId: inspection.id,
            notes: `QC Disposition: ${input.scrappedAtoms} atoms scrapped`,
          },
          requestId
        );
      }

      // Determine overall disposition
      let disposition: string = InspectionDisposition.PARTIAL;
      if (input.passedAtoms === inspection.inspectedAtoms) {
        disposition = InspectionDisposition.PASSED;
      } else if (input.scrappedAtoms === inspection.inspectedAtoms) {
        disposition = InspectionDisposition.SCRAPPED;
      } else if (input.reworkAtoms === inspection.inspectedAtoms) {
        disposition = InspectionDisposition.REWORK;
      }

      // Create check results
      if (input.results.length > 0) {
        await tx.inspectionResult.createMany({
          data: input.results.map((r) => ({
            workspaceId,
            inspectionId: inspection.id,
            checkCode: r.checkCode,
            checkDescription: r.checkDescription,
            checkMethod: r.checkMethod,
            measuredValue: r.measuredValue,
            isPassed: r.isPassed,
            defectReason: r.defectReason,
            notes: r.notes,
            evidenceDocumentId: r.evidenceDocumentId,
          })),
        });
      }

      // Update inspection
      const updatedInspection = await tx.inspection.update({
        where: {
          workspaceId_id: {
            workspaceId,
            id: inspection.id,
          },
        },
        data: {
          status: 'FINALIZED',
          disposition,
          passedAtoms: input.passedAtoms,
          reworkAtoms: input.reworkAtoms,
          scrappedAtoms: input.scrappedAtoms,
          notes: input.notes || inspection.notes,
          inspectorUserId: principal.userId,
          version: { increment: 1 },
        },
        include: {
          results: true,
          productionOutput: true,
        },
      });

      // Update ProductionOutput status
      if (output) {
        await tx.productionOutput.update({
          where: {
            workspaceId_id: {
              workspaceId,
              id: output.id,
            },
          },
          data: {
            status: disposition === 'SCRAPPED' ? 'REJECTED' : 'INSPECTED',
            version: { increment: 1 },
          },
        });

        // A partial final output can be inspected in multiple batches. Keep the task
        // in WAITING_QC until accepted quantity reaches the task target.
        if (output.task && output.task.status === 'WAITING_QC') {
          if (input.passedAtoms > 0n || disposition === 'PASSED') {
            const finalizedInspections = await tx.inspection.aggregate({
              where: {
                workspaceId,
                status: 'FINALIZED',
                productionOutput: {
                  taskId: output.task.id,
                  attemptNumber: output.task.attemptNumber,
                },
              },
              _sum: { passedAtoms: true },
            });
            const cumulativePassedAtoms = finalizedInspections._sum.passedAtoms ?? 0n;
            const taskComplete =
              output.task.targetAtoms <= 0n || cumulativePassedAtoms >= output.task.targetAtoms;

            if (taskComplete) {
              await tx.task.update({
                where: {
                  workspaceId_id: {
                    workspaceId,
                    id: output.task.id,
                  },
                },
                data: {
                  status: 'COMPLETED',
                  completedAt: new Date(),
                  version: { increment: 1 },
                },
              });

              // Promote any pending successors whose predecessors are all completed
              const successors = await tx.taskDependency.findMany({
                where: { workspaceId, predecessorTaskId: output.task.id },
                include: { successor: { include: { predecessorDeps: true } } },
              });

              for (const succ of successors) {
                const allPreds = succ.successor.predecessorDeps;
                const otherPreds = allPreds.filter((p: any) => p.predecessorTaskId !== output.task.id);
                const otherPredTasks = await tx.task.findMany({
                  where: { id: { in: otherPreds.map((p: any) => p.predecessorTaskId) } },
                });
                const allOtherCompleted = otherPredTasks.every((p: any) => p.status === 'COMPLETED');

                if (allOtherCompleted && succ.successor.status === 'PENDING') {
                  await tx.task.update({
                    where: { id: succ.successor.id },
                    data: { status: 'READY', version: { increment: 1 } },
                  });
                }
              }
            }
          }
        }
      }

      if (output?.task?.instanceId) {
        const workflowInstance = await tx.workflowInstance.findFirst({
          where: { workspaceId, id: output.task.instanceId },
          select: { orderId: true },
        });
        if (workflowInstance) {
          await maybeCompleteOrderQualityLifecycle(tx, workspaceId, workflowInstance.orderId, principal.userId, requestId);
        }
      }

      return {
        data: updatedInspection,
        aggregateType: 'INSPECTION',
        aggregateId: updatedInspection.id,
        resourceVersion: updatedInspection.version,
      };
    },
  });
}

export async function authorizeRework(
  db: PrismaClient,
  principal: Principal,
  rawInput: unknown,
  idempotencyKey?: string
) {
  requireAnyPermission(principal, ['quality.configure', 'quality.inspect', 'owner']);
  const input = AuthorizeReworkSchema.parse(rawInput);
  const workspaceId = principal.workspaceId;

  const inspection = await findInspectionById(db, workspaceId, input.inspectionId);
  if (!inspection) {
    throw new NotFoundError(`Inspection '${input.inspectionId}' not found`);
  }

  if (inspection.status !== 'FINALIZED') {
    throw new BadRequestError('Can only authorize rework for finalized inspections');
  }

  if (inspection.reworkAtoms <= 0n) {
    throw new BadRequestError('Inspection has no rework atoms to authorize');
  }

  if (!inspection.productionOutput) {
    throw new BadRequestError('Inspection is not linked to a production output');
  }

  // Invariant: Cannot authorize more rework atoms than were designated for rework
  const existingAttempts = await db.reworkAttempt.findMany({
    where: {
      workspaceId,
      inspectionId: inspection.id,
      status: { not: 'CANCELLED' },
    },
  });
  const alreadyAuthorized = existingAttempts.reduce(
    (acc, a) => acc + a.targetAtoms,
    0n
  );

  if (alreadyAuthorized + input.targetAtoms > inspection.reworkAtoms) {
    throw new BadRequestError(
      `Cannot authorize ${input.targetAtoms} atoms: already authorized ${alreadyAuthorized} of ${inspection.reworkAtoms} rework atoms.`
    );
  }

  return executeCommand<any, any>({
    principal,
    commandType: 'quality.rework.authorize',
    idempotencyKey: idempotencyKey || randomUUID(),
    payload: input,
    prismaClient: db,
    handler: async (tx, { requestId }) => {
      const currentInspection = await tx.inspection.findUnique({
        where: { workspaceId_id: { workspaceId, id: input.inspectionId } },
        include: { productionOutput: true },
      });
      if (!currentInspection || currentInspection.status !== 'FINALIZED' || !currentInspection.productionOutput) {
        throw new BadRequestError('Rework authorization requires a finalized inspection linked to production output.');
      }
      const authorizedTask = await tx.task.findFirst({ where: { ...executionTaskScope(principal), id: currentInspection.productionOutput.taskId }, select: { id: true } });
      if (!authorizedTask) throw new NotFoundError('Inspection not found in your facility scope');
      if (currentInspection.productionOutput.serialId && input.targetAtoms !== 1_000_000n) throw new BadRequestError('Serialized rework must authorize one complete unit');
      const currentAttempts = await tx.reworkAttempt.findMany({
        where: { workspaceId, inspectionId: currentInspection.id, status: { not: 'CANCELLED' } },
      });
      const currentAuthorizedAtoms = currentAttempts.reduce((total: bigint, attempt: { targetAtoms: bigint }) => total + attempt.targetAtoms, 0n);
      if (currentAuthorizedAtoms + input.targetAtoms > currentInspection.reworkAtoms) {
        throw new BadRequestError(
          `Cannot authorize ${input.targetAtoms} atoms: already authorized ${currentAuthorizedAtoms} of ${currentInspection.reworkAtoms} rework atoms.`
        );
      }
      const reworkAttempt = await tx.reworkAttempt.create({
        data: {
          workspaceId,
          inspectionId: currentInspection.id,
          taskId: currentInspection.productionOutput.taskId,
          attemptNumber: currentAttempts.reduce((max: number, attempt: { attemptNumber: number }) => Math.max(max, attempt.attemptNumber), 0) + 1,
          targetAtoms: input.targetAtoms,
          instruction: input.instruction,
          status: 'PENDING',
          authorizedById: principal.userId,
        },
      });

      return {
        data: reworkAttempt,
        aggregateType: 'REWORK_ATTEMPT',
        aggregateId: reworkAttempt.id,
        resourceVersion: 1,
      };
    },
  });
}

export async function recordReinspection(
  db: PrismaClient,
  principal: Principal,
  rawInput: unknown,
  idempotencyKey?: string
) {
  requireAnyPermission(principal, ['quality.inspect', 'owner']);
  const input = RecordReinspectionSchema.parse(rawInput);
  const workspaceId = principal.workspaceId;

  const origInspection = await findInspectionById(
    db,
    workspaceId,
    input.originalInspectionId
  );
  if (!origInspection) {
    throw new NotFoundError(`Original inspection '${input.originalInspectionId}' not found`);
  }

  if (origInspection.status !== 'FINALIZED') {
    throw new BadRequestError('Original inspection must be finalized');
  }

  if (origInspection.reworkAtoms <= 0n) {
    throw new BadRequestError('Original inspection had 0 rework atoms to reinspect');
  }

  // Reworked units must satisfy the originally pinned QC plan again.
  assertChecklistReadings(origInspection.qcChecklist, input.results);

  // Check cumulative reinspected atoms to preserve conservation of quantity
  const existingReinspections = await db.inspection.findMany({
    where: {
      workspaceId,
      reinspectionOfId: origInspection.id,
      status: 'FINALIZED',
    },
  });

  const priorReinspectedPassed = existingReinspections.reduce(
    (acc, r) => acc + r.passedAtoms,
    0n
  );
  const priorReinspectedScrapped = existingReinspections.reduce(
    (acc, r) => acc + r.scrappedAtoms,
    0n
  );
  const totalPrior = priorReinspectedPassed + priorReinspectedScrapped;

  const currentTotal = input.passedAtoms + input.scrappedAtoms;
  if (currentTotal <= 0n) {
    throw new BadRequestError('Reinspection atoms must be strictly positive (> 0).');
  }
  if (totalPrior + currentTotal > origInspection.reworkAtoms) {
    throw new BadRequestError(
      `Reinspection quantity overflow: total reinspected (${totalPrior + currentTotal}) exceeds original rework atoms (${origInspection.reworkAtoms}).`
    );
  }

  let destFgLocationId = input.destinationFgLocationId;
  let destScrapLocationId = input.destinationScrapLocationId;

  if (input.passedAtoms > 0n && !destFgLocationId) {
    const defaultFg = await findDefaultLocationByKind(db, workspaceId, 'FG');
    if (!defaultFg) {
      throw new BadRequestError('No default FG location found');
    }
    destFgLocationId = defaultFg.id;
  }

  if (input.scrappedAtoms > 0n && !destScrapLocationId) {
    const defaultScrap = await findDefaultLocationByKind(db, workspaceId, 'SCRAP');
    if (!defaultScrap) {
      throw new BadRequestError('No default SCRAP location found');
    }
    destScrapLocationId = defaultScrap.id;
  }

  return executeCommand<any, any>({
    principal,
    commandType: 'quality.reinspection.record',
    idempotencyKey: idempotencyKey || randomUUID(),
    payload: input,
    prismaClient: db,
    handler: async (tx, { requestId }) => {
      const currentOriginal = await tx.inspection.findUnique({
        where: { workspaceId_id: { workspaceId, id: input.originalInspectionId } },
        include: { productionOutput: true, qcChecklist: { include: { checks: true } } },
      });
      if (!currentOriginal || currentOriginal.status !== 'FINALIZED' || currentOriginal.reworkAtoms <= 0n) {
        throw new BadRequestError('Reinspection requires a finalized original inspection with rework atoms.');
      }
      if (currentOriginal.productionOutput) {
        const task = await tx.task.findFirst({ where: { ...executionTaskScope(principal), id: currentOriginal.productionOutput.taskId }, select: { id: true } });
        if (!task) throw new NotFoundError('Inspection not found in your facility scope');
        if (currentOriginal.productionOutput.serialId && (input.passedAtoms + input.scrappedAtoms !== 1_000_000n || [input.passedAtoms, input.scrappedAtoms].some((atoms) => atoms !== 0n && atoms !== 1_000_000n))) {
          throw new BadRequestError('Serialized reinspection must reclassify one complete existing unit');
        }
      }
      assertChecklistReadings(currentOriginal.qcChecklist, input.results);
      await assertEvidenceDocumentsInWorkspace(tx, workspaceId, input.results);

      // Re-check cumulative reinspected atoms under tx
      const existingReinspections = await tx.inspection.findMany({
        where: {
          workspaceId,
          reinspectionOfId: currentOriginal.id,
          status: 'FINALIZED',
        },
      });
      const priorPassed = existingReinspections.reduce((acc: bigint, r: { passedAtoms: bigint }) => acc + r.passedAtoms, 0n);
      const priorScrapped = existingReinspections.reduce((acc: bigint, r: { scrappedAtoms: bigint }) => acc + r.scrappedAtoms, 0n);
      const totalPrior = priorPassed + priorScrapped;
      const currentTotal = input.passedAtoms + input.scrappedAtoms;
      if (currentTotal <= 0n) {
        throw new BadRequestError('Reinspection atoms must be strictly positive (> 0).');
      }
      if (input.passedAtoms > 0n) {
        await assertActiveLocationKind(tx, workspaceId, destFgLocationId, 'FG');
      }
      if (input.scrappedAtoms > 0n) {
        await assertActiveLocationKind(tx, workspaceId, destScrapLocationId, 'SCRAP');
      }
      if (totalPrior + currentTotal > currentOriginal.reworkAtoms) {
        throw new BadRequestError(
          `Reinspection quantity overflow: total reinspected (${totalPrior + currentTotal}) exceeds original rework atoms (${currentOriginal.reworkAtoms}).`
        );
      }

      let reworkAttempt: { targetAtoms: bigint; status: string } | null = null;
      if (input.reworkAttemptId) {
        reworkAttempt = await tx.reworkAttempt.findFirst({
          where: {
            workspaceId,
            id: input.reworkAttemptId,
            inspectionId: currentOriginal.id,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
          select: { targetAtoms: true, status: true },
        });
        if (!reworkAttempt || currentTotal !== reworkAttempt.targetAtoms) {
          throw new BadRequestError('Reinspection must exactly settle an active rework attempt for this inspection.');
        }
      }

      const output = currentOriginal.productionOutput;
      const itemId = output?.itemId;
      const lotId = output?.lotId;
      const sourceLocationId = output?.destinationLocationId;

      // Transfer accepted rework units from quarantine to FG
      if (input.passedAtoms > 0n && itemId && sourceLocationId && destFgLocationId) {
        if (sourceLocationId !== destFgLocationId) {
          await postMovement(
            tx,
            principal,
            {
              movementType: MovementType.QC_DISPOSITION,
              itemId,
              sourceLocationId,
              destinationLocationId: destFgLocationId,
              sourceLotId: lotId,
              destinationLotId: lotId,
              atoms: input.passedAtoms,
              referenceType: MovementReferenceType.QC_INSPECTION,
              referenceId: currentOriginal.id,
              notes: `Reinspection: ${input.passedAtoms} reworked atoms accepted to FG`,
            },
            requestId
          );
        }
      }

      if (input.scrappedAtoms > 0n && itemId && sourceLocationId && destScrapLocationId) {
        await postMovement(
          tx,
          principal,
          {
            movementType: MovementType.QC_DISPOSITION,
            itemId,
            sourceLocationId,
            destinationLocationId: destScrapLocationId,
            sourceLotId: lotId,
            destinationLotId: null,
            atoms: input.scrappedAtoms,
            referenceType: MovementReferenceType.QC_INSPECTION,
            referenceId: currentOriginal.id,
            notes: `Reinspection: ${input.scrappedAtoms} reworked atoms scrapped`,
          },
          requestId
        );
      }

      const reinspection = await tx.inspection.create({
        data: {
          workspaceId,
          sourceType: currentOriginal.sourceType,
          productionOutputId: currentOriginal.productionOutputId,
          supplyReceiptId: currentOriginal.supplyReceiptId,
          qcChecklistId: currentOriginal.qcChecklistId,
          checklistRevision: currentOriginal.checklistRevision,
          inspectedAtoms: currentTotal,
          passedAtoms: input.passedAtoms,
          reworkAtoms: 0n,
          scrappedAtoms: input.scrappedAtoms,
          status: 'FINALIZED',
          disposition: input.scrappedAtoms === 0n ? 'PASSED' : 'PARTIAL',
          inspectorUserId: principal.userId,
          reinspectionOfId: currentOriginal.id,
          notes: input.notes,
        },
      });
      const taskContext = currentOriginal.productionOutputId
        ? await tx.task.findFirst({
            where: { workspaceId, id: currentOriginal.productionOutput?.taskId },
            select: { instance: { select: { orderId: true } } },
          })
        : null;
      const orderId = taskContext?.instance.orderId;
      if (orderId) await materializeLifecycleQcForms(tx, workspaceId, orderId, reinspection.id);

      if (input.results && input.results.length > 0) {
        await tx.inspectionResult.createMany({
          data: input.results.map((r) => ({
            workspaceId,
            inspectionId: reinspection.id,
            checkCode: r.checkCode,
            checkDescription: r.checkDescription,
            checkMethod: r.checkMethod,
            measuredValue: r.measuredValue,
            isPassed: r.isPassed,
            defectReason: r.defectReason,
            notes: r.notes,
            evidenceDocumentId: r.evidenceDocumentId,
          })),
        });
      }

      if (input.reworkAttemptId) {
        await tx.reworkAttempt.update({
          where: {
            workspaceId_id: {
              workspaceId,
              id: input.reworkAttemptId,
            },
          },
          data: {
            status: 'COMPLETED',
          },
        });
      }

      if (orderId) await maybeCompleteOrderQualityLifecycle(tx, workspaceId, orderId, principal.userId, requestId);

      return {
        data: reinspection,
        aggregateType: 'INSPECTION',
        aggregateId: reinspection.id,
        resourceVersion: reinspection.version,
      };
    },
  });
}
