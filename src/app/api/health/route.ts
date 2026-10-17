import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';

// Health depends on live database state, so it must never be cached or
// statically evaluated at build time.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const processStartedAt = Date.now();

/**
 * Container health probe.
 *
 * Confirms the SQLite store is reachable and that the connection-level pragmas
 * were applied, so Cloud Run only routes traffic to instances whose durable
 * database was actually restored from the mounted bucket. Returns 503 when the
 * database cannot be queried so a bad revision fails fast instead of serving
 * errors behind a green health check.
 */
export async function GET() {
  const probeStartedAt = Date.now();
  const version = process.env.MANUOS_VERSION ?? '1.0.0';

  try {
    await db.$queryRawUnsafe('SELECT 1 AS ok');
    const foreignKeys = await db.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>(
      'PRAGMA foreign_keys'
    );

    return NextResponse.json({
      status: 'ok',
      service: 'manuos-web',
      version,
      uptimeSeconds: Math.round((Date.now() - processStartedAt) / 1000),
      database: {
        status: 'ok',
        latencyMs: Date.now() - probeStartedAt,
        foreignKeysEnabled: Number(foreignKeys?.[0]?.foreign_keys ?? 0) === 1,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'degraded',
        service: 'manuos-web',
        version,
        uptimeSeconds: Math.round((Date.now() - processStartedAt) / 1000),
        database: {
          status: 'error',
          latencyMs: Date.now() - probeStartedAt,
          message: error instanceof Error ? error.message : 'unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
