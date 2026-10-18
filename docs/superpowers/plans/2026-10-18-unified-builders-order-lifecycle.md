# Unified Builder Hardening and Order Lifecycle Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this single plan task-by-task, inline in the active checkout. Do not delegate, commit, push, migrate shared databases or send external notifications without the applicable user authorization. Check off only verified deliverables.

**Goal:** Make the selected published workflow control an order's cross-department journey, with versioned dynamic forms, accountable assignments, real capacity scheduling, grounded AI assistance and a connected audit trail through confirmed delivery.

**Architecture:** Preserve existing production routing and all authoritative domain commands. Extend Workflow Studio with explicit lifecycle-stage definitions and typed action adapters; a lifecycle production stage references a pinned production routing version instead of treating Sales or Delivery as machine operations. Pin workflow, form bindings, assignment rules and transition rules when an order enters the workflow; execute each state-changing action and its lifecycle transition in the same transaction.

**Tech Stack:** Next.js15 App Router, React19, strict TypeScript, existing typed icon facade/shared UI controls, Tailwind4 semantic light tokens, Prisma/SQLite, executeCommand, bigint atoms, existing scheduling and ledger engines.

**Status (2026-10-18):** Core spec implementation remains in progress; Gate A, Gate B and integrated acceptance are not complete. Latest full non-browser verification passes 106 files / 562 source and integration tests; typecheck, Prisma validation/migration status, OpenAPI parse and ledger reconciliation also pass. Recovery/subcontract changes were reconciled into the active worktree. The user explicitly asked the agent to skip E2E; browser, full persona acceptance and authenticated local UI verification remain user-owned and unverified. Do not treat lifecycle rollout as ready until the remaining agent-owned items are verified.

## Global constraints

- One plan owns the entire sequence below. The readiness audit is supporting evidence, not a second implementation plan: `docs/audits/2026-10-18-workflow-form-builder-readiness.md`.
- Preserve unrelated working changes, existing production workflows and released orders. Do not reset the checkout or overwrite concurrent work.
- Validate live authenticated membership, workspace, facility, subject assignment and action permission at every server read/write boundary. Department metadata does not itself grant access.
- Every mutation uses executeCommand with payload-bound idempotency, actor from Principal, transactional compare-and-swap/version checks and audit. Existing services must expose transaction-aware internals rather than nesting independent command transactions.
- Quantities remain bigint atoms at10^6 scale; use domain quantity helpers. Inventory changes only through postMovement, preserving output/QC/shipment invariants.
- Use centered CRUD dialogs, shared DatePicker/Select, semantic light tokens, names rather than UUID input, responsive layouts aligned with normal page content.
- Scheduling writes require the existing permission, validation and explicit reviewed approval; an AI answer never mutates a schedule.
- A default workflow may be offered as configuration; runtime must not hardcode Sales → Engineering → Production → QC → Delivery as the only possible path.
- Published workflow/form/binding configuration is immutable. Changes create new versions; running instances keep their pins. Explicit migrations cannot fabricate historical stages or evidence.
- All new APIs and changed envelopes are documented in `contracts/openapi.yaml`; maintained request examples are updated if present.
- Tests use isolated createFactoryFixture databases and close in afterAll. No mutation of local DEMO stock to prove behavior.

## Target user journey

1. Sales creates an order with an authorized published lifecycle workflow, or explicitly accepts the configured Order type default. The UI shows the selected name/version, first department/PIC policy and expected stages before save.
2. Saving creates the order, pins and initial lifecycle/form instances atomically. Initial sales specification forms are available immediately, before confirmation or release.
3. A ready stage appears in its department queue and, when assigned, the recipient's My Work. It has an action, form requirements, due date and handoff explanation.
4. Engineering selects/confirms the published production routing for each relevant line/job. The lifecycle pin is fixed at intake; production routing is pinned at engineering approval/release. Both versions are visible and traceable.
5. Resource-bound production work enters existing Planning. It can run only with actual resource eligibility, availability, material and dependency checks. Administrative work uses accountable ownership/deadlines, not artificial machine bookings.
6. Task/workstation/inspection pages display the exact pinned forms. Finalization satisfies evidence only; typed domain actions still enforce production, QC and stock rules.
7. Stage completion invokes or observes the real domain result and activates the correct next stage/branch. Production work is not considered done while required operations or rework attempts remain unfinished.
8. Delivery supports multiple shipments and partial receipts. The delivery stage and order are complete only when all required line quantities are confirmed delivered.
9. AI can explain current stage, blockers and feasible alternatives using authorized current records and finalized form evidence. Changes remain proposals until the normal approval command succeeds.
10. Order traceability links the whole chain, including pins, form answers/corrections, ownership, approvals, bookings/reschedules, material lots, QC, rework and shipments.

## Shared contract decisions

