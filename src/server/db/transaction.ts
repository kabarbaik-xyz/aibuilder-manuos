import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { db as defaultDb } from './client';
import { Principal } from '../auth/principal';
import { Committed } from '@/domain/commands';
import { ConflictError } from '@/domain/errors';

export function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',') +
    '}'
  );
}

export function hashPayload(payload: any): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export interface CommandExecutionResult<TOutput> {
  data: TOutput;
  aggregateType: string;
  aggregateId: string;
  resourceVersion: number;
  previousVersion?: number;
  auditDetails?: Record<string, any>;
}

export interface ExecuteCommandOptions<TInput, TOutput> {
  principal: Principal;
  commandType: string;
  idempotencyKey: string;
  expectedVersion?: number;
  payload: TInput;
  requestId?: string;
  prismaClient?: PrismaClient;
  handler: (
    tx: any,
    context: { requestId: string; principal: Principal }
  ) => Promise<CommandExecutionResult<TOutput>>;
}

export async function executeCommand<TInput, TOutput>(
  options: ExecuteCommandOptions<TInput, TOutput>
): Promise<Committed<TOutput>> {
  const {
    principal,
    commandType,
    idempotencyKey,
    expectedVersion,
    payload,
    handler,
  } = options;

  const client = options.prismaClient || defaultDb;
  const requestId = options.requestId || randomUUID();
  const requestHash = hashPayload(payload);

  // 1. Check idempotency receipt (after authorization)
  const existingReceipt = await client.commandReceipt.findUnique({
    where: {
      workspaceId_principalId_key: {
        workspaceId: principal.workspaceId,
        principalId: principal.userId,
        key: idempotencyKey,
      },
    },
  });

  if (existingReceipt) {
    // Conflict if same key is reused with different payload
    if (existingReceipt.requestHash !== requestHash) {
      throw new ConflictError(
        `Idempotency key '${idempotencyKey}' was already submitted with a different request payload`,
        'DUPLICATE_KEY_PAYLOAD',
        false
      );
    }

    // Read current workspace revision
    const ws = await client.workspace.findUnique({
      where: { id: principal.workspaceId },
    });

    return {
      data: JSON.parse(existingReceipt.resultJson) as TOutput,
      meta: {
        resourceVersion: expectedVersion ?? 1,
        workspaceRevision: ws?.revision ?? 1,
        requestId,
        replayed: true,
      },
    };
  }

  // 2. Execute command atomically in transaction
  return await client.$transaction(async (tx) => {
    const result = await handler(tx, { requestId, principal });

    // Validate expected version if supplied
    const currentVersion =
      result.previousVersion !== undefined
        ? result.previousVersion
        : result.resourceVersion;

    if (
      expectedVersion !== undefined &&
      currentVersion !== expectedVersion
    ) {
      throw new ConflictError(
        `Resource version mismatch: expected ${expectedVersion}, but found ${currentVersion}`,
        'STALE_VERSION',
        true
      );
    }

    // Increment workspace revision
    const workspace = await tx.workspace.update({
      where: { id: principal.workspaceId },
      data: { revision: { increment: 1 } },
    });

    // Write audit event
    await tx.auditEvent.create({
      data: {
        workspaceId: principal.workspaceId,
        actorUserId: principal.userId,
        commandId: idempotencyKey,
        aggregateType: result.aggregateType,
        aggregateId: result.aggregateId,
        action: commandType,
        beforeRevision: expectedVersion ?? null,
        afterRevision: result.resourceVersion,
        detailJson: JSON.stringify(result.auditDetails || {}),
      },
    });

    // Write command receipt
    await tx.commandReceipt.create({
      data: {
        workspaceId: principal.workspaceId,
        principalId: principal.userId,
        key: idempotencyKey,
        requestHash,
        commandType,
        resourceId: result.aggregateId,
        resultJson: JSON.stringify(result.data),
      },
    });

    return {
      data: result.data,
      meta: {
        resourceVersion: result.resourceVersion,
        workspaceRevision: workspace.revision,
        requestId,
        replayed: false,
      },
    };
  });
}
