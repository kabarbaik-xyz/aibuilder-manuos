import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: '2026-11-24T09:00:00Z',
    service: 'manuos-web',
    version: '1.0.0',
  });
}