Extend template kind explicitly: `PRODUCTION_ROUTING` remains compatible with existing workflow definitions; `ORDER_LIFECYCLE` uses a distinct validated definition schema in the same Studio. Additive persistence must not reinterpret current OPERATION/INSPECTION/APPROVAL nodes as sales/shipping stages.

```ts
type LifecycleAction =
  | 'ORDER_CONFIRM' | 'ENGINEERING_APPROVE' | 'PLAN_PRODUCTION'
  | 'EXECUTE_PRODUCTION' | 'FINALIZE_QC' | 'CONFIRM_DELIVERY'
  | 'REVIEW_EVIDENCE';
type AssignmentPolicy =
  | { kind: 'MEMBER'; membershipId: string; departmentId?: string }
  | { kind: 'DEPARTMENT_QUEUE'; departmentId: string; eligibleRoleCodes: string[] };
type StageSchedulePolicy =
  | { kind: 'DEADLINE'; dueAfterMinutes: number }
  | { kind: 'RESOURCE_CAPACITY'; routingSource: 'APPROVED_ENGINEERING' };
type StageFormPin = {
  formVersionId: string; contentHash: string; required: boolean;
  completionPoint: 'BEFORE_ACTION' | 'BEFORE_STAGE_COMPLETION';
};
type StageState = 'PENDING' | 'READY' | 'ACTIVE' | 'BLOCKED' |
  'WAITING_APPROVAL' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
```

- General lifecycle stage instances have membership ownership; existing production Task retains assignedTechnicianId and machine bookings. My Work combines authorized items with clear type labels, without changing technician identity rules.
- Every stage action has a registered adapter declaring required permissions, completion fact, resource policy and permitted subject/form purposes. Unknown action types prevent publish.
- Scope by order/line/job explicitly. An order-level production stage aggregates relevant child jobs; completing one job cannot complete other lines.
- Conditions are a closed, validated expression schema over named authorized domain facts/finalized form values. No eval, SQL, arbitrary JS, or free-text conditionCode execution.
- Support sequence, parallel AND and explicitly mutually exclusive branches. Joins account for skipped branches. Missing/unknown condition facts block with a reason rather than silently choosing a route.
- Rework/rejection are explicit outcomes that create linked attempts or return work through supported handlers. Do not weaken the production DAG cycle guard or rewrite completed history.
- Draft forms are editable; submitted forms are immutable except append-only corrections. Form completion does not equal a domain operation's completion.

## Phase1 — Close builder/runtime blockers

### Task1: Subject-scoped form access and transactional commands

**Modify:** `src/server/modules/forms/submissions.ts`, `service.ts`, `policy.ts`; `src/app/api/form-instances/[id]/route.ts`, `draft/route.ts`, `finalize/route.ts`, `corrections/route.ts`; form template/version routes; `src/features/forms/api.ts`.
**Create:** `src/server/modules/forms/subject-access.ts`, `contracts-schema.ts`.
**Tests:** `tests/integration/forms-access.test.ts`, `forms-concurrency.test.ts`; retain forms-versioning/submissions suites.

**Interfaces:** `resolveFormSubjectAccess(tx, principal, {subjectType, subjectId}, action)` returns authorized subject/facility/assignment; throws without revealing foreign records. Form writes consume strict parsed payload, expectedVersion and command idempotency; return existing envelope plus command metadata.

- [x] Add negative tests: same-workspace unassigned technician, outside-facility order/inspection, revoked member, customer role, forged actor, unauthorized correction.
- [x] Add two competing saves/finalizations/publishes against one version; exactly one wins. Replay the same idempotency key; no extra submission/event is created. Changed payload with same key conflicts.
- [x] Resolve subject access inside the write transaction, using existing domain permission conventions. Do not grant generic form-author permission access to every operational form.
- [x] Move authoring/binding/submission mutations under executeCommand, with transaction-aware helpers and conditional version/status updates. Do not allow saveDraft to reopen an already-finalized instance.
- [x] Preserve actor/time, correction reason and supersedes links; attach correction documents using the same validated mechanism as original finalization.
- [x] Run `rtk proxy npx vitest run tests/integration/forms-access.test.ts tests/integration/forms-submissions.test.ts tests/integration/forms-versioning.test.ts`; concurrency cases live in the access and submissions specs. Update OpenAPI idempotency/version/auth examples in this task.

### Task2: Typed binding validation, immutable pins and early materialization

**Modify:** `src/server/modules/forms/contracts.ts`, `service.ts`, `completion.ts`; `prisma/schema.prisma`; `src/server/modules/orders/service.ts`, `release.ts`; `src/server/modules/workflow/instantiate.ts`.
**Create:** `src/server/modules/forms/bindings.ts`, `materialize.ts`; named additive migration for binding snapshots/owner scope.
**Tests:** `tests/integration/forms-binding-pins.test.ts`; extend `forms-domain-gates.test.ts` and `forms-history-context.test.ts`.

