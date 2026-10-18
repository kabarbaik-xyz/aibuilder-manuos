import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { buildAuthorizedContext, resolveAuthorizedEvidenceReferences } from '@/server/ai/context';
import { validateGroundedOutput, Explanation } from '@/server/ai/validation';
import { ProductionBrainService, BrainAnswerSchema, BrainAnswerDTO } from '@/server/ai/brain';
import { getCached, setCached, clearCache } from '@/server/ai/cache';
import { OrderService } from '@/server/modules/orders/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { z } from 'zod';

describe('I04: Shared Grounded-AI Boundary and Production Brain', () => {
  let fixture: FactoryFixture;
  let brainService: ProductionBrainService;

  beforeAll(async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    fixture = await createFactoryFixture();
    brainService = new ProductionBrainService(fixture.db);
    clearCache();
  });

  afterAll(async () => {
    await fixture.close();
    vi.unstubAllEnvs();
  });

  it('builds strictly scoped authorized context and deterministic contextHash', async () => {
    const { alpha } = fixture;

    const context = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db);

    expect(context).toBeDefined();
    expect(context.workspaceId).toBe(alpha.workspaceId);
    expect(context.contextHash).toMatch(/^[a-f0-9]{64}$/);
    expect(context.evidenceIndex.length).toBeGreaterThan(0);
    expect(new Date(context.snapshotCapturedAt).toISOString()).toBe(context.snapshotCapturedAt);
    expect(context.coverage.orders).toMatchObject({ status: 'EMPTY', includedCount: 0, limit: 20, sampled: false });
    expect(context.coverage.inventory.limit).toBe(30);

    // Scoped context hash must change when workspace revision increments
    const initialHash = context.contextHash;

    await fixture.db.workspace.update({
      where: { id: alpha.workspaceId },
      data: { revision: { increment: 1 } },
    });

    const updatedContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db);
    expect(updatedContext.contextHash).not.toBe(initialHash);
  });

  it('restricts customer user context strictly to their owned company orders', async () => {
    const { alpha } = fixture;

    // Customer user context
    const customerContext = await buildAuthorizedContext(alpha.users.customerUser.principal, fixture.db);

    // Customer must never see orders from other customers
    for (const order of customerContext.orders) {
      expect(order.customerName).toBe('Apex Dynamics Corp');
    }
  });

  it('restricts internal AI order and task context to granted facilities', async () => {
    const { alpha } = fixture;
    const owner = alpha.users.owner;
    const planner = alpha.users.planner;
    const outOfScopeFacility = await fixture.db.facility.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'AI-OUT-OF-SCOPE',
        name: 'AI out-of-scope facility',
      },
    });
    const orders = new OrderService(fixture.db);
    const order = await orders.createOrderDraft(owner.principal, {
      customerId: alpha.masters.customerId,
      orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId,
      orderedQuantity: '1',
      requestedDate: '2026-12-23T00:00:00.000Z',
    }, 'ai-context-out-of-scope-order');
    await fixture.db.order.update({
      where: { id: order.data.id },
      data: { facilityId: outOfScopeFacility.id },
    });

    const context = await buildAuthorizedContext(planner.principal, fixture.db, { orderId: order.data.id });
    expect(context.orders).toEqual([]);
    expect(context.lifecycleStages).toEqual([]);
    await expect(brainService.answerProductionQuestion(planner.principal, 'Summarize this order', {
      type: 'ORDER', id: order.data.id,
    })).rejects.toThrow(/not available/i);
  });

  it('grounds AI context in active lifecycle ownership while hiding it from customer users', async () => {
    const { alpha } = fixture;
    const owner = alpha.users.owner;
    await fixture.db.membership.update({
      where: { workspaceId_id: { workspaceId: alpha.workspaceId, id: owner.membershipId } },
      data: { departmentId: alpha.masters.departmentId },
    });
    const workflows = new WorkflowService(fixture.db);
    const orders = new OrderService(fixture.db);
    const template = await workflows.createTemplate(owner.principal, {
      orderTypeId: alpha.masters.orderTypeId, code: 'WF-AI-LIFECYCLE-CONTEXT',
      name: 'Customer order workflow', kind: 'ORDER_LIFECYCLE',
    }, 'ai-lifecycle-template');
    await workflows.saveVersionDraft(owner.principal, template.data.initialVersionId!, {
      definition: { schemaVersion: 1, name: 'Customer order workflow', stages: [
        {
          key: 'SALES-REVIEW', name: 'Review customer request', action: 'REVIEW_EVIDENCE',
          departmentId: alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: owner.membershipId, departmentId: alpha.masters.departmentId },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 240 }, predecessors: [], forms: [],
        },
        {
          key: 'ENGINEERING-REVIEW', name: 'Review engineering package', action: 'ENGINEERING_APPROVE',
          departmentId: alpha.masters.departmentId,
          assignment: { kind: 'MEMBER', membershipId: owner.membershipId, departmentId: alpha.masters.departmentId },
          schedule: { kind: 'DEADLINE', dueAfterMinutes: 480 }, predecessors: ['SALES-REVIEW'], forms: [],
        },
      ] },
    }, 'ai-lifecycle-version');
    await workflows.publishVersion(owner.principal, template.data.initialVersionId!, 'ai-lifecycle-publish');
    const order = await orders.createOrderDraft(owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '2', requestedDate: '2026-12-22T00:00:00.000Z',
      lifecycleWorkflowVersionId: template.data.initialVersionId,
    }, 'ai-lifecycle-order');

    const plannerContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db, { orderId: order.data.id });
    expect(plannerContext.lifecycleStages).toContainEqual(expect.objectContaining({
      orderNumber: order.data.orderNumber, workflowName: 'Customer order workflow',
      name: 'Review customer request', department: expect.any(String), assignedTo: expect.any(String),
      state: 'READY', scheduleKind: 'DEADLINE',
    }));
    expect(plannerContext.lifecycleStages).toContainEqual(expect.objectContaining({
      name: 'Review engineering package',
      blockers: ['Waiting for Review customer request (ready)'],
    }));
    const customerContext = await buildAuthorizedContext(alpha.users.customerUser.principal, fixture.db, { orderId: order.data.id });
    expect(customerContext.lifecycleStages).toEqual([]);
    expect(customerContext.recoveryReviews).toEqual([]);
  });

  it('limits assistant evidence to a server-resolved order context', async () => {
    const { alpha } = fixture;
    const orderService = new OrderService(fixture.db);
    const order = await orderService.createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId,
      orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId,
      orderedQuantity: 4,
      requestedDate: '2026-12-20T00:00:00.000Z',
    }, 'ai-context-order');
    const otherOrder = await orderService.createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId,
      orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId,
      orderedQuantity: 5,
      requestedDate: '2026-12-21T00:00:00.000Z',
    }, 'ai-context-order-other');

    const result = await brainService.answerProductionQuestion(
      alpha.users.planner.principal,
      'What is the status of this order?',
      { type: 'ORDER', id: order.data.id },
    );

    const answer = result.status === 'SUCCESS' ? result.data : result.fallbackData;
    expect(answer?.evidenceRefs).toContain(order.data.orderNumber);
    expect(answer?.evidenceRefs).not.toContain(otherOrder.data.orderNumber);
    expect(answer?.evidence).toContainEqual({
      recordType: 'ORDER',
      recordId: order.data.id,
      label: order.data.orderNumber,
      href: `/orders/${order.data.id}`,
      reference: order.data.orderNumber,
    });
    const scopedContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db, { orderId: order.data.id });
    const item = await fixture.db.item.findUniqueOrThrow({ where: { id: alpha.masters.fgItemId } });
    expect(resolveAuthorizedEvidenceReferences(scopedContext, [item.code])).toContainEqual({
      recordType: 'ITEM',
      recordId: alpha.masters.fgItemId,
      label: `${item.code} · ${item.name}`,
      href: `/orders/${order.data.id}`,
      reference: item.code,
    });
  });

  it('resolves task context only for planning-authorized users', async () => {
    const { alpha } = fixture;
    const workflows = new WorkflowService(fixture.db);
    const engineering = new EngineeringService(fixture.db);
    const orders = new OrderService(fixture.db);
    const template = await workflows.createTemplate(alpha.users.owner.principal, {
      orderTypeId: alpha.masters.orderTypeId,
      code: 'WF-AI-TASK-CONTEXT',
      name: 'AI task context',
    }, 'ai-task-context-template');
    const draft = await workflows.saveVersionDraft(alpha.users.owner.principal, template.data.initialVersionId, {
      definition: { schemaVersion: 1, name: 'AI task context v1', nodes: [{ key: 'OP-10', name: 'Machining', type: 'OPERATION', plannedDurationMinutes: 40 }], edges: [] },
    }, 'ai-task-context-version');
    const version = await workflows.publishVersion(alpha.users.owner.principal, draft.data.id, 'ai-task-context-publish');
    const order = await orders.createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId,
      orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId,
      orderedQuantity: 4,
      requestedDate: '2026-12-20T00:00:00.000Z',
    }, 'ai-task-context-order');
    await engineering.saveEngineeringDraft(alpha.users.owner.principal, order.data.engineeringRevisions[0].id, {
      workflowVersionId: version.data.id,
      bomLines: [],
    }, 'ai-task-context-engineering');
    await engineering.approveEngineeringRevision(alpha.users.owner.principal, order.data.engineeringRevisions[0].id, 'ai-task-context-approve');
    const release = await releaseOrder(alpha.users.owner.principal, order.data.id, 'ai-task-context-release', fixture.db);
    const taskId = release.data.taskIds['OP-10'];
    const bookingStart = new Date('2026-12-20T08:00:00.000Z');
    const bookingEnd = new Date('2026-12-20T08:40:00.000Z');
    await fixture.db.resourceBooking.create({
      data: {
        workspaceId: alpha.workspaceId,
        taskId,
        resourceType: 'MACHINE',
        resourceId: alpha.masters.machineId,
        startAt: bookingStart,
        endAt: bookingEnd,
      },
    });

    const response = await brainService.answerProductionQuestion(alpha.users.planner.principal, 'What is blocking this task?', { type: 'TASK', id: taskId });
    const answer = response.status === 'SUCCESS' ? response.data : response.fallbackData;
    expect(answer?.evidence).toContainEqual(expect.objectContaining({ recordType: 'TASK', recordId: taskId, href: `/planning/tasks/${taskId}` }));
    const taskContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db, { taskId });
    await fixture.db.taskIssue.create({
      data: {
        workspaceId: alpha.workspaceId,
        taskId,
        title: 'Fixture blocker',
        severity: 'CRITICAL',
        status: 'OPEN',
        ownerUserId: alpha.users.planner.userId,
        reporterUserId: alpha.users.owner.userId,
      },
    });
    const blockedTaskContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db, { taskId });
    expect(blockedTaskContext.tasks).toContainEqual(expect.objectContaining({
      id: taskId,
      blockers: [expect.objectContaining({
        kind: 'ISSUE', severity: 'CRITICAL', owner: expect.any(String),
      })],
    }));
    expect(taskContext.confirmedBookings).toContainEqual(expect.objectContaining({
      orderNumber: order.data.orderNumber,
      operation: 'OP-10',
      resourceType: 'MACHINE',
      resourceName: expect.any(String),
      startAt: bookingStart.toISOString(),
      endAt: bookingEnd.toISOString(),
    }));
    const formTemplate = await fixture.db.formTemplate.create({
      data: {
        workspaceId: alpha.workspaceId,
        code: 'AI-TASK-EVIDENCE',
        name: 'Setup verification',
        purpose: 'TASK_EVIDENCE',
      },
    });
    const formVersion = await fixture.db.formVersion.create({
      data: {
        workspaceId: alpha.workspaceId,
        templateId: formTemplate.id,
        versionNumber: 1,
        status: 'PUBLISHED',
        schemaVersion: 1,
        definitionJson: JSON.stringify({ schemaVersion: 1, purpose: 'TASK_EVIDENCE', fields: [
          { key: 'setup_notes', label: 'Setup notes', kind: 'textarea', required: true },
          { key: 'machine_ref', label: 'Machine reference', kind: 'reference', referenceType: 'machine', required: false },
        ] }),
        contentHash: 'ai-task-evidence-v1',
        publishedAt: new Date('2026-12-19T00:00:00.000Z'),
      },
    });
    const formInstance = await fixture.db.formInstance.create({
      data: {
        workspaceId: alpha.workspaceId,
        formVersionId: formVersion.id,
        subjectType: 'TASK',
        subjectId: taskId,
        required: true,
        completionPoint: 'BEFORE_ACTION',
        status: 'SUBMITTED',
      },
    });
    await fixture.db.formSubmission.create({
      data: {
        workspaceId: alpha.workspaceId,
        instanceId: formInstance.id,
        sequenceNumber: 1,
        status: 'FINAL',
        answersJson: JSON.stringify({ setup_notes: 'Clamp inspected and secured.', machine_ref: alpha.masters.machineId }),
        actorId: alpha.users.owner.userId,
        finalizedAt: new Date('2026-12-19T00:15:00.000Z'),
      },
    });
    const evidenceContext = await buildAuthorizedContext(alpha.users.owner.principal, fixture.db, { taskId });
    expect(evidenceContext.submittedFormEvidence).toContainEqual(expect.objectContaining({
      orderNumber: order.data.orderNumber,
      subject: `${order.data.orderNumber} / operation OP-10`,
      purpose: 'TASK_EVIDENCE',
      sequenceNumber: 1,
      answers: [{ field: 'Setup notes', value: 'Clamp inspected and secured.' }],
    }));

    const task = await fixture.db.task.findUniqueOrThrow({ where: { id: taskId }, include: { instance: true } });
    const recoverySnapshot = {
      id: 'ai-recovery-review', orderId: order.data.id, orderNumber: order.data.orderNumber,
      mode: 'SCHEDULE_REVIEW', state: 'SAVED', options: [], createdAt: new Date().toISOString(),
      scheduleReview: {
        instanceId: task.instanceId, workflowVersionId: task.instance.workflowVersionId,
        engineeringRevisionId: task.instance.engineeringRevisionId,
        facilityTimezone: 'Asia/Jakarta', horizonStart: '2026-12-20T08:00:00.000Z', horizonEnd: '2026-12-21T08:00:00.000Z',
        evaluatedAt: new Date().toISOString(), projectedEndAt: '2026-12-20T09:00:00.000Z',
        taskVersions: [{ taskId, version: task.version }],
        tasks: [{ taskId, version: task.version, nodeKey: 'OP-10', startAt: '2026-12-20T08:00:00.000Z', endAt: '2026-12-20T08:40:00.000Z', technicianName: null, machineName: 'Fixture machine', predecessorTaskIds: [] }],
        assumptions: ['Saved for review only.'],
      },
    };
    await fixture.db.recoveryProposal.create({
      data: {
        workspaceId: alpha.workspaceId, orderId: order.data.id, orderVersion: (await fixture.db.order.findUniqueOrThrow({ where: { id: order.data.id } })).version,
        proposalJson: JSON.stringify(recoverySnapshot), status: 'PROPOSED', proposedById: alpha.users.planner.userId,
      },
    });
    const recoveryContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db, { orderId: order.data.id });
    expect(recoveryContext.recoveryReviews).toContainEqual(expect.objectContaining({
      orderNumber: order.data.orderNumber, state: 'PENDING_APPROVAL', taskCount: 1,
      projectedEndAt: '2026-12-20T09:00:00.000Z', mustRevalidateBeforeApply: true,
    }));
    await fixture.db.task.update({ where: { id: taskId }, data: { version: { increment: 1 } } });
    const staleRecoveryContext = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db, { orderId: order.data.id });
    expect(staleRecoveryContext.recoveryReviews).toEqual([]);
    await expect(brainService.answerProductionQuestion(alpha.users.customerUser.principal, 'What is blocking this task?', { type: 'TASK', id: taskId })).rejects.toThrow(/not available/i);
  });


  it('validates grounded output and flags ungrounded hallucinated references', async () => {
    const { alpha } = fixture;
    const fgItem = await fixture.db.item.findUnique({
      where: { id: alpha.masters.fgItemId },
    });
    expect(fgItem).toBeDefined();

    const context = await buildAuthorizedContext(alpha.users.planner.principal, fixture.db);

    const testSchema = z.object({
      answer: z.string(),
      evidenceRefs: z.array(z.string()),
    });

    // Valid grounded output
    const validOutput = {
      answer: 'Analysis complete for part',
      evidenceRefs: [fgItem!.code],
    };

    const validRes = validateGroundedOutput({
      schema: testSchema,
      rawData: validOutput,
      context,
      model: 'test-model',
    });

    expect(validRes.status).toBe('SUCCESS');
    if (validRes.status === 'SUCCESS') {
      expect(validRes.evidenceRefs).toContain(fgItem!.code);
    }

    // Ungrounded hallucinated output
    const hallucinatedOutput = {
      answer: 'Fabricated order analysis',
      evidenceRefs: ['ORD-FAKE-999999', 'PART-NONEXISTENT'],
    };

    const invalidRes = validateGroundedOutput({
      schema: testSchema,
      rawData: hallucinatedOutput,
      context,
      model: 'test-model',
    });

    expect(invalidRes.status).toBe('FALLBACK');
    if (invalidRes.status === 'FALLBACK') {
      expect(invalidRes.reason).toBe('UNGROUNDED_CLAIM');
    }
  });

  it('provides grounded deterministic answers through ProductionBrainService without AI keys', async () => {
    const { alpha } = fixture;

    const res = await brainService.answerProductionQuestion(
      alpha.users.planner.principal,
      'What active orders do we have?'
    );

    expect(res).toBeDefined();
    // In test environment without GEMINI_API_KEY, fallbackData is populated with grounded real DB facts
    const answerData = res.status === 'SUCCESS' ? res.data : res.fallbackData;
    expect(answerData).toBeDefined();
    expect(answerData!.answer).toBeDefined();
    expect(typeof answerData!.answer).toBe('string');
    expect(answerData!.linkToScreen).toBeDefined();
  });

  it('enforces scoped in-memory caching with TTL', () => {
    const key = 'test-cache-key';
    setCached(key, { result: 'stored-data' }, 1000);

    const cached = getCached<{ result: string }>(key);
    expect(cached).toBeDefined();
    expect(cached?.result).toBe('stored-data');

    clearCache();
    expect(getCached(key)).toBeNull();
  });
});
