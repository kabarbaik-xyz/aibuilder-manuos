import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { BadRequestError, NotFoundError } from '@/domain/errors';

export interface TelemetryReadingInput {
  machineId: string;
  metric: 'TEMPERATURE' | 'VIBRATION' | 'CYCLE_TIME' | 'RPM';
  value: number;
  timestamp: Date | string;
  eventKey?: string;
}

export interface TelemetryIngestionResultDTO {
  machineId: string;
  machineCode: string;
  metric: string;
  value: number;
  status: 'RECORDED' | 'DUPLICATE_IGNORED' | 'ALERT_TRIGGERED';
  machineOperationalStatus: string;
  diagnosticNotice: string;
  recordedAt: string;
}

const processedTelemetryKeys = new Set<string>();

export class TelemetryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Ingests machine sensor telemetry diagnostics.
   * Safety Guard: Ingestion is diagnostic/monitoring only; it never directly actuates physical machinery.
   */
  async ingestTelemetry(
    principal: Principal,
    input: TelemetryReadingInput
  ): Promise<TelemetryIngestionResultDTO> {
    requireAnyPermission(principal, ['resource.manage', 'task.execute_assigned', 'owner', 'order.release']);

    const workspaceId = principal.workspaceId;

    if (input.eventKey && processedTelemetryKeys.has(`${workspaceId}:${input.eventKey}`)) {
      const machine = await this.prisma.machine.findUnique({
        where: { workspaceId_id: { workspaceId, id: input.machineId } },
      });
      return {
        machineId: input.machineId,
        machineCode: machine?.code || 'UNKNOWN',
        metric: input.metric,
        value: input.value,
        status: 'DUPLICATE_IGNORED',
        machineOperationalStatus: machine?.status || 'IDLE',
        diagnosticNotice: 'Duplicate telemetry event key ignored idempotently.',
        recordedAt: new Date().toISOString(),
      };
    }

    const machine = await this.prisma.machine.findUnique({
      where: {
        workspaceId_id: {
          workspaceId,
          id: input.machineId,
        },
      },
    });

    if (!machine) {
      throw new NotFoundError(`Machine '${input.machineId}' not found.`);
    }

    let operationalStatus = machine.status;
    let status: 'RECORDED' | 'ALERT_TRIGGERED' = 'RECORDED';

    // Condition threshold alert: Temperature > 95°C or Vibration > 50 mm/s
    if (
      (input.metric === 'TEMPERATURE' && input.value > 95) ||
      (input.metric === 'VIBRATION' && input.value > 50)
    ) {
      status = 'ALERT_TRIGGERED';
      operationalStatus = 'MAINTENANCE';

      await this.prisma.machine.update({
        where: {
          workspaceId_id: {
            workspaceId,
            id: machine.id,
          },
        },
        data: {
          status: 'MAINTENANCE',
        },
      });
    }

    if (input.eventKey) {
      processedTelemetryKeys.add(`${workspaceId}:${input.eventKey}`);
    }

    return {
      machineId: machine.id,
      machineCode: machine.code,
      metric: input.metric,
      value: input.value,
      status,
      machineOperationalStatus: operationalStatus,
      diagnosticNotice: 'Telemetry reading captured. Diagnostic monitoring only; does not actuate equipment.',
      recordedAt: new Date().toISOString(),
    };
  }
}