**Interfaces:** `validateBindingTarget(tx, principal, input)` validates a discriminated context/target/purpose; `materializePinnedForms(tx, {workspaceId, subjectType, subjectId, pins})` is transaction-local and idempotent; `assertPinnedFormsFinalized(tx, subject)` reads instance pins, not today's mutable template bindings.

- [x] Test invalid context fields, missing target, foreign order/workflow/checklist, missing workflow node, incompatible purpose and duplicate bindings; reject before write.
- [x] Persist immutable binding sets and requiredness/completion point per published workflow version and instantiated subject. Hash the full execution-relevant configuration.
- [x] Test that publishing/rebinding v2 neither changes the form rendered for existing v1 instances nor introduces a new required gate on them.
- [x] Materialize order specification forms on order/workflow initialization, before release. Ensure task and inspection evidence exist before their respective action gates.
- [x] Test the full required-order-form path: create order → see instance → draft save → final submit → release allowed. Release with absent/unfinished pinned form is rejected atomically.
- [x] Enforce completion point semantics at action entry, task completion, and order release; partial output is not blocked by evidence required only before stage completion.
- [x] Treat legacy zero-binding instances explicitly: no retroactive requirement insertion, and existing unbound FormInstance rows continue to enforce their snapshotted requiredness. Covered by isolated regression fixtures; migration defaults/backfill are additive and preserve historical rows.
- [x] Run focused binding and execution specs: `rtk proxy npx vitest run tests/integration/forms-bindings.test.ts tests/integration/forms-domain-gates.test.ts tests/integration/forms-history-context.test.ts tests/integration/task-execution.test.ts` (26 passed).

### Task3: Complete advertised form controls

**Modify:** `src/domain/forms/types.ts`, `schema.ts`, `validation.ts`; `src/features/forms/components/form-renderer.tsx`, `field-editor.tsx`, `definition-editor.tsx`, `submission-panel.tsx`.
**Create:** `src/features/forms/components/form-attachment-field.tsx`, `form-reference-field.tsx`, `playwright.config.ts`, `tests/browser/fixture-server.ts`; add a dedicated browser test script and dev tooling in `package.json` only if not already installed. Exclude browser specs from Vitest collection.
**Tests:** extend `src/domain/forms/validation.test.ts`; create `tests/browser/dynamic-form-controls.spec.ts`.

- [ ] Establish the browser harness against an isolated createFactoryFixture server, with its lifecycle cleanup. Existing `tests/e2e` specs and `test:e2e` use Vitest/API handlers; they are not browser proof. Reuse them for API coverage and put real UI specs in `tests/browser`.
- [x] Implement actual multiselect arrays; typed booleans; decimal strings without float arithmetic; DatePicker; authorized named master lookup; real document upload/download using existing document endpoints. API round trips and the attachment renderer contract are covered by specs.
- [x] Validate live references in the current workspace and reject invalid, foreign, inactive, missing or differently-scoped attachment documents. Attachments may be unlinked only when uploaded by the current actor; subject-linked evidence must match the form subject.
- [x] Apply order/task/inspection facility scoping to machine references while retaining shared facility-neutral machines.
- [ ] Verify upload/download behavior through the browser renderer (browser/E2E verification was explicitly waived by the user; API and renderer specs remain in scope).
- [x] Keep visibleWhen behavior identical in preview, runtime and server validation. Hidden fields do not silently satisfy required visible evidence; the preview/runtime use the shared renderer and server validation uses the same visibility evaluator.
- [x] Namespace control IDs by form instance/renderer instance; the shared renderer uses a per-instance React useId namespace.
- [x] Cover all 9 field kinds in API integration round trips through draft save → final submit → reload/read-only; verify linked attachment evidence, authorized reference lookup, decimal-as-string precision, typed boolean/multiselect/date values and conditional visibility.
- [ ] Verify actual browser rendering/fill/read-only/correction for all 9 field kinds, including upload file-type/size limits and field control behavior.
- [x] Prevent publish for any field capability not supported in both renderer and server; publish revalidates the strict closed field-kind schema and returns actionable field errors.
- [x] Run `rtk proxy npx vitest run src/domain/forms/validation.test.ts` (9 passed) and the relevant API/renderer specs.
- [ ] Run browser rendering/upload/download/read-only/correction specs; browser/E2E verification was explicitly waived by the user.

**GateA:** Tasks1–3 must pass before enabling lifecycle configuration in production-facing UI. No raw-ID field, unscoped submission route or live mutable binding dependency may remain in the supported contract.

## Phase2 — Make Studio configure executable lifecycle stages

### Task4: Versioned stage model and deterministic transition rules

