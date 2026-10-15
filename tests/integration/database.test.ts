import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { createPrismaClient, configurePrismaSqlite } from '@/server/db/client';

describe('F01: SQLite Database Bootstrap & Integrity', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('migrates a clean database and enables WAL mode and foreign keys', async () => {
    const journalMode = await testDb.db.$queryRawUnsafe<Array<{ journal_mode: string }>>(
      'PRAGMA journal_mode;'
    );
    expect(journalMode[0]?.journal_mode.toLowerCase()).toBe('wal');

    const foreignKeys = await testDb.db.$queryRawUnsafe<Array<{ foreign_keys: bigint | number }>>(
      'PRAGMA foreign_keys;'
    );
    expect(Number(foreignKeys[0]?.foreign_keys)).toBe(1);
  });

  it('persists data across client reconnects', async () => {
    const workspace = await testDb.db.workspace.create({
      data: {
        code: 'TEST-WS-1',
        name: 'Test Workspace 1',
        timezone: 'Asia/Jakarta',
        currency: 'IDR',
      },
    });

    const user = await testDb.db.user.create({
      data: {
        name: 'Test User',
        email: 'test@example.com',
      },
    });

    await testDb.db.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        status: 'ACTIVE',
      },
    });

    // Disconnect and reconnect with a completely new client instance
    const client2 = createPrismaClient(testDb.url);
    await client2.$connect();
    await configurePrismaSqlite(client2);

    const reconnectedWorkspace = await client2.workspace.findUnique({
      where: { code: 'TEST-WS-1' },
      include: {
        memberships: {
          include: { user: true },
        },
      },
    });

    expect(reconnectedWorkspace).not.toBeNull();
    expect(reconnectedWorkspace?.memberships).toHaveLength(1);
    expect(reconnectedWorkspace?.memberships[0].user.email).toBe('test@example.com');

    await client2.$disconnect();
  });

  it('enforces foreign key constraints on invalid parent IDs', async () => {
    // Attempt to insert a membership for a non-existent workspace ID
    await expect(
      testDb.db.membership.create({
        data: {
          workspaceId: 'non-existent-workspace-id',
          userId: 'non-existent-user-id',
          status: 'ACTIVE',
        },
      })
    ).rejects.toThrow();
  });

  it('enforces cross-workspace foreign key rejection on composite relations', async () => {
    // Create two workspaces
    const wsA = await testDb.db.workspace.create({
      data: { code: 'WS-A', name: 'Workspace A' },
    });
    const wsB = await testDb.db.workspace.create({
      data: { code: 'WS-B', name: 'Workspace B' },
    });

    // Create a role in Workspace A
    const roleA = await testDb.db.role.create({
      data: {
        workspaceId: wsA.id,
        code: 'ROLE_TEST',
        name: 'Test Role',
      },
    });

    // Create a permission
    const perm = await testDb.db.permission.create({
      data: {
        code: 'test.perm',
        description: 'Test permission',
        resource: 'test',
        action: 'perm',
      },
    });

    // Attempt to link roleA with wsB (cross-workspace mismatch in role_permissions)
    await expect(
      testDb.db.$executeRawUnsafe(
        `INSERT INTO role_permissions (id, workspace_id, role_id, permission_code, created_at)
         VALUES ('rp-1', '${wsB.id}', '${roleA.id}', '${perm.code}', CURRENT_TIMESTAMP)`
      )
    ).rejects.toThrow();
  });

  it('enforces append-only immutability trigger on audit_events', async () => {
    const ws = await testDb.db.workspace.findFirstOrThrow();
    const user = await testDb.db.user.findFirstOrThrow();

    const audit = await testDb.db.auditEvent.create({
      data: {
        workspaceId: ws.id,
        actorUserId: user.id,
        aggregateType: 'TEST',
        aggregateId: 'test-1',
        action: 'CREATED',
        detailJson: JSON.stringify({ ok: true }),
      },
    });

    // Attempting to update an audit event must fail by SQLite trigger
    await expect(
      testDb.db.$executeRawUnsafe(
        `UPDATE audit_events SET action = 'ALTERED' WHERE id = '${audit.id}'`
      )
    ).rejects.toThrow(/append-only/i);

    // Attempting to delete an audit event must fail by SQLite trigger
    await expect(
      testDb.db.$executeRawUnsafe(
        `DELETE FROM audit_events WHERE id = '${audit.id}'`
      )
    ).rejects.toThrow(/append-only/i);
  });

  it('seeds permissions and workspace system roles idempotently', async () => {
    const { seedPermissionsAndRoles } = await import('../../prisma/seed');
    const result = await seedPermissionsAndRoles(testDb.db);
    expect(result.rolesCount).toBeGreaterThan(0);

    const perms = await testDb.db.permission.findMany();
    expect(perms.length).toBeGreaterThanOrEqual(42);

    const roles = await testDb.db.role.findMany({
      where: { workspaceId: result.workspaceId },
      include: { permissions: true },
    });
    expect(roles.length).toBe(10);

    const accessAdmin = roles.find((r) => r.code === 'ACCESS_ADMIN');
    expect(accessAdmin?.permissions.map((p) => p.permissionCode)).toContain('access.manage');

    const owner = roles.find((r) => r.code === 'OWNER');
    expect(owner?.permissions.map((p) => p.permissionCode)).toContain('order.release');

    // Running again must be idempotent and not duplicate
    await expect(seedPermissionsAndRoles(testDb.db, result.workspaceId)).resolves.not.toThrow();
  });
});
