# Unified Builder Hardening and Order Lifecycle Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement this single plan task-by-task, inline in the active checkout. Do not delegate, commit, push, migrate shared databases or send external notifications without the applicable user authorization. Check off only verified deliverables.

**Goal:** Make the selected published workflow control an order's cross-department journey, with versioned dynamic forms, accountable assignments, real capacity scheduling, grounded AI assistance and a connected audit trail through confirmed delivery.

**Architecture:** Preserve existing production routing and all authoritative domain commands. Extend Workflow Studio with explicit lifecycle-stage definitions and typed action adapters; a lifecycle production stage references a pinned production routing version instead of treating Sales or Delivery as machine operations. Pin workflow, form bindings, assignment rules and transition rules when an order enters the workflow; execute each state-changing action and its lifecycle transition in the same transaction.

**Tech Stack:** Next.js15 App Router, React19, strict TypeScript, existing typed icon facade/shared UI controls, Tailwind4 semantic light tokens, Prisma/SQLite, executeCommand, bigint atoms, existing scheduling and ledger engines.

**Status (2026-10-18):** Implementation remains in progress; Gate A, Gate B and integrated acceptance are not complete. Latest focused verification covers 11 spec files / 51 tests, `npm run typecheck`, OpenAPI YAML parsing and earlier Prisma schema validation. Recent work also adds lifecycle evidence-review completion, selected-workflow intake preview, actual Planning bookings in lifecycle queues, authorized lifecycle context for CoreAI, handoff history, and activation-relative stage deadlines. The user explicitly waived E2E; browser-only UI behavior and the integrated persona journey remain unverified. Do not treat lifecycle rollout as ready until the remaining unchecked items are verified.

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

- [ ] Add negative tests: same-workspace unassigned technician, outside-facility order/inspection, revoked member, customer role, forged actor/subject, unauthorized correction.
- [ ] Add two competing saves/finalizations/publishes against one version; exactly one wins. Replay the same idempotency key; no extra submission/event is created. Changed payload with same key conflicts.
- [ ] Resolve subject access inside the write transaction, using existing domain permission conventions. Do not grant generic form-author permission access to every operational form.
- [ ] Move authoring/binding/submission mutations under executeCommand, with transaction-aware helpers and conditional version/status updates. Do not allow saveDraft to reopen an already-finalized instance.
- [ ] Preserve actor/time, correction reason and supersedes links; attach correction documents using the same validated mechanism as original finalization.
- [ ] Run `rtk proxy npx vitest run tests/integration/forms-access.test.ts tests/integration/forms-concurrency.test.ts tests/integration/forms-versioning.test.ts tests/integration/forms-submissions.test.ts`; all cases pass. Update OpenAPI idempotency/version/auth examples in this task.

### Task2: Typed binding validation, immutable pins and early materialization

**Modify:** `src/server/modules/forms/contracts.ts`, `service.ts`, `completion.ts`; `prisma/schema.prisma`; `src/server/modules/orders/service.ts`, `release.ts`; `src/server/modules/workflow/instantiate.ts`.
**Create:** `src/server/modules/forms/bindings.ts`, `materialize.ts`; named additive migration for binding snapshots/owner scope.
**Tests:** `tests/integration/forms-binding-pins.test.ts`; extend `forms-domain-gates.test.ts` and `forms-history-context.test.ts`.

**Interfaces:** `validateBindingTarget(tx, principal, input)` validates a discriminated context/target/purpose; `materializePinnedForms(tx, {workspaceId, subjectType, subjectId, pins})` is transaction-local and idempotent; `assertPinnedFormsFinalized(tx, subject)` reads instance pins, not today's mutable template bindings.

- [ ] Test invalid context fields, missing target, foreign workflow/node/checklist, incompatible purpose and duplicate bindings; reject before write.
- [ ] Persist immutable binding sets and requiredness/completion point per published workflow version and instantiated subject. Hash the full execution-relevant configuration.
- [ ] Test that publishing/rebinding v2 neither changes the form rendered for existing v1 instances nor introduces a new required gate on them.
- [ ] Materialize order specification forms on order/workflow initialization, before release. Ensure task and inspection evidence exist before their respective action gates.
- [ ] Test the full required-order-form path: create order → see instance → draft save → final submit → release allowed. Release with absent/unfinished pinned form is rejected atomically.
- [ ] Treat legacy zero-binding instances explicitly: no retroactive requirement insertion. Add a compatibility reader and migration fixtures for existing forms/workflows.
- [ ] Run `rtk proxy npx vitest run tests/integration/forms-binding-pins.test.ts tests/integration/forms-domain-gates.test.ts tests/integration/forms-history-context.test.ts`.