**Modify:** `src/domain/workflow-definition.ts`, `src/server/modules/workflow/contracts.ts`, `service.ts`; `prisma/schema.prisma`.
**Create:** `src/domain/order-lifecycle-definition.ts`, `order-lifecycle-runtime.ts`; `src/server/modules/order-lifecycle/action-registry.ts`, `contracts.ts`; additive lifecycle instance/stage/assignment/event migration.
**Tests:** `src/domain/order-lifecycle-definition.test.ts`, `order-lifecycle-runtime.test.ts`, `src/server/modules/order-lifecycle/action-registry.test.ts`, `tests/integration/order-lifecycle-intake.test.ts` (the original `lifecycle-version-pins.test.ts` filename was never created).

**Interfaces:** `validateLifecycleDefinition(definition, catalog)` returns structured errors; `evaluateStageTransition(snapshot, action, facts)` is pure and returns allowed/next-state/activated-or-skipped-stage keys and reasons. Action registry maps every LifecycleAction to its required permissions and explicit domain completion facts.

- [x] Add lifecycle template kind without changing legacy production-routing interpretation; production-routing contract remains separate and lifecycle intake pins the selected published version.
- [x] Validate active departments/members/roles, form pins/purposes, supported schedule policies, deadlines, terminal paths, registered actions, duplicate keys and graph reachability before publish. Resource-capacity routing resolves only through the approved-engineering policy.
- [x] Validate simple select-answer branch references and values against required pinned order forms; branch evaluation is single-level and reads only finalized evidence in the current workspace. Nested conditions remain unsupported.
- [x] Test serial flow, parallel fan-out/AND join, exclusive branch, skipped branch handling and fail-closed missing condition facts.
- [x] Make QC pass/reject/rework outcomes explicit in lifecycle routing. Typed branches consume finalized aggregate outcomes (`PASSED`, `PASSED_AFTER_REWORK`, `PARTIAL`, `REJECTED`); rework stays in the QC domain flow and the lifecycle waits for every output's finalized inspection, exact reinspection quantity and closed rework attempts before routing.
- [x] Add membership assignment and lifecycle events with versioned CAS. Serialize immutable published definition/binding hashes; do not mutate completed attempts.
- [x] State publish/review rules explicitly: an authorized `workflow.publish` principal may publish a valid DRAFT directly or publish a reviewed version; two-person review is not mandatory. Covered by workflow version specs.
- [x] Run `rtk proxy npx vitest run src/domain/order-lifecycle-definition.test.ts src/domain/order-lifecycle-runtime.test.ts src/server/modules/order-lifecycle/action-registry.test.ts tests/integration/order-lifecycle-intake.test.ts` (17 passed); legacy workflow version tests remain a separate regression check.

### Task5: Builder stage inspector, binding UI and execution preview

**Modify:** `src/features/workflows/components/definition-editor.tsx`, `node-inspector.tsx`, `workflow-canvas.tsx`, `node-palette.tsx`; canvas adapters/state; form template pages.
**Create:** `src/features/workflows/components/stage-assignment-editor.tsx`, `stage-form-bindings.tsx`, `stage-execution-preview.tsx`; authenticated binding/catalog routes under `src/app/api/workflows/`.
**Tests:** extend workflow canvas adapter/state tests; create `tests/browser/lifecycle-builder.spec.ts`.

- [x] Let author select stage action, department, eligible roles and specific member or department queue. Show resulting access separately from organization metadata.
- [x] Select published forms by readable template/version, requiredness and completion point; show field preview, definition hash/version and unsupported/missing references.
- [x] Select deadline vs resource-capacity scheduling. Only resource-capacity stages can invoke approved production routing and Planning; do not demand machines for Sales/approval/delivery administration.
- [x] Make order-form and QC outcome routing configurable through typed controls, not free JSON or raw condition codes.
- [x] Preview who receives work, what forms are shown, what blocks completion and which stage/branch activates next. Preview remains non-mutating and is not proof of actual scheduling capacity.
- [x] Publish validation reports errors at the exact stage/field; published view is read-only with fork action.
- Lifecycle authoring now reads workspace role choices through a narrow `workflow.author`-authorized catalog (code/name/active only); an HTTP integration spec proves an Engineer can load it while QC is denied. The lifecycle editor now exposes Submit for review on drafts, locks REVIEW versions, and offers approve/publish and retire actions only in their valid statuses. OpenAPI documents the role catalog. The user waived browser/E2E proof, so the full no-raw-ID authoring journey remains unverified and this GateB checkbox stays open.
- Schedule proposal apply is now covered under two concurrent command keys against the same reviewed evidence: one applies, the loser receives `STALE_VERSION`, and existing assertions prove only one booking/event set and lifecycle completion are persisted. The finite-capacity fixture now includes its required engineering-approval stage before planning.
- Planning previews now show operation names for predecessor links (never task UUID fragments) and compare projected job completion with the separately labeled contractual promised date. Cross-job successor impact remains open because jobs are scheduled independently and the current model has no successor-job dependency contract.
- [ ] Prove an author configures and publishes an example without API tools/raw IDs; unsupported configuration cannot publish.

