import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BackupManifest, computeSha256 } from './backup-db';

export interface RestoreOptions {
  manifestPath: string;
  targetDbPath: string;
  allowOverwrite?: boolean;
  forceLive?: boolean;
}

export interface RestoreResult {
  success: boolean;
  targetDbPath: string;
  manifestVerified: boolean;
  integrityCheck: string;
  fkCheckErrorCount: number;
  tablesCount: number;
}

export async function restoreDatabaseBackup(options: RestoreOptions): Promise<RestoreResult> {
  const { manifestPath, targetDbPath, allowOverwrite, forceLive } = options;

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at path: ${manifestPath}`);
  }

  const manifestDir = path.dirname(manifestPath);
  const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
  const manifest: BackupManifest = JSON.parse(manifestRaw);

  const backupDbPath = path.resolve(manifestDir, manifest.dbFilename);
  if (!fs.existsSync(backupDbPath)) {
    throw new Error(`Backup database file not found at: ${backupDbPath}`);
  }

  // 1. Verify Checksum
  const computedHash = computeSha256(backupDbPath);
  if (computedHash !== manifest.dbSha256) {
    throw new Error(
      `Checksum mismatch! Expected SHA-256 ${manifest.dbSha256}, but computed ${computedHash}`
    );
  }

  // 2. Safety guard against accidental live DB overwrite
  const defaultLivePath = path.resolve(process.cwd(), 'prisma/data/dev.db');
  const resolvedTarget = path.resolve(targetDbPath);

  if (resolvedTarget === defaultLivePath && !forceLive) {
    throw new Error(
      'Target path is the active live database! Pass forceLive=true or --force-live to confirm overwrite.'
    );
  }

  if (fs.existsSync(resolvedTarget) && !allowOverwrite && !forceLive) {
    throw new Error(
      `Target database file already exists at ${resolvedTarget}. Specify allowOverwrite=true to replace.`
    );
  }

  // Ensure target directory exists
  const targetDir = path.dirname(resolvedTarget);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 3. Copy backup file to target destination
  fs.copyFileSync(backupDbPath, resolvedTarget);

  // 4. Verify restored DB integrity
  const targetPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${resolvedTarget}`,
      },
    },
  });

  try {
    const integrityRows = await targetPrisma.$queryRawUnsafe<Array<{ integrity_check: string }>>(
      'PRAGMA integrity_check'
    );
    const integrityCheck = integrityRows[0]?.integrity_check || 'unknown';

    const fkRows = await targetPrisma.$queryRawUnsafe<Array<unknown>>('PRAGMA foreign_key_check');
    const fkCheckErrorCount = fkRows.length;

    const tablesRows = await targetPrisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const tablesCount = tablesRows.length;

    if (integrityCheck !== 'ok') {
      throw new Error(`Restored database failed integrity check: ${integrityCheck}`);
    }

    return {
      success: true,
      targetDbPath: resolvedTarget,
      manifestVerified: true,
      integrityCheck,
      fkCheckErrorCount,
      tablesCount,
    };
  } finally {
    await targetPrisma.$disconnect();
  }
}

if (require.main === module || process.argv[1]?.includes('restore')) {
  const manifestArg = process.argv[2];
  const targetDbArg = process.argv[3];
  const forceLive = process.argv.includes('--force-live');

  if (!manifestArg || !targetDbArg) {
    console.error('Usage: tsx scripts/restore-db.ts <manifestPath> <targetDbPath> [--force-live]');
    process.exit(1);
  }

  restoreDatabaseBackup({
    manifestPath: manifestArg,
    targetDbPath: targetDbArg,
    allowOverwrite: true,
    forceLive,
  })
    .then((result) => {
      console.log('✓ Database successfully restored:');
      console.log(`  Target DB:     ${result.targetDbPath}`);
      console.log(`  Checksum:      Verified OK`);
      console.log(`  Integrity:     ${result.integrityCheck}`);
      console.log(`  FK Errors:     ${result.fkCheckErrorCount}`);
      console.log(`  Tables Found:  ${result.tablesCount}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('✗ Restore failed:', err);
      process.exit(1);
    });
}