### Task3: Complete advertised form controls

**Modify:** `src/domain/forms/types.ts`, `schema.ts`, `validation.ts`; `src/features/forms/components/form-renderer.tsx`, `field-editor.tsx`, `definition-editor.tsx`, `submission-panel.tsx`.
**Create:** `src/features/forms/components/form-attachment-field.tsx`, `form-reference-field.tsx`, `playwright.config.ts`, `tests/browser/fixture-server.ts`; add a dedicated browser test script and dev tooling in `package.json` only if not already installed. Exclude browser specs from Vitest collection.
**Tests:** extend `src/domain/forms/validation.test.ts`; create `tests/browser/dynamic-form-controls.spec.ts`.

- [ ] Establish the browser harness against an isolated createFactoryFixture server, with its lifecycle cleanup. Existing `tests/e2e` specs and `test:e2e` use Vitest/API handlers; they are not browser proof. Reuse them for API coverage and put real UI specs in `tests/browser`.
- [ ] Implement actual multiselect arrays; typed booleans; decimal strings without float arithmetic; DatePicker; authorized named master lookup; real document upload/download using existing document endpoints.
- [ ] Validate referenced entities/documents server-side in current workspace/subject scope. Reject invalid, foreign, inaccessible or missing attachments rather than accepting an unresolvable evidence ID.
- [ ] Keep visibleWhen behavior identical in preview, runtime and server validation. Hidden fields do not silently satisfy required visible evidence.
- [ ] Namespace control IDs by form instance/renderer instance; preview and multiple operational forms must not share IDs.
- [ ] Test all9 field kinds through fill → draft save → final submit → reload/read-only → correction. Include file-type/size limits, invalid references, decimal precision, required fields and conditional visibility.
- [ ] Prevent publish for any field capability not supported in both renderer and server; show actionable errors in the builder.
- [ ] Run `rtk proxy npx vitest run src/domain/forms/validation.test.ts` and `rtk proxy npx playwright test --config playwright.config.ts tests/browser/dynamic-form-controls.spec.ts` against the isolated fixture server created in this task.

**GateA:** Tasks1–3 must pass before enabling lifecycle configuration in production-facing UI. No raw-ID field, unscoped submission route or live mutable binding dependency may remain in the supported contract.

## Phase2 — Make Studio configure executable lifecycle stages

### Task4: Versioned stage model and deterministic transition rules

**Modify:** `src/domain/workflow-definition.ts`, `src/server/modules/workflow/contracts.ts`, `service.ts`; `prisma/schema.prisma`.
**Create:** `src/domain/order-lifecycle-definition.ts`, `order-lifecycle-runtime.ts`; `src/server/modules/order-lifecycle/action-registry.ts`, `contracts.ts`; additive lifecycle instance/stage/assignment/event migration.
**Tests:** `src/domain/order-lifecycle-definition.test.ts`, `order-lifecycle-runtime.test.ts`, `tests/integration/lifecycle-version-pins.test.ts`.

**Interfaces:** `validateLifecycleDefinition(definition, catalog)` returns structured errors; `evaluateStageTransition(snapshot, action, facts)` is pure and returns allowed/next-state/activated-or-skipped-stage keys and reasons. Action registry maps every LifecycleAction to its required permissions and explicit domain completion facts.

- [ ] Add lifecycle template kind without changing legacy production-routing interpretation.
- [ ] Validate active departments/members/roles, form pins/purposes, routing sources, deadlines, valid terminal paths, unknown adapters, duplicate keys and unreachable/dead-end stages.
- [ ] Validate conditional references and values against pinned form schemas; bounded nested conditions only. No decision may read another workspace or unsubmitted draft answers.
- [ ] Test serial flow, parallel fan-out/AND join, exclusive branch plus merge, skipped branch handling, missing condition facts, rejection and explicit rework attempts.
- [ ] Add membership assignment and lifecycle events with versioned CAS. Serialize immutable published definition/binding hashes; do not mutate completed attempts.
- [ ] State publish/review rules explicitly. Do not imply mandatory two-person approval if the configured contract permits authorized self-publication.
- [ ] Run domain lifecycle tests and `tests/integration/lifecycle-version-pins.test.ts`; legacy workflow suites remain passing.