**GateB:** A complete cross-department example is configurable, valid and inspectable in Studio; execution previews match deterministic engine results. No lifecycle rollout before GateA and GateB.

## Phase3 — Connect order intake, ownership and real domain actions

### Task6: Start the selected workflow at order intake

**Modify:** `src/features/orders/components/order-form.tsx`, `order-detail.tsx`; `src/features/engineering/components/review-editor.tsx`; order contracts/service/release and engineering service.
**Create:** `src/server/modules/order-lifecycle/service.ts`, `assignment.ts`, `adapters.ts`; `src/features/orders/components/order-lifecycle-timeline.tsx`.
**Tests:** `tests/integration/order-lifecycle-intake.test.ts`; extend `tests/e2e/order-engineering-workflow.spec.ts`.

**Interfaces:** `startOrderLifecycle(tx, principal, {orderId, workflowVersionId})` validates and pins, creates first stage/assignment/forms atomically. `applyStageDomainAction(tx, principal, {stageInstanceId, expectedVersion, actionPayload})` invokes the existing typed domain internals and advances lifecycle in the same command transaction.

- [x] Show workflow name/version and Order type compatibility in intake. Prefilled defaults must be visible, overridable only with an authorized compatible published workflow, and explicit in the saved record.
- [x] Create order + initial lifecycle + pinned first-stage forms in one transaction; the isolated intake spec proves the selected published version and first-stage assignment are pinned with the created order.
- [x] Verify lifecycle-intake replay returns the same order and lifecycle instance for the same idempotency key.
- [x] A retired pinned form blocks new intake and the isolated order count is unchanged, proving failed initial form materialization rolls the order back.
- [x] Distinguish lifecycle version selected at intake from production-routing version selected at engineering. Show both links/versions and why each applies.
- [x] Register completion facts for order confirmation, engineering approval, applied Planning proposal, production aggregation, QC finalization, full delivery, and evidence review. Existing typed domain commands invoke lifecycle completion in their transaction; lifecycle events retain the action and completion fact.
- [x] Same-key replay of order confirmation and applied schedule proposals preserves one lifecycle completion event and one booking application.
- Order confirmation with a new command key after success is rejected before any repeat transition; its regression spec still observes exactly one completion event. Other domain adapters remain to be audited.
- Evidence-review stage completion also rejects a concurrent stale version and a new-key retry after success; one concurrent call produces the sole completion event. This does not yet prove retries across every domain adapter.
- An active selected lifecycle now rejects a domain action that is absent from its pinned stages, closing the legacy-adapter bypass; the isolated intake spec covers this. Cross-adapter replay and alternate-workflow coverage remain open.
- QC completion is retried when a rework reinspection or required inspection form is finalized, and is held while any output lacks a final inspection, rework quantity remains unsettled, or an attempt is active. Required lifecycle QC evidence is scoped to each original output inspection. Final lifecycle routing now derives the exact aggregate outcome and supports typed QC branches; domain/unit and related integration specs pass.
- [ ] Reconcile already-recorded outcomes idempotently across every domain adapter, including retries under a new command key; stage buttons and existing module actions must not create contradictory progression or duplicate events. Same-key replay coverage includes order confirmation, schedule proposal apply, production output, QC finalization, delivery confirmation, evidence-review completion, and engineering approval. New-key replay coverage currently proves engineering approval does not emit a second lifecycle completion; the remaining domain actions still need adapter-by-adapter coverage.
- [x] Engineering omission is allowed only where valid approved engineering/routing/material prerequisites already exist; stage configuration never bypasses release safeguards. The omission regression spec confirms release fails without an APPROVED engineering revision and creates no jobs or tasks.
- Implicit multi-line release now persists each full line allocation with its manufacturing job. A new-key retry spec caught and prevents the prior failure where persisted jobs disagreed with the line allocation total; it asserts retry reuses both jobs/instances without duplicating jobs, tasks or material demands. A focused release spec also proves an unresolved customer question keeps engineering in DRAFT and prevents confirmation, jobs, workflow instances and tasks. An alternate administrative sequence (confirmation → evidence review) is now executed through completion without default production stages. Multi-line release now also proves each job retains its independently approved routing revision/version and creates the corresponding 3- vs 4-task graph. Cross-adapter retry coverage remains open.
- [x] Test multiple lines/jobs, independently pinned routing, failed approval, duplicate release and alternate workflows with a different administrative sequence. Focused release/intake specs cover all five cases.

### Task7: Cross-role queues, My Work and operational forms

