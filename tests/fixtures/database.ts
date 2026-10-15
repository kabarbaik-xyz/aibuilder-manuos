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

  // Run migrations using prisma migrate deploy on this specific database URL
  execSync(`npx prisma migrate deploy`, {
    env: {
      ...process.env,
      DATABASE_URL: url,
    },
    stdio: 'pipe',
  });

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
