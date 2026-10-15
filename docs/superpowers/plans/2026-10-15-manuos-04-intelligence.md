# ManuOS Six Intelligence Capabilities and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation and commits require separate user authorization.

**Goal:** Deliver M5–M6/R1: all six named intelligence capabilities operate on the actual R0 business records, with human-controlled decisions and reproducible evidence.

**Architecture:** Authorized revisioned read contexts feed pure computation and validated provider explanations/proposals. Consequential recovery/engineering decisions commit through the ordinary R0 commands. The same source data drives Command Center.

**Tech Stack:** Existing TypeScript engines/Gemini SDK, Zod output validation, Prisma/SQLite evidence/proposal records, typed query layer and meaningful Vitest/integration/browser coverage.

## Global Constraints

R0 gates O09 must pass. Master-plan constraints apply. No fixed hero IDs/dates/cost percentages or fake no-history recommendations in normal paths. AI unavailable is honest; deterministic/manual business behavior remains usable. Provider-mocked tests and actual live-provider proof are distinct.

## I01 — Production Dependency Intelligence: connected CPM/ripple

**Files:** modify `src/engines/cpm.ts`, `ripple.ts`, `calendar.ts`; create `src/server/modules/planning/impact.ts`, `schedule-repository.ts`, disruption/schedule-run/result migrations and handlers under `src/app/api/intelligence/impact/`, `src/app/api/disruptions/`; update planning UI and create R04; add `src/engines/impact.test.ts`, `tests/integration/impact.test.ts`.

**Consumes:** O05 `scheduleTasks`, actual task dependency/remaining-duration/material/resource/calendar state and current revision.
**Produces:** `analyzeImpact(context, scenario)` and `recalculateSchedule(principal,input)` returning exact affected/runnable sets, task schedule/slack/critical-path results, before/after order ETA and reasons. No special-case order 1045 merely because material is TB-24.

- [ ] Connect CPM to the actual application path and same scheduling/calendar semantics. Include actual remaining work; completed operations are not rescheduled from zero.
- [ ] Model typed material ETA, machine downtime and task-overrun input. Keep read-only scenario simulation separate from approved actual event writes; effect dates come from supplied context.
- [ ] Test fixture A's 10h baseline and actual material-date shift, fixture B's independent parallel branch/AND join, invalid graph and unrelated material/order.
- [ ] Persist computation input hash/revision/results so UI evidence is resolvable; reject or label stale views after domain changes.
- [ ] Run named engine/integration checks and read back results; verify changing actual resources/ETAs affects the displayed plan. AI explanation is connected under I04, not implied complete by the computed panel.

## I02 — Promise Engine from actual feasible capacity/material

**Files:** modify `src/engines/capacity.ts`; create `src/server/modules/intelligence/contracts.ts`, `promise.ts`, `src/app/api/intelligence/promise/route.ts`; modify promise feature and create R03; add `tests/integration/promise.test.ts`, extend capacity tests.

**Produces:** `evaluatePromise(principal,input)` over reviewed item/routing/quantity/requested date, actual resource bookings/calendar and material readiness; returns evaluation ID, feasible/unknown constraints, explicit assumptions and validated alternatives. It does not book resources.

- [ ] Remove fixed anchor, 96% bottleneck and generic unit-throughput constants. Apply reviewed setup/run duration and quantity basis through the O05/I01 scheduler.
- [ ] Evaluate shortages, open supply ETA and actual released/available resources. Missing routing/rates/resources return insufficient-input/uncertainty, not confidently feasible.
- [ ] Simulate alternatives against the same constraints. Overtime cannot assemble absent components, and a supplier ETA alone cannot count as received stock.
- [ ] Test changed quantity/calendar/bookings/material ETA and competing orders; assert no side-effect reservation on feasibility evaluation.
- [ ] Wire actual form/evaluation read models, run focused checks and inspect DB for unchanged operational reservation rows. Explanation attachment follows I04 with persisted evaluation context.

## I03 — Self-Healing: simulations and real atomic approval

**Files:** modify `src/engines/recovery.ts`; create `src/server/modules/intelligence/recovery.ts`, `recovery-simulation.ts`, recovery-plan/option/policy migrations and handlers for create/read/approve/reject; replace `src/features/recovery/recovery-studio.tsx` with an adapter over actual read models; create R05 and `tests/integration/recovery.test.ts`.

