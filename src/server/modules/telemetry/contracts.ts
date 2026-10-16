import { z } from 'zod';

export const TelemetryState = {
  RUNNING: 'RUNNING',
  IDLE: 'IDLE',
  DOWN: 'DOWN',
  MAINTENANCE: 'MAINTENANCE',
} as const;
export type TelemetryState = (typeof TelemetryState)[keyof typeof TelemetryState];

export const TelemetryEventSchema = z.object({
  eventKey: z.string().min(1).max(200),
  state: z.enum([TelemetryState.RUNNING, TelemetryState.IDLE, TelemetryState.DOWN, TelemetryState.MAINTENANCE]),
  occurredAt: z.string().datetime(),
  payloadJson: z.string().max(10000).optional(),
});
export type TelemetryEventInput = z.infer<typeof TelemetryEventSchema>;

export const IngestTelemetrySchema = z.object({
  machineId: z.string().uuid(),
  events: z.array(TelemetryEventSchema).min(1).max(200),
});
export type IngestTelemetryInput = z.infer<typeof IngestTelemetrySchema>;

export const ReconcileTelemetrySchema = z.object({
  eventId: z.string().uuid(),
  note: z.string().min(1).max(1000),
});
export type ReconcileTelemetryInput = z.infer<typeof ReconcileTelemetrySchema>;

export interface TelemetryDowntimeInterval {
  startAt: Date;
  endAt: Date | null;
  sourceEventKeys: string[];
}
