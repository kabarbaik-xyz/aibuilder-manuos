import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { RecoveryService } from '@/server/modules/intelligence/recovery';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/domain/errors';
import { parseQuantity } from '@/domain/quantity';

describe('SCH-09/AII-06: recovery proposal resolution lifecycle', () => {
  let fixture: FactoryFixture;
  let recovery: RecoveryService;
  let orderId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    recovery = new RecoveryService(fixture.db);

    const alpha = fixture.alpha;
    const order = await fixture.db.order.create({
      data: {
        workspaceId: alpha.workspaceId,
        customerId: alpha.masters.customerId,
        orderTypeId: alpha.masters.orderTypeId,
        itemId: alpha.masters.fgItemId,
        orderNumber: `SO-RECOVERY-${crypto.randomUUID().slice(0, 8)}`,
        orderedAtoms: 5_000_000n,
        requestedDate: new Date('2026-12-31T17:00:00.000Z'),
        status: 'RELEASED',
      },
    });
    await fixture.db.recoveryProposal.create({
      data: {
        workspaceId: alpha.workspaceId,
        orderId: order.id,
        orderVersion: order.version,
        proposalJson: JSON.stringify({ id: 'seed-proposal', orderId: order.id }),
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('lists saved proposals in the current workspace and resolves an authorized detail', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const page = await recovery.listProposals(principal, { page: 1, pageSize: 10 });
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.items.every(item => item.orderId === orderId)).toBe(true);
    expect(page.items.some(item => item.id && item.orderId === orderId)).toBe(true);

    const proposal = await fixture.db.recoveryProposal.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, orderId },
    });
    const detail = await recovery.getProposal(principal, proposal.id);
    expect(detail.id).toBe(proposal.id);
    expect(detail.orderNumber).toContain('SO-RECOVERY-');

    await expect(recovery.getProposal(fixture.beta.users.owner.principal, proposal.id)).rejects.toThrowError(NotFoundError);
  });

  it('rejects resolution without planning.write authority', async () => {
    const stripped = {
      ...fixture.alpha.users.owner.principal,
      permissions: new Set<string>(),
    };
    const proposal = await fixture.db.recoveryProposal.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, orderId },
    });
    await expect(
      recovery.rejectProposal(
        stripped,
        { proposalId: proposal.id, note: 'nope' },
        'key-recovery-reject-denied'
      )
    ).rejects.toThrowError(ForbiddenError);
  });

  it('rejects a proposal with actor and note, and closes the lifecycle', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const proposal = await fixture.db.recoveryProposal.findFirstOrThrow({
      where: { workspaceId: fixture.alpha.workspaceId, orderId },
    });

    const rejected = await recovery.rejectProposal(
      principal,
      { proposalId: proposal.id, note: 'Capacity recovered naturally' },
      'key-recovery-reject'
    );
    expect(rejected.data.status).toBe('REJECTED');
    expect(rejected.data.resolvedById).toBe(principal.userId);
    expect(rejected.data.resolutionNote).toBe('Capacity recovered naturally');

    await expect(
      recovery.rejectProposal(
        principal,
        { proposalId: proposal.id, note: 'again' },
        'key-recovery-reject-again'
      )
    ).rejects.toThrowError(BadRequestError);
  });

  it('rejects unknown proposals as not found', async () => {
    await expect(
      recovery.rejectProposal(
        fixture.alpha.users.owner.principal,
        { proposalId: '00000000-0000-4000-8000-000000000000', note: 'x' },
        'key-recovery-reject-missing'
      )
    ).rejects.toThrowError(NotFoundError);
  });
});