**Produces:** `proposeRecovery`, `simulateRecoveryOption`, `approveRecovery` using bounded typed command sets and the base revision. Feasible options must be implementable using existing scheduling/assignment/shipment/stock services; unavailable subcontract paths are explicit, not fake positive matches.

- [ ] Generate data-based split/reschedule/reassign/overtime alternatives permitted by the fixture. Compute actual time/resource/quantity changes; infeasible options carry specific reasons.
- [ ] Calculate any displayed cost delta only from known price/rate/quantity/time/freight snapshots; if no baseline/rate exists, cost is unavailable. Do not promote sample percentages into a costing system.
- [ ] Display stored option consequences/revision rather than hardcoded 40/80/date/actor text. Human approval confirms a stored changes hash, not a client replacement graph.
- [ ] Approval transaction rechecks permissions/version/inventory/resource conditions, invokes actual normal commands and commits allocation/plan/audit once. It never adds produced or QC-passed units.
- [ ] Test shortage/overtime infeasibility, a real quantity-conserving split option, resource reassignment, stale proposal, competing stock change and repeated approval. Run `rtk npm run test:integration -- tests/integration/recovery.test.ts` and reconcile DB.

## I04 — Shared grounded-AI boundary and Production Brain

**Files:** replace/extend `src/server/ai/gemini-client.ts`; create `context.ts`, `validation.ts`, `cache.ts`, `provenance.ts`; add AI-run migration; update all nine existing route contracts deliberately; modify brain feature and add R02; add `tests/integration/ai-context.test.ts`, `src/server/ai/validation.test.ts`, mocked provider tests and live-evidence runbook.

**Produces:** `buildAuthorizedContext(principal, scope)`, `callGroundedAI(context, schema, promptVersion)`, `Explanation<T>` union from API design, and `answerProductionQuestion`. Context identity includes full input/scope/revision/model/prompt/schema hash.

- [ ] Replace client graph snapshots with actual scoped server reads. Do not include unrelated customer data, session secrets or unnecessary contacts in provider context.
- [ ] Validate structured provider output with Zod and resolvable evidence refs. Consequential numeric claims use typed metric/reference fields checked against computed data; render verified metrics from those fields. Prompt instructions alone do not establish grounding.
- [ ] Implement actual supported request timeout/cancellation, bounded transient retry, size limits, cache scoping/invalidation and sanitized provenance logging. Remove canned successful `aiResult` responses.
- [ ] Wire Brain and the impact/promise/recovery explanation routes to actual I01–I03 run/plan IDs. UI shows AI/computed/unavailable source plus revision/time and links; read-only AI has no execution permission.
- [ ] Test malicious RFQ/question content, unknown refs, invalid schema, same-question/different-scope and same-scope/changed-revision cache cases, timeout and provider unavailable. Core computed panels remain usable.
- [ ] Run context/validation/provider-mocked checks. Then separately use configured server credentials for a new actual-order Brain answer and each claimed explanation path, recording sanitized evidence. No key available means live validation remains explicitly blocked, not mocked as done.

## I05 — AI Engineering Copilot connected to real reviewed creation

**Files:** update `/api/ai/extract-rfq`, `/api/ai/generate-workflow` and engineering/intake UI; create `src/server/modules/engineering/copilot.ts`, typed extraction/mapping contracts and `tests/integration/engineering-copilot.test.ts`, `tests/e2e/copilot-order.spec.ts`.

**Produces:** `draftEngineeringFromRFQ` and `draftWorkflowDefinition` whose outputs are reviewed drafts, not active processes/orders. Customer/item/resource mapping resolves actual masters or flags explicit unresolved references.

- [ ] Extract a new RFQ into typed qty/UOM/spec/BOM/routing/questions; preserve source text and AI-run provenance. Do not substitute a canned aerospace/bracket draft for arbitrary failed extraction.
- [ ] Render editable engineering review with unresolved ambiguities and master mappings; saving/releasing uses W02/W03, keeping actual returned IDs.
- [ ] Draft only supported workflow nodes/guards; validate on the server through W01, permit at most two automated draft/repair attempts and report actual rejection reasons.
- [ ] Test valid extraction → reviewed saved order/instance, unknown material/unit, hallucinated references, ambiguity blocking, invalid DAG and manual fallback when AI is unavailable.
- [ ] Run integration/browser checks and separately record one successful provider extraction/generation for the path claimed live. After refresh the real reviewed records, questions and process version remain.

## I06 — Factory Memory from measured execution/QC evidence

