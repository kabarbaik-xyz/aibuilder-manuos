import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __manuos_db: PrismaClient | undefined;
}

export function createPrismaClient(databaseUrl?: string): PrismaClient {
  const url = databaseUrl || process.env.DATABASE_URL || 'file:./data/dev.db';
  const client = new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'test' ? ['error'] : ['error', 'warn'],
  });

  // Prisma connects lazily. Initialize the connection before its first query so
  // callers using this factory cannot accidentally run with SQLite defaults.
  let initialization: Promise<void> | undefined;
  let initializing = false;
  client.$use(async (params, next) => {
    const queryText = Array.isArray(params.args)
      ? params.args.find((arg): arg is string => typeof arg === 'string')
      : typeof params.args === 'string'
        ? params.args
        : typeof params.args === 'object' &&
            params.args !== null &&
            'query' in params.args &&
            typeof params.args.query === 'string'
          ? params.args.query
          : '';
    const isBootstrapPragma =
      initializing &&
      /PRAGMA\s+(foreign_keys|busy_timeout|journal_mode)\b/i.test(queryText);

    if (isBootstrapPragma) {
      return next(params);
    }

    if (!initialization) {
      initialization = (async () => {
        initializing = true;
        try {
          await configurePrismaSqlite(client);
        } finally {
          initializing = false;
        }
      })();
    }

    await initialization;
    return next(params);
  });

  return client;
}

export async function configurePrismaSqlite(client: PrismaClient): Promise<void> {
  await client.$queryRawUnsafe('PRAGMA foreign_keys = ON;');
  await client.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
}

export function getDb(): PrismaClient {
  if (global.__manuos_db) {
    return global.__manuos_db;
  }
  return (global.__manuos_db = createPrismaClient());
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const instance = getDb();
    const val = (instance as any)[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  },
});
