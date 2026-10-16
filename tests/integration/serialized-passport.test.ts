import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { MastersService } from '@/server/modules/masters/service';
import { WorkflowService } from '@/server/modules/workflow/service';
import { OrderService } from '@/server/modules/orders/service';
import { EngineeringService } from '@/server/modules/engineering/service';
import { releaseOrder } from '@/server/modules/orders/release';
import { recordOutput } from '@/server/modules/execution/output';
import { createInspection, finalizeInspection } from '@/server/modules/quality/service';
import { PassportService } from '@/server/modules/quality/passport';
import { updatePassportSharing } from '@/server/modules/quality/passport-publication';
import { BadRequestError, NotFoundError } from '@/domain/errors';

describe('Recorded serialized output → immutable passport → explicit customer sharing', () => {
  let fixture: FactoryFixture;
  let taskId: string;
  let orderId: string;
  let itemId: string;
  let outputId: string;
  const serialNumber = 'SERIAL-RECORDED-001';
  beforeAll(async () => {
    fixture = await createFactoryFixture();
    const { alpha } = fixture;
    const owner = alpha.users.owner.principal;
    const masters = new MastersService(fixture.db);
    const item = await masters.createItem(owner, { code: 'SERIAL-UNIT', name: 'Serialized unit', itemType: 'FINISHED', baseUomId: alpha.masters.uomPcsId, tracking: 'SERIAL' }, 'serial-item');
    itemId = item.data.id;
    const workflows = new WorkflowService(fixture.db);
    const template = await workflows.createTemplate(owner, { code: 'SERIAL-FLOW', name: 'Serialized completion', orderTypeId: alpha.masters.orderTypeId }, 'serial-template');
    const version = await workflows.saveVersionDraft(owner, template.data.initialVersionId, {
      definition: { schemaVersion: 1, name: 'Serialized completion', nodes: [{ key: 'OP-FINAL', name: 'Final assembly', type: 'OPERATION', plannedDurationMinutes: 30 }], edges: [] },
    }, 'serial-version');
    await workflows.publishVersion(owner, version.data.id, 'serial-publish-workflow');
    const orders = new OrderService(fixture.db);
    const order = await orders.createOrderDraft(owner, { customerId: alpha.masters.customerId, orderTypeId: alpha.masters.orderTypeId, itemId, orderedQuantity: '2', requestedDate: '2026-12-01T00:00:00Z' }, 'serial-order');
    orderId = order.data.id;
    const engineering = new EngineeringService(fixture.db);
    const revisionId = order.data.engineeringRevisions[0].id;
    await engineering.saveEngineeringDraft(owner, revisionId, { workflowVersionId: version.data.id, bomLines: [] }, 'serial-engineering');
    await engineering.approveEngineeringRevision(owner, revisionId, 'serial-engineering-approve');
    const released = await releaseOrder(owner, orderId, 'serial-release', fixture.db);
    taskId = released.data.taskIds['OP-FINAL'];
    // Isolate output/QC/publication rules from dispatch/session tests.
    await fixture.db.task.update({ where: { id: taskId }, data: { status: 'RUNNING', assignedTechnicianId: alpha.masters.technicianId } });
  });
  afterAll(async () => { await fixture.close(); });

  it('rejects missing/fractional serial identity and records one physical unit exactly once', async () => {
    const owner = fixture.alpha.users.operator.principal;
    const base = { taskId, destinationLocationId: fixture.alpha.masters.quarantineLocationId, isFinal: true };
    await expect(recordOutput(fixture.db, owner, { ...base, outputAtoms: '1000000' }, 'missing-serial')).rejects.toThrow(BadRequestError);
    await expect(recordOutput(fixture.db, owner, { ...base, serialNumber, outputAtoms: '500000' }, 'fractional-serial')).rejects.toThrow(BadRequestError);
    const result = await recordOutput(fixture.db, owner, { ...base, serialNumber, outputAtoms: '1000000' }, 'record-serial');
    const replay = await recordOutput(fixture.db, owner, { ...base, serialNumber, outputAtoms: '1000000' }, 'record-serial');
    outputId = result.data.output.id;
    expect(replay.meta.replayed).toBe(true);
    expect(replay.data.output.id).toBe(outputId);
    const output = await fixture.db.productionOutput.findUniqueOrThrow({ where: { id: outputId } });
    const serial = await fixture.db.serial.findUniqueOrThrow({ where: { id: output.serialId! } });
    expect(serial.serialNumber).toBe(serialNumber);
    expect(serial.lotId).toBe(output.lotId);
    await expect(recordOutput(fixture.db, owner, { ...base, serialNumber, outputAtoms: '1000000' }, 'duplicate-serial')).rejects.toThrow(BadRequestError);
    expect(await fixture.db.productionOutput.count({ where: { serialId: serial.id } })).toBe(1);
    expect(await fixture.db.stockMovement.count({ where: { movementType: 'PRODUCTION_OUTPUT', referenceId: taskId } })).toBe(1);
  });

  it('requires full QC, publishes a canonical snapshot, and shares only on explicit authorization', async () => {
    const { alpha } = fixture;
    const service = new PassportService(fixture.db);
    const input = { serialNumber, itemId, orderId };
    await expect(service.publishPassport(alpha.users.qc.principal, input, 'premature-passport')).rejects.toThrow(BadRequestError);
    await expect(createInspection(fixture.db, alpha.users.qc.principal, { sourceType: 'PRODUCTION_OUTPUT', productionOutputId: outputId, inspectedAtoms: '500000' }, 'fractional-unit-inspection')).rejects.toThrow(BadRequestError);
    const inspection = await createInspection(fixture.db, alpha.users.qc.principal, { sourceType: 'PRODUCTION_OUTPUT', productionOutputId: outputId }, 'unit-inspection');
    await expect(finalizeInspection(fixture.db, alpha.users.qc.principal, { inspectionId: inspection.data.id, passedAtoms: '500000', reworkAtoms: '500000' }, 'split-unit-disposition')).rejects.toThrow(BadRequestError);
    await finalizeInspection(fixture.db, alpha.users.qc.principal, { inspectionId: inspection.data.id, passedAtoms: '1000000', destinationFgLocationId: alpha.masters.fgLocationId }, 'accept-unit');
    const published = await service.publishPassport(alpha.users.qc.principal, input, 'publish-unit-passport');
    const replay = await service.publishPassport(alpha.users.qc.principal, input, 'publish-unit-passport');
    expect(replay).toEqual(published);
    const snapshot = await service.getUnitPassport(alpha.users.qc.principal, serialNumber);
    expect(snapshot.digestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.sourceOutputId).toBe(outputId);
    expect(snapshot.genealogyScope).toBe('UNIT_WITH_JOB_BATCH_INPUTS');
    expect(snapshot.operations.every((operation) => operation.operatorName === null && operation.machineName === null)).toBe(true);
    await expect(service.getUnitPassport(alpha.users.customerUser.principal, serialNumber)).rejects.toThrow(NotFoundError);
    await updatePassportSharing(fixture.db, alpha.users.qc.principal, serialNumber, { action: 'SHARE' }, 'share-unit');
    expect((await service.getUnitPassport(alpha.users.customerUser.principal, serialNumber)).digestSha256).toBe(published.digestSha256);
    await fixture.db.order.update({ where: { id: orderId }, data: { deliveryAddress: 'Changed after publication' } });
    expect((await service.getUnitPassport(alpha.users.customerUser.principal, serialNumber)).digestSha256).toBe(published.digestSha256);
    await expect(fixture.db.passport.update({ where: { id: published.id }, data: { snapshotJson: '{}' } })).rejects.toThrow();
    await expect(fixture.db.passport.delete({ where: { id: published.id } })).rejects.toThrow();
    await updatePassportSharing(fixture.db, alpha.users.qc.principal, serialNumber, { action: 'REVOKE' }, 'revoke-unit');
    await expect(service.getUnitPassport(alpha.users.customerUser.principal, serialNumber)).rejects.toThrow(NotFoundError);
  });
});