**Files:** modify `src/engines/similarity.ts`; create `src/server/modules/intelligence/memory.ts`, evidence projection/query contracts and versioned planning-policy migration; update memory route/UI and add R06; add `tests/integration/factory-memory.test.ts` and `src/engines/similarity.test.ts` cases.

**Produces:** `queryFactoryMemory(principal, filters)` with actual comparable completed-run samples, overrun/rework/defect/routing evidence and explicitly separate policy recommendation. Group all attempts/time events into one measured operation/run population instead of counting each event as a new independent sample.

- [ ] Build read models from completed actual work/inspection/rework with pinned operation/material/resource/routing IDs. Exclude proposed/unfinished work from measured history.
- [ ] Define the reported aggregation: arithmetic mean of per-run `(actual-planned)/planned` for positive-planned comparable runs; sample count and any distinct weighted statistic are labeled. Minimum evidence policy is explicit/configurable, initially three comparable completed runs.
- [ ] Replace hardcoded UI rows/18%/rev2 defaults. Empty/unrelated evidence returns insufficient history; no routing winner without actual comparable evidence. Policy padding is not presented as a measured average.
- [ ] Complete a new operation/QC/rework run and assert subsequent query samples/aggregates change correctly. Compare unrelated/new family and changed filters; suggestions never mutate running work.
- [ ] Run focused unit/integration checks, then connect `/api/ai/memory-recommend` through I04 and record an actual evidence-grounded provider recommendation if claimed live.

## I07 — Command Center and cross-module integration

**Files:** create `src/server/modules/intelligence/dashboard.ts`, dashboard route/read model; migrate command-center and orchestrator read components; create R01 and `tests/integration/dashboard.test.ts`, `tests/e2e/intelligence.spec.ts`; retire legacy operational store callers in normal routes.

**Produces:** scoped real metrics and exception queue linking orders/material/resource/QC/approval facts to actual detail IDs; all six capability entry points share the same records/revision definitions.

- [ ] Define populations/time windows/units for each metric: active orders, at-risk ETA, actual pending approvals, machine scheduled/capacity minutes, finished-item QC progress and material shortages. Do not sum pieces/kg/raw/FG into a meaningless total.
- [ ] Replace scenario-only charts/copy and legacy store imports. Preserve normal empty/unknown/no-history states; old demo mode remains isolated if retained.
- [ ] Verify user/customer/workspace scope across cache changes, deep links and the assistant; no response from another context survives a membership or workspace switch.
- [ ] Run the new-order disruption → impact/promise/recovery → human approval → customer/memory path in browser with DB readback and input-sensitive assertions.
- [ ] Mark individual intelligence features verified only with their actual tests/runtime/provider level. UI integration alone is not permission to mark all nine AI routes complete.

## I08 — R1 acceptance, durable hosting assets and handoff

**Files:** create `scripts/backup-db.ts`, `restore-db.ts`, `tests/integration/backup-restore.test.ts`, final e2e/evidence index; update Dockerfile/startup/migration scripts, setup/deployment/demo runbooks, requirements/status docs and ignore rules.

- [ ] Run all acceptance A01–A16 and AI01–AI06 plus second customer/type/parallel/rework, actual-data input changes, idempotency/concurrency/rollback and no-provider behavior. Review source to ensure no hero-ID fallback or direct Zustand business write remains in normal app routes.
- [ ] Verify a durable local/single-server SQLite/private-file path, one migration runner and least-needed filesystem permissions. Prepare container volume/env/backup assets; do not claim or perform a Cloud Run/multi-instance deployment implicitly.
- [ ] Create consistent DB backup + private file manifest, restore to a different directory and run integrity/FK/stock/output/shipment reconciliation. Never overwrite the live/developer DB in a test.
- [ ] Run final typecheck, focused integration/e2e suites, full existing meaningful engine suite and production build once after final changes; broaden only when new failures/changes justify it.
- [ ] Perform batched 1440/1024/390px and narrow/short/mobile-scroll/account/dialog validation. Fix collected defects together; confirm once.
- [ ] Produce a repeatable runbook and evidence matrix: local verified, real-provider verified and deployment state explicitly distinguished; sensitive credentials/data excluded.
- [ ] Review R0+R1 scope coverage including all six intelligence features. External credential/hosting blockers remain named; do not mark them complete or substitute sample responses. Handoff the actual remaining decisions without automatic publishing/commit/push.
