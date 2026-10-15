import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess } from '../fixtures/access';
import { GET as getMe } from '@/app/api/me/route';
import { NextRequest } from 'next/server';

describe('F04: Access Shell & Session Lifecycle E2E', () => {
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

  it('blocks direct unauthorized navigation at the API boundary', async () => {
    const unauthReq = new NextRequest('http://localhost:3000/api/me');
    const res = await getMe(unauthReq);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('resolves active identity and roles for authenticated staff session', async () => {
    const access = await seedTestAccess(testDb.db, {
      name: 'Alex Rahman',
      roles: ['OWNER', 'ACCESS_ADMIN'],
    });

    const req = new NextRequest('http://localhost:3000/api/me', {
      headers: access.headers,
    });
    const res = await getMe(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.name).toBe('Alex Rahman');
    expect(json.data.roles).toContain('OWNER');
    expect(json.data.roles).toContain('ACCESS_ADMIN');
    expect(json.data.permissions).toContain('order.release');
  });

  it('invalidates session on sign-out, immediately blocking subsequent access', async () => {
    const access = await seedTestAccess(testDb.db, {
      name: 'Sarah Chen',
      roles: ['CUSTOMER'],
      customerId: 'CUST-1',
    });

    // 1. Initial request succeeds
    const req1 = new NextRequest('http://localhost:3000/api/me', {
      headers: access.headers,
    });
    const res1 = await getMe(req1);
    expect(res1.status).toBe(200);

    // 2. Perform sign-out / session deletion in DB
    await testDb.db.session.delete({
      where: { token: access.sessionToken },
    });

    // 3. Subsequent request with same cookie is rejected
    const req2 = new NextRequest('http://localhost:3000/api/me', {
      headers: access.headers,
    });
    const res2 = await getMe(req2);
    expect(res2.status).toBe(401);
  });
});