### Task5: Builder stage inspector, binding UI and execution preview

**Modify:** `src/features/workflows/components/definition-editor.tsx`, `node-inspector.tsx`, `workflow-canvas.tsx`, `node-palette.tsx`; canvas adapters/state; form template pages.
**Create:** `src/features/workflows/components/stage-assignment-editor.tsx`, `stage-form-bindings.tsx`, `stage-execution-preview.tsx`; authenticated binding/catalog routes under `src/app/api/workflows/`.
**Tests:** extend workflow canvas adapter/state tests; create `tests/browser/lifecycle-builder.spec.ts`.

- [ ] Let author select stage action, department, eligible roles and specific member or department queue. Show resulting access separately from organization metadata.
- [ ] Select published forms by readable template/version, requiredness and completion point; show field preview, definition hash/version and unsupported/missing references.
- [ ] Select deadline vs resource-capacity scheduling. Only resource-capacity stages can invoke approved production routing and Planning; do not demand machines for Sales/approval/delivery administration.
- [ ] Make routing conditions and rejection/rework outcomes configurable through typed controls, not free JSON or raw condition codes.
- [ ] Preview who receives work, what forms are shown, what blocks completion and which stage/branch activates next. Preview remains non-mutating and is not proof of actual scheduling capacity.
- [ ] Publish validation reports errors at the exact stage/field; published view is read-only with fork action.
- [ ] Prove an author configures and publishes an example without API tools/raw IDs; unsupported configuration cannot publish.

**GateB:** A complete cross-department example is configurable, valid and inspectable in Studio; execution previews match deterministic engine results. No lifecycle rollout before GateA and GateB.

## Phase3 — Connect order intake, ownership and real domain actions

### Task6: Start the selected workflow at order intake

**Modify:** `src/features/orders/components/order-form.tsx`, `order-detail.tsx`; `src/features/engineering/components/review-editor.tsx`; order contracts/service/release and engineering service.
**Create:** `src/server/modules/order-lifecycle/service.ts`, `assignment.ts`, `adapters.ts`; `src/features/orders/components/order-lifecycle-timeline.tsx`.
**Tests:** `tests/integration/order-lifecycle-intake.test.ts`; extend `tests/e2e/order-engineering-workflow.spec.ts`.

**Interfaces:** `startOrderLifecycle(tx, principal, {orderId, workflowVersionId})` validates and pins, creates first stage/assignment/forms atomically. `applyStageDomainAction(tx, principal, {stageInstanceId, expectedVersion, actionPayload})` invokes the existing typed domain internals and advances lifecycle in the same command transaction.

- [ ] Show workflow name/version and Order type compatibility in intake. Prefilled defaults must be visible, overridable only with an authorized compatible published workflow, and explicit in the saved record.
- [ ] Create order + initial lifecycle + pinned first-stage forms in one transaction. Failed assignment/form materialization rolls back the order creation; duplicate submit replays once.
- [ ] Distinguish lifecycle version selected at intake from production-routing version selected at engineering. Show both links/versions and why each applies.
- [ ] Register adapters for order confirmation, engineering approval, planning readiness, production aggregation, QC finalization, delivery confirmation and evidence-only review. Reuse transaction-aware domain validation, not direct status updates.
- [ ] An already-recorded domain outcome must reconcile idempotently; stage buttons and existing module actions must not create contradictory progression or duplicate events.
- [ ] Engineering omission is allowed only where valid approved engineering/routing/material prerequisites already exist; stage configuration never bypasses release safeguards.
- [ ] Test multiple lines/jobs, independently pinned routing, failed approval, duplicate release and alternate workflows with a different administrative sequence.

### Task7: Cross-role queues, My Work and operational forms

**Modify:** existing execution My Work/workstation views; `src/features/quality/components/InspectionDetailView.tsx`; delivery detail; person assigned-work views; navigation permissions and notifications.
**Create:** `src/features/work-items/` for shared read model and stage detail; `src/server/modules/order-lifecycle/queries.ts`; scoped stage queue/claim/reassign/action API routes.
**Tests:** `tests/integration/lifecycle-assignment.test.ts`, `tests/browser/lifecycle-personas.spec.ts`.

