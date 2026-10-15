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
      'inventory.read',
      'resource.manage',
      'customer_order.read_own',
    ]);

    const startTime = Date.now();
    const context = await buildAuthorizedContext(principal, this.prisma);

    const model = process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash';
    const promptVersion = 'brain-qa-v4';
    const cacheKey = `brain:${context.contextHash}:${model}:${promptVersion}:${question.trim().toLowerCase()}`;

    // 1. Check scoped cache
    const cached = getCached<Explanation<BrainAnswerDTO>>(cacheKey);
    if (cached) {
      return cached;
    }

    const inventoryQuestion = /stock|inventory|material|stok|persediaan/i.test(question) && !/order|production|produksi/i.test(question);

    // 2. Build structured grounded prompt
    const prompt = `
You are the ManuOS Operational Brain assistant for ${principal.workspaceId}.
Answer the question below STRICTLY using the authorized factory operational context.
The context is a bounded sample, not workspace totals. Missing categories may be restricted by access. Say when the requested facts are unavailable. NEVER invent fake orders, machines, or parts. Reference real IDs and numbers from the context.

Operational Context:
- Active Orders (${inventoryQuestion ? 'omitted: inventory-only question' : context.orders.length}):
${(inventoryQuestion ? [] : context.orders).map((o) => `  * ${o.orderNumber}: ${o.itemCode} (${o.orderedQty} units) for ${o.customerName}, Status: ${o.status}, Promised: ${o.promisedDate || 'None'}`).join('\n')}

- Stock Balances (${context.inventory.length}):
${context.inventory.map((i) => `  * ${i.itemCode} (${i.itemName}): On Hand: ${i.onHandQty}, Reserved: ${i.reservedQty}`).join('\n')}

- Active Resources (${inventoryQuestion ? 'omitted: inventory-only question' : context.resources.length}):
${(inventoryQuestion ? [] : context.resources).map((r) => `  * ${r.code} (${r.name}, ${r.type}): Status: ${r.status}`).join('\n')}

User Question: "${question}"

Rules:
- Read-only operational analysis only.
- Keep the answer concise: at most 120 words and at most 5 evidence references. Answer the question directly; avoid listing every record.
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
      maxOutputTokens: 1024,
    });

    const latencyMs = Date.now() - startTime;

    const explanation = validateGroundedOutput<BrainAnswerDTO>({
      schema: BrainAnswerSchema,
      rawData: aiRes.aiResult,
      context,
      model,
      fallbackData: fallbackAnswer,
    });

    if (explanation.status === 'FALLBACK' && !aiRes.aiResult) {
      explanation.reason = aiRes.reason === 'timeout' ? 'TIMEOUT' : aiRes.reason === 'schema' ? 'SCHEMA_ERROR' : 'UNAVAILABLE';
      explanation.message = explanation.reason === 'TIMEOUT' ? 'AI response exceeded the time limit' : explanation.reason === 'SCHEMA_ERROR' ? 'AI response could not be validated' : 'AI provider is unavailable';
    }

    recordProvenance({
      contextHash: context.contextHash,
      model,
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
          answer: 'No active orders are present in the records accessible to this snapshot.',
          evidenceRefs: [],
          linkToScreen: 'command',
        };
      }
      const firstOrder = activeOrders[0];
      return {
        answer: `The latest accessible snapshot includes ${activeOrders.length} active orders (up to 20 records). Latest order ${firstOrder.orderNumber} (${firstOrder.itemCode}, ${firstOrder.orderedQty} units) is currently ${firstOrder.status}.`,
        evidenceRefs: [firstOrder.orderNumber, firstOrder.itemCode],
        linkToScreen: 'orchestrator',
      };
    }

    if (q.includes('stock') || q.includes('inventory') || q.includes('material')) {
      if (context.inventory.length === 0) {
        return {
          answer: 'No inventory balances are available in this snapshot. Your access may restrict inventory records.',
          evidenceRefs: [],
          linkToScreen: 'workstation',
        };
      }
      const firstInv = context.inventory[0];
      return {
        answer: `The accessible inventory sample includes ${context.inventory.length} items (up to 30 balance records). ${firstInv.itemCode} has ${firstInv.onHandQty} on hand (${firstInv.reservedQty} reserved).`,
        evidenceRefs: [firstInv.itemCode],
        linkToScreen: 'workstation',
      };
    }

    return {
      answer: `The latest accessible snapshot contains ${activeOrders.length} orders, ${context.inventory.length} tracked materials, and ${context.resources.length} machines/technicians. This is a limited snapshot, not workspace totals.`,
      evidenceRefs: activeOrders.slice(0, 2).map((o) => o.orderNumber),
      linkToScreen: 'command',
    };
  }
}
