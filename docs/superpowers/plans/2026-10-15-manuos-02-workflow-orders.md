# ManuOS Engineering, Orders and Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation and commits require separate user authorization.

**Goal:** Deliver M2: real reviewed engineering, published process versions and new orders instantiated into durable production work.

**Architecture:** Reuse F01–F07 identity, master, command and query interfaces. Separate definition/version management from pure workflow transition evaluation and actual operational postings.

**Tech Stack:** Existing Next/React/Zod/Vitest and the selected Prisma/SQLite infrastructure. No unrestricted workflow scripting or external workflow orchestration platform.

## Global Constraints

Master-plan constraints apply. Normal operations never branch on order 1042 or a demo date; published definitions/released instructions are immutable; UI preview is not persistence; actor authority is server-derived. F01–F07 must pass before this plan starts.

## W01 — Typed definitions, server validation and published versions

**Files:** create `src/server/modules/workflow/contracts.ts`, `repository.ts`, `service.ts`, `src/domain/workflow-definition.ts`, `src/domain/workflow-definition.test.ts`, workflow migrations, `src/app/api/workflows/route.ts`, `src/app/api/workflows/[id]/versions/[versionId]/route.ts` and action handlers for validate/submit-review/publish/retire; modify `src/engines/workflow-validate.ts`, contracts; add `tests/integration/workflow-versions.test.ts`.

**Consumes:** actual order-type/department/permission/resource/QC catalogs; F03 commands and F02 Principal.
**Produces:** `WorkflowDefinition` with schema version, typed node/edge/guard registry and completion policy; `validateWorkflowDefinition(definition, catalog)` returns errors with node/field refs; `publishWorkflowVersion(principal,input)` commits immutable definition/version/hash/approver.

- [x] Define Zod schemas for OPERATION, INSPECTION and APPROVAL nodes, explicit duration/requirements, AND joins, supported condition codes/params and terminal completion policy. Reject arbitrary scripts/free-text conditions.
- [x] Extend graph validation for endpoints/cycles, required role/resource references, node reachability/completion, incompatible guard config and missing QC definitions. Distinguish intentional declared parallel paths from accidental orphan nodes.
- [x] Implement draft → review → publish → retire with authorization/version conflicts. Published node/edge content cannot be changed; editing forks a new version.
- [x] Write actual DB tests for two different definitions, cycle/missing-ref rejection, unauthorized publication and immutable published versions.
- [x] Run `rtk npm test -- src/domain/workflow-definition.test.ts` and `rtk npm run test:integration -- tests/integration/workflow-versions.test.ts`; expected: validation and lifecycle rules hold on persisted versions.

## W02 — Real order drafts and reviewed engineering revisions

**Files:** create `src/server/modules/orders/contracts.ts`, `repository.ts`, `service.ts`, `src/server/modules/engineering/contracts.ts`, `repository.ts`, `service.ts`; add order/RFQ/questions/engineering/BOM migrations and handlers under `src/app/api/orders/`; create `tests/integration/order-drafts.test.ts` and extend factory fixtures.

**Produces:** `createOrderDraft(principal,input): Promise<Committed<OrderDetail>>`, `saveEngineeringDraft`, `submitEngineeringReview`, `approveEngineeringRevision`. `OrderDetail` includes IDs/versions and distinct ordered/completed/accepted/allocated/shipped quantities; empty computed amounts start at zero, not the hero fixture.

- [x] Define actual typed create/edit/review contracts from customer/type/item/quantity/date. Keep raw RFQ and customer questions with their source; do not lose draft context when leaving the page.
- [x] Store reviewed BOM quantities/base-UOM conversions and output basis, routing/process version, spec/document revision and checklist requirements. Validate inactive/mismatched master refs and unresolved critical questions.
- [x] Save/submit/approve under version and permission guards; approved revisions are immutable, customer/date commitments remain distinguishable from requested dates.
- [x] Test same-key create returns one order, code allocation is transaction-safe, wrong customer/workspace is denied, and an actual draft survives reconnect.
- [x] Run `rtk npm run test:integration -- tests/integration/order-drafts.test.ts`; verify real order and engineering readback before UI success claims.

## W03 — Release and process instantiation transaction

**Files:** create `src/server/modules/workflow/instantiate.ts`, `src/server/modules/orders/release.ts`, instance/MO/jobsheet/task/dependency/demand/event migrations, `src/app/api/orders/[id]/release/route.ts`; extend `tests/integration/order-release.test.ts` and fixture definitions.

**Produces:** `releaseOrder(principal,input)` and `instantiateWorkflow(tx, order, publishedVersion, engineeringRevision)` returning canonical instance/work IDs. Instance/tasks pin process and engineering versions. No client-provided task graph is accepted.

