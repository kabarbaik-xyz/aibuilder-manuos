import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { OrderService } from '@/server/modules/orders/service';
import { getOrderEvidenceTimeline } from '@/server/modules/order-lifecycle/traceability';
import { ForbiddenError, NotFoundError } from '@/domain/errors';
import { FormService } from '@/server/modules/forms/service';

describe('Order evidence timeline', () => {
  let fixture: FactoryFixture;

  beforeAll(async () => { fixture = await createFactoryFixture(); });
  afterAll(async () => { await fixture.close(); });

  it('links shipment evidence to its order with readable labels and supports bounded search', async () => {
    const { alpha } = fixture;
    const order = await new OrderService(fixture.db).createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '2', requestedDate: '2026-12-22T00:00:00.000Z',
    }, 'evidence-timeline-order');
    const deliveredAt = new Date('2026-12-23T08:30:00.000Z');
    const shipment = await fixture.db.shipment.create({ data: {
      workspaceId: alpha.workspaceId, shipmentNumber: 'SHP-TIMELINE-1', orderId: order.data.id,
      customerId: alpha.masters.customerId, status: 'DELIVERED', deliveredAt,
      destinationAddress: 'Customer receiving dock',
    } });
    await fixture.db.shipmentLine.create({ data: {
      workspaceId: alpha.workspaceId, shipmentId: shipment.id, itemId: alpha.masters.fgItemId,
      sourceLocationId: alpha.masters.fgLocationId, allocatedAtoms: 2_000_000n,
      dispatchedAtoms: 2_000_000n, deliveredAtoms: 2_000_000n,
    } });
    const secondShipment = await fixture.db.shipment.create({ data: {
      workspaceId: alpha.workspaceId, shipmentNumber: 'SHP-TIMELINE-2', orderId: order.data.id,
      customerId: alpha.masters.customerId, status: 'DISPATCHED',
      allocatedAt: new Date('2026-12-24T07:00:00.000Z'), dispatchedAt: new Date('2026-12-24T09:00:00.000Z'),
      destinationAddress: 'Customer receiving dock',
    } });
    await fixture.db.shipmentLine.create({ data: {
      workspaceId: alpha.workspaceId, shipmentId: secondShipment.id, itemId: alpha.masters.fgItemId,
      sourceLocationId: alpha.masters.fgLocationId, allocatedAtoms: 1_000_000n,
      dispatchedAtoms: 1_000_000n,
    } });
    const passport = await fixture.db.passport.create({ data: {
      workspaceId: alpha.workspaceId, serialNumber: 'SN-TIMELINE-1', orderId: order.data.id,
      itemId: alpha.masters.fgItemId, digestSha256: 'a'.repeat(64), snapshotJson: JSON.stringify({ serialNumber: 'SN-TIMELINE-1' }),
      publishedById: alpha.users.owner.principal.userId,
    } });

    const timeline = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id);
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `SHIPMENT:${shipment.id}:DELIVERED`, category: 'DELIVERY', title: 'Shipment delivered',
      label: 'SHP-TIMELINE-1', occurredAt: deliveredAt.toISOString(),
      orderId: order.data.id, shipmentId: shipment.id,
    }));
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `SHIPMENT:${secondShipment.id}:DISPATCHED`, title: 'Shipment dispatched',
      label: 'SHP-TIMELINE-2', shipmentId: secondShipment.id,
    }));
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `PASSPORT_PUBLICATION:${passport.id}:v1`, category: 'PASSPORT',
      title: 'Unit passport published', label: 'SN-TIMELINE-1', href: '/passports/SN-TIMELINE-1',
    }));
    const searched = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id, { search: 'shipment delivered' });
    expect(searched.events).toHaveLength(1);
    expect(searched.events[0].shipmentId).toBe(shipment.id);
    expect(searched.events[0].references).not.toContain(shipment.id);
    const searchedById = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id, { search: shipment.id });
    expect(searchedById.events.map(event => event.reference)).toContain(`SHIPMENT:${shipment.id}:DELIVERED`);
  });

  it('does not reveal another facility order or customer-internal evidence', async () => {
    const { alpha } = fixture;
    const order = await new OrderService(fixture.db).createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-12-22T00:00:00.000Z',
    }, 'evidence-timeline-private-order');
    const facility = await fixture.db.facility.create({ data: {
      workspaceId: alpha.workspaceId, code: 'EVIDENCE-PRIVATE', name: 'Evidence private facility',
    } });
    await fixture.db.order.update({ where: { id: order.data.id }, data: { facilityId: facility.id } });
    await expect(getOrderEvidenceTimeline(fixture.db, alpha.users.planner.principal, order.data.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOrderEvidenceTimeline(fixture.db, alpha.users.customerUser.principal, order.data.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('shows recovery proposals as pending until the applied result is persisted', async () => {
    const { alpha } = fixture;
    const order = await new OrderService(fixture.db).createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-12-22T00:00:00.000Z',
    }, 'evidence-timeline-recovery-order');
    const pending = await fixture.db.recoveryProposal.create({ data: {
      workspaceId: alpha.workspaceId, orderId: order.data.id, orderVersion: order.data.version,
      proposalJson: JSON.stringify({ mode: 'SCHEDULE_REVIEW' }), proposedById: alpha.users.owner.principal.userId,
    } });
    const applied = await fixture.db.recoveryProposal.create({ data: {
      workspaceId: alpha.workspaceId, orderId: order.data.id, orderVersion: order.data.version,
      proposalJson: JSON.stringify({ mode: 'SCHEDULE_REVIEW' }), status: 'APPROVED',
      proposedById: alpha.users.owner.principal.userId, resolvedById: alpha.users.owner.principal.userId,
      resolvedAt: new Date('2026-12-23T10:00:00.000Z'), resolutionNote: 'Applied 2 reviewed task assignments.',
    } });

    const timeline = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id);
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `RECOVERY_PROPOSAL:${pending.id}:PROPOSED`, title: 'Schedule review awaiting decision',
      summary: 'Proposal is a review only; no schedule change is recorded until the apply command succeeds.',
    }));
    expect(timeline.events).toContainEqual(expect.objectContaining({
      reference: `RECOVERY_PROPOSAL:${applied.id}:APPROVED`, title: 'Reviewed schedule applied',
      summary: 'Applied 2 reviewed task assignments.',
    }));
  });

  it('omits task form evidence when the reader cannot access the underlying task', async () => {
    const { alpha } = fixture;
    const order = await new OrderService(fixture.db).createOrderDraft(alpha.users.owner.principal, {
      customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId,
      itemId: alpha.masters.fgItemId, orderedQuantity: '1', requestedDate: '2026-12-22T00:00:00.000Z',
    }, 'evidence-timeline-task-form-order');
    const workflowTemplate = await fixture.db.workflowTemplate.create({ data: {
      workspaceId: alpha.workspaceId, orderTypeId: alpha.masters.orderTypeId,
      code: 'WF-TIMELINE-PRIVATE-FORM', name: 'Timeline private form workflow',
    } });
    const workflowVersion = await fixture.db.workflowVersion.create({ data: {
      workspaceId: alpha.workspaceId, templateId: workflowTemplate.id,
      versionNumber: 1, status: 'PUBLISHED', definitionJson: '{}',
    } });
    const revision = await fixture.db.engineeringRevision.findFirstOrThrow({ where: { orderId: order.data.id } });
    const workflowInstance = await fixture.db.workflowInstance.create({ data: {
      workspaceId: alpha.workspaceId, orderId: order.data.id,
      workflowVersionId: workflowVersion.id, engineeringRevisionId: revision.id,
    } });
    const task = await fixture.db.task.create({ data: {
      workspaceId: alpha.workspaceId, instanceId: workflowInstance.id,
      nodeKey: 'PRIVATE-OP', assignedTechnicianId: alpha.masters.technicianId,
    } });
    const formService = new FormService(fixture.db);
    const form = await formService.createTemplate(alpha.users.owner.principal, {
      code: 'TIMELINE_PRIVATE_TASK_FORM', name: 'Private task evidence', purpose: 'TASK_EVIDENCE',
    });
    await formService.publishFormVersion(alpha.users.owner.principal, {
      templateId: form.templateId, versionId: form.versionId, expectedVersion: 1,
    });
    const formInstance = await fixture.db.$transaction((tx) => formService.createFormInstance(tx, {
      workspaceId: alpha.workspaceId, formVersionId: form.versionId,
      subjectType: 'TASK', subjectId: task.id,
    }));
    const submission = await fixture.db.formSubmission.create({ data: {
      workspaceId: alpha.workspaceId, instanceId: formInstance.instanceId,
      sequenceNumber: 1, status: 'FINAL', answersJson: '{}',
      actorId: alpha.users.owner.principal.userId, finalizedAt: new Date('2026-12-20T10:00:00.000Z'),
    } });
    const correction = await fixture.db.formSubmission.create({ data: {
      workspaceId: alpha.workspaceId, instanceId: formInstance.instanceId,
      sequenceNumber: 2, status: 'FINAL', answersJson: '{"corrected":true}',
      actorId: alpha.users.owner.principal.userId, finalizedAt: new Date('2026-12-20T10:30:00.000Z'),
      correctionReason: 'Corrected the recorded measurement', supersedesId: submission.id,
    } });
    const privateShipment = await fixture.db.shipment.create({ data: {
      workspaceId: alpha.workspaceId, shipmentNumber: 'SHP-TIMELINE-PRIVATE', orderId: order.data.id,
      customerId: alpha.masters.customerId, status: 'ALLOCATED', allocatedAt: new Date('2026-12-20T11:00:00.000Z'),
      destinationAddress: 'Private delivery address', trackingNumber: 'PRIVATE-TRACKING-1',
    } });
    const ownerTimeline = await getOrderEvidenceTimeline(fixture.db, alpha.users.owner.principal, order.data.id);
    expect(ownerTimeline.events.some(event => event.reference === `FORM_SUBMISSION:${submission.id}`)).toBe(true);
    expect(ownerTimeline.events).toContainEqual(expect.objectContaining({
      reference: `FORM_SUBMISSION:${correction.id}`, title: 'Form evidence corrected',
      summary: 'Corrected the recorded measurement', submissionId: correction.id,
    }));

    const role = await fixture.db.role.create({ data: {
      workspaceId: alpha.workspaceId, code: 'TIMELINE_EVIDENCE_READER', name: 'Timeline evidence reader',
    } });
    await fixture.db.rolePermission.createMany({ data: ['order.read', 'forms.read'].map(permissionCode => ({
      workspaceId: alpha.workspaceId, roleId: role.id, permissionCode,
    })) });
    await fixture.db.membershipRole.deleteMany({ where: { membershipId: alpha.users.qc.membershipId } });
    await fixture.db.membershipRole.create({ data: {
      workspaceId: alpha.workspaceId, membershipId: alpha.users.qc.membershipId, roleId: role.id,
    } });
    const restrictedReader = {
      ...alpha.users.qc.principal,
      permissions: new Set(['order.read', 'forms.read']),
      roles: [role.code],
    };

    const timeline = await getOrderEvidenceTimeline(fixture.db, restrictedReader, order.data.id);
    expect(timeline.events.some(event => event.reference === `FORM_SUBMISSION:${submission.id}`)).toBe(false);
    expect(timeline.events.some(event => event.reference === `FORM_SUBMISSION:${correction.id}`)).toBe(false);
    expect(timeline.events.some(event => event.reference.startsWith('ENGINEERING_REVISION:'))).toBe(false);
    expect(timeline.events.some(event => event.reference.startsWith(`SHIPMENT:${privateShipment.id}:`))).toBe(false);
  });
});
