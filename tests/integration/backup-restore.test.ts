import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createDatabaseBackup } from '../../scripts/backup-db';
import { restoreDatabaseBackup } from '../../scripts/restore-db';
import { reconcileStock } from '../../src/server/modules/inventory/ledger';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';

describe('I08: Durable Backup, Checksum Verification and Isolated Restoration', () => {
  const tempTestDir = path.resolve(process.cwd(), 'backups/test-temp-' + Date.now());
  let fixture: FactoryFixture;

  beforeAll(async () => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    fixture = await createFactoryFixture();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  it('creates an atomic SQLite backup with manifest and valid SHA-256 checksum', async () => {
    const backupRes = await createDatabaseBackup({
      destinationDir: tempTestDir,
      backupNamePrefix: 'test-backup',
      sourceDbPath: fixture.url.replace(/^file:/, ''),
    });

    expect(fs.existsSync(backupRes.backupDbPath)).toBe(true);
    expect(fs.existsSync(backupRes.manifestPath)).toBe(true);
    expect(backupRes.manifest.version).toBe('1.0.0');
    expect(backupRes.manifest.integrityCheck).toBe('ok');
    expect(backupRes.manifest.fkCheckErrorCount).toBe(0);
    expect(backupRes.manifest.dbSizeBytes).toBeGreaterThan(0);
    expect(backupRes.manifest.tablesCount).toBeGreaterThan(10);
    expect(backupRes.manifest.dbSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects tampering and rejects restoring a corrupted or altered backup file', async () => {
    const backupRes = await createDatabaseBackup({
      destinationDir: tempTestDir,
      backupNamePrefix: 'tamper-test',
      sourceDbPath: fixture.url.replace(/^file:/, ''),
    });

    // Tamper with the backup file by appending a byte
    fs.appendFileSync(backupRes.backupDbPath, Buffer.from([0x00]));

    const isolatedTarget = path.resolve(tempTestDir, 'should-fail.db');

    await expect(
      restoreDatabaseBackup({
        manifestPath: backupRes.manifestPath,
        targetDbPath: isolatedTarget,
      })
    ).rejects.toThrow(/Checksum mismatch/);

    expect(fs.existsSync(isolatedTarget)).toBe(false);
  });

  it('guards active live database against accidental overwrite without forceLive', async () => {
    const backupRes = await createDatabaseBackup({
      destinationDir: tempTestDir,
      backupNamePrefix: 'guard-test',
      sourceDbPath: fixture.url.replace(/^file:/, ''),
    });

    const livePath = path.resolve(process.cwd(), 'prisma/data/dev.db');

    await expect(
      restoreDatabaseBackup({
        manifestPath: backupRes.manifestPath,
        targetDbPath: livePath,
        forceLive: false,
      })
    ).rejects.toThrow(/active live database/);
  });

  it('restores backup to isolated target directory and validates ledger reconciliation', async () => {
    const backupRes = await createDatabaseBackup({
      destinationDir: tempTestDir,
      backupNamePrefix: 'valid-restore',
      sourceDbPath: fixture.url.replace(/^file:/, ''),
    });

    const isolatedTarget = path.resolve(tempTestDir, 'restored-isolated.db');

    const restoreRes = await restoreDatabaseBackup({
      manifestPath: backupRes.manifestPath,
      targetDbPath: isolatedTarget,
      allowOverwrite: true,
    });

    expect(restoreRes.success).toBe(true);
    expect(restoreRes.manifestVerified).toBe(true);
    expect(restoreRes.integrityCheck).toBe('ok');
    expect(restoreRes.fkCheckErrorCount).toBe(0);
    expect(restoreRes.tablesCount).toBe(backupRes.manifest.tablesCount);

    // Verify data access and double-entry ledger reconciliation on restored DB
    const restoredPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${isolatedTarget}`,
        },
      },
    });

    try {
      const workspaces = await restoredPrisma.workspace.findMany();
      expect(workspaces.length).toBeGreaterThan(0);

      for (const ws of workspaces) {
        const reconcileRes = await reconcileStock(restoredPrisma, ws.id);
        expect(reconcileRes.balanced).toBe(true);
        expect(reconcileRes.mismatches).toHaveLength(0);
      }
    } finally {
      await restoredPrisma.$disconnect();
    }
  });
});