- [x] Write the release test first: use reviewed order A and workflow A; release produces exact task dependencies/BOM demand and pinned IDs once. Repeating the command returns those IDs.
- [x] Recheck approved spec/published workflow/customer/item/calendar/master status inside the transaction. Create production grouping, task instances/attempt 1, dependency links, actual material demand and audit atomically.
- [x] Test injected failure after task insertion: no partial instance/demand/release status or success receipt persists.
- [x] Publish process version 2; assert existing order A remains on version 1 while new order B can pin version 2.
- [x] Run `rtk npm run test:integration -- tests/integration/order-release.test.ts`; expected: no toast-only order, no rebind or duplicate instantiation.

Material shortage is visible demand, not fabricated stock; order release can create waiting work. Operator start routes are introduced only after O03/O05 provide actual readiness/posting behavior.

## W04 — Bounded workflow transition/guard engine

**Files:** create `src/domain/workflow-runtime.ts`, `src/domain/workflow-runtime.test.ts`, `src/server/modules/workflow/events.ts`; adapt task lifecycle contracts and tests.

**Produces:** `evaluateTransition(input): TransitionDecision` over a server-built readiness snapshot. `TransitionDecision` is `{allowed:true,nextStatus}` or `{allowed:false,reasons:[{code,resourceId,message}]}`. Inputs include current node/attempt/state, granted action/assignment, predecessor completion, usable-material coverage, resource eligibility and required evidence. API callers cannot provide this snapshot directly.

- [x] Implement the finite action registry and legal state transitions specified in DB section 9. Preserve scheduled DAG versus explicit rework attempt semantics.
- [x] Write tests that one completed predecessor cannot release an AND join, unavailable material cannot be bypassed, an unassigned operator cannot execute, and inspection requires actual required results/authority.
- [x] Treat missing input/evidence as a denied/unknown-readiness reason, not an assumed green state. Do not expose fake successful start/finish APIs before O05 wires authoritative inputs.
- [x] Commit workflow events only through successful application commands; event records share actor/command/revision with actual domain writes.
- [x] Run `rtk npm test -- src/domain/workflow-runtime.test.ts`; verify exact allowed/denied transitions and bounded guard types.

## W05 — Workflow Studio, Order Hub and Engineering Hub UI

**Files:** create feature modules `src/features/workflows/{api,hooks}.ts`, `components/definition-editor.tsx`, `components/version-review.tsx`; `src/features/orders/{api,hooks}.ts`, `components/order-form.tsx`, `components/order-detail.tsx`; `src/features/engineering/{api,hooks}.ts`, `components/review-editor.tsx`. Create route pages W01–W03, O01–O03 and E01–E02 from the catalog, modify existing `/orders/new` route ownership and intake drawer; add `tests/e2e/order-engineering-workflow.spec.ts`.

**Consumes:** actual DTOs and lifecycle commands; **produces:** saved draft/review/version/release UI and direct links that reload correctly.

- [x] Build structured node/edge editing plus graph preview/inspector; represent actual validation errors and published read-only/fork state. Precision dragging is optional, not a runtime dependency.
- [x] Build order list/detail/new and engineering review forms with actual master selectors, BOM/question editing and role-aware next actions. Keep one intake editor shared by the page and any drawer entry.
- [x] Replace both existing confirmation handlers with `createOrderDraft`/save/release adapters. Navigate only after success with returned IDs; keep form/error state after failure.
- [x] Preserve tabs/deep links and pinned versions, show task/material/quality tabs as real empty/waiting states until downstream records exist. No static charts/quantities presented as actual order evidence.
- [x] Run `rtk npm run test:e2e -- tests/e2e/order-engineering-workflow.spec.ts`, typecheck and one batched responsive review. Expected: user-created customer/type/order flows through review/publish/release and survives refresh.

## W06 — M2 acceptance and second-type proof

**Files:** create `tests/integration/workflow-independence.test.ts`, extend `tests/fixtures/factory.ts`, update requirements/evidence docs.

- [x] Instantiate materially different workflow B with parallel branches and QC gate for a different customer/item. Confirm no seed ID/date/type check was added to runtime/release code.
- [x] Run denial/stale-version/rollback/version-pin tests together and read actual persisted instances/dependencies/demand.
- [x] Reconnect after a simulated process restart; show the same orders/process versions in UI, not reconstructed local React state.
- [x] Mark M2's exact gates, including actual schema/route tests and browser path. Operational execution remains pending O01–O09; proceed to stock/supply with explicit dependency references.
