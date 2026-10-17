import { PrismaClient } from '@prisma/client';
import { Principal } from '@/server/auth/principal';
import { requireAnyPermission } from '@/server/auth/permissions';
import { buildAuthorizedContext, resolveAuthorizedEvidenceReferences, AuthorizedEvidenceReference } from './context';
import { Explanation, validateGroundedOutput } from './validation';
import { callGeminiStructured } from './gemini-client';
import { getCached, setCached } from './cache';
import { recordProvenance } from './provenance';
import { z } from 'zod';
import { NotFoundError } from '@/domain/errors';

export interface BrainQuestionContext {
  type: 'ORDER' | 'ITEM' | 'TASK';
  id: string;
}

export const BrainAnswerSchema = z.object({
  answer: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
  linkToScreen: z.string().optional(),
});

export type BrainAnswerDTO = z.infer<typeof BrainAnswerSchema> & { evidence?: AuthorizedEvidenceReference[] };

export class ProductionBrainService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Answers operational questions strictly grounded in active workspace state.
   */
  async answerProductionQuestion(
    principal: Principal,
    question: string,
    scopedRecord?: BrainQuestionContext,
  ): Promise<Explanation<BrainAnswerDTO>> {
    requireAnyPermission(principal, [
      'order.read',
      'planning.read',
      'inventory.read',
      'resource.manage',
      'customer_order.read_own',
      'task.assign',
    ]);

    const startTime = Date.now();
    const context = await buildAuthorizedContext(principal, this.prisma, scopedRecord
      ? scopedRecord.type === 'ORDER' ? { orderId: scopedRecord.id }
        : scopedRecord.type === 'ITEM' ? { itemId: scopedRecord.id }
          : { taskId: scopedRecord.id }
      : undefined);
    if (scopedRecord && !(scopedRecord.type === 'ORDER'
      ? context.orders.some(order => order.id === scopedRecord.id)
      : scopedRecord.type === 'TASK'
        ? context.tasks.some(task => task.id === scopedRecord.id)
        : context.evidenceIndex.includes(scopedRecord.id))) {
      throw new NotFoundError('Selected assistant context is not available in the current workspace scope.');
    }

    const model = process.env.GEMINI_FLASH_MODEL || 'gemini-flash-lite-latest';
    const promptVersion = 'brain-qa-v6-readable';
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
The context is a bounded sample, not workspace totals. Missing categories may be restricted by access. Say when the requested facts are unavailable. NEVER invent fake orders, machines, or parts. Use real order numbers, item names, and operation names from the context. Never print database UUIDs. The order sample includes historical and draft orders; do not call every sampled order active.

Operational Context:
- Sampled Orders (${inventoryQuestion ? 'omitted: inventory-only question' : context.orders.length}):
${(inventoryQuestion ? [] : context.orders).map((o) => `  * ${o.orderNumber}: ${o.itemCode} (${o.orderedQty} units) for ${o.customerName}, Status: ${o.status}, Promised: ${o.promisedDate || 'None'}`).join('\n')}

- Stock Balances (${context.inventory.length}):
${context.inventory.map((i) => `  * ${i.itemCode} (${i.itemName}): On Hand: ${i.onHandQty}, Reserved: ${i.reservedQty}`).join('\n')}

- Active Resources (${inventoryQuestion ? 'omitted: inventory-only question' : context.resources.length}):
${(inventoryQuestion ? [] : context.resources).map((r) => `  * ${r.code} (${r.name}, ${r.type}): Status: ${r.status}`).join('\n')}

- Assigned/Plannable Tasks (${context.tasks.length}):
${(inventoryQuestion ? [] : context.tasks).map(task => `  * ${task.id}: ${task.orderNumber} / ${task.nodeKey}, status ${task.status}, planned ${task.plannedMinutes ?? 'unavailable'} minutes, actual ${task.actualMinutes ?? 'unavailable'} minutes`).join('\n')}

User Question: "${question}"

Rules:
- Read-only operational analysis only.
- Write for a busy factory planner, not a database reader. Match the language of the user's question.
- Keep the answer at most 180 words and at most 5 evidence references. Start with ONE short sentence answering the question. Then use 2–4 short sections with Markdown headings (###) and bullet points (-). Each bullet must express one fact, with at most two example records. Never write a comma-separated catalogue of records or a long paragraph.
- For order status questions: group by human-readable status (In production, Released, Draft, Partially delivered, Delivered). State sample counts only when directly counted from the supplied records. Delivered and cancelled orders are not active. Do not enumerate every order.
- For inventory: group relevant records into short bullets with item name/code, on-hand amount, and reserved amount when relevant. Never add quantities across different items or infer shortage/sufficiency from stock alone. Never invent a unit when none is supplied.
- For production overview: separate Orders, Work in progress, and Resources when evidence exists. Do not describe completed tasks as open work, or resource status as confirmed scheduling availability.
- Translate enum values into natural words: IN_PRODUCTION → In production, PARTIALLY_DELIVERED → Partially delivered. Do not print raw status codes, UUIDs, or internal field names.
- If there is an evidenced issue, finish with one concrete next step. If none is evidenced, do not invent urgency or recommendations. Make missing evidence explicit.
- State briefly that this covers the accessible sample, not the whole factory. Never present sample counts as workspace totals. Do not claim an item is raw material or finished goods unless context explicitly supports that classification.
- Put citations only in evidenceRefs; the UI renders Sources separately. Do not repeat a Sources section inside answer.
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
    const fallbackAnswer = this.buildDeterministicFallback(question, context, scopedRecord);

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

    const validatedRefs = explanation.status === 'SUCCESS'
      ? explanation.evidenceRefs
      : explanation.fallbackData?.evidenceRefs ?? [];
    const typedEvidence = resolveAuthorizedEvidenceReferences(context, validatedRefs);
    if (explanation.status === 'SUCCESS') explanation.data.evidence = typedEvidence;
    else if (explanation.fallbackData) explanation.fallbackData.evidence = typedEvidence;

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
    context: Awaited<ReturnType<typeof buildAuthorizedContext>>,
    scopedRecord?: BrainQuestionContext,
  ): BrainAnswerDTO {
    const q = question.toLowerCase();
    const activeOrders = context.orders.filter((o) => !['DELIVERED', 'CANCELLED', 'DRAFT'].includes(o.status));
    const readableStatus = (status: string) => status.toLowerCase().replaceAll('_', ' ');
    const selectedOrder = scopedRecord?.type === 'ORDER' ? context.orders.find(order => order.id === scopedRecord.id) : undefined;
    if (selectedOrder) return {
      answer: `${selectedOrder.orderNumber} is ${readableStatus(selectedOrder.status)}.\n\n### Order details\n- Item: ${selectedOrder.itemCode}.\n- Ordered quantity: ${selectedOrder.orderedQty}.\n- Promised delivery: ${selectedOrder.promisedDate ?? 'Not committed'}.\n\nThis summary covers the selected order only.`,
      evidenceRefs: [selectedOrder.orderNumber, selectedOrder.itemCode], linkToScreen: 'orchestrator',
    };


    if (context.tasks.length > 0 && /task|operation|block|tugas|operasi/i.test(q)) {
      const task = context.tasks[0];
      return {
        answer: `Task ${task.nodeKey} for ${task.orderNumber} is ${readableStatus(task.status)}.\n\n### Duration\n- Planned: ${task.plannedMinutes ?? 'unavailable'} minutes.\n- Measured: ${task.actualMinutes ?? 'unavailable'} minutes.\n\nBased on accessible records only.`,
        evidenceRefs: [task.id],
        linkToScreen: 'orchestrator',
      };
    }

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
        answer: `The accessible sample includes ${activeOrders.length} active orders.\n\n### Latest active order\n- ${firstOrder.orderNumber}: ${readableStatus(firstOrder.status)}.\n- Item: ${firstOrder.itemCode}.\n- Ordered quantity: ${firstOrder.orderedQty}.\n\nThis is a limited sample, not a factory-wide total.`,
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
        answer: `Inventory records are available in the accessible sample.\n\n### ${firstInv.itemName} (${firstInv.itemCode})\n- On hand: ${firstInv.onHandQty}.\n- Reserved: ${firstInv.reservedQty}.\n\nThis is a limited sample; stock sufficiency has not been assessed.`,
        evidenceRefs: [firstInv.itemCode],
        linkToScreen: 'workstation',
      };
    }

    return {
      answer: `Here is the accessible production snapshot.\n\n### Orders\n- ${activeOrders.length} active orders in the sample.\n\n### Resources\n- ${context.resources.length} machine/technician records in the sample.\n- Resource status alone does not confirm scheduling availability.\n\nThis is a limited snapshot, not factory-wide totals.`,
      evidenceRefs: activeOrders.slice(0, 2).map((o) => o.orderNumber),
      linkToScreen: 'command',
    };
  }
}