- [ ] Expose department queue and personal assignments for Sales, Engineering, PPIC, Technician, QC and Delivery using actual permission/assignment scope. Do not add a universal read permission to make the UI work.
- [x] Specific-member assignments require active eligible membership; ineligible or disabled recipients block and can be reassigned explicitly, with no silent fallback to administrator. Queue claim remains atomic.
- [ ] General ownership uses membership IDs. Capacity scheduling resolves linked technician IDs; users cannot self-assert technician identity.
- [ ] Show stage action, due date/schedule, predecessor blockers, pinned forms and required evidence. Mount SubmissionPanel in the real order/task/inspection contexts.
- [ ] Clarify task/stage completion vs form submission; once all gates pass, execute the domain action with explicit consequences and applicable approval.
- [x] Record reassignment actor/reason and claim actor transactionally in the lifecycle event stream.
- [x] Notify the active previous and new assignee transactionally through in-app notifications. External email/Slack delivery is outside this plan.
- [ ] Log in through the normal flow per persona in isolated E2E; verify menus, landing destination, queue, form access and handoff to the next actor, including multi-role behavior.

## Phase4 — Use scheduling as the authoritative capacity path

### Task8: Stage-to-schedule linkage, approved rescheduling and impact propagation

**Modify:** planning service/schedule-proposals/availability; order release/workflow instantiation; planning views and execution start-readiness; existing recovery apply adapter.
**Create:** `src/server/modules/order-lifecycle/scheduling.ts`.
**Tests:** `tests/integration/lifecycle-scheduling.test.ts`; extend existing finite-capacity, dispatch and workforce suites only for new behaviors.

- [ ] Link lifecycle production/planning stages to the real job/Task instances and booking IDs. Never copy a second independent schedule into lifecycle state.
- [ ] Compute feasibility using dependency graph, shift/roster, technician skill/cert validity, machine capability, existing bookings, material readiness and facility scope.
- [ ] Administrative stages display deadline/owner and actual progress; they do not appear as production capacity without an explicit supported resource model.
- [ ] Stage activation creates schedulable work or reveals existing released tasks; it does not silently confirm bookings.
- [ ] Preview schedule/reschedule impact on successor jobs and expected completion. Keep contractual promised date separate; changing customer commitment requires its existing approval path.
- [ ] Apply only reviewed, current proposals through the existing approval/CAS transaction; record booking changes and lifecycle impact atomically. Unsupported policy paths must be rejected, not silently approximated.
- [ ] Test resource conflict, expired skill, leave/shift swap, material shortage, overdue administrative prerequisite, stale approval and partial multi-job scheduling. One failure rolls back changes; no duplicated capacity or orphan bookings.
- [ ] Ensure concurrent lifecycle actions and scheduling cannot start work from stale stage/assignment evidence.

## Phase5 — Connect AI and traceability to the same records

### Task9: Authorized AI context and proposal adapters

**Modify:** `src/server/ai/context.ts`, `brain.ts`; AI context contracts/routes/drawer; existing intelligence recovery and capability read models.
**Create:** `src/server/modules/order-lifecycle/ai-context.ts`.
**Tests:** `tests/integration/lifecycle-ai-context.test.ts`; reuse deterministic/mocked provider facilities, not paid live calls.

- [ ] Build bounded typed context containing selected workflow/stage/form versions, authorized current stage/PIC/deadline, predecessor blockers, finalized permitted answers, schedule/booking/material/QC facts and pending approvals.
- [x] Apply facility grants to internal AI order, task, machine and technician context; customer order context remains restricted to the customer's own records. Verified with an outside-facility regression spec.
- [x] Include actual confirmed Planning bookings for authorized tasks in CoreAI context, with operation, visible resource name and time window; prompts distinguish a booking from general availability.
- [x] Include finalized form answers only through the existing form read/subject authorization service; omit drafts, attachments and reference IDs, and retain the finalization timestamp. Verified by integration spec.
- [ ] Include evidence provenance/timestamps and distinguish current records, historical snapshots, restricted/missing data and actual totals vs samples. Exclude secrets, unauthorized form fields and unrelated departments' restricted records.
- [ ] Support contextual questions such as why a stage is blocked, who owns the next action and which validated recovery options exist. Evidence links open readable authorized records, never model-authored URLs.
- [ ] AI builder changes apply only to authorized drafts after deterministic schema/catalog validation. Operational AI changes create the existing validated proposal; approval invokes Task8/domain adapters and never direct state mutation.
- [ ] Test that prompt text cannot change actor/workspace, unlock forms, self-approve schedules or claim unsupported facts. Provider failure produces an honest grounded fallback with no mutation.
- [ ] Update capabilities/help copy so only connected behaviors are advertised.

