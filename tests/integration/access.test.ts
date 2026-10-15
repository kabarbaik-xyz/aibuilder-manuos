import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess } from '../fixtures/access';
import { resolvePrincipal, requirePrincipal } from '@/server/auth/auth';
import { requirePermission } from '@/server/auth/permissions';
import { assertCustomerOwnership } from '@/server/auth/policy';
import { disableMembership } from '@/server/auth/provisioning';
import { GET as getMe } from '@/app/api/me/route';
import { NextRequest } from 'next/server';

describe('F02: Authentication, RBAC & Principal Policies', () => {
  let testDb: TestDatabase;

  let prevDb: any;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    prevDb = (global as any).__manuos_db;
    (global as any).__manuos_db = testDb.db;
  });

  afterAll(async () => {
    (global as any).__manuos_db = prevDb;
    await testDb.close();
  });

  it('rejects anonymous requests without session cookie', async () => {
    const emptyHeaders = new Headers();
    await expect(
      resolvePrincipal(emptyHeaders, undefined, testDb.db)
    ).rejects.toThrow(/authentication session required/i);
  });

  it('rejects requests with an expired session', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    // Expire the session in database
    await testDb.db.session.update({
      where: { token: access.sessionToken },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      resolvePrincipal(access.headers, access.workspaceId, testDb.db)
    ).rejects.toThrow(/session has expired/i);
  });

  it('rejects requests for a disabled/banned user', async () => {
    const access = await seedTestAccess(testDb.db, {
      roles: ['OWNER'],
      banned: true,
    });

    await expect(
      resolvePrincipal(access.headers, access.workspaceId, testDb.db)
    ).rejects.toThrow(/disabled or suspended/i);
  });

  it('rejects requests when membership is disabled', async () => {
    const access = await seedTestAccess(testDb.db, {
      roles: ['OWNER'],
      status: 'DISABLED',
    });

    await expect(
      resolvePrincipal(access.headers, access.workspaceId, testDb.db)
    ).rejects.toThrow(/does not hold an active membership/i);
  });

  it('rejects requests when accessing an unauthorized workspace', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    // Create an unrelated second workspace
    const ws2 = await testDb.db.workspace.create({
      data: {
        code: 'OTHER-WS',
        name: 'Other Facility',
      },
    });

    await expect(
      resolvePrincipal(access.headers, ws2.id, testDb.db)
    ).rejects.toThrow(/does not hold an active membership/i);
  });

  it('enforces RBAC permissions based on seeded role matrix', async () => {
    // SALES role has order.create but NOT order.release
    const salesAccess = await seedTestAccess(testDb.db, { roles: ['SALES'] });
    const principal = await resolvePrincipal(
      salesAccess.headers,
      salesAccess.workspaceId,
      testDb.db
    );

    expect(principal.permissions.has('order.create')).toBe(true);
    expect(principal.permissions.has('order.release')).toBe(false);

    expect(() => requirePermission(principal, 'order.create')).not.toThrow();
    expect(() => requirePermission(principal, 'order.release')).toThrow(
      /missing required capability 'order.release'/i
    );
  });

  it('prevents client role forging by deriving permissions strictly from DB', async () => {
    const salesAccess = await seedTestAccess(testDb.db, { roles: ['SALES'] });

    // Client attempts to send forged role header
    const headers = new Headers(salesAccess.headers);
    headers.set('x-user-role', 'OWNER');
    headers.set('x-permissions', 'order.release,admin');

    const principal = await resolvePrincipal(
      headers,
      salesAccess.workspaceId,
      testDb.db
    );

    // Forged headers must be ignored
    expect(principal.roles).toEqual(['SALES']);
    expect(principal.permissions.has('order.release')).toBe(false);
  });

  it('enforces customer ownership isolation', async () => {
    const customerAccess = await seedTestAccess(testDb.db, {
      roles: ['CUSTOMER'],
      customerId: 'CUST-ALPHA',
    });
    const principal = await resolvePrincipal(
      customerAccess.headers,
      customerAccess.workspaceId,
      testDb.db
    );

    // Accessing own customer resources is allowed
    expect(() => assertCustomerOwnership(principal, 'CUST-ALPHA')).not.toThrow();

    // Accessing another customer's resources is blocked
    expect(() => assertCustomerOwnership(principal, 'CUST-BETA')).toThrow(
      /customer cannot view or modify records belonging to other accounts/i
    );
  });

  it('revoking a session in DB immediately invalidates subsequent commands', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });

    // First call succeeds
    const p1 = await resolvePrincipal(
      access.headers,
      access.workspaceId,
      testDb.db
    );
    expect(p1.userId).toBe(access.userId);

    // Revoke session in database
    await testDb.db.session.delete({
      where: { token: access.sessionToken },
    });

    // Subsequent call must fail immediately
    await expect(
      resolvePrincipal(access.headers, access.workspaceId, testDb.db)
    ).rejects.toThrow(/authentication session required/i);
  });

  it('prevents disabling the last ACCESS_ADMIN in a workspace', async () => {
    const adminAccess = await seedTestAccess(testDb.db, {
      roles: ['ACCESS_ADMIN'],
    });

    await expect(
      disableMembership(adminAccess.workspaceId, adminAccess.membershipId, testDb.db)
    ).rejects.toThrow(/at least one active ACCESS_ADMIN must remain/i);
  });

  it('verifies /api/me HTTP route boundary with and without session', async () => {
    // 1. Without session -> 401
    const unauthReq = new NextRequest('http://localhost:3000/api/me');
    const unauthRes = await getMe(unauthReq);
    expect(unauthRes.status).toBe(401);
    const unauthJson = await unauthRes.json();
    expect(unauthJson.error.code).toBe('UNAUTHORIZED');

    // 2. With session -> 200 with principal
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });
    const authReq = new NextRequest('http://localhost:3000/api/me', {
      headers: access.headers,
    });
    const authRes = await getMe(authReq);
    expect(authRes.status).toBe(200);
    const authJson = await authRes.json();
    expect(authJson.data.userId).toBe(access.userId);
    expect(authJson.data.roles).toContain('OWNER');
    expect(authJson.data.permissions).toContain('order.release');
  });
});