**Modify:** existing execution My Work/workstation views; `src/features/quality/components/InspectionDetailView.tsx`; delivery detail; person assigned-work views; navigation permissions and notifications.
**Create:** `src/features/work-items/` for shared read model and stage detail; `src/server/modules/order-lifecycle/queries.ts`; scoped stage queue/claim/reassign/action API routes.
**Tests:** `tests/integration/lifecycle-assignment.test.ts`, `tests/browser/lifecycle-personas.spec.ts`.

- [x] Expose department queue and personal assignments for Sales, Engineering, PPIC, Technician, QC and Delivery using actual permission/assignment scope. Do not add a universal read permission to make the UI work.
- [x] Specific-member assignments require active eligible membership; ineligible or disabled recipients block and can be reassigned explicitly, with no silent fallback to administrator. Queue claim remains atomic.
- [x] General ownership uses membership IDs. Capacity scheduling resolves linked technician IDs; users cannot self-assert technician identity.
- [x] Show stage action, due date/schedule, predecessor blockers, pinned forms and required evidence. Mount SubmissionPanel in the real order/task/inspection contexts.
- [x] Clarify task/stage completion vs form submission; once all gates pass, execute the domain action with explicit consequences and applicable approval.
- [x] Record reassignment actor/reason and claim actor transactionally in the lifecycle event stream.
- [x] Notify the active previous and new assignee transactionally through in-app notifications. External email/Slack delivery is outside this plan.
- [ ] Log in through the normal flow per persona in isolated E2E; verify menus, landing destination, queue, form access and handoff to the next actor, including multi-role behavior.

## Phase4 — Use scheduling as the authoritative capacity path

### Task8: Stage-to-schedule linkage, approved rescheduling and impact propagation

**Modify:** planning service/schedule-proposals/availability; order release/workflow instantiation; planning views and execution start-readiness; existing recovery apply adapter.
**Create:** `src/server/modules/order-lifecycle/scheduling.ts`.
**Tests:** `tests/integration/lifecycle-scheduling.test.ts`; extend existing finite-capacity, dispatch and workforce suites only for new behaviors.

- [x] Link lifecycle production/planning stages to the real job/Task instances and booking IDs. Never copy a second independent schedule into lifecycle state.
- [x] Surface current production task status and confirmed Planning bookings in the order lifecycle panel, linked to the live task detail. Booking rows are read from the existing task/resource-booking records; no duplicate schedule is persisted.
- [x] Compute feasibility using dependency graph, shift/roster, technician skill/cert validity, machine capability, existing bookings, material readiness and facility scope. Lifecycle proposal application uses the existing Planning revalidation path.
- [x] Administrative stages display deadline/owner and actual progress; they do not appear as production capacity without an explicit supported resource model.
- [x] Stage activation creates schedulable work or reveals existing released tasks; it does not silently confirm bookings.
- [ ] Preview schedule/reschedule impact on successor jobs and expected completion. Keep contractual promised date separate; changing customer commitment requires its existing approval path.
- [x] Apply only reviewed, current proposals through the existing approval/CAS transaction; record booking changes and lifecycle impact atomically. Unsupported policy paths must be rejected, not silently approximated.
- [ ] Test resource conflict, expired skill, leave/shift swap, material shortage, overdue administrative prerequisite, stale approval and partial multi-job scheduling. One failure rolls back changes; no duplicated capacity or orphan bookings.
- Existing finite-capacity, qualified-dispatch, workforce-roster, shift-swap, material-custody and multi-job specs cover resource conflicts, expired qualifications, leave/shift swaps, material availability, stale approval and partial delivery/job behavior. Shift-swap specs exposed two defects now fixed: idempotent replays bypassed live membership revocation, and already-requested shifts remained selectable. This checkbox stays open for successor/admin-deadline impact and one rollback assertion spanning a partial multi-job plan.
- [x] Ensure concurrent lifecycle actions and scheduling cannot start work from stale stage/assignment evidence. Lifecycle stage CAS is covered by the intake spec; finite-capacity proposal application now also proves a competing apply is rejected as stale without duplicate bookings/events.

## Phase5 — Connect AI and traceability to the same records

### Task9: Authorized AI context and proposal adapters

**Modify:** `src/server/ai/context.ts`, `brain.ts`; AI context contracts/routes/drawer; existing intelligence recovery and capability read models.
**Create:** `src/server/modules/order-lifecycle/ai-context.ts`.
**Tests:** `tests/integration/lifecycle-ai-context.test.ts`; reuse deterministic/mocked provider facilities, not paid live calls.

