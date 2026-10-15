import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export interface BackupManifest {
  version: '1.0.0';
  createdAt: string;
  dbFilename: string;
  dbSha256: string;
  dbSizeBytes: number;
  sourceDbPath: string;
  integrityCheck: string;
  fkCheckErrorCount: number;
  tablesCount: number;
}

export interface BackupOptions {
  destinationDir?: string;
  sourceDbPath?: string;
  backupNamePrefix?: string;
}

export interface BackupResult {
  manifest: BackupManifest;
  manifestPath: string;
  backupDbPath: string;
}

export function computeSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

export async function createDatabaseBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destDir = options.destinationDir || path.resolve(process.cwd(), 'backups');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const prefix = options.backupNamePrefix || 'manuos-backup';
  const backupDbFilename = `${prefix}-${timestamp}.db`;
  const manifestFilename = `${prefix}-${timestamp}.manifest.json`;

  const backupDbPath = path.resolve(destDir, backupDbFilename);
  const manifestPath = path.resolve(destDir, manifestFilename);

  // Determine source db path
  let sourceDbPath = options.sourceDbPath;
  if (!sourceDbPath) {
    const rawUrl = process.env.DATABASE_URL || 'file:./data/dev.db';
    if (rawUrl.startsWith('file:')) {
      const relative = rawUrl.replace(/^file:/, '');
      sourceDbPath = path.isAbsolute(relative)
        ? relative
        : path.resolve(process.cwd(), 'prisma', relative);
    } else {
      sourceDbPath = path.resolve(process.cwd(), 'prisma/data/dev.db');
    }
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${sourceDbPath}`,
      },
    },
  });

  try {
    // 1. Checkpoint WAL log safely
    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');

    // 2. Perform atomic SQLite VACUUM INTO backup target
    if (fs.existsSync(backupDbPath)) {
      fs.unlinkSync(backupDbPath);
    }
    await prisma.$executeRawUnsafe(`VACUUM INTO '${backupDbPath}'`);

    // 3. Verify backup file existence and compute sha256 + size
    if (!fs.existsSync(backupDbPath)) {
      throw new Error(`Backup file failed to generate at ${backupDbPath}`);
    }

    const stats = fs.statSync(backupDbPath);
    const dbSha256 = computeSha256(backupDbPath);

    // 4. Verify integrity of the newly produced backup DB
    const backupPrisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${backupDbPath}`,
        },
      },
    });

    let integrityResult = 'unknown';
    let fkErrors = 0;
    let tablesCount = 0;

    try {
      const integrityRows = await backupPrisma.$queryRawUnsafe<Array<{ integrity_check: string }>>(
        'PRAGMA integrity_check'
      );
      integrityResult = integrityRows[0]?.integrity_check || 'unknown';

      const fkRows = await backupPrisma.$queryRawUnsafe<Array<unknown>>('PRAGMA foreign_key_check');
      fkErrors = fkRows.length;

      const tablesRows = await backupPrisma.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      tablesCount = tablesRows.length;
    } finally {
      await backupPrisma.$disconnect();
    }

    const manifest: BackupManifest = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      dbFilename: backupDbFilename,
      dbSha256,
      dbSizeBytes: stats.size,
      sourceDbPath,
      integrityCheck: integrityResult,
      fkCheckErrorCount: fkErrors,
      tablesCount,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    return {
      manifest,
      manifestPath,
      backupDbPath,
    };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module || process.argv[1]?.includes('backup')) {
  const targetDir = process.argv[2];
  createDatabaseBackup({ destinationDir: targetDir })
    .then((result) => {
      console.log('✓ Database backup successfully generated:');
      console.log(`  Target DB:   ${result.backupDbPath}`);
      console.log(`  Manifest:    ${result.manifestPath}`);
      console.log(`  Size:        ${result.manifest.dbSizeBytes} bytes`);
      console.log(`  SHA-256:     ${result.manifest.dbSha256}`);
      console.log(`  Integrity:   ${result.manifest.integrityCheck}`);
      console.log(`  Tables:      ${result.manifest.tablesCount}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('✗ Backup failed:', err);
      process.exit(1);
    });
}
