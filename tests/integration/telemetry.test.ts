import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createFactoryFixture, FactoryFixture } from '../fixtures/factory';
import { TelemetryService } from '@/server/modules/telemetry/service';
import { ForbiddenError, NotFoundError } from '@/domain/errors';

describe('INT-05: authenticated machine telemetry ingestion, dedupe and reconciliation', () => {
  let fixture: FactoryFixture;
  let telemetry: TelemetryService;
  let machineId: string;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
    telemetry = new TelemetryService(fixture.db);
    machineId = fixture.alpha.masters.machineId;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('rejects a principal without resource.manage permission', async () => {
    const stripped = {
      ...fixture.alpha.users.owner.principal,
      permissions: new Set<string>(),
    };
    await expect(
      telemetry.ingestTelemetry(
        stripped,
        {
          machineId,
          events: [
            { eventKey: 'evt-denied', state: 'RUNNING', occurredAt: '2026-10-16T01:00:00.000Z' },
          ],
        },
        'key-telemetry-denied'
      )
    ).rejects.toThrowError(ForbiddenError);
  });

  it('rejects machines outside the workspace', async () => {
    await expect(
      telemetry.ingestTelemetry(
        fixture.beta.users.owner.principal,
        {
          machineId,
          events: [
            { eventKey: 'evt-foreign', state: 'RUNNING', occurredAt: '2026-10-16T01:00:00.000Z' },
          ],
        },
        'key-telemetry-foreign'
      )
    ).rejects.toThrowError(NotFoundError);
  });

  it('ingests a batch and is idempotent on duplicate event keys', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const first = await telemetry.ingestTelemetry(
      principal,
      {
        machineId,
        events: [
          { eventKey: 'evt-1', state: 'RUNNING', occurredAt: '2026-10-16T01:00:00.000Z' },
          { eventKey: 'evt-2', state: 'DOWN', occurredAt: '2026-10-16T02:00:00.000Z' },
          { eventKey: 'evt-3', state: 'RUNNING', occurredAt: '2026-10-16T03:00:00.000Z' },
        ],
      },
      'key-telemetry-ingest-1'
    );
    expect(first.data.accepted).toBe(3);
    expect(first.data.duplicates).toBe(0);

    const replay = await telemetry.ingestTelemetry(
      principal,
      {
        machineId,
        events: [
          { eventKey: 'evt-2', state: 'DOWN', occurredAt: '2026-10-16T02:00:00.000Z' },
          { eventKey: 'evt-4', state: 'IDLE', occurredAt: '2026-10-16T04:00:00.000Z' },
        ],
      },
      'key-telemetry-ingest-2'
    );
    expect(replay.data.accepted).toBe(1);
    expect(replay.data.duplicates).toBe(1);

    const count = await fixture.db.machineTelemetryEvent.count({
      where: { workspaceId: fixture.alpha.workspaceId, machineId },
    });
    expect(count).toBe(4);
  });

  it('flags out-of-order (late clock) events for reconciliation', async () => {
    const res = await telemetry.ingestTelemetry(
      fixture.alpha.users.owner.principal,
      {
        machineId,
        events: [
          { eventKey: 'evt-late', state: 'DOWN', occurredAt: '2026-10-16T01:30:00.000Z' },
        ],
      },
      'key-telemetry-late'
    );
    expect(res.data.accepted).toBe(1);

    const row = await fixture.db.machineTelemetryEvent.findFirst({
      where: { workspaceId: fixture.alpha.workspaceId, machineId, eventKey: 'evt-late' },
    });
    expect(row?.needsReconciliation).toBe(true);
  });

  it('derives downtime intervals from state transitions, including an open interval', async () => {
    await telemetry.ingestTelemetry(
      fixture.alpha.users.owner.principal,
      {
        machineId,
        events: [
          { eventKey: 'evt-5', state: 'DOWN', occurredAt: '2026-10-16T05:00:00.000Z' },
        ],
      },
      'key-telemetry-ingest-5'
    );

    const intervals = await telemetry.listDowntimeIntervals(
      fixture.alpha.users.owner.principal,
      machineId
    );
    // Ordered transitions: 01:00 RUN, 01:30 DOWN(late), 02:00 DOWN, 03:00 RUN,
    // 04:00 IDLE, 05:00 DOWN(open). Late arrival joins the same DOWN run.
    expect(intervals.data).toHaveLength(2);
    expect(intervals.data[0].startAt).toEqual(new Date('2026-10-16T01:30:00.000Z'));
    expect(intervals.data[0].endAt).toEqual(new Date('2026-10-16T03:00:00.000Z'));
    expect(intervals.data[1].startAt).toEqual(new Date('2026-10-16T05:00:00.000Z'));
    expect(intervals.data[1].endAt).toBeNull();
  });

  it('reconciles a flagged event with a note and actor', async () => {
    const principal = fixture.alpha.users.owner.principal;
    const row = await fixture.db.machineTelemetryEvent.findFirst({
      where: { workspaceId: fixture.alpha.workspaceId, machineId, eventKey: 'evt-late' },
    });
    expect(row).toBeTruthy();

    await telemetry.reconcileEvent(
      principal,
      { eventId: row!.id, note: 'Clock skew verified against PLC' },
      'key-telemetry-reconcile-1'
    );

    const updated = await fixture.db.machineTelemetryEvent.findUnique({
      where: { id: row!.id },
    });
    expect(updated?.needsReconciliation).toBe(false);
    expect(updated?.reconciliationNote).toBe('Clock skew verified against PLC');
    expect(updated?.reconciledById).toBe(principal.userId);
    expect(updated?.reconciledAt).toBeTruthy();
  });
});