- [x] Build bounded typed context containing selected workflow/stage/form versions, authorized current stage/PIC/deadline, predecessor blockers, finalized permitted answers, schedule/booking/material/QC facts and pending approvals.
- [x] Apply facility grants to internal AI order, task, machine and technician context; customer order context remains restricted to the customer's own records. Verified with an outside-facility regression spec.
- [x] Include actual confirmed Planning bookings for authorized tasks in CoreAI context, with operation, visible resource name and time window; prompts distinguish a booking from general availability.
- [x] Include finalized form answers only through the existing form read/subject authorization service; omit drafts, attachments and reference IDs, and retain the finalization timestamp. Verified by integration spec.
- [x] Include evidence provenance/timestamps and distinguish current records, historical snapshots, restricted/missing data and actual totals vs samples. Exclude secrets, unauthorized form fields and unrelated departments' restricted records.
- [x] Support contextual questions about why a task/stage is blocked and who owns the next action, using authorized active issues and predecessor states. Evidence links still resolve through readable authorized records, never model-authored URLs.
- [x] Include only currently validated recovery options from the existing proposal adapter; do not invent a workaround when no current proposal exists.
- Current AI context includes only pending schedule reviews whose order/job/workflow/engineering pins, complete open-task versions and future slots still match. It labels them as pending and requires live capacity revalidation before apply.
- A stale pending review is exercised through the AI recovery question: after a task version changes, context omits the saved review. For a planner asking about a specific order, CoreAI now also runs the existing finite-capacity proposal engine as a fresh read-only preview; the answer distinguishes saved approval state from fresh feasibility, names blockers, and says Planning must revalidate on apply. The integration spec confirms preview does not change bookings and stale saved review is not represented as current.
- Typed lifecycle context now includes readable pinned form name/version/purpose/requiredness/completion point; the AI prompt receives those labels without internal form IDs, and marks details restricted/unavailable instead of guessing. Authorized AI context also aggregates initial finalized production QC quantities/dispositions by order using bigint atoms, excludes reinspection rows to avoid double-counting rework, allows quality readers to ask scoped QC questions, hides QC from customer context, and gives deterministic QC answers with an explicit restricted/no-final-record distinction. `ai-context.test.ts` verifies these facts, bookings, blocker ownership, finalized permitted form answers, stage version/PIC/deadline, QC access, and customer restriction.
- CoreAI now consumes that context for recovery/reschedule questions and its deterministic fallback states pending approval plus apply-time revalidation; it does not claim unsupported alternatives or capacity guarantees.
- Spec sends an instruction-injection question with an out-of-scope order ID and requested delivery-state change; grounded fallback stays within the server-selected order and DB status remains unchanged. Live-provider refusal/self-approval behavior is not proven because no paid live model call was run.
- [x] AI builder changes apply only to authorized persisted drafts after deterministic schema/catalog validation. Proposal application now routes through the existing versioned workflow/form commands, requires explicit human acknowledgment and the reviewed target revision, and rejects missing/stale drafts; specs verify persisted draft changes, command receipts, validation, and no false Applied result.
- [x] Test that prompt text cannot change actor/workspace, unlock forms, self-approve schedules or claim unsupported facts. Provider failure produces an honest grounded fallback with no mutation.
- Scoped injection and mocked provider-outage specs keep saved review pending, preserve booking/form counts and return only grounded fallback evidence. No paid live call was run.
- [x] Update capabilities/help copy so only connected behaviors are advertised; Recovery explicitly says schedule review/apply are connected and alternative strategies are unavailable, covered by the capability registry spec.

### Task10: Connected order evidence timeline and passport links

**Modify:** `src/server/modules/quality/passport.ts`, `passport-publication.ts`; order detail/timeline and current workflow/form events/read models.
**Create:** `src/server/modules/order-lifecycle/traceability.ts`, `src/features/orders/components/order-evidence-timeline.tsx`.
**Tests:** `tests/integration/lifecycle-traceability.test.ts`.

- [x] Record stable event references to lifecycle stage/attempt, workflow/routing/form/binding pins, actor/PIC/department, submission/correction, approval, schedule proposal/booking changes, issue/rework, material lot/output/QC and shipment. Internal timeline records pinned lifecycle/form/routing versions, handoff actor and department, submission sequence/correction reason, recovery decision state, booking changes, lot-linked ledger movement, QC/rework and shipment milestones.
- [x] Show lifecycle handoff time, stage transition, typed domain action and its completion fact in the order history; facts come from the action registry and existing command transactions.
- Internal order history now resolves the lifecycle event actor to a readable name; customer order detail omits the internal lifecycle event stream. Full evidence genealogy and per-link authorization remain open.
- Order detail resolves each immutable lifecycle form pin to its historical template name/version, requiredness and completion point, even after the version is retired; it does not substitute the current template.
- [x] Read from authoritative event/submission/ledger sources; do not manufacture duplicate stock or an independently editable audit timeline. Corrections append and preserve original evidence.
- [x] Link AI proposal evidence to its human decision and actual applied command result. Failed attempts must not look successfully applied; only persisted APPROVED state from the successful apply command appears as applied.
- [ ] Build a scoped timeline searchable by order/line/job/stage/lot. Access checks apply to every detail/download, not only to the top-level order. The timeline is bounded/searchable; regression specs now prove task-form submissions, engineering revisions, and shipment/tracking evidence are omitted without their respective detail permissions. Remaining resource-link boundaries still need specs.
- [x] Add public/customer-safe evidence projections only through existing passport publication permissions; internal answers, personnel details and unpublished attachments are excluded by default. The internal timeline lists published immutable passport snapshots only; customer access stays on the existing passport reader/sharing rules.
- [ ] Test complete genealogy and a correction/reassignment/reschedule/rework path, including an inaccessible evidence link and a multi-shipment order. Specs cover facility/customer denial, inaccessible task-form evidence, multiple shipments, passport publication and pending-vs-applied recovery evidence; correction/reassignment/reschedule/rework genealogy remains open.

