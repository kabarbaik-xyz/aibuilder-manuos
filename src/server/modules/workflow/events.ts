import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';

export interface RecordWorkflowEventParams {
  tx: any; // Prisma transaction client
  workspaceId: string;
  instanceId: string;
  taskId?: string | null;
  fromStatus?: string | null;
  toStatus: string;
  action: string;
  actorUserId: string;
  commandId?: string | null;
  attemptNumber?: number;
  detail?: Record<string, any>;
}

export async function recordWorkflowEvent(params: RecordWorkflowEventParams) {
  const {
    tx,
    workspaceId,
    instanceId,
    taskId,
    fromStatus,
    toStatus,
    action,
    actorUserId,
    commandId,
    attemptNumber,
    detail,
  } = params;

  return tx.workflowEvent.create({
    data: {
      workspaceId,
      instanceId,
      taskId: taskId || null,
      fromStatus: fromStatus || null,
      toStatus,
      action,
      actorUserId,
      commandId: commandId || null,
      attemptNumber: attemptNumber || 1,
      detailJson: JSON.stringify(detail || {}),
    },
  });
}
