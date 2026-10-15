import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { buildAuthorizedContext } from './context';
import { Explanation, validateGroundedOutput } from './validation';
import { callGeminiStructured } from './gemini-client';
import { getCached, setCached } from './cache';
import { recordProvenance } from './provenance';
import { z } from 'zod';

export const BrainAnswerSchema = z.object({
  answer: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
  linkToScreen: z.string().optional(),
});

export type BrainAnswerDTO = z.infer<typeof BrainAnswerSchema>;

export class ProductionBrainService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Answers operational questions strictly grounded in active workspace state.
   */
  async answerProductionQuestion(
    principal: Principal,
    question: string
  ): Promise<Explanation<BrainAnswerDTO>> {
    requireAnyPermission(principal, [
      'order.read',
      'planning.read',
      'execution.read',
      'customer_order.read_own',
    ]);

    const startTime = Date.now();
    const context = await buildAuthorizedContext(principal, this.prisma);

    const promptVersion = 'brain-qa-v1';
    const cacheKey = `brain:${context.contextHash}:${promptVersion}:${question.trim().toLowerCase()}`;

    // 1. Check scoped cache
    const cached = getCached<Explanation<BrainAnswerDTO>>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Build structured grounded prompt
    const prompt = `
You are the ManuOS Operational Brain assistant for ${principal.workspaceId}.
Answer the question below STRICTLY using the authorized factory operational context.
NEVER invent fake orders, machines, or parts. Reference real IDs and numbers from the context.

Operational Context:
- Active Orders (${context.orders.length}):
${context.orders.map((o) => `  * ${o.orderNumber}: ${o.itemCode} (${o.orderedQty} units) for ${o.customerName}, Status: ${o.status}, Promised: ${o.promisedDate || 'None'}`).join('\n')}

- Stock Balances (${context.inventory.length}):
${context.inventory.map((i) => `  * ${i.itemCode} (${i.itemName}): On Hand: ${i.onHandQty}, Reserved: ${i.reservedQty}`).join('\n')}

- Active Resources (${context.resources.length}):
${context.resources.map((r) => `  * ${r.code} (${r.name}, ${r.type}): Status: ${r.status}`).join('\n')}

User Question: "${question}"

Rules:
- Read-only operational analysis only.
- Include verified evidence references from context in "evidenceRefs" (e.g. order numbers, part numbers).
- Suggest relevant screen in "linkToScreen" ("command", "orchestrator", "workstation", "quality", "shipments").
`;

    const responseSchema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
        linkToScreen: { type: 'string' },
      },
      required: ['answer', 'evidenceRefs'],
    };

    // 3. Fallback data generator if AI unavailable or ungrounded
    const fallbackAnswer = this.buildDeterministicFallback(question, context);

    // 4. Invoke model
    const aiRes = await callGeminiStructured<any>(prompt, cacheKey, {
      responseSchema,
    });

    const latencyMs = Date.now() - startTime;

    const explanation = validateGroundedOutput<BrainAnswerDTO>({
      schema: BrainAnswerSchema,
      rawData: aiRes.aiResult,
      context,
      model: 'gemini-2.5-flash',
      fallbackData: fallbackAnswer,
    });

    recordProvenance({
      contextHash: context.contextHash,
      model: 'gemini-2.5-flash',
      promptVersion,
      latencyMs,
      status: explanation.status,
      reason: explanation.status === 'FALLBACK' ? explanation.reason : undefined,
    });

    // Cache valid explanation
    if (explanation.status === 'SUCCESS') {
      setCached(cacheKey, explanation);
    }

    return explanation;
  }

  private buildDeterministicFallback(
    question: string,
    context: Awaited<ReturnType<typeof buildAuthorizedContext>>
  ): BrainAnswerDTO {
    const q = question.toLowerCase();
    const activeOrders = context.orders.filter((o) => o.status !== 'DELIVERED');

    if (q.includes('order') || q.includes('active') || q.includes('status')) {
      if (activeOrders.length === 0) {
        return {
          answer: 'There are currently no active production orders in the workspace.',
          evidenceRefs: [],
          linkToScreen: 'command',
        };
      }
      const firstOrder = activeOrders[0];
      return {
        answer: `Factory has ${activeOrders.length} active orders. Latest order ${firstOrder.orderNumber} (${firstOrder.itemCode}, ${firstOrder.orderedQty} units) is currently ${firstOrder.status}.`,
        evidenceRefs: [firstOrder.orderNumber, firstOrder.itemCode],
        linkToScreen: 'orchestrator',
      };
    }

    if (q.includes('stock') || q.includes('inventory') || q.includes('material')) {
      if (context.inventory.length === 0) {
        return {
          answer: 'No inventory balances are currently recorded in the warehouse ledger.',
          evidenceRefs: [],
          linkToScreen: 'workstation',
        };
      }
      const firstInv = context.inventory[0];
      return {
        answer: `Tracking ${context.inventory.length} item balances. ${firstInv.itemCode} has ${firstInv.onHandQty} on hand (${firstInv.reservedQty} reserved).`,
        evidenceRefs: [firstInv.itemCode],
        linkToScreen: 'workstation',
      };
    }

    return {
      answer: `Operational factory state contains ${activeOrders.length} orders, ${context.inventory.length} tracked materials, and ${context.resources.length} active machines/technicians.`,
      evidenceRefs: activeOrders.slice(0, 2).map((o) => o.orderNumber),
      linkToScreen: 'command',
    };
  }
}
