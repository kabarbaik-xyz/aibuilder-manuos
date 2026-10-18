import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { AccessService } from '@/server/modules/access/service';
import { createBetterAuth } from '@/server/auth/auth';
import { buildDemoSuperadminAccount, resolveDemoSeedPassword, syncDemoAccessAccount } from '../../scripts/demo-seed-accounts';
import { seedTestAccess } from '../fixtures/access';

describe('demo seed People & Access', () => {
  let fixture: FactoryFixture;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('repairs a seed-managed login and synchronizes department, role, landing page, and technician profile', async () => {
    const owner = fixture.alpha.users.admin;
    const technician = await fixture.db.technician.create({
      data: {
        workspaceId: fixture.alpha.workspaceId,
        code: 'DEMO-SEED-OP',
        name: 'Demo Seed Operator',
        departmentId: fixture.alpha.masters.departmentId,
        facilityId: owner.principal.facilityId,
      },
    });
    const account = {
      code: 'operator-demo',
      name: 'Demo Seed Operator',
      email: 'operator.demo@manuos.test',
      roleCodes: ['TECHNICIAN'],
      departmentId: fixture.alpha.masters.departmentId,
      jobTitle: 'Production Technician',
      landingPage: '/shop-floor',
      technicianId: technician.id,
    };
    const access = new AccessService(fixture.db);
    const firstPassword = 'First-demo-password-123';
    const repairedPassword = 'Repaired-demo-password-456';

    await syncDemoAccessAccount(fixture.db, access, owner.principal, account, {
      password: firstPassword,
      resetExistingPassword: false,
      idempotencyKey: 'demo-account-create',
    });

    const user = await fixture.db.user.findUniqueOrThrow({ where: { email: account.email } });
    const membership = await fixture.db.membership.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: fixture.alpha.workspaceId, userId: user.id } },
      include: { roles: { include: { role: true } } },
    });
    expect(membership).toMatchObject({
      status: 'ACTIVE',
      departmentId: fixture.alpha.masters.departmentId,
      jobTitle: 'Production Technician',
      landingPage: '/shop-floor',
      technicianId: technician.id,
    });
    expect(membership.roles.map((grant) => grant.role.code)).toEqual(['TECHNICIAN']);
    expect(await fixture.db.technician.findUniqueOrThrow({ where: { id: technician.id } })).toMatchObject({ membershipId: membership.id });
    expect((await createBetterAuth(fixture.db).api.signInEmail({ body: { email: account.email, password: firstPassword }, asResponse: true })).status).toBe(200);

    const credential = await fixture.db.account.findFirstOrThrow({ where: { userId: user.id, providerId: 'credential' } });
    await fixture.db.account.update({ where: { id: credential.id }, data: { password: await hashPassword('Stale-demo-password-789') } });
    await fixture.db.session.create({ data: { userId: user.id, token: 'demo-seed-stale-session', expiresAt: new Date(Date.now() + 60_000) } });

    await syncDemoAccessAccount(fixture.db, access, owner.principal, account, {
      password: repairedPassword,
      resetExistingPassword: true,
      idempotencyKey: 'demo-account-password-repair',
    });

    const auth = createBetterAuth(fixture.db);
    expect((await auth.api.signInEmail({ body: { email: account.email, password: repairedPassword }, asResponse: true })).status).toBe(200);
    expect((await auth.api.signInEmail({ body: { email: account.email, password: 'Stale-demo-password-789' }, asResponse: true })).status).not.toBe(200);
    expect(await fixture.db.session.findUnique({ where: { token: 'demo-seed-stale-session' } })).toBeNull();
  });

  it('grants the ENGINEER role the approval permission required by its lifecycle stage', async () => {
    const engineer = await seedTestAccess(fixture.db, {
      workspaceCode: 'WS-ALPHA',
      email: 'demo-engineer-approval@alpha.test',
      name: 'Demo Engineer Approval',
      roles: ['ENGINEER'],
    });
    expect(engineer.principal.permissions.has('engineering.approve')).toBe(true);
  });

  it('provisions the documented Superadmin demo login with full workspace roles', async () => {
    const owner = fixture.alpha.users.admin;
    const account = buildDemoSuperadminAccount('DEMO');
    await syncDemoAccessAccount(fixture.db, new AccessService(fixture.db), owner.principal, account, {
      password: 'Demo-superadmin-password-123',
      resetExistingPassword: false,
      idempotencyKey: 'demo-superadmin-create',
    });

    const user = await fixture.db.user.findUniqueOrThrow({ where: { email: account.email } });
    const membership = await fixture.db.membership.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: fixture.alpha.workspaceId, userId: user.id } },
      include: { roles: { include: { role: true } } },
    });
    expect(account.email).toBe('superadmin.demo@manuos.test');
    expect(membership.roles.map((grant) => grant.role.code).sort()).toEqual([...account.roleCodes].sort());
    expect(membership.roles.map((grant) => grant.role.code)).toContain('ACCESS_ADMIN');
    expect(membership.roles.map((grant) => grant.role.code)).toContain('OWNER');
  });

  it('uses the documented default demo password unless explicitly overridden', () => {
    expect(resolveDemoSeedPassword()).toBe('Password123!');
    expect(resolveDemoSeedPassword('Workspace-specific-123!')).toBe('Workspace-specific-123!');
  });
});
