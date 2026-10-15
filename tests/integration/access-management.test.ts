import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { AccessService } from '@/server/modules/access/service';
import { createBetterAuth, resolvePrincipal } from '@/server/auth/auth';
import { GET as listUsers, POST as createUser } from '@/app/api/users/route';
import { PATCH as updateMembership } from '@/app/api/users/[id]/route';
import { GET as listPermissions } from '@/app/api/permissions/route';

describe('Workspace access administration', () => {
  let fixture: FactoryFixture;
  let service: AccessService;
  beforeAll(async () => { fixture = await createFactoryFixture(); service = new AccessService(fixture.db); });
  afterAll(async () => { await fixture.close(); });
  const key = () => randomUUID();

  it('denies anonymous and non-admin HTTP requests, including forged actor input', async () => {
    expect((await listUsers(new NextRequest('http://localhost/api/users'))).status).toBe(401);
    expect((await listPermissions(new NextRequest('http://localhost/api/permissions', { headers: fixture.alpha.users.owner.headers }))).status).toBe(403);
    const deniedHeaders = new Headers(fixture.alpha.users.owner.headers); deniedHeaders.set('content-type', 'application/json');
    expect((await createUser(new NextRequest('http://localhost/api/users', { method: 'POST', headers: deniedHeaders, body: '{}' }))).status).toBe(403);
    const headers = new Headers(fixture.alpha.users.admin.headers);
    headers.set('content-type', 'application/json');
    const response = await createUser(new NextRequest('http://localhost/api/users', { method: 'POST', headers,
      body: JSON.stringify({ name: 'Forged', email: 'forged@test.example', password: 'A-long-password-123', roleCodes: ['WAREHOUSE'], actorId: 'forged' }) }));
    expect(response.status).toBe(400);
    expect(await fixture.db.user.findUnique({ where: { email: 'forged@test.example' } })).toBeNull();
  });

  it('lists safe workspace-scoped read models without credential fields', async () => {
    const response = await listUsers(new NextRequest('http://localhost/api/users', { headers: fixture.alpha.users.admin.headers }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.some((user: { email: string }) => user.email === 'owner@beta.test')).toBe(false);
    expect(body.data.every((user: { version: number }) => user.version >= 1)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('password');
    expect((await service.scopeOptions(fixture.alpha.users.admin.principal)).customers.some(c => c.id === fixture.beta.masters.customerId)).toBe(false);
  });

  it('creates atomically, replays once, and never resets an existing account password', async () => {
    const principal = fixture.alpha.users.admin.principal;
    const input = { name: 'Warehouse Access', email: 'new-access@example.test', password: 'A-long-password-123', roleCodes: ['WAREHOUSE'] };
    const idempotencyKey = key();
    const result = await service.createUser(principal, input, idempotencyKey);
    const replay = await service.createUser(principal, input, idempotencyKey);
    expect(replay.meta.replayed).toBe(true);
    expect(replay.data).toEqual(result.data);
    const account = await fixture.db.account.findFirstOrThrow({ where: { userId: result.data.userId } });
    expect(account.password).not.toBe(input.password);
    await expect(service.createUser(principal, { ...input, password: 'A-different-password' }, key())).rejects.toThrow(/already exists/);
    expect((await fixture.db.account.findUniqueOrThrow({ where: { id: account.id } })).password).toBe(account.password);
    const audit = await fixture.db.auditEvent.findMany({ where: { aggregateId: result.data.membershipId } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(input.password);
    await expect(service.createUser(principal, { ...input, email: 'invalid-role@example.test', roleCodes: ['UNKNOWN'] }, key())).rejects.toThrow(/valid active roles/);
    expect(await fixture.db.user.findUnique({ where: { email: 'invalid-role@example.test' } })).toBeNull();
  });

  it('rejects cross-workspace targets and customer/technician scope mismatches', async () => {
    const principal = fixture.alpha.users.admin.principal;
    await expect(service.updateMembership(principal, fixture.beta.users.owner.membershipId,
      { roleCodes: ['OWNER'], status: 'DISABLED', expectedVersion: 1 }, key())).rejects.toThrow(/not found/);
    const input = { name: 'Scoped', email: 'scoped@example.test', password: 'A-long-password-123', roleCodes: ['CUSTOMER'] };
    await expect(service.createUser(principal, input, key())).rejects.toThrow(/requires a linked customer/);
    await expect(service.createUser(principal, { ...input, customerId: fixture.beta.masters.customerId }, key())).rejects.toThrow(/does not belong/);
    await expect(service.createUser(principal, { ...input, customerId: fixture.alpha.masters.customerId, roleCodes: ['CUSTOMER', 'OWNER'] }, key())).rejects.toThrow(/only use/);
    await expect(service.createUser(principal, { ...input, roleCodes: ['TECHNICIAN'], technicianId: fixture.alpha.masters.technicianId }, key())).rejects.toThrow(/already linked/);
  });

  it('protects the last admin, including stale-version rollback and HTTP disable attempts', async () => {
    const admin = fixture.alpha.users.admin;
    const input = { roleCodes: ['ACCESS_ADMIN'], status: 'DISABLED', expectedVersion: 1 };
    await expect(service.updateMembership(admin.principal, admin.membershipId, input, key())).rejects.toThrow(/At least one/);
    await expect(service.updateMembership(admin.principal, admin.membershipId, { ...input, status: 'ACTIVE', roleCodes: ['OWNER'] }, key())).rejects.toThrow(/At least one/);
    const headers = new Headers(admin.headers); headers.set('content-type', 'application/json');
    const response = await updateMembership(new NextRequest(`http://localhost/api/users/${admin.membershipId}`, { method: 'PATCH', headers, body: JSON.stringify(input) }), { params: Promise.resolve({ id: admin.membershipId }) });
    expect(response.status).toBe(403);
    const membership = await fixture.db.membership.findUniqueOrThrow({ where: { id: admin.membershipId } });
    expect(membership.status).toBe('ACTIVE');
    expect(membership.version).toBe(1);
    await expect(service.updateMembership(admin.principal, fixture.alpha.users.buyer.membershipId,
      { roleCodes: ['OWNER'], status: 'DISABLED', expectedVersion: 99 }, key())).rejects.toThrow(/version mismatch/);
    const buyer = await fixture.db.membership.findUniqueOrThrow({ where: { id: fixture.alpha.users.buyer.membershipId }, include: { roles: { include: { role: true } } } });
    expect(buyer.status).toBe('ACTIVE');
    expect(buyer.roles.map(r => r.role.code)).toEqual(['BUYER']);
  });

  it('supports custom role lifecycle and applies grant changes on the next authenticated request', async () => {
    const principal = fixture.alpha.users.admin.principal;
    const role = await service.createRole(principal, { code: 'ACCESS_REVIEWER', name: 'Access reviewer', permissions: ['access.manage'] }, key());
    const user = await service.createUser(principal, { name: 'Reviewer', email: 'reviewer@example.test', password: 'A-long-password-123', roleCodes: ['ACCESS_REVIEWER'] }, key());
    const token = key();
    await fixture.db.session.create({ data: { token, userId: user.data.userId, expiresAt: new Date(Date.now() + 3600000) } });
    const headers = new Headers({ cookie: `better-auth.session_token=${token}`, 'x-workspace-id': fixture.alpha.workspaceId });
    const before = await resolvePrincipal(headers, undefined, fixture.db);
    expect(before.permissions.has('access.manage')).toBe(true);
    await service.updateRole(principal, role.data.id, { name: 'Access reviewer', permissions: ['order.read'], isActive: true, expectedVersion: 1 }, key());
    const after = await resolvePrincipal(headers, undefined, fixture.db);
    expect(after.permissions.has('access.manage')).toBe(false);
    expect(after.permissions.has('order.read')).toBe(true);
    await expect(service.listUsers(before)).rejects.toThrow(/no longer active/);
    await service.updateRole(principal, role.data.id, { name: 'Access reviewer', permissions: ['order.read'], isActive: false, expectedVersion: 2 }, key());
    expect((await resolvePrincipal(headers, undefined, fixture.db)).permissions.size).toBe(0);
    await expect(service.createRole(principal, { code: 'BAD_GRANT', name: 'Bad', permissions: ['invented.permission'] }, key())).rejects.toThrow(/Unknown permission/);
    const system = (await service.listRoles(principal)).find(r => r.code === 'ACCESS_ADMIN')!;
    await expect(service.updateRole(principal, system.id, { name: 'Changed', permissions: ['order.read'], isActive: false, expectedVersion: system.version }, key())).rejects.toThrow(/protected/);
    const foreignRole = await fixture.db.role.findFirstOrThrow({ where: { workspaceId: fixture.beta.workspaceId } });
    await expect(service.updateRole(principal, foreignRole.id, { name: 'Changed', permissions: ['order.read'], isActive: true, expectedVersion: 1 }, key())).rejects.toThrow(/not found/);
  });

  it('disables and reactivates a membership without changing its account or history', async () => {
    const principal = fixture.alpha.users.admin.principal;
    const created = await service.createUser(principal, { name: 'Temporary', email: 'temporary@example.test', password: 'A-long-password-123', roleCodes: ['WAREHOUSE'] }, key());
    const token = key();
    await fixture.db.session.create({ data: { token, userId: created.data.userId, expiresAt: new Date(Date.now() + 3600000) } });
    const headers = new Headers({ cookie: `better-auth.session_token=${token}`, 'x-workspace-id': fixture.alpha.workspaceId });
    await service.updateMembership(principal, created.data.membershipId, { roleCodes: ['WAREHOUSE'], status: 'DISABLED', expectedVersion: 1 }, key());
    await expect(resolvePrincipal(headers, undefined, fixture.db)).rejects.toThrow(/active membership/);
    await service.updateMembership(principal, created.data.membershipId, { roleCodes: ['WAREHOUSE'], status: 'ACTIVE', expectedVersion: 2 }, key());
    expect((await resolvePrincipal(headers, undefined, fixture.db)).permissions.has('inventory.read')).toBe(true);
    expect(await fixture.db.auditEvent.count({ where: { aggregateId: created.data.membershipId } })).toBe(3);
  });

  it('creates valid scoped memberships and synchronizes technician links', async () => {
    const principal = fixture.alpha.users.admin.principal;
    const technician = await fixture.db.technician.create({ data: { workspaceId: fixture.alpha.workspaceId, code: 'ACCESS-TECH', name: 'Access technician' } });
    const created = await service.createUser(principal, { name: 'Tech user', email: 'tech-access@example.test', password: 'A-long-password-123', roleCodes: ['TECHNICIAN'], technicianId: technician.id }, key());
    expect((await fixture.db.membership.findUniqueOrThrow({ where: { id: created.data.membershipId } })).technicianId).toBe(technician.id);
    expect((await fixture.db.technician.findUniqueOrThrow({ where: { id: technician.id } })).membershipId).toBe(created.data.membershipId);
    await service.updateMembership(principal, created.data.membershipId, { roleCodes: ['WAREHOUSE'], status: 'ACTIVE', expectedVersion: 1 }, key());
    expect((await fixture.db.technician.findUniqueOrThrow({ where: { id: technician.id } })).membershipId).toBeNull();
    const customer = await service.createUser(principal, { name: 'Portal user', email: 'portal-access@example.test', password: 'A-long-password-123', roleCodes: ['CUSTOMER'], customerId: fixture.alpha.masters.customerId }, key());
    expect((await fixture.db.membership.findUniqueOrThrow({ where: { id: customer.data.membershipId } })).customerId).toBe(fixture.alpha.masters.customerId);
  });

  it('can revoke an admin role when another active system admin remains', async () => {
    const principal = fixture.alpha.users.admin.principal;
    const second = await service.createUser(principal, { name: 'Second admin', email: 'second-admin@example.test', password: 'A-long-password-123', roleCodes: ['ACCESS_ADMIN'] }, key());
    await service.updateMembership(principal, second.data.membershipId, { roleCodes: ['WAREHOUSE'], status: 'ACTIVE', expectedVersion: 1 }, key());
    const remaining = await fixture.db.membershipRole.count({ where: { workspaceId: fixture.alpha.workspaceId, role: { code: 'ACCESS_ADMIN' }, membership: { status: 'ACTIVE' } } });
    expect(remaining).toBe(1);
  });

  it('edits name and login email atomically, retains the password and revokes old sessions', async () => {
    const admin = fixture.alpha.users.admin;
    const created = await service.createUser(admin.principal, { name: 'Before edit', email: 'before-edit@example.test', password: 'A-long-password-123', roleCodes: ['WAREHOUSE'] }, key());
    const original = await fixture.db.user.findUniqueOrThrow({ where: { id: created.data.userId } });
    const account = await fixture.db.account.findFirstOrThrow({ where: { userId: original.id } });
    await fixture.db.session.create({ data: { userId: original.id, token: key(), expiresAt: new Date(Date.now() + 3600000) } });
    const headers = new Headers(admin.headers); headers.set('content-type', 'application/json');
    const response = await updateMembership(new NextRequest(`http://localhost/api/users/${created.data.membershipId}`, { method: 'PATCH', headers,
      body: JSON.stringify({ name: 'After edit', email: 'AFTER-EDIT@example.test', expectedIdentityUpdatedAt: original.updatedAt.toISOString(), expectedVersion: 1, roleCodes: ['WAREHOUSE'], status: 'ACTIVE' }) }), { params: Promise.resolve({ id: created.data.membershipId }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data.email).toBe('after-edit@example.test');
    const updated = await fixture.db.user.findUniqueOrThrow({ where: { id: original.id } });
    expect(updated.name).toBe('After edit'); expect(updated.emailVerified).toBe(false);
    const credential = await fixture.db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(credential.password).toBe(account.password); expect(credential.accountId).toBe(updated.id);
    expect(await fixture.db.session.count({ where: { userId: original.id } })).toBe(0);
    const auth = createBetterAuth(fixture.db);
    const login = await auth.api.signInEmail({ body: { email: updated.email, password: 'A-long-password-123' }, asResponse: true });
    expect(login.status).toBe(200);
    const oldLogin = await auth.api.signInEmail({ body: { email: original.email, password: 'A-long-password-123' }, asResponse: true });
    expect(oldLogin.status).toBe(401);
    await expect(service.updateMembership(admin.principal, created.data.membershipId,
      { name: 'Duplicate', email: admin.principal.email, expectedIdentityUpdatedAt: updated.updatedAt.toISOString(), expectedVersion: 2, roleCodes: ['OWNER'], status: 'ACTIVE' }, key())).rejects.toThrow(/already used/);
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: original.id } })).name).toBe('After edit');
    await expect(service.updateMembership(admin.principal, created.data.membershipId,
      { name: 'Stale name', expectedIdentityUpdatedAt: original.updatedAt.toISOString(), expectedVersion: 2, roleCodes: ['WAREHOUSE'], status: 'ACTIVE' }, key())).rejects.toThrow(/Account details changed/);
  });

  it('requires administration in every workspace before editing a shared account identity', async () => {
    const admin = fixture.alpha.users.admin.principal;
    const created = await service.createUser(admin, { name: 'Shared account', email: 'shared-edit@example.test', password: 'A-long-password-123', roleCodes: ['WAREHOUSE'] }, key());
    await fixture.db.membership.create({ data: { workspaceId: fixture.beta.workspaceId, userId: created.data.userId } });
    expect((await service.listUsers(admin, created.data.membershipId))[0].canEditIdentity).toBe(false);
    const identity = await fixture.db.user.findUniqueOrThrow({ where: { id: created.data.userId } });
    const edit = { name: 'Shared renamed', expectedIdentityUpdatedAt: identity.updatedAt.toISOString(), expectedVersion: 1, roleCodes: ['WAREHOUSE'], status: 'ACTIVE' };
    await expect(service.updateMembership(admin, created.data.membershipId, edit, key())).rejects.toThrow(/every linked workspace/);
    const secondAdmin = await fixture.db.membership.create({ data: { workspaceId: fixture.beta.workspaceId, userId: admin.userId } });
    const betaRole = await fixture.db.role.findFirstOrThrow({ where: { workspaceId: fixture.beta.workspaceId, code: 'ACCESS_ADMIN' } });
    await fixture.db.membershipRole.create({ data: { workspaceId: fixture.beta.workspaceId, membershipId: secondAdmin.id, roleId: betaRole.id } });
    expect((await service.listUsers(admin, created.data.membershipId))[0].canEditIdentity).toBe(true);
    await service.updateMembership(admin, created.data.membershipId, edit, key());
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: identity.id } })).name).toBe('Shared renamed');
  });

  it('rolls identity/session changes back when last-admin protection fails and flags self email edits for login', async () => {
    const admin = fixture.alpha.users.admin;
    const user = await fixture.db.user.findUniqueOrThrow({ where: { id: admin.userId } });
    const input = { name: 'Updated admin', email: 'updated-admin@example.test', expectedIdentityUpdatedAt: user.updatedAt.toISOString(), expectedVersion: 1, roleCodes: ['ACCESS_ADMIN'], status: 'ACTIVE' };
    await expect(service.updateMembership(admin.principal, admin.membershipId, { ...input, status: 'DISABLED' }, key())).rejects.toThrow(/At least one/);
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(user.email);
    expect(await fixture.db.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);
    const result = await service.updateMembership(admin.principal, admin.membershipId, input, key());
    expect(result.data.reauthenticate).toBe(true);
    expect(await fixture.db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('repairs legacy email credential identifiers without changing passwords', async () => {
    const principal = fixture.alpha.users.admin.principal;
    const created = await service.createUser(principal, { name: 'Legacy login', email: 'legacy-login@example.test', password: 'A-long-password-123', roleCodes: ['WAREHOUSE'] }, key());
    const original = await fixture.db.account.findFirstOrThrow({ where: { userId: created.data.userId } });
    await fixture.db.account.update({ where: { id: original.id }, data: { accountId: created.data.email } });
    const sql = readFileSync(path.resolve('prisma/migrations/20261015110000_credential_account_identifiers/migration.sql'), 'utf8');
    await fixture.db.$executeRawUnsafe(sql);
    const repaired = await fixture.db.account.findUniqueOrThrow({ where: { id: original.id } });
    expect(repaired.accountId).toBe(created.data.userId);
    expect(repaired.password).toBe(original.password);
    expect(await fixture.db.$executeRawUnsafe(sql)).toBe(0);
    const login = await createBetterAuth(fixture.db).api.signInEmail({ body: { email: created.data.email, password: 'A-long-password-123' }, asResponse: true });
    expect(login.status).toBe(200);
  });
});
