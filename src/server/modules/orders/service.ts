import { PrismaClient } from '@prisma/client';
import { db as defaultDb } from '@/server/db/client';
import { Principal } from '@/server/auth/principal';
import { requirePermission, requireAnyPermission } from '@/server/auth/permissions';
import { ConflictError, NotFoundError, BadRequestError, ForbiddenError } from '@/domain/errors';
import { parseQuantity } from '@/domain/quantity';
import { executeCommand } from '@/server/db/transaction';
import * as contracts from './contracts';
import { validateLifecycleDefinition, type OrderLifecycleDefinition } from '@/domain/order-lifecycle-definition';
import { orderLifecycleDefinitionSchema } from '@/server/modules/workflow/contracts';
import { completeLifecycleAction } from '@/server/modules/order-lifecycle/service';
import { isOrderLifecycleEnabled } from '@/domain/order-lifecycle-rollout';

export class OrderService {
  constructor(private readonly prisma: PrismaClient = defaultDb) {}

  // -----------------------------------------------------------
  // List & Get
  // -----------------------------------------------------------
  async listOrders(
    principal: Principal,
    filter?: { customerId?: string; status?: string }
  ) {
    requireAnyPermission(principal, ['order.read', 'customer_order.read_own']);

    // Scoped customer user can only view their own company's orders
    const effectiveCustomerId = principal.customerId || filter?.customerId;

    return this.prisma.order.findMany({
      where: {
        workspaceId: principal.workspaceId,
        ...(effectiveCustomerId ? { customerId: effectiveCustomerId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: {
        customer: true,
        orderType: true,
        item: true,
        lines: {
          include: {
            item: true,
            uom: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
        engineeringRevisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(principal: Principal, id: string) {
    requireAnyPermission(principal, ['order.read', 'customer_order.read_own']);
    const canViewProductionSchedule = ['planning.read', 'planning.write', 'task.assign', 'task.execute_assigned']
      .some(permission => principal.permissions.has(permission));

    const order = await this.prisma.order.findFirst({
      where: { id, workspaceId: principal.workspaceId },
      include: {
        customer: true,
        orderType: true,
        item: { include: { baseUom: true } },
        facility: true,
        questions: { orderBy: { createdAt: 'asc' } },
        rfqDrafts: { orderBy: { createdAt: 'desc' } },
        lines: {
          include: {
            item: { include: { baseUom: true } },
            uom: true,
            manufacturingOrders: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
        engineeringRevisions: {
          orderBy: { revisionNumber: 'desc' },
          include: {
            bomLines: {
              include: {
                item: true,
                inputUom: true,
              },
            },
          },
        },
        instances: {
          include: {
            tasks: {
              include: {
                assignedTechnician: true,
                assignedMachine: true,
                ...(canViewProductionSchedule ? { resourceBookings: {
                  where: { status: 'CONFIRMED' },
                  orderBy: { startAt: 'asc' },
                } } : {}),
              },
            },
          },
        },
        lifecycleInstances: {
          include: {
            workflowVersion: { include: { template: true } },
            stages: { include: { department: true, assignedMembership: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'asc' } },
            events: { orderBy: { occurredAt: 'asc' } },
          },
        },
        demands: {
          include: {
            item: {
              include: {
                baseUom: true,
              },
            },
          },
        },
        shipments: {
          orderBy: { createdAt: 'desc' },
          include: {
            lines: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundError(`Order '${id}' not found`);

    if (principal.customerId && order.customerId !== principal.customerId) {
      throw new ForbiddenError(`Access denied: customer user cannot access order '${id}'`);
    }

    if (principal.customerId) {
      const { lifecycleInstances: _internalLifecycle, ...customerSafeOrder } = order;
      return customerSafeOrder as typeof order;
    }

    if (!principal.customerId && order.lifecycleInstances?.length) {
      const actorIds = [...new Set(order.lifecycleInstances.flatMap(instance => instance.events.map(event => event.actorUserId)))];
      const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : [];
      const actorNames = new Map(actors.map(actor => [actor.id, actor.name]));
      const pins = order.lifecycleInstances.flatMap(instance => instance.stages.flatMap(stage => {
        try {
          return (JSON.parse(stage.formPinsJson) as Array<{ formVersionId: string; contentHash: string }>).map(pin => pin);
        } catch {
          return [];
        }
      }));
      const formVersions = pins.length ? await this.prisma.formVersion.findMany({
        where: { workspaceId: principal.workspaceId, id: { in: [...new Set(pins.map(pin => pin.formVersionId))] } },
        select: { id: true, versionNumber: true, contentHash: true, template: { select: { name: true } } },
      }) : [];
      const formVersionByPin = new Map(formVersions.map(version => [`${version.id}:${version.contentHash}`, version]));
      order.lifecycleInstances = order.lifecycleInstances.map(instance => ({
        ...instance,
        stages: instance.stages.map(stage => {
          let stagePins: Array<{ formVersionId: string; contentHash: string; required: boolean; completionPoint: string }> = [];
          try { stagePins = JSON.parse(stage.formPinsJson) as typeof stagePins; } catch { /* Ignore malformed historical pins and retain the source JSON for audit. */ }
          return {
            ...stage,
            pinnedForms: stagePins.map(pin => {
              const version = formVersionByPin.get(`${pin.formVersionId}:${pin.contentHash}`);
              return {
                name: version?.template.name ?? 'Unavailable pinned form',
                version: version?.versionNumber ?? null,
                contentHash: pin.contentHash,
                required: pin.required,
                completionPoint: pin.completionPoint,
              };
            }),
          };
        }),
        events: instance.events.map(event => ({ ...event, actorName: actorNames.get(event.actorUserId) ?? 'Former user' })),
      }));
    }

    return order;
  }

  // -----------------------------------------------------------
  // Create Order Draft
  // -----------------------------------------------------------
  async createOrderDraft(
    principal: Principal,
    input: contracts.CreateOrderDraftInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');
    if (input.lifecycleWorkflowVersionId && !isOrderLifecycleEnabled()) {
      throw new BadRequestError('Order lifecycle rollout is disabled. Create a legacy draft or contact an administrator.');
    }

    return executeCommand({
      principal,
      commandType: 'order.draft.create',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        let reviewedRfq: { id: string; rawText: string; extractedFieldsJson: string; orderId: string | null } | null = null;
        if (input.rfqDraftId) {
          reviewedRfq = await tx.rfqDraft.findFirst({
            where: { id: input.rfqDraftId, workspaceId: principal.workspaceId },
            select: { id: true, rawText: true, extractedFieldsJson: true, orderId: true },
          });
          if (!reviewedRfq) throw new NotFoundError(`Reviewed RFQ '${input.rfqDraftId}' not found`);
          let reviewState: string | undefined;
          try { reviewState = (JSON.parse(reviewedRfq.extractedFieldsJson) as { reviewState?: string }).reviewState; } catch { /* invalid legacy metadata remains ineligible for handoff */ }
          if (reviewedRfq.orderId || reviewState !== 'REVIEWED') {
            throw new BadRequestError('Only an unlinked RFQ that has completed engineering review can be attached to a new order draft.');
          }
        }

        // Customer check
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, workspaceId: principal.workspaceId, archivedAt: null },
        });
        if (!customer) throw new BadRequestError(`Customer '${input.customerId}' not found or inactive`);

        // OrderType check
        const orderType = await tx.orderType.findFirst({
          where: { id: input.orderTypeId, workspaceId: principal.workspaceId, archivedAt: null },
        });
        if (!orderType) throw new BadRequestError(`OrderType '${input.orderTypeId}' not found or inactive`);

        // Use the caller's assigned site by default; an explicitly selected site
        // must also be present in the authenticated principal's grant set.
        const facilityId = input.facilityId ?? principal.facilityId ?? null;
        if (facilityId) {
          const facility = await tx.facility.findFirst({
            where: { id: facilityId, workspaceId: principal.workspaceId, status: 'ACTIVE' },
          });
          if (!facility) throw new BadRequestError(`Facility '${facilityId}' not found or inactive`);
          if (!principal.facilityIds?.includes(facilityId)) {
            throw new ForbiddenError(`Access to facility '${facilityId}' is not granted to this membership`);
          }
        }

        // Determine primary item and lines
        const hasExplicitLines = input.lines && input.lines.length > 0;
        let primaryItemId = input.itemId;
        let totalOrderedAtoms = 0n;
        const lineAtoms: bigint[] = [];

        if (hasExplicitLines) {
          if (!primaryItemId) {
            primaryItemId = input.lines![0].itemId;
          }
          for (const line of input.lines!) {
            const item = await tx.item.findFirst({
              where: { id: line.itemId, workspaceId: principal.workspaceId, archivedAt: null },
              include: { baseUom: true },
            });
            if (!item) throw new BadRequestError(`Item '${line.itemId}' not found or inactive`);

            let precision = item.baseUom.precision;
            if (line.uomId) {
              const uom = await tx.uom.findFirst({
                where: { id: line.uomId, workspaceId: principal.workspaceId, isActive: true },
                select: { id: true, precision: true },
              });
              if (!uom) throw new BadRequestError(`UOM '${line.uomId}' not found or inactive`);
              precision = uom.precision;
            }

            const atoms = parseQuantity(String(line.orderedQuantity), precision);
            lineAtoms.push(atoms);
            totalOrderedAtoms += atoms;
          }
        } else {
          if (!primaryItemId) {
            throw new BadRequestError('Either itemId or lines must be provided to create an order draft');
          }
          const item = await tx.item.findFirst({
            where: { id: primaryItemId, workspaceId: principal.workspaceId, archivedAt: null },
            include: { baseUom: true },
          });
          if (!item) throw new BadRequestError(`Item '${primaryItemId}' not found or inactive`);

          const qty = input.orderedQuantity ?? 1;
          totalOrderedAtoms = parseQuantity(String(qty), item.baseUom.precision);
        }

        // Generate Order Number transaction-safely
        const count = await tx.order.count({
          where: { workspaceId: principal.workspaceId },
        });
        const orderNumber = `ORD-${String(count + 1).padStart(5, '0')}`;

        const requestedDate = new Date(input.requestedDate);
        const promisedDate = input.promisedDate ? new Date(input.promisedDate) : null;

      const lifecycleVersion = input.lifecycleWorkflowVersionId
        ? await tx.workflowVersion.findFirst({
            where: {
              id: input.lifecycleWorkflowVersionId,
              workspaceId: principal.workspaceId,
              status: 'PUBLISHED',
              template: { kind: 'ORDER_LIFECYCLE', orderTypeId: input.orderTypeId, isArchived: false },
            },
          })
        : null;
      if (input.lifecycleWorkflowVersionId && !lifecycleVersion) {
        throw new BadRequestError('Selected order lifecycle must be published and compatible with this order type.');
      }
      const lifecycleDefinition = lifecycleVersion
        ? orderLifecycleDefinitionSchema.parse(JSON.parse(lifecycleVersion.definitionJson)) as OrderLifecycleDefinition
        : null;
      if (lifecycleDefinition && !validateLifecycleDefinition(lifecycleDefinition).isValid) {
        throw new BadRequestError('Selected order lifecycle definition is no longer valid. Create a new published version.');
      }

        const order = await tx.order.create({
          data: {
            workspaceId: principal.workspaceId,
            orderNumber,
            customerId: input.customerId,
            orderTypeId: input.orderTypeId,
            lifecycleWorkflowVersionId: lifecycleVersion?.id ?? null,
            itemId: primaryItemId,
            orderedAtoms: totalOrderedAtoms,
            requestedDate,
            promisedDate,
            facilityId,
            deliveryAddress: input.deliveryAddress,
            contractReference: input.contractReference,
            status: 'DRAFT',
          },
          include: {
            customer: true,
            orderType: true,
            item: true,
          },
        });

        // Create OrderLines
        if (hasExplicitLines) {
          for (let i = 0; i < input.lines!.length; i++) {
            const line = input.lines![i];
            const atoms = lineAtoms[i];
            const lineReqDate = line.requestedDate ? new Date(line.requestedDate) : requestedDate;
            const linePromDate = line.promisedDate ? new Date(line.promisedDate) : promisedDate;

            await tx.orderLine.create({
              data: {
                workspaceId: principal.workspaceId,
                orderId: order.id,
                lineNumber: i + 1,
                itemId: line.itemId,
                uomId: line.uomId ?? undefined,
                orderedAtoms: atoms,
                unitPriceCents: line.unitPriceCents ? BigInt(line.unitPriceCents) : null,
                requestedDate: lineReqDate,
                promisedDate: linePromDate,
                notes: line.notes,
              },
            });
          }
        } else {
          // Default single line for backward compatibility
          await tx.orderLine.create({
            data: {
              workspaceId: principal.workspaceId,
              orderId: order.id,
              lineNumber: 1,
              itemId: primaryItemId,
              orderedAtoms: totalOrderedAtoms,
              requestedDate,
              promisedDate,
            },
          });
        }

        // Snapshot the order type's published specification forms immediately so
        // they can be reviewed before the order reaches its release gate.
        const orderFormBindings = await tx.formBinding.findMany({
          where: {
            workspaceId: principal.workspaceId,
            context: 'ORDER_TYPE',
            orderTypeId: order.orderTypeId,
            formVersion: { status: 'PUBLISHED' },
          },
          select: { id: true, formVersionId: true, required: true },
        });
        for (const binding of orderFormBindings) {
          await tx.formInstance.upsert({
            where: {
              workspaceId_subjectType_subjectId_formVersionId: {
                workspaceId: principal.workspaceId,
                subjectType: 'ORDER',
                subjectId: order.id,
                formVersionId: binding.formVersionId,
              },
            },
            create: {
              workspaceId: principal.workspaceId,
              formVersionId: binding.formVersionId,
              formBindingId: binding.id,
              subjectType: 'ORDER',
              subjectId: order.id,
              required: binding.required,
              completionPoint: 'BEFORE_ACTION',
              status: 'PENDING',
            },
            // Existing instances are immutable pins; a later binding must not rewrite them.
            update: {},
          });
        }

        if (lifecycleVersion && lifecycleDefinition) {
          const lifecycle = await tx.orderLifecycleInstance.create({
            data: {
              workspaceId: principal.workspaceId,
              orderId: order.id,
              workflowVersionId: lifecycleVersion.id,
              status: 'ACTIVE',
            },
          });
          await tx.orderLifecycleStage.createMany({
            data: lifecycleDefinition.stages.map((stage) => ({
              workspaceId: principal.workspaceId,
              instanceId: lifecycle.id,
              stageKey: stage.key,
              name: stage.name,
              action: stage.action,
              departmentId: stage.departmentId,
              assignedMembershipId: stage.assignment.kind === 'MEMBER' ? stage.assignment.membershipId : null,
              assignmentJson: JSON.stringify(stage.assignment),
              scheduleJson: JSON.stringify(stage.schedule),
              formPinsJson: JSON.stringify(stage.forms),
              predecessorKeysJson: JSON.stringify(stage.predecessors),
              activationConditionJson: JSON.stringify(stage.activationCondition ?? null),
              state: stage.predecessors.length === 0 ? 'READY' : 'PENDING',
              dueAt: stage.predecessors.length === 0 && stage.schedule.kind === 'DEADLINE'
                ? new Date(Date.now() + stage.schedule.dueAfterMinutes * 60_000)
                : null,
            })),
          });
          const orderScopedFormPins = new Map<string, { required: boolean; completionPoint: 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION' }>();
          for (const form of lifecycleDefinition.stages.flatMap((stage) => stage.forms)) {
            const previous = orderScopedFormPins.get(form.formVersionId);
            orderScopedFormPins.set(form.formVersionId, {
              required: Boolean(previous?.required || form.required),
              completionPoint: previous?.completionPoint === 'BEFORE_ACTION' || form.completionPoint === 'BEFORE_ACTION'
                ? 'BEFORE_ACTION'
                : 'BEFORE_STAGE_COMPLETION',
            });
          }
          for (const [formVersionId, pin] of orderScopedFormPins) {
            const formVersion = await tx.formVersion.findFirst({
              where: { id: formVersionId, workspaceId: principal.workspaceId, status: 'PUBLISHED' },
              include: { template: { select: { purpose: true } } },
            });
            if (!formVersion) throw new BadRequestError('A pinned lifecycle form version is no longer published.');
            if (formVersion.template.purpose === 'ORDER_SPEC') {
              await tx.formInstance.upsert({
                where: {
                  workspaceId_subjectType_subjectId_formVersionId: {
                    workspaceId: principal.workspaceId,
                    subjectType: 'ORDER',
                    subjectId: order.id,
                    formVersionId,
                  },
                },
                create: { workspaceId: principal.workspaceId, formVersionId, subjectType: 'ORDER', subjectId: order.id, required: pin.required, completionPoint: pin.completionPoint, status: 'PENDING' },
                update: pin.required ? { required: true, completionPoint: pin.completionPoint } : {},
              });
            }
          }
          await tx.orderLifecycleEvent.create({
            data: {
              workspaceId: principal.workspaceId,
              instanceId: lifecycle.id,
              eventType: 'LIFECYCLE_STARTED',
              actorUserId: principal.userId,
              detailJson: JSON.stringify({ workflowVersionId: lifecycleVersion.id, definitionHash: lifecycleVersion.definitionHash }),
            },
          });
        }

        // RFQ Context
        if (reviewedRfq) {
          const metadata = JSON.parse(reviewedRfq.extractedFieldsJson) as Record<string, unknown>;
          await tx.rfqDraft.update({
            where: { id: reviewedRfq.id },
            data: {
              orderId: order.id,
              sourceType: 'TEXT',
              extractedFieldsJson: JSON.stringify({ ...metadata, handoffOrderId: order.id, handedOffAt: new Date().toISOString() }),
            },
          });
        } else if (input.rfqText) {
          await tx.rfqDraft.create({
            data: {
              workspaceId: principal.workspaceId,
              orderId: order.id,
              rawText: input.rfqText,
              sourceType: input.rfqSourceType || 'MANUAL',
            },
          });
        }

        // Initialize Engineering Revision 1
        const publishedWf = input.workflowVersionId
          ? await tx.workflowVersion.findFirst({
              where: {
                id: input.workflowVersionId,
                workspaceId: principal.workspaceId,
                status: 'PUBLISHED',
                template: { orderTypeId: input.orderTypeId },
              },
            })
          : await tx.workflowVersion.findFirst({
              where: {
                workspaceId: principal.workspaceId,
                status: 'PUBLISHED',
                template: { orderTypeId: input.orderTypeId },
              },
              orderBy: { versionNumber: 'desc' },
            });
        if (input.workflowVersionId && !publishedWf) {
          throw new BadRequestError('Selected workflow must be published and compatible with this order type.');
        }

        const engineeringLines = await tx.orderLine.findMany({
          where: { workspaceId: principal.workspaceId, orderId: order.id },
          orderBy: { lineNumber: 'asc' },
        });
        for (const [index, line] of engineeringLines.entries()) {
          await tx.engineeringRevision.create({
            data: {
              workspaceId: principal.workspaceId,
              orderId: order.id,
              orderLineId: line.id,
              revisionNumber: index + 1,
              status: 'DRAFT',
              workflowVersionId: publishedWf?.id || null,
              outputBasisAtoms: BigInt(1_000_000), // 1 unit output basis
            },
          });
        }

        const fullOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: {
            customer: true,
            orderType: true,
            item: true,
            lines: {
              include: {
                item: true,
                uom: true,
              },
              orderBy: { lineNumber: 'asc' },
            },
            rfqDrafts: true,
            engineeringRevisions: {
              include: { bomLines: true },
            },
          },
        });

        return {
          data: fullOrder!,
          aggregateType: 'ORDER',
          aggregateId: order.id,
          resourceVersion: order.version,
          auditDetails: reviewedRfq ? { rfqDraftId: reviewedRfq.id } : undefined,
        };
      },
    });
  }

  async attachLifecycle(
    principal: Principal,
    orderId: string,
    input: contracts.AttachOrderLifecycleInput,
    idempotencyKey: string,
  ) {
    requirePermission(principal, 'order.create');
    if (!isOrderLifecycleEnabled()) {
      throw new BadRequestError('Order lifecycle rollout is disabled. A workflow cannot be attached to this draft yet.');
    }

    return executeCommand({
      principal,
      commandType: 'order.lifecycle.attach',
      idempotencyKey,
      expectedVersion: input.expectedVersion,
      payload: { orderId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, workspaceId: principal.workspaceId },
        });
        if (!order) throw new NotFoundError(`Order '${orderId}' not found`);
        if (order.version !== input.expectedVersion) {
          throw new ConflictError(`Order version mismatch: expected ${input.expectedVersion}, but found ${order.version}`, 'STALE_VERSION', true);
        }
        if (order.facilityId && !principal.facilityIds?.includes(order.facilityId)) {
          throw new ForbiddenError(`Access to facility '${order.facilityId}' is not granted to this membership`);
        }
        if (order.status !== 'DRAFT' || order.confirmedAt) {
          throw new BadRequestError('A lifecycle can only be attached before an order is confirmed.');
        }
        if (order.lifecycleWorkflowVersionId) {
          throw new ConflictError('This order already has a pinned lifecycle workflow.', 'LIFECYCLE_ALREADY_ATTACHED', false);
        }

        const lifecycleVersion = await tx.workflowVersion.findFirst({
          where: {
            id: input.workflowVersionId,
            workspaceId: principal.workspaceId,
            status: 'PUBLISHED',
            template: { kind: 'ORDER_LIFECYCLE', orderTypeId: order.orderTypeId, isArchived: false },
          },
        });
        if (!lifecycleVersion) {
          throw new BadRequestError('Selected order lifecycle must be published and compatible with this order type.');
        }

        let definition: OrderLifecycleDefinition;
        try {
          definition = orderLifecycleDefinitionSchema.parse(JSON.parse(lifecycleVersion.definitionJson)) as OrderLifecycleDefinition;
        } catch {
          throw new BadRequestError('Selected order lifecycle definition is invalid. Publish a corrected version.');
        }
        if (!validateLifecycleDefinition(definition).isValid) {
          throw new BadRequestError('Selected order lifecycle definition is no longer valid. Create a new published version.');
        }

        const assignedMembershipIds = [...new Set(definition.stages.flatMap((stage) =>
          stage.assignment.kind === 'MEMBER' ? [stage.assignment.membershipId] : []))];
        if (assignedMembershipIds.length) {
          const activeMemberships = await tx.membership.findMany({
            where: { workspaceId: principal.workspaceId, id: { in: assignedMembershipIds }, status: 'ACTIVE' },
            select: { id: true },
          });
          if (activeMemberships.length !== assignedMembershipIds.length) {
            throw new BadRequestError('The published lifecycle assigns a stage to an inactive or unavailable member. Publish a corrected version.');
          }
        }

        const pinnedFormIds = [...new Set(definition.stages.flatMap((stage) => stage.forms.map((form) => form.formVersionId)))];
        const formVersions = pinnedFormIds.length ? await tx.formVersion.findMany({
          where: { workspaceId: principal.workspaceId, id: { in: pinnedFormIds }, status: 'PUBLISHED' },
          include: { template: { select: { purpose: true } } },
        }) : [];
        const formVersionById = new Map<string, (typeof formVersions)[number]>(formVersions.map((version: (typeof formVersions)[number]) => [version.id, version]));
        for (const pin of definition.stages.flatMap((stage) => stage.forms)) {
          const version = formVersionById.get(pin.formVersionId);
          if (!version || version.contentHash !== pin.contentHash) {
            throw new BadRequestError('A pinned lifecycle form is no longer published at the expected version. Publish a corrected lifecycle.');
          }
        }

        const updated = await tx.order.updateMany({
          where: {
            id: order.id,
            workspaceId: principal.workspaceId,
            status: 'DRAFT',
            version: input.expectedVersion,
            lifecycleWorkflowVersionId: null,
          },
          data: { lifecycleWorkflowVersionId: lifecycleVersion.id, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          throw new ConflictError('Order changed while the lifecycle was being attached. Reload the draft and try again.', 'STALE_VERSION', true);
        }

        const lifecycle = await tx.orderLifecycleInstance.create({
          data: { workspaceId: principal.workspaceId, orderId: order.id, workflowVersionId: lifecycleVersion.id, status: 'ACTIVE' },
        });
        await tx.orderLifecycleStage.createMany({
          data: definition.stages.map((stage) => ({
            workspaceId: principal.workspaceId,
            instanceId: lifecycle.id,
            stageKey: stage.key,
            name: stage.name,
            action: stage.action,
            departmentId: stage.departmentId,
            assignedMembershipId: stage.assignment.kind === 'MEMBER' ? stage.assignment.membershipId : null,
            assignmentJson: JSON.stringify(stage.assignment),
            scheduleJson: JSON.stringify(stage.schedule),
            formPinsJson: JSON.stringify(stage.forms),
            predecessorKeysJson: JSON.stringify(stage.predecessors),
            activationConditionJson: JSON.stringify(stage.activationCondition ?? null),
            state: stage.predecessors.length === 0 ? 'READY' : 'PENDING',
            dueAt: stage.predecessors.length === 0 && stage.schedule.kind === 'DEADLINE'
              ? new Date(Date.now() + stage.schedule.dueAfterMinutes * 60_000)
              : null,
          })),
        });

        const orderSpecPins = new Map<string, { required: boolean; completionPoint: 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION' }>();
        for (const pin of definition.stages.flatMap((stage) => stage.forms)) {
          if (formVersionById.get(pin.formVersionId)?.template.purpose !== 'ORDER_SPEC') continue;
          const previous = orderSpecPins.get(pin.formVersionId);
          orderSpecPins.set(pin.formVersionId, {
            required: Boolean(previous?.required || pin.required),
            completionPoint: previous?.completionPoint === 'BEFORE_ACTION' || pin.completionPoint === 'BEFORE_ACTION'
              ? 'BEFORE_ACTION'
              : 'BEFORE_STAGE_COMPLETION',
          });
        }
        for (const [formVersionId, pin] of orderSpecPins) {
          await tx.formInstance.upsert({
            where: { workspaceId_subjectType_subjectId_formVersionId: {
              workspaceId: principal.workspaceId,
              subjectType: 'ORDER',
              subjectId: order.id,
              formVersionId,
            } },
            create: {
              workspaceId: principal.workspaceId,
              formVersionId,
              subjectType: 'ORDER',
              subjectId: order.id,
              required: pin.required,
              completionPoint: pin.completionPoint,
              status: 'PENDING',
            },
            update: pin.required ? { required: true, completionPoint: pin.completionPoint } : {},
          });
        }

        await tx.orderLifecycleEvent.create({
          data: {
            workspaceId: principal.workspaceId,
            instanceId: lifecycle.id,
            eventType: 'LIFECYCLE_STARTED',
            actorUserId: principal.userId,
            detailJson: JSON.stringify({ workflowVersionId: lifecycleVersion.id, definitionHash: lifecycleVersion.definitionHash, attachedToDraft: true }),
          },
        });
        const result = await tx.order.findFirst({
          where: { id: order.id, workspaceId: principal.workspaceId },
          include: { customer: true, orderType: true, item: true },
        });
        if (!result) throw new NotFoundError(`Order '${orderId}' not found`);
        return {
          data: result,
          aggregateType: 'ORDER',
          aggregateId: order.id,
          previousVersion: order.version,
          resourceVersion: result.version,
          auditDetails: { workflowVersionId: lifecycleVersion.id, definitionHash: lifecycleVersion.definitionHash },
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Add Order Line
  // -----------------------------------------------------------
  async addOrderLine(
    principal: Principal,
    orderId: string,
    input: contracts.AddOrderLineInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');

    return executeCommand({
      principal,
      commandType: 'order.line.add',
      idempotencyKey,
      payload: { orderId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, workspaceId: principal.workspaceId },
        });
        if (!order) throw new NotFoundError(`Order '${orderId}' not found`);

        if (order.status !== 'DRAFT' || order.confirmedAt) {
          throw new BadRequestError(
            `Cannot add order lines after confirmation or outside DRAFT status (current status '${order.status}')`
          );
        }

        const item = await tx.item.findFirst({
          where: { id: input.itemId, workspaceId: principal.workspaceId, archivedAt: null },
          include: { baseUom: true },
        });
        if (!item) throw new BadRequestError(`Item '${input.itemId}' not found or inactive`);

        let precision = item.baseUom.precision;
        if (input.uomId) {
          const uom = await tx.uom.findFirst({
            where: { id: input.uomId, workspaceId: principal.workspaceId, isActive: true },
            select: { id: true, precision: true },
          });
          if (!uom) throw new BadRequestError(`UOM '${input.uomId}' not found or inactive`);
          precision = uom.precision;
        }

        const maxLine = await tx.orderLine.findFirst({
          where: { orderId: order.id, workspaceId: principal.workspaceId },
          orderBy: { lineNumber: 'desc' },
        });
        const nextLineNumber = (maxLine?.lineNumber ?? 0) + 1;
        const lineAtoms = parseQuantity(String(input.orderedQuantity), precision);

        const orderLine = await tx.orderLine.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId: order.id,
            lineNumber: nextLineNumber,
            itemId: input.itemId,
            uomId: input.uomId ?? item.baseUomId,
            orderedAtoms: lineAtoms,
            unitPriceCents: input.unitPriceCents ? BigInt(input.unitPriceCents) : null,
            requestedDate: input.requestedDate ? new Date(input.requestedDate) : order.requestedDate,
            promisedDate: input.promisedDate ? new Date(input.promisedDate) : order.promisedDate,
            notes: input.notes,
          },
          include: {
            item: true,
            uom: true,
          },
        });

        const latestRevision = await tx.engineeringRevision.findFirst({
          where: { workspaceId: principal.workspaceId, orderId: order.id },
          orderBy: { revisionNumber: 'desc' },
          select: { revisionNumber: true },
        });
        await tx.engineeringRevision.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId: order.id,
            orderLineId: orderLine.id,
            revisionNumber: (latestRevision?.revisionNumber ?? 0) + 1,
            status: 'DRAFT',
            outputBasisAtoms: 1_000_000n,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            orderedAtoms: { increment: lineAtoms },
            version: { increment: 1 },
          },
        });

        return {
          data: orderLine,
          aggregateType: 'ORDER_LINE',
          aggregateId: orderLine.id,
          resourceVersion: 1,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Confirm Order
  // -----------------------------------------------------------
  async confirmOrder(
    principal: Principal,
    orderId: string,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');

    return executeCommand({
      principal,
      commandType: 'order.confirm',
      idempotencyKey,
      payload: { orderId },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, workspaceId: principal.workspaceId },
        });
        if (!order) throw new NotFoundError(`Order '${orderId}' not found`);

        if (order.status === 'CANCELLED') {
          throw new BadRequestError(`Cannot confirm order '${orderId}' in CANCELLED status`);
        }
        if ((order.status !== 'DRAFT' && order.status !== 'READY') || order.confirmedAt !== null) {
          throw new BadRequestError(`Only an unconfirmed DRAFT or READY order can be confirmed`);
        }

        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            confirmedAt: new Date(),
            confirmedById: principal.userId,
            version: { increment: 1 },
          },
          include: {
            customer: true,
            orderType: true,
            item: true,
            lines: {
              include: {
                item: true,
                uom: true,
              },
              orderBy: { lineNumber: 'asc' },
            },
          },
        });

        await completeLifecycleAction(tx, {
          workspaceId: principal.workspaceId,
          orderId: order.id,
          action: 'ORDER_CONFIRM',
          actorUserId: principal.userId,
          commandId: idempotencyKey,
        });

        return {
          data: updated,
          aggregateType: 'ORDER',
          aggregateId: updated.id,
          resourceVersion: updated.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Allocate Job (Bounded Job Split)
  // -----------------------------------------------------------
  async allocateJob(
    principal: Principal,
    input: contracts.AllocateJobInput,
    idempotencyKey: string
  ) {
    requireAnyPermission(principal, ['order.create', 'order.release']);

    return executeCommand({
      principal,
      commandType: 'order.job.allocate',
      idempotencyKey,
      payload: input,
      prismaClient: this.prisma,
      handler: async (tx) => {
        const line = await tx.orderLine.findFirst({
          where: { id: input.orderLineId, workspaceId: principal.workspaceId },
          include: { order: true, uom: true },
        });
        if (!line) throw new NotFoundError(`Order line '${input.orderLineId}' not found`);

        if (line.order.status !== 'DRAFT' || line.order.confirmedAt !== null) {
          throw new BadRequestError(`Jobs can only be allocated while the order is an unconfirmed draft`);
        }

        const targetAtoms = parseQuantity(String(input.targetQuantity), line.uom?.precision ?? 6);
        const remainingAtoms = line.orderedAtoms - line.allocatedAtoms;

        if (targetAtoms > remainingAtoms) {
          throw new BadRequestError(
            `Cannot allocate ${targetAtoms} atoms: exceeds remaining unallocated atoms (${remainingAtoms}) on order line '${line.id}'.`
          );
        }

        // Validate optional references
        if (input.departmentId) {
          const dept = await tx.department.findFirst({
            where: { id: input.departmentId, workspaceId: principal.workspaceId, archivedAt: null },
          });
          if (!dept) throw new BadRequestError(`Department '${input.departmentId}' not found or inactive`);
        }

        if (input.workflowVersionId) {
          const wf = await tx.workflowVersion.findFirst({
            where: {
              id: input.workflowVersionId,
              workspaceId: principal.workspaceId,
              status: 'PUBLISHED',
              orderTypeId: line.order.orderTypeId,
            },
          });
          if (!wf) throw new BadRequestError(`Workflow version '${input.workflowVersionId}' is not published for this order type`);
        }

        if (input.engineeringRevisionId) {
          const eng = await tx.engineeringRevision.findFirst({
            where: {
              id: input.engineeringRevisionId,
              workspaceId: principal.workspaceId,
              orderId: line.orderId,
              orderLineId: line.id,
              status: 'APPROVED',
            },
          });
          if (!eng) throw new BadRequestError(`Engineering revision '${input.engineeringRevisionId}' is not an approved revision for this order line`);
        }

        // Generate MO Number transaction-safely
        const moCount = await tx.manufacturingOrder.count({
          where: { workspaceId: principal.workspaceId },
        });
        const moNumber = input.moNumber || `MO-${String(moCount + 1).padStart(5, '0')}`;

        const manufacturingOrder = await tx.manufacturingOrder.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId: line.orderId,
            orderLineId: line.id,
            moNumber,
            departmentId: input.departmentId ?? null,
            workflowVersionId: input.workflowVersionId ?? null,
            engineeringRevisionId: input.engineeringRevisionId ?? null,
            targetAtoms,
            status: 'DRAFT',
          },
        });

        const updatedLine = await tx.orderLine.update({
          where: { id: line.id },
          data: {
            allocatedAtoms: { increment: targetAtoms },
          },
          include: {
            item: true,
            uom: true,
            manufacturingOrders: true,
          },
        });

        return {
          data: {
            manufacturingOrder,
            orderLine: updatedLine,
            unallocatedAtoms: updatedLine.orderedAtoms - updatedLine.allocatedAtoms,
          },
          aggregateType: 'MANUFACTURING_ORDER',
          aggregateId: manufacturingOrder.id,
          resourceVersion: manufacturingOrder.version,
        };
      },
    });
  }

  // -----------------------------------------------------------
  // Customer Questions
  // -----------------------------------------------------------
  async addCustomerQuestion(
    principal: Principal,
    orderId: string,
    input: contracts.AddCustomerQuestionInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.read');

    return executeCommand({
      principal,
      commandType: 'order.question.add',
      idempotencyKey,
      payload: { orderId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, workspaceId: principal.workspaceId },
        });
        if (!order) throw new NotFoundError(`Order '${orderId}' not found`);

        const q = await tx.customerQuestion.create({
          data: {
            workspaceId: principal.workspaceId,
            orderId,
            question: input.question,
            status: 'OPEN',
          },
        });

        return {
          data: q,
          aggregateType: 'ORDER_QUESTION',
          aggregateId: q.id,
          resourceVersion: 1,
        };
      },
    });
  }

  async resolveCustomerQuestion(
    principal: Principal,
    questionId: string,
    input: contracts.ResolveCustomerQuestionInput,
    idempotencyKey: string
  ) {
    requirePermission(principal, 'order.create');

    return executeCommand({
      principal,
      commandType: 'order.question.resolve',
      idempotencyKey,
      payload: { questionId, ...input },
      prismaClient: this.prisma,
      handler: async (tx) => {
        const question = await tx.customerQuestion.findFirst({
          where: { id: questionId, workspaceId: principal.workspaceId },
        });
        if (!question) throw new NotFoundError(`Question '${questionId}' not found`);

        const updated = await tx.customerQuestion.update({
          where: { id: questionId },
          data: {
            answer: input.answer,
            status: input.status,
            resolvedById: principal.userId,
            resolvedAt: new Date(),
          },
        });

        return {
          data: updated,
          aggregateType: 'ORDER_QUESTION',
          aggregateId: updated.id,
          resourceVersion: 1,
        };
      },
    });
  }
}

export const orderService = new OrderService();
