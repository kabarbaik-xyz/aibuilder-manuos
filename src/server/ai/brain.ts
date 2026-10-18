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
      'quality.read',
      'customer_order.read_own',
      'task.assign',
    ]);

    const startTime = Date.now();
    const asksRecovery = /recover|reschedul|schedule review/i.test(question);
    const context = await buildAuthorizedContext(principal, this.prisma, scopedRecord
      ? scopedRecord.type === 'ORDER' ? { orderId: scopedRecord.id, evaluateRecovery: asksRecovery }
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
    const promptVersion = 'brain-qa-v13-fresh-recovery-preview';
    const cacheKey = `brain:${context.contextHash}:${model}:${promptVersion}:${question.trim().toLowerCase()}`;

    // 1. Check scoped cache
    const cached = getCached<Explanation<BrainAnswerDTO>>(cacheKey);
    if (cached) {
      return cached;
    }

    const inventoryQuestion = /stock|inventory|material|stok|persediaan/i.test(question) && !/order|production|produksi/i.test(question);
    const coverageSummary = Object.entries(context.coverage)
      .map(([category, coverage]) => `${category}: ${coverage.status.toLowerCase()} (${coverage.includedCount}/${coverage.limit}${coverage.sampled ? ', sample may be truncated' : ''})`)
      .join('; ');

    // 2. Build structured grounded prompt
    const prompt = `
You are the ManuOS Operational Brain assistant for ${principal.workspaceId}.
Answer the question below STRICTLY using the authorized factory operational context.
This authorized snapshot was captured at ${context.snapshotCapturedAt}. Coverage by source: ${coverageSummary}. A RESTRICTED category is hidden by permission; an EMPTY category had no accessible matching records. A sampled category may be truncated. Never turn sample counts into workspace totals. NEVER invent fake orders, machines, or parts. Use real order numbers, item names, and operation names from the context. Never print database UUIDs. Orders include historical and draft records; do not call every sampled order active. Finalized form submissions are historical evidence and must retain their recorded finalization time.

Operational Context:
- Sampled Orders (${inventoryQuestion ? 'omitted: inventory-only question' : context.orders.length}):
${(inventoryQuestion ? [] : context.orders).map((o) => `  * ${o.orderNumber}: ${o.itemCode} (${o.orderedQty} units) for ${o.customerName}, Status: ${o.status}, Promised: ${o.promisedDate || 'None'}`).join('\n')}

- Stock Balances (${context.inventory.length}):
${context.inventory.map((i) => `  * ${i.itemCode} (${i.itemName}): On Hand: ${i.onHandQty}, Reserved: ${i.reservedQty}`).join('\n')}

- Active Resources (${inventoryQuestion ? 'omitted: inventory-only question' : context.resources.length}):
${(inventoryQuestion ? [] : context.resources).map((r) => `  * ${r.code} (${r.name}, ${r.type}): Status: ${r.status}`).join('\n')}

- Current Order Workflow Stages (${inventoryQuestion ? 'omitted: inventory-only question' : context.lifecycleStages.length}):
${(inventoryQuestion ? [] : context.lifecycleStages).map(stage => `  * ${stage.orderNumber}: ${stage.workflowName} v${stage.workflowVersion}, ${stage.name} (${stage.action.replaceAll('_', ' ')}) is ${stage.state.replaceAll('_', ' ').toLowerCase()} in ${stage.department}; owner ${stage.assignedTo ?? 'eligible department queue'}, due ${stage.dueAt ?? 'not set'}, scheduling ${stage.scheduleKind.toLowerCase()}${stage.blockers.length ? `; waiting on ${stage.blockers.join(', ')}` : ''}${stage.formPins.length ? `; pinned forms: ${stage.formPins.map(form => form.status === 'AVAILABLE' ? `${form.name} v${form.version} (${form.purpose}, ${form.required ? 'required' : 'optional'}, ${form.completionPoint.replaceAll('_', ' ').toLowerCase()})` : `form details ${form.status.toLowerCase()} (${form.required ? 'required' : 'optional'})`).join(', ')}` : ''}`).join('\n')}

- Pending Recovery Reviews (${inventoryQuestion ? 'omitted: inventory-only question' : context.recoveryReviews.length}):
${(inventoryQuestion ? [] : context.recoveryReviews).map(review => `  * ${review.orderNumber}: saved finite-capacity schedule review projects completion ${review.projectedEndAt}; evaluated ${review.evaluatedAt}; ${review.taskCount} task(s); pending human approval. Its saved snapshot matches current order/job/task versions, but capacity, materials and qualifications must be revalidated before apply.`).join('\n')}

- Fresh finite-capacity preview (${inventoryQuestion || !context.currentRecoveryEvaluation ? 'not requested or unavailable' : 1}):
${!inventoryQuestion && context.currentRecoveryEvaluation ? `  * ${context.currentRecoveryEvaluation.orderNumber}: evaluated ${context.currentRecoveryEvaluation.evaluatedAt}; ${context.currentRecoveryEvaluation.scheduledTaskCount}/${context.currentRecoveryEvaluation.taskCount} open task(s) fit current finite capacity; state ${context.currentRecoveryEvaluation.status}; projected finish ${context.currentRecoveryEvaluation.projectedEndAt ?? 'unavailable'}; blockers ${context.currentRecoveryEvaluation.blockers.join('; ') || 'none recorded'}. This is an ephemeral preview and changes no booking.` : ''}

- Initial finalized QC summaries (${inventoryQuestion ? 'omitted: inventory-only question' : context.qcSummaries.length}; excludes follow-up reinspections to avoid counting the same rework twice):
${(inventoryQuestion ? [] : context.qcSummaries).map(qc => `  * ${qc.orderNumber}: ${qc.finalizedInspections} initial inspection(s), ${qc.inspectedQty} inspected, ${qc.passedQty} passed, ${qc.reworkQty} rework, ${qc.scrappedQty} scrapped; disposition(s) ${qc.dispositions.join(', ') || 'not recorded'}; latest finalized ${qc.latestFinalizedAt}.`).join('\n')}

- Assigned/Plannable Tasks (${context.tasks.length}):
${(inventoryQuestion ? [] : context.tasks).map(task => `  * ${task.orderNumber} / operation ${task.nodeKey}, status ${task.status}, planned ${task.plannedMinutes ?? 'unavailable'} minutes, actual ${task.actualMinutes ?? 'unavailable'} minutes${task.blockers.length ? `; blockers: ${task.blockers.map(blocker => `${blocker.severity ? `${blocker.severity} ` : ''}${blocker.summary}${blocker.owner ? ` (owner ${blocker.owner})` : ''}${blocker.expectedResolutionAt ? `, expected ${blocker.expectedResolutionAt}` : ''}`).join('; ')}` : ''}`).join('\n')}

- Confirmed Resource Bookings (${inventoryQuestion ? 'omitted: inventory-only question' : context.confirmedBookings.length}):
${(inventoryQuestion ? [] : context.confirmedBookings).map(booking => `  * ${booking.orderNumber} / operation ${booking.operation}: ${booking.resourceName ?? booking.resourceType.toLowerCase()} booked ${booking.startAt} to ${booking.endAt}`).join('\n')}

- Finalized Form Evidence (${inventoryQuestion ? 'omitted: inventory-only question' : context.submittedFormEvidence.length}):
${(inventoryQuestion ? [] : context.submittedFormEvidence).map(form => `  * ${form.orderNumber} / ${form.subject}, ${form.purpose.replaceAll('_', ' ').toLowerCase()} submission ${form.sequenceNumber} finalized ${form.finalizedAt}: ${form.answers.map(answer => `${answer.field}=${answer.value}`).join('; ')}`).join('\n')}

User Question: "${question}"

Rules:
- Read-only operational analysis only.
- Write for a busy factory planner, not a database reader. Match the language of the user's question.
- Keep the answer at most 180 words and at most 5 evidence references. Start with ONE short sentence answering the question. Then use 2–4 short sections with Markdown headings (###) and bullet points (-). Each bullet must express one fact, with at most two example records. Never write a comma-separated catalogue of records or a long paragraph.
- For order status questions: group by human-readable status (In production, Released, Draft, Partially delivered, Delivered). State sample counts only when directly counted from the supplied records. Delivered and cancelled orders are not active. Do not enumerate every order.
- For inventory: group relevant records into short bullets with item name/code, on-hand amount, and reserved amount when relevant. Never add quantities across different items or infer shortage/sufficiency from stock alone. Never invent a unit when none is supplied.
- For production overview: separate Orders, Work in progress, and Resources when evidence exists. Do not describe completed tasks as open work, or resource status as confirmed scheduling availability.
- A confirmed booking is an actual reservation for its time window only; do not infer general availability, shift coverage, or a complete schedule from the bounded booking sample.
- Form evidence contains only finalized answers from form instances the current user can read. Drafts, attachments and reference IDs are omitted; do not treat absent answers as evidence that a requirement was not submitted.
- For workflow questions: use only the supplied current stage, department, owner, due date, and scheduling policy. A stage state is not proof that its domain action or evidence has completed; use task, QC, and delivery records for those outcomes.
- For QC questions: use only finalized QC summaries and their recorded quantities/dispositions. Do not infer pass rates or treat open inspections as finalized evidence.
- For blocker questions: identify only blockers explicitly listed on the task or lifecycle stage. Name the recorded owner and expected resolution time when present. Recovery options may be called validated only when a supplied, current proposal explicitly validates them; otherwise explain the blocker and point to its owner without inventing a workaround.
- A pending Recovery schedule review is a saved proposal, not an approved change or a guarantee of current capacity. State that human approval and live apply-time revalidation are still required; do not describe unavailable alternative strategies as evaluated.
- A fresh finite-capacity preview is current read-only evidence for the selected order only. It is not a saved approval or booking; direct the planner to review/apply through Planning, which rechecks current records. Never describe the preview as applied.
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
    if (/recover|reschedul|schedule review/i.test(q)) {
      const evaluation = context.currentRecoveryEvaluation;
      if (evaluation) {
        const reviews = context.recoveryReviews.filter(review => review.orderNumber === evaluation.orderNumber).slice(0, 2);
        const reviewStatus = reviews.length
          ? `### Saved review\n- A saved schedule review is awaiting approval. Its snapshot still matches order and task versions, and a human must approve it. Capacity, materials, and qualifications are revalidated before apply.\n\n`
          : '### Saved review\n- No current pending schedule review is saved; the evaluation below is a newly generated preview.\n\n';
        const previewLines = evaluation.status === 'COMPLETE'
          ? [`- A fresh finite-capacity preview schedules all ${evaluation.taskCount} open task(s).`, `- Projected completion: ${evaluation.projectedEndAt ?? 'not available'}.`]
          : [`- The preview schedules ${evaluation.scheduledTaskCount} of ${evaluation.taskCount} open task(s); a complete schedule is not currently available.`, ...evaluation.blockers.slice(0, 4).map(blocker => `- ${blocker}`)];
        return {
          answer: `${evaluation.orderNumber} has a fresh finite-capacity preview from ${evaluation.evaluatedAt}.\n\n${reviewStatus}### Current preview\n${previewLines.join('\n')}\n\n### Next step\n- This read-only preview does not change bookings. Review and apply the schedule in Planning, where capacity and versions are checked again.`,
          evidenceRefs: [evaluation.orderNumber], linkToScreen: 'orchestrator',
        };
      }
      const reviews = context.recoveryReviews.slice(0, 2);
      return reviews.length ? {
        answer: `A saved schedule review is awaiting approval for ${reviews.map(review => review.orderNumber).join(' and ')}.\n\n### Review status\n${reviews.map(review => `- Projected completion: ${review.projectedEndAt} (${review.taskCount} tasks).`).join('\n')}\n- The saved snapshot still matches order and task versions.\n- A human must approve it, and current capacity, materials, and qualifications are revalidated before apply.\n\nThis covers only the accessible sample; it is not a factory-wide recovery view.`,
        evidenceRefs: reviews.map(review => review.orderNumber), linkToScreen: 'orchestrator',
      } : {
        answer: 'No current pending schedule review is present in this accessible snapshot. A planner can generate a new finite-capacity review for an active released job; alternative recovery strategies are not connected.',
        evidenceRefs: [], linkToScreen: 'orchestrator',
      };
    }
    const selectedOrder = scopedRecord?.type === 'ORDER' ? context.orders.find(order => order.id === scopedRecord.id) : undefined;
    if (selectedOrder && /quality|qc|inspection|inspected|rework|scrap|passed/i.test(q)) {
      const qc = context.qcSummaries.find(summary => summary.orderNumber === selectedOrder.orderNumber);
      const qcRestricted = context.coverage.qcSummaries.status === 'RESTRICTED';
      return {
        answer: qc
          ? `${selectedOrder.orderNumber} has ${qc.finalizedInspections} initial finalized QC inspection(s).\n\n### Recorded quantities\n- Inspected: ${qc.inspectedQty}; passed: ${qc.passedQty}.\n- Rework: ${qc.reworkQty}; scrapped: ${qc.scrappedQty}.\n- Disposition: ${qc.dispositions.join(', ') || 'not recorded'}; latest finalization: ${qc.latestFinalizedAt}.\n- Follow-up reinspections are excluded from these initial quantities.\n\nThis covers the accessible QC sample for the selected order.`
          : qcRestricted
            ? `QC details for ${selectedOrder.orderNumber} are restricted for this account.`
            : `No finalized production QC inspection is present in the accessible snapshot for ${selectedOrder.orderNumber}. Open inspections are not included as finalized evidence.`,
        evidenceRefs: [selectedOrder.orderNumber], linkToScreen: 'quality',
      };
    }
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
