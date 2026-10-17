import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { configurePrismaSqlite, createPrismaClient } from '@/server/db/client';

export interface TestDatabase {
  db: PrismaClient;
  url: string;
  filePath: string;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const tempDir = path.resolve(process.cwd(), 'tests/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const dbId = randomUUID();
  const filePath = path.join(tempDir, `test-${dbId}.db`);
  const url = `file:${filePath}`;

  // Prisma's SQLite schema engine can fail without diagnostics when several
  // worker processes apply the same migration tree at once. Serialize only
  // migration setup; each fixture still gets its own database and runs freely.
  const migrationLockPath = path.join(tempDir, 'prisma-migrate.lock');
  let migrationLock: number | undefined;
  while (migrationLock === undefined) {
    try {
      migrationLock = fs.openSync(migrationLockPath, 'wx');
      fs.writeFileSync(migrationLock, `${process.pid}\n${Date.now()}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

      try {
        const lockAge = Date.now() - fs.statSync(migrationLockPath).mtimeMs;
        if (lockAge > 120_000) {
          fs.unlinkSync(migrationLockPath);
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw statError;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    execSync('npx prisma migrate deploy', {
      env: {
        ...process.env,
        DATABASE_URL: url,
        // The bundled Prisma 6.4.1 SQLite schema engine exits with an empty
        // error on this host unless its Rust logger is initialized.
        RUST_LOG: 'info',
      },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = error as NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer };
    throw new Error([
      'Failed to migrate the isolated integration database.',
      output.stderr?.toString().trim(),
      output.stdout?.toString().trim(),
      output.message,
    ].filter(Boolean).join('\n'));
  } finally {
    fs.closeSync(migrationLock);
    try {
      fs.unlinkSync(migrationLockPath);
    } catch {
      // Another fixture may already have removed a stale lock.
    }
  }

  const client = createPrismaClient(url);
  await client.$connect();
  await configurePrismaSqlite(client);

  return {
    db: client,
    url,
    filePath,
    async close() {
      await client.$disconnect();
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(`${filePath}-wal`)) fs.unlinkSync(`${filePath}-wal`);
        if (fs.existsSync(`${filePath}-shm`)) fs.unlinkSync(`${filePath}-shm`);
      } catch {
        // ignore cleanup error
      }
    },
  };
}
