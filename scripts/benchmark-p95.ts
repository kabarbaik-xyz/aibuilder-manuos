import { performance } from 'perf_hooks';
import { createFactoryFixture } from '../tests/fixtures/factory';
import { executeCommand } from '../src/server/db/transaction';

async function main() {
  console.log('====================================================');
  console.log('ManuOS PRD P95 Performance & Latency Benchmark');
  console.log('Reference Environment: Local Host (Node.js + SQLite WAL)');
  console.log('Target Thresholds: CRUD P95 < 800ms, Workstation Submit P95 < 1500ms');
  console.log('====================================================\n');

  console.log('Initializing isolated reference database fixture...');
  const fixture = await createFactoryFixture();
  const db = fixture.db;
  const workspaceId = fixture.alpha.workspaceId;
  const principal = fixture.alpha.users.owner.principal;

  const sampleCount = 50;
  const crudLatencies: number[] = [];
  const submitLatencies: number[] = [];

  // 1. Measure CRUD Read / Mutation Latency (P95 < 800ms)
  console.log(`Executing ${sampleCount} CRUD command samples...`);
  for (let i = 0; i < sampleCount; i++) {
    const start = performance.now();
    await executeCommand({
      principal,
      commandType: 'benchmark.crud.sample',
      idempotencyKey: `bench-crud-${i}-${Date.now()}`,
      payload: { index: i },
      prismaClient: db,
      handler: async (tx) => {
        const items = await tx.item.findMany({
          where: { workspaceId },
          take: 10,
        });
        return {
          data: { count: items.length },
          aggregateType: 'BENCHMARK',
          aggregateId: `bench-${i}`,
          resourceVersion: 1,
        };
      },
    });
    const elapsed = performance.now() - start;
    crudLatencies.push(elapsed);
  }

  // 2. Measure Workstation Submit Latency (P95 < 1500ms)
  console.log(`Executing ${sampleCount} Workstation Submit simulation samples...`);
  for (let i = 0; i < sampleCount; i++) {
    const start = performance.now();
    await executeCommand({
      principal,
      commandType: 'benchmark.workstation.submit',
      idempotencyKey: `bench-submit-${i}-${Date.now()}`,
      payload: { index: i },
      prismaClient: db,
      handler: async (tx) => {
        const task = await tx.task.findFirst({
          where: { workspaceId },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: principal.userId,
            commandId: `bench-submit-audit-${i}`,
            action: 'SUBMIT',
            aggregateType: 'TASK',
            aggregateId: task?.id || `task-sample-${i}`,
            detailJson: '{}',
            beforeRevision: 1,
            afterRevision: 2,
            reason: 'Benchmarking submit response time',
          },
        });
        return {
          data: { submitted: true },
          aggregateType: 'TASK',
          aggregateId: task?.id || `task-sample-${i}`,
          resourceVersion: 2,
        };
      },
    });
    const elapsed = performance.now() - start;
    submitLatencies.push(elapsed);
  }

  function getPercentile(arr: number[], pct: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((pct / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  const crudP50 = getPercentile(crudLatencies, 50).toFixed(2);
  const crudP95 = getPercentile(crudLatencies, 95).toFixed(2);
  const crudP99 = getPercentile(crudLatencies, 99).toFixed(2);

  const subP50 = getPercentile(submitLatencies, 50).toFixed(2);
  const subP95 = getPercentile(submitLatencies, 95).toFixed(2);
  const subP99 = getPercentile(submitLatencies, 99).toFixed(2);

  console.log('\n----------------- Results -----------------');
  console.log(`CRUD Latency (Target P95 < 800ms):`);
  console.log(`  P50: ${crudP50}ms | P95: ${crudP95}ms | P99: ${crudP99}ms -> ${parseFloat(crudP95) < 800 ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Workstation Submit Latency (Target P95 < 1500ms):`);
  console.log(`  P50: ${subP50}ms | P95: ${subP95}ms | P99: ${subP99}ms -> ${parseFloat(subP95) < 1500 ? '✓ PASS' : '✗ FAIL'}`);
  console.log('-------------------------------------------\n');

  await fixture.close();
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
