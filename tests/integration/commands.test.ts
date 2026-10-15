import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess } from '../fixtures/access';
import { executeCommand, hashPayload } from '@/server/db/transaction';

describe('F03: Transaction Atomicity, Idempotency & Revision Control', () => {
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

  it('atomically commits aggregate, audit event, command receipt, and increments workspace revision', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });
    const initialWs = await testDb.db.workspace.findUniqueOrThrow({
      where: { id: access.workspaceId },
    });
    const initialRev = initialWs.revision;

    const key = 'cmd-test-1';
    const payload = { code: 'ROLE-A', name: 'Role A' };

    const result = await executeCommand({
      principal: access.principal,
      commandType: 'role.create',
      idempotencyKey: key,
      payload,
      prismaClient: testDb.db,
      handler: async (tx) => {
        const role = await tx.role.create({
          data: {
            workspaceId: access.workspaceId,
            code: payload.code,
            name: payload.name,
          },
        });
        return {
          data: { id: role.id, code: role.code },
          aggregateType: 'ROLE',
          aggregateId: role.id,
          resourceVersion: 1,
        };
      },
    });

    expect(result.data.code).toBe('ROLE-A');
    expect(result.meta.replayed).toBe(false);
    expect(result.meta.workspaceRevision).toBe(initialRev + 1);

    // Verify DB records
    const receipt = await testDb.db.commandReceipt.findUnique({
      where: {
        workspaceId_principalId_key: {
          workspaceId: access.workspaceId,
          principalId: access.userId,
          key,
        },
      },
    });
    expect(receipt).not.toBeNull();
    expect(receipt?.commandType).toBe('role.create');

    const audit = await testDb.db.auditEvent.findFirst({
      where: {
        workspaceId: access.workspaceId,
        commandId: key,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.action).toBe('role.create');
  });

  it('replays identical response when called with the same key and payload without re-executing handler', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });
    const key = 'cmd-replay-test';
    const payload = { action: 'test-replay', amount: 50 };

    let handlerCalls = 0;
    const run = () =>
      executeCommand({
        principal: access.principal,
        commandType: 'test.action',
        idempotencyKey: key,
        payload,
        prismaClient: testDb.db,
        handler: async () => {
          handlerCalls++;
          return {
            data: { executed: true, calls: handlerCalls },
            aggregateType: 'TEST',
            aggregateId: 'test-id',
            resourceVersion: 1,
          };
        },
      });

    const first = await run();
    expect(first.meta.replayed).toBe(false);
    expect(handlerCalls).toBe(1);

    const second = await run();
    expect(second.meta.replayed).toBe(true);
    expect(handlerCalls).toBe(1); // handler was NOT called again
    expect(second.data).toEqual(first.data);
  });

  it('detects and rejects duplicate key with different payload as conflict', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });
    const key = 'cmd-conflict-key';

    await executeCommand({
      principal: access.principal,
      commandType: 'test.conflict',
      idempotencyKey: key,
      payload: { value: 'first-payload' },
      prismaClient: testDb.db,
      handler: async () => ({
        data: { ok: true },
        aggregateType: 'TEST',
        aggregateId: '1',
        resourceVersion: 1,
      }),
    });

    // Reusing the same key with different payload must throw DUPLICATE_KEY_PAYLOAD
    await expect(
      executeCommand({
        principal: access.principal,
        commandType: 'test.conflict',
        idempotencyKey: key,
        payload: { value: 'DIFFERENT-payload' },
        prismaClient: testDb.db,
        handler: async () => ({
          data: { ok: true },
          aggregateType: 'TEST',
          aggregateId: '1',
          resourceVersion: 1,
        }),
      })
    ).rejects.toThrow(/already submitted with a different request payload/i);
  });

  it('rolls back aggregate, audit, and receipt on failure, allowing a safe retry with the same key', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });
    const key = 'cmd-rollback-key';
    const payload = { code: 'ROLE-FAIL', name: 'Will Rollback' };

    let shouldFail = true;

    const runCommand = () =>
      executeCommand({
        principal: access.principal,
        commandType: 'role.create',
        idempotencyKey: key,
        payload,
        prismaClient: testDb.db,
        handler: async (tx) => {
          await tx.role.create({
            data: {
              workspaceId: access.workspaceId,
              code: payload.code,
              name: payload.name,
            },
          });

          if (shouldFail) {
            throw new Error('Simulated failure during business transaction');
          }

          return {
            data: { success: true },
            aggregateType: 'ROLE',
            aggregateId: 'role-id',
            resourceVersion: 1,
          };
        },
      });

    // First attempt fails
    await expect(runCommand()).rejects.toThrow(/Simulated failure/i);

    // Verify NOTHING was written to DB
    const failedRole = await testDb.db.role.findFirst({
      where: { workspaceId: access.workspaceId, code: payload.code },
    });
    expect(failedRole).toBeNull();

    const failedReceipt = await testDb.db.commandReceipt.findUnique({
      where: {
        workspaceId_principalId_key: {
          workspaceId: access.workspaceId,
          principalId: access.userId,
          key,
        },
      },
    });
    expect(failedReceipt).toBeNull();

    const failedAudit = await testDb.db.auditEvent.findFirst({
      where: { commandId: key },
    });
    expect(failedAudit).toBeNull();

    // Second attempt with the SAME idempotency key succeeds
    shouldFail = false;
    const retryResult = await runCommand();
    expect(retryResult.data.success).toBe(true);
    expect(retryResult.meta.replayed).toBe(false);

    // DB now contains the committed record
    const succeededRole = await testDb.db.role.findFirst({
      where: { workspaceId: access.workspaceId, code: payload.code },
    });
    expect(succeededRole).not.toBeNull();
  });

  it('enforces expectedVersion optimistic concurrency check', async () => {
    const access = await seedTestAccess(testDb.db, { roles: ['OWNER'] });
    const key = 'cmd-stale-version';

    await expect(
      executeCommand({
        principal: access.principal,
        commandType: 'test.version',
        idempotencyKey: key,
        expectedVersion: 3, // Expected version 3
        payload: { test: true },
        prismaClient: testDb.db,
        handler: async () => ({
          data: { updated: true },
          aggregateType: 'TEST',
          aggregateId: 'test-id',
          resourceVersion: 4, // Current version is 4 (mismatch!)
        }),
      })
    ).rejects.toThrow(/Resource version mismatch/i);
  });
});
