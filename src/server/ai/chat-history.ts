import type { PrismaClient } from '@prisma/client';
import type { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { executeCommand, hashPayload, serializeJson } from '@/server/db/transaction';
import type { BrainAnswerDTO, BrainQuestionContext } from './brain';

export type SavedChatMessage = { question: string; context?: BrainQuestionContext | null; answer: BrainAnswerDTO; status: 'SUCCESS' | 'FALLBACK'; fallbackReason?: string };
function scope(principal: Principal) {
  requireAnyPermission(principal, ['order.read', 'planning.read', 'inventory.read', 'resource.manage', 'customer_order.read_own', 'task.assign']);
  // Historical answers may contain records no longer visible after an access change.
  return hashPayload({ permissions: [...principal.permissions].sort(), roles: [...principal.roles].sort(), facilities: [...(principal.facilityIds ?? [])].sort(), customerId: principal.customerId ?? null, technicianId: principal.technicianId ?? null });
}
export async function readChatHistory(db: PrismaClient, principal: Principal) {
  const rows = await db.assistantChatEntry.findMany({ where: { workspaceId: principal.workspaceId, membershipId: principal.membershipId, scopeHash: scope(principal) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 });
  return rows.reverse().map(row => ({ ...JSON.parse(row.messageJson) as SavedChatMessage, id: row.id, savedAt: row.createdAt.toISOString() }));
}
export async function saveChatMessage(db: PrismaClient, principal: Principal, message: SavedChatMessage, idempotencyKey: string) {
  const scopeHash = scope(principal);
  return executeCommand({ principal, commandType: 'assistant.chat.save', idempotencyKey, payload: { message, scopeHash }, prismaClient: db, handler: async tx => {
    const row = await tx.assistantChatEntry.create({ data: { workspaceId: principal.workspaceId, membershipId: principal.membershipId, scopeHash, messageJson: serializeJson(message) } });
    const old = await tx.assistantChatEntry.findMany({ where: { workspaceId: principal.workspaceId, membershipId: principal.membershipId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 20, select: { id: true } });
    if (old.length) await tx.assistantChatEntry.deleteMany({ where: { workspaceId: principal.workspaceId, membershipId: principal.membershipId, id: { in: old.map((entry: { id: string }) => entry.id) } } });
    return { data: { id: row.id }, aggregateType: 'ASSISTANT_CHAT', aggregateId: row.id, resourceVersion: 1 };
  } });
}