### Task10: Connected order evidence timeline and passport links

**Modify:** `src/server/modules/quality/passport.ts`, `passport-publication.ts`; order detail/timeline and current workflow/form events/read models.
**Create:** `src/server/modules/order-lifecycle/traceability.ts`, `src/features/orders/components/order-evidence-timeline.tsx`.
**Tests:** `tests/integration/lifecycle-traceability.test.ts`.

- [ ] Record stable event references to lifecycle stage/attempt, workflow/routing/form/binding pins, actor/PIC/department, submission/correction, approval, schedule proposal/booking changes, issue/rework, material lot/output/QC and shipment.
- [ ] Read from authoritative event/submission/ledger sources; do not manufacture duplicate stock or an independently editable audit timeline. Corrections append and preserve original evidence.
- [ ] Link AI proposal evidence to its human decision and actual applied command result. Failed attempts must not look successfully applied.
- [ ] Build a scoped timeline searchable by order/line/job/stage/lot. Access checks apply to every detail/download, not only to the top-level order.
- [ ] Add public/customer-safe evidence projections only through existing passport publication permissions; internal answers, personnel details and unpublished attachments are excluded by default.
- [ ] Test complete genealogy and a correction/reassignment/reschedule/rework path, including an inaccessible evidence link and a multi-shipment order.

## Phase6 — Prove the entire journey before rollout

### Task11: Migration, regression and integrated acceptance

**Files:** additive Prisma migrations and fixtures, `contracts/openapi.yaml`, user-facing workflow/form guides, `tests/e2e/order-lifecycle.spec.ts`, `tests/browser/order-lifecycle.spec.ts`, existing integration/E2E suites.

- [ ] Keep current production-routing workflows operational. Introduce lifecycle selection for new eligible orders behind a documented rollout setting. Legacy orders show legacy mode; attaching a workflow to an existing draft is an explicit audited command validating current state and pins. Released/in-progress orders are not silently migrated.
- [ ] Supply one configured published lifecycle with named departments, active membership policies, published forms and validated production routing. Fixture data belongs in tests/demo setup, not hardcoded operational UI.
- [ ] E2E happy path: Sales creates selected-workflow order and submits specification → Engineering approves routing/BOM → PPIC previews/applies schedule → Warehouse issues WIP → Technician submits evidence/output → QC finalizes → Delivery allocates/dispatches/confirms all quantities. Assert actor handoffs, saved form versions, booking IDs and final delivered state/readback.
- [ ] E2E alternatives: different lifecycle sequence; parallel branch merge; unknown/missing decision facts; reject/correct/review again; QC rework; delayed production plus approved reschedule; partial shipment and receipt; permission change; concurrent claim/complete; retry after timeout; inactive PIC; new template version while old work is running.
- [ ] Assert form completion alone cannot release stock, pass QC, complete unproduced quantities or confirm delivery. All quantity conservation and overproduction rules remain enforced.
- [ ] Run focused tests after each substantive phase; run the required final integration/E2E regression pass once after the integrated change. Do not repeatedly rerun passing broad suites without a new risk.
- [ ] Final checks: `rtk npm run typecheck`, `rtk npm test` for the existing Vitest integration/API-E2E suites and `rtk proxy npx playwright test --config playwright.config.ts` for the browser suite, `rtk npm run db:reconcile`, Prisma schema/migration validation, OpenAPI parse and `rtk git diff --check`. Require zero compiler errors and zero ledger discrepancies. The existing test, test:integration and test:e2e scripts all invoke vitest run; do not run those three aliases redundantly or call them three independent checks. Separate source/unit/integration/browser/local-HTTP from production proof.
- [ ] Back up the confirmed target DB before any authorized local migration, verify migration status and restore procedure, then verify real authenticated read paths and a disposable fixture journey. No deployment/production claim from local tests.
- [ ] Reconcile current in-progress Recovery/subcontract changes before final verification. The audit's compiler failures are baseline context, not permission to omit final green checks.

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
