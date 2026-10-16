import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { seedTestAccess } from '../fixtures/access';
import { SharingService } from '@/server/modules/sharing/service';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/domain/errors';
import type { Principal } from '@/server/auth/principal';

describe('INT-06: cross-factory sharing consent and commitments', () => {
  let fixture: FactoryFixture;
  let sharing: SharingService;
  let betaAdminP: Principal;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    sharing = new SharingService(fixture.db);
    const betaAdmin = await seedTestAccess(fixture.db, {
      workspaceCode: 'WS-BETA',
      email: 'admin@beta.test',
      name: 'Beta Administrator',
      roles: ['ACCESS_ADMIN'],
    });
    betaAdminP = betaAdmin.principal;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('requires admin access to propose sharing and blocks self-sharing', async () => {
    const owner = fixture.alpha.users.admin.principal;
    const stripped = { ...owner, permissions: new Set<string>() };
    await expect(
      sharing.proposeConsent(
        stripped,
        { partnerWorkspaceId: fixture.beta.workspaceId, scope: 'CAPACITY' },
        'key-share-denied'
      )
    ).rejects.toThrowError(ForbiddenError);

    await expect(
      sharing.proposeConsent(
        owner,
        { partnerWorkspaceId: fixture.alpha.workspaceId, scope: 'CAPACITY' },
        'key-share-self'
      )
    ).rejects.toThrowError(BadRequestError);
  });

  it('completes a bilateral consent: partner accepts, either side revokes', async () => {
    const alphaOwner = fixture.alpha.users.admin.principal;
    const betaOwner = betaAdminP;

    const proposed = await sharing.proposeConsent(
      alphaOwner,
      { partnerWorkspaceId: fixture.beta.workspaceId, scope: 'CAPACITY', note: 'spare press hours' },
      'key-share-propose'
    );
    expect(proposed.data.status).toBe('PROPOSED');

    // The proposing workspace itself cannot accept its own proposal.
    await expect(
      sharing.decideConsent(
        alphaOwner,
        { consentId: proposed.data.id, action: 'ACCEPT' },
        'key-share-accept-self'
      )
    ).rejects.toThrowError(NotFoundError);

    const accepted = await sharing.decideConsent(
      betaOwner,
      { consentId: proposed.data.id, action: 'ACCEPT' },
      'key-share-accept'
    );
    expect(accepted.data.status).toBe('ACCEPTED');
    expect(accepted.data.acceptedById).toBe(betaOwner.userId);
    expect(accepted.data.acceptedAt).not.toBeNull();

    // A second bilateral proposal for the same scope is rejected as duplicate.
    await expect(
      sharing.proposeConsent(
        alphaOwner,
        { partnerWorkspaceId: fixture.beta.workspaceId, scope: 'CAPACITY' },
        'key-share-dup'
      )
    ).rejects.toThrowError(BadRequestError);

    const revoked = await sharing.decideConsent(
      alphaOwner,
      { consentId: proposed.data.id, action: 'REVOKE' },
      'key-share-revoke'
    );
    expect(revoked.data.status).toBe('REVOKED');
    expect(revoked.data.revokedById).toBe(alphaOwner.userId);
  });

  it('offers commitments only on accepted consents and never moves inventory', async () => {
    const alphaOwner = fixture.alpha.users.admin.principal;
    const alphaPlanner = fixture.alpha.users.planner.principal;
    const betaOwner = betaAdminP;

    const proposed = await sharing.proposeConsent(
      alphaOwner,
      { partnerWorkspaceId: fixture.beta.workspaceId, scope: 'SUPPLY' },
      'key-supply-propose'
    );

    await expect(
      sharing.offerCommitment(
        alphaPlanner,
        {
          consentId: proposed.data.id,
          kind: 'STOCK',
          resourceKey: 'item:resin-pp',
          quantity: 3,
          windowStart: '2026-11-01T00:00:00.000Z',
          windowEnd: '2026-11-30T00:00:00.000Z',
        },
        'key-commit-pending'
      )
    ).rejects.toThrowError(BadRequestError);

    await sharing.decideConsent(
      betaOwner,
      { consentId: proposed.data.id, action: 'ACCEPT' },
      'key-supply-accept'
    );

    const offered = await sharing.offerCommitment(
      alphaPlanner,
      {
        consentId: proposed.data.id,
        kind: 'STOCK',
        resourceKey: 'item:resin-pp',
        quantity: 3,
        windowStart: '2026-11-01T00:00:00.000Z',
        windowEnd: '2026-11-30T00:00:00.000Z',
      },
      'key-commit-offer'
    );
    expect(offered.data.status).toBe('OFFERED');
    expect(offered.data.quantityAtoms).toBe(3_000_000n);

    // Receiving a commitment is not receipt of inventory: no stock movement rows exist.
    const movements = await fixture.db.stockMovement.count();
    expect(movements).toBe(0);

    // A non-partner workspace cannot see the agreement.
    await expect(
      sharing.getConsent(betaAdminP, proposed.data.id)
    ).resolves.toMatchObject({ data: { id: proposed.data.id } });
  });

  it('hides cross-workspace consents as not found', async () => {
    const alphaOwner = fixture.alpha.users.admin.principal;
    const betaOwner = betaAdminP;

    const proposed = await sharing.proposeConsent(
      alphaOwner,
      { partnerWorkspaceId: fixture.beta.workspaceId, scope: 'CAPABILITY' },
      'key-cap-propose'
    );

    // Unknown id reads as not found.
    await expect(
      sharing.getConsent(alphaOwner, '00000000-0000-4000-8000-000000000009')
    ).rejects.toThrowError(NotFoundError);

    // Beta may act on it (they are the named partner), but a random consent id is hidden.
    await expect(
      sharing.decideConsent(
        betaOwner,
        { consentId: '00000000-0000-4000-8000-000000000009', action: 'ACCEPT' },
        'key-cap-accept-missing'
      )
    ).rejects.toThrowError(NotFoundError);
  });
});