## Phase6 — Prove the entire journey before rollout

### Task11: Migration, regression and integrated acceptance

**Files:** additive Prisma migrations and fixtures, `contracts/openapi.yaml`, user-facing workflow/form guides, `tests/e2e/order-lifecycle.spec.ts`, `tests/browser/order-lifecycle.spec.ts`, existing integration/E2E suites.

**Verification boundary:** The user explicitly waived agent-run E2E. Do not run E2E/browser suites; leave their acceptance items visibly pending for the user. Continue with focused unit and isolated integration specs plus typecheck.

- [x] Keep current production-routing workflows operational. Lifecycle selection for new orders is controlled by the documented `NEXT_PUBLIC_MANUOS_ORDER_LIFECYCLE_ENABLED` rollout setting; legacy drafts remain supported. Attaching a workflow to an existing draft is an explicit audited command validating current draft state, facility scope, active member assignments, published form hashes, and immutable pins. Released/in-progress orders cannot be silently migrated.
- [ ] Supply one configured published lifecycle with named departments, active membership policies, published forms and validated production routing. Fixture data belongs in tests/demo setup, not hardcoded operational UI.
- [ ] E2E happy path: Sales creates selected-workflow order and submits specification → Engineering approves routing/BOM → PPIC previews/applies schedule → Warehouse issues WIP → Technician submits evidence/output → QC finalizes → Delivery allocates/dispatches/confirms all quantities. Assert actor handoffs, saved form versions, booking IDs and final delivered state/readback.
- [ ] E2E alternatives: different lifecycle sequence; parallel branch merge; unknown/missing decision facts; reject/correct/review again; QC rework; delayed production plus approved reschedule; partial shipment and receipt; permission change; concurrent claim/complete; retry after timeout; inactive PIC; new template version while old work is running.
- [x] Assert form completion alone cannot release stock, pass QC, complete unproduced quantities or confirm delivery. Existing form-domain gates and production/QC/shipment invariants cover these separate authorities.
- [x] Run focused tests after substantive phases and one final integrated source/unit/integration pass. Latest non-browser run passes 106 files / 562 tests; focused engineering approval retry spec passes (14 tests). Browser/E2E remains explicitly waived by the user.
- [x] Final checks: `rtk npm run typecheck`, full source/integration Vitest run, `rtk npm run db:reconcile`, Prisma validation/migration status, OpenAPI parse and `rtk git diff --check` pass. Browser suite was skipped per explicit instruction.
- [ ] Back up the confirmed target DB before any authorized local migration, verify migration status and restore procedure, then verify real authenticated read paths and a disposable fixture journey. The local demo DB was backed up and migrated, and migration status is current; authenticated local UI/read-path proof remains outstanding. No deployment/production claim from local tests.
- [x] Reconcile current in-progress Recovery/subcontract changes before final verification. Changes were cherry-picked into this worktree, Prisma Client regenerated, and the recovery/capability specs pass.

## Coverage and completion gate

| User requirement / audit blocker | Owning tasks |
|---|---|
| Form subject security, CAS, idempotency and audit | 1 |
| Safe bindings, immutable pins, form before release | 2 |
| All declared dynamic controls and real evidence uploads | 3 |
| Dynamic workflow stages, department/role/PIC, branches | 4–5 |
| Visible workflow choice at intake, engineering and release | 6 |
| Real stakeholder tasks, queues, forms and handoffs | 7 |
| Existing scheduling, constraints and approved changes | 8 |
| Builder and operational AI connected to real authorized facts | 9 |
| Traceability from intake to final delivered shipment | 10 |
| Existing-order safety and end-to-end acceptance | 11 |

The plan is complete only when GateA, GateB and integrated acceptance pass. A polished editor, green isolated form tests, a manually seeded binding or an AI demo is not sufficient. Do not mark downstream phases done because upstream configuration exists.
