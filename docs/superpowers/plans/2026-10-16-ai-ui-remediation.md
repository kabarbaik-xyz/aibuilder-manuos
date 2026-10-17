# CoreAI UI and API remediation plan

## Primary goal

Users can find every available AI capability from a clear CoreAI entry and use it directly from the relevant order, engineering, planning, or quality workflow. Each screen shows real authorized records, evidence, limitations, and review actions; unavailable engines never masquerade as working operational features.

**Status:** CoreAI discovery and several operational slices are implemented. Promise quantity/date review and transactional Recovery schedule application are connected; exact supply allocation, recovery alternatives, schedule publication, provider/pilot, and rendered browser proof remain open.

**Scope:** Mostly UI and integration, with backend corrections where existing outputs cannot safely support the UI. Covers AII-01–07, SCH-07–09, CST-03, and discovery of existing form/workflow AI tools.

**Architecture:** Keep the existing workspace shell, navigation registry, React Query clients, domain services, command transactions, and UI primitives. Add a CoreAI hub and focused pages, then connect contextual actions to those same components and contracts. Deterministic services compute constraints and quantities; model responses explain or draft; authorized users approve changes.

**Execution discipline:** Complete tasks in dependency order, update this plan's checkboxes with evidence, preserve unrelated changes, and do not commit, push, merge, or deploy without explicit user instruction. A passing test or an existing endpoint alone does not close a browser journey or a capability.

**Implementation progress (2026-10-17):** CoreAI navigation, Ask AI launcher naming, a session-protected capability registry, and `/ai`, `/ai/assistant`, `/ai/risks`, `/ai/memory`, and `/orders/intake` pages are present. The assistant reuses the existing conversation component; order context is validated server-side and limits its evidence snapshot, with a visible clear action. The risk inbox has server-side filters/pagination and detail resolution, but reports incomplete coverage because order-derived source data is limited to the dashboard's 50 latest orders; it has no acknowledge/resolve mutation. Factory memory keeps missing actual duration null, computes overrun only from measured samples in explicitly selected item/process cohorts, excludes reinspection quantities, and does not recommend an unvalidated buffer. Technician suggestions now appear in Planning, backed by an authenticated route and existing assignment rechecks. Costing has scoped permissions, single-currency/integer minor-unit accounting, audit/idempotency, missing-data states, and source-linked deterministic variance explanation. Verification: full Vitest 79 files/423 tests passed; build and typecheck passed; demo workspace reconciliation has zero discrepancies (194 movements, 113 buckets); OpenAPI YAML parsed; `git diff --check` passed. Authenticated local browser smoke showed CoreAI navigation/capability links, the paginated risk inbox (18 signals over two pages), and an evidence detail with its source-order link. Full browser journeys and responsive/accessibility checks remain open. Remaining work includes full cohort controls/performance bounds, typed evidence links and task context in assistant, uploaded RFQ provenance/review/apply, full finite-capacity proposal UI, Promise correction, recovery lifecycle/application, and QC pilot decisions. Provider and pilot proof remain open.

**Implementation progress (2026-10-17 continuation):** Added persisted, bounded text-only RFQ extraction/review with source SHA-256, prompt/model metadata, original-versus-edited values, master-match status, and a reviewed order-draft handoff that records lineage within order creation. Provider failure creates no extraction record. Added workspace-scoped, paginated recovery queue/detail and audited rejection; Apply remains disabled pending real transactional effects. Focused RFQ/recovery integration tests pass (6 tests). Document upload/citations, safe Promise/schedule proposal, recovery application, vision provider/pilot, and broad browser/accessibility proof remain release gates.

**Implementation progress (2026-10-17 continued):** Added deterministic `GET /api/orders/{id}/costing/explanation` with ranked integer variance contributors, source IDs, authorized evidence links and explicit coverage; the Costing tab now loads it on demand. Added Similar jobs links from order/item context into a pre-filtered Factory Memory view, carrying item identity in its scoped evidence DTO. Inspection detail now states that AI visual analysis is unavailable and keeps manual QC visible while naming pilot prerequisites. Focused costing/memory navigation tests and typecheck pass.

**Implementation progress (2026-10-17 continued):** The assistant now turns verified order/item references into typed internal evidence links; unmatched model output cannot become a destination. Updated its OpenAPI response. Checklist progress is 47/86 (~55%); unresolved work remains explicitly listed below.

**Implementation progress (2026-10-17 continued):** Factory Memory now scopes its completed-run evidence by item, process, department, workflow version, facility and inclusive completion-date window. The page exposes the version/facility ID and date filters; department matching now follows its manufacturing-order relation. Focused coverage verifies workflow-version isolation and date-window exclusion/validation.

**Implementation progress (2026-10-17 continued):** Ask AI accepts server-resolved task context for planners and only assigned tasks for technician-only principals. Planning task detail links to the assistant when the caller has that scope; task references resolve to authorized task-detail links. Context-switch reset no longer clears a route-provided context on initial render. Focused memory and assistant suites pass (9 tests); typecheck passes.

**Implementation progress (2026-10-17 continued):** Risk detail now resolves a current cause, affected order/task/material-demand records, structured evidence, missing-data reasons and permitted actions. Customer risk reads exclude internal material demand; dashboard material shortage calculation now sums all eligible balances and preserves quantity precision. Risk integration tests cover current evidence and customer denial.

**Implementation progress (2026-10-17 continued):** Form and workflow proposal review now presents field/step additions, changes and removals, requirements, dependencies, assumptions, validation findings and open questions before the optional raw JSON. Draft AI actions include a focused example and the existing human review/revision guard remains in force.

**Implementation progress (2026-10-17 continued):** The legacy Promise evaluator now returns NOT_CONNECTED with missing prerequisites and null dates/capacity/confidence; it no longer reports pooled-stock feasibility or invented cost/capacity alternatives. The companion AI explanation route returns 503 and does not trust caller-supplied feasibility. CoreAI continues to show Promise as unavailable until a validated finite-capacity evaluator exists.

**Implementation progress (2026-10-17 continued):** Planning now labels the existing route output as a dependency sequence estimate, calls out missing capacity/calendar/material checks, and no longer describes its dates as material-ready delivery scheduling. Assignment confirmation continues to use the existing server-side resource recheck.

**Implementation progress (2026-10-17 finite-capacity priority):** Added a deterministic, non-mutating finite-capacity schedule proposal endpoint and Planning workbench. The service derives facility, workflow, required qualifications, published availability, machine class, dependencies and reserved/issued material state from authorized server records; proposals include evidence versions, explicit unscheduled reasons, bounded horizon/task counts and assumptions. Proposals do not create bookings. Unsupported constraints remain explicit (exclusive machine capacity, no split shifts, no duration scaling, and no future PO ETA). Added pure engine and service integration coverage; SCH-08 now reports deterministic readiness. Full Vitest: 82 files / 438 tests passed; production build and typecheck passed; DEMO reconciliation balanced (194 movements / 113 buckets); `git diff --check` passed. Checklist progress is 60/89 (~67%). Reusing the same core for Promise/Recovery, transactional publishing/revalidation, rendered browser journeys and the remaining provider/pilot gates remain open.

**Implementation progress (2026-10-17 Promise connection):** Promise now requires a specific released order and active job, invokes the exact Planning finite-capacity proposal service, and returns a candidate facility-local date only for a complete schedule. Partial or missing constraints return `NOT_CONNECTED` with reasons. The Command Center Promise drawer and Planning workbench now use the API; the fictional machine-family calculation, fixed sample values, and client-supplied AI explanation were removed from this entry point. No customer commitment or booking is written. Full Vitest: 82 files / 439 tests passed; production build and typecheck passed; OpenAPI YAML parsed and `git diff --check` passed. Checklist progress is 63/89 (~71%). Supplier ETA ingestion, component-level readiness display, alternatives, multi-item line allocation, change approval, Promise browser proof, and Recovery connection/application remain open.

**Implementation progress (2026-10-17 Recovery schedule reviews):** Recovery generation now runs the same finite-capacity service as Planning. It saves only COMPLETE schedule snapshots, through `executeCommand` with idempotency, actor/audit, and transactional order/task version rechecks. Incomplete schedules return explicit reasons and are not persisted. The Recovery inbox can select a released order/job and generate a saved review; detail shows task times, resources, versions, and assumptions. Apply remains disabled; no overtime, alternate routing, split shipment, outsourcing, cost or shipment effects are claimed. Focused tests pass 52/52; typecheck, OpenAPI parse and diff-check pass. Final full Vitest passes 82 files / 443 tests, production build and typecheck pass, OpenAPI YAML parses, and diff-check is clean. Plan checkbox progress is 64/90 (~71%); transactional publish validation, additional recovery strategies/application, and browser/provider/pilot gates remain open.

**Promise review UI follow-up (2026-10-17):** The modal now places requested delivery beside projected completion, shows the facility-local date delta, evaluation time/reference and evidence version count, and states that alternatives/customer commitment are outside this estimate. A missing schedule displays no comparison claim. Focused presentation tests pass; final full Vitest is 83 files / 445 tests, typecheck and production build pass, and `git diff --check` passes. Component readiness, capacity evidence detail, alternative strategies and the separate customer change-approval flow remain open.

**Promise quantity and controlled date-request update (2026-10-17):** The Promise contract now requires a decimal quantity string, parses it with the linked UOM precision into integer atoms, and binds it to exactly one active released/in-progress manufacturing order under the selected engineering revision. Partial/different quantities, ambiguous MO links, missing order-line links, and quantities beyond remaining line demand return `NOT_CONNECTED` with null feasibility and no schedule projection. The Promise UI displays the evaluated quantity and can submit a feasible requested date through the existing audited order change-request workflow; this submits for review and does not change the order date. Component evidence now shows task material demand, active reservation amount, and matching approved/partially received supply lines with ETA, labeled as inbound and not allocated to the selected job. OpenAPI, typecheck and diff checks pass; no tests or browser checks run in this continuation. Exact supply-to-demand allocation/receipt readiness, alternatives, and Promise journey proof remain open.

**Recovery date-review action (2026-10-17):** Added `POST /api/intelligence/recovery/{id}/request-date` and a separate “Request projected date review” action for saved schedule reviews. The service recomputes finite-capacity scheduling, rejects stale order/workflow/engineering/task versions or a changed facility-local completion date, and creates an idempotent audited DATE change request transactionally. The action requests human review only; it does not publish resource bookings or mark recovery applied. Typecheck, OpenAPI parse and diff-check pass; no tests/browser checks run.

**Recovery transactional Apply (2026-10-17):** Schedule snapshots now retain technician and machine IDs. Added `POST /api/intelligence/recovery/{id}/apply`; within one `executeCommand` transaction it checks workspace/facility authorization, order and active-instance scope, exact open-task set and versions, dependency timing, material issued/reservation coverage, and current qualifications/published resource availability. It then assigns the tasks, creates confirmed bookings, appends workflow events, and resolves the proposal; any failure rolls back all effects. Historical simulation proposals and old snapshots without resource IDs remain non-applicable. Detail UI now uses a centered confirmation dialog and explains the effects; date review remains separate. OpenAPI and typecheck pass; tests and browser review have not been run in this continuation, so the required rollback/concurrency proof and rendered journey remain open.

**Planning Promise parity (2026-10-17):** Planning's requested-date evaluation now uses the same five-minute review horizon as its finite-capacity preview, and displays requested versus projected date, date delta, exact job quantity, component issued/reserved/unallocated status, RAW snapshot, linked approved PO ETA evidence, and evaluation/version references. A feasible date can be submitted through the existing audited DATE change-request flow; the customer commitment remains unchanged pending authorized review. `npm run typecheck`, OpenAPI YAML parse, and `git diff --check` pass. Tests and browser review were not run per user preference. Exact supplier allocation/receipt readiness and alternate Promise/Recovery strategies remain open.

**Planning schedule-proposal application (2026-10-17):** Added `POST /api/planning/schedule-proposals/apply`. The audited idempotent transaction recomputes the deterministic proposal and requires exact order/workflow/engineering/task versions, schedule windows, and resource assignments from the reviewed snapshot. It rechecks active order/task scope, dependencies, material readiness, qualifications, and current availability, then assigns tasks, records confirmed bookings, and appends workflow events atomically. Planning now has an explicit confirmation step and separates applying assignments from publishing the versioned schedule snapshot. The focused integration test proves stale-version rejection without writes, rollback after an injected mid-apply failure, and successful sequential idempotent retry. Typecheck and diff-check pass; OpenAPI was parsed earlier in this implementation slice. Browser review was intentionally skipped per user request.

**Promise supply evidence and Planning form follow-up (2026-10-17):** Promise now includes supplier name and a direct link to each matching approved PO's detail, while continuing to label remaining PO quantity and ETA as unallocated evidence. Fixed Planning's embedded Promise date check to require and submit the full-job quantity expected by the corrected API. Schedule proposal/recovery horizons now start five minutes ahead to allow review; Recovery Apply rejects slots that have already started. The PO data model has no supply-to-demand allocation relation, so inbound quantity still cannot be counted as job readiness. Typecheck/OpenAPI/diff-check pending; tests and browser review not run by request.

**Command Center visual refinement (2026-10-17):** Added live horizontal production-progress bars for the five latest orders and a severity-mix bar for the current exception inbox, using only dashboard API records and labeling the latter as a snapshot rather than a historical trend. Widened and centered the Ask AI welcome suggestions to reduce unused space. Focused chart tests pass; full Vitest is 84 files / 448 tests, typecheck and production build pass, detector reports no findings for the changed dashboard components, and `git diff --check` passes. Rendered browser review was unavailable because no browser surface remained available in CUA; responsive layout is code-checked but still needs browser proof.

**Verification update (2026-10-17):** The focused assistant, Factory Memory, risk, dashboard and builder-proposal suites pass (21 tests total); typecheck passes. This covers task-context workspace/customer denial, workflow-version/date cohort scoping, risk detail evidence and customer material-risk hiding, and the proposal review contracts. Full suite/build/reconciliation/OpenAPI checks remain to be rerun once implementation is complete. Checklist is 51/86 (~59%).

**Verification refresh (2026-10-17):** Before the latest memory-cohort and task-context slices, `rtk npm test` passed 81 files / 429 tests, build, typecheck, OpenAPI YAML parse, DEMO reconciliation (194 movements / 113 buckets balanced), and diff check passed. New focused tests pass for Factory Memory cohort filters and assistant TASK context (9 tests total); typecheck passes after those changes. Production-server HTTP smoke returned 200 for `/ai` and `/orders/intake`; browser accessibility-state inspection timed out, so this is route/SSR reachability evidence only, not a rendered browser journey. The local server was stopped. Checklist progress is now 49/86 (~57%). A final full verification pass remains required after implementation changes.

**Latest continuation (2026-10-17):** Completed task-scoped Ask AI, factory-memory cohort constraints, evidence-backed risk detail, more legible form/workflow proposal review, and an honest planning-sequence limitation label. Promise and recovery generation now return explicit `NOT_CONNECTED` instead of assumed feasibility; recovery UI and capability status say generation/apply are disabled while saved historical proposals remain reviewable. Full Vitest passed 81 files / 431 tests before the final recovery containment edits; post-edit focused containment and saved-proposal tests passed 40/40, latest typecheck passed, OpenAPI YAML parsed and `git diff --check` passed. Latest production build, full regression rerun, and reconciliation are pending. Checklist is 55/89 (~62%); authenticated browser/accessibility journeys, provider/pilot decisions, real finite-capacity proposal engine, and transactional recovery application remain open.

**Final local verification (2026-10-17):** Typecheck and production build pass after the final Planning UI edit. Full suite: 81 files / 432 tests. Reconciliation: DEMO 194 movements / 113 buckets balanced. OpenAPI YAML parsed and diff check passed. Checklist: 58/90 (~64%). Full constraint-validated schedule/Promise/recovery generation and application, visual inference/pilot, and rendered multi-role browser/accessibility evidence remain open or owner-gated.

**Follow-up verification (2026-10-17):** Full Vitest passed 81 files / 432 tests; production build and typecheck passed; OpenAPI YAML parsed; DEMO reconciliation balanced (194 movements / 113 buckets); diff check passed. Then added the disabled Generate schedule proposal affordance in Planning; run typecheck/build once more to close that small UI-only delta. Checklist is now 57 checked items; external provider/pilot and actual rendered browser/accessibility evidence stay open.

## Sources and verified baseline

- `docs/product_rev/CoreOS_Feature_Breakdown_v1.xlsx`: Feature Backlog rows 70–76 (AII), 49–51 (SCH-07–09), 79 (CST-03); Acceptance Tests AC-14/15; Overview principle 05; Decisions D-05; Release Plan R1–R3.
- `docs/product_rev/CoreOS_PRD_v1.docx`: navigation includes CoreAI; intelligence capabilities, evidence, human approval, and observability requirements.
- `docs/product_rev/CoreOS_BRD_v1.docx`: intelligence readiness, feasible promises, recovery governance, and manufacturing validation boundaries.
- `docs/DESIGN.md` and `docs/superpowers/specs/2026-10-15-manuos-ui-restoration/visual-contract.md`: the later visual contract and AGENTS.md override older sidebar widths and CRUD drawer defaults.
- `docs/superpowers/plans/2026-10-16-product-rev-completion.md`: parent scope, especially phases 9, 10, 11, and 12. Its checked implementation items require source and UI revalidation; several current services still contain prototype assumptions.
- Current source audit: `src/lib/master-navigation.ts`, `src/lib/route-metadata.ts`, `src/components/modal-manager.tsx`, AI/intelligence routes and services, and the integration suites named below. This is source evidence, not fresh browser/provider/pilot proof.

### Current gaps

| Capability | Current evidence | Required correction |
| --- | --- | --- |
| AII-01 Assistant | Workspace drawer calls `/api/ai/brain-qa`; label is Ask ManuOS | Explicit AI entry, contextual questions, navigable authorized evidence |
| AII-02 Risk | Dashboard exceptions and impact service exist | Searchable risk inbox with causes, affected records, and relevant actions |
| AII-03 Document extraction | Text extraction endpoint and demo intake exist | Real upload/text review page, provenance, master matching, reviewed draft handoff |
| AII-04 Promise | Evaluation endpoint exists | Replace first-template, pooled-stock, fixed-capacity assumptions before displaying feasibility |
| AII-05 Memory | History endpoint exists | Exclude invented actual durations; expose comparable measured evidence and coverage |
| AII-06 Recovery | Scoped proposal history, rejection, schedule review, date request, and transactional schedule Apply | Verify rollback/concurrency and rendered lifecycle; add supported alternatives only when approved operational evidence exists |
| AII-07 Vision | Inspection photo evidence exists; anomaly workflow absent | Assisted analysis draft with human adjudication and a separately validated inference adapter |
| SCH-07 Recommendations | Recommendation service exists without operational route/client | Ranked eligible candidates in assignment UI, authenticated API, final server recheck |
| SCH-08 Optimization | Schedule endpoint and engine exist | Reviewable proposal screen and complete constraint validation; no automatic publication |
| SCH-09 Scenarios | Impact/recovery foundations exist | Nonmutating comparison backed by versioned constraints and controlled application |
| CST-03 Cost intelligence | Order costing summary exists | Evidence-based variance explanation, coverage and currency integrity |

## Design decision and boundaries

Use **one CoreAI sidebar entry plus contextual actions**. Seven separate sidebar entries would make navigation longer; changing labels alone would leave inaccessible tools and incorrect outputs. A hub provides discovery while contextual actions keep users inside their work.

### Routes and entry points

All routes below are planned unless explicitly listed as existing. Only add enabled navigation links when the destination works for that user.

| Surface | Purpose | Contextual entry |
| --- | --- | --- |
| `/ai` | CoreAI hub: available tools, real risk preview, capability state | Sidebar CoreAI, dashboard AI entry |
| `/ai/assistant` | Full conversation using shared workspace assistant component | Global Ask AI button; existing drawer remains quick access |
| `/ai/risks` | Risk list and evidence drilldown | Dashboard at-risk metric, order risk action |
| `/orders/intake` | Uploaded RFQ/text extraction and engineering review | Order Hub Import RFQ; New order secondary action |
| `/ai/promise` | Candidate delivery evaluation | Order detail and New order Check promise |
| `/ai/memory` | Similar measured jobs and duration evidence | Engineering review, order and planning detail |
| `/ai/recovery` | Saved proposal queue and history | Order/risk/planning Compare recovery action |
| `/ai/recovery/[id]` | Refresh-safe proposal detail and comparison | Queue row; optional read-only contextual drawer |
| Existing Planning page and assignment modal | Recommended technicians and schedule preview | Assign resources; Generate schedule proposal |
| Existing order Costing tab | Explain variance with source records | Explain variance action |
| Existing inspection detail | Assisted image analysis and human review | Analyze image on an authorized stored attachment |

Use `/ai` as the common active sidebar parent. Give child routes explicit titles in `src/lib/route-metadata.ts`; do not let them all become “CoreAI detail.” Register the sidebar item in both the exported nav items and the functional group paths in `src/lib/master-navigation.ts`.

### Shared UI contract

- Light theme, semantic tokens, typed icon facade, PageHeader, Panel, DataTable, Badge, EmptyState, ErrorState, Button, FormField, shared Select and DatePicker.
- Exactly one AuthenticatedShell owned by the workspace layout. Pages contain page content only.
- Full intake/authoring is a page. Add/edit/apply confirmation forms use centered modal dialogs. Contextual evidence and read-only recovery inspection may use drawers.
- English sentence-case product copy, consistent with the current design system. Clearly label AI answer, Record summary, Estimate, Insufficient data, Needs review, and Applied.
- Every tool has loading, empty, denied, provider unavailable, validation failure, stale result, and retry states where applicable. Preserve user inputs on recoverable errors.
- No decorative intelligence score, fake counters, seeded customer/order defaults, fabricated capacity, or invented accuracy percentages.
- Hub configuration state is server-derived and contains no secrets. Page availability, engine readiness, and release/pilot readiness are separate concepts.
- Query keys include workspace/membership scope and relevant filters; clear sensitive cached results on workspace change. No provider request on hover or page prefetch.
- Deep links carry identifiers only; the server resolves and authorizes order/job/item/inspection context. Never trust client actor, tenant, qualification, quantity, or cost claims.

## Phase 0 — Reconfirm contracts and capability readiness

**How this serves the primary goal:** Prevent the new UI from exposing demo-only tools or presenting prototype calculations as operational truth.

**Files/patterns:** `src/components/modal-manager.tsx:25–30`; `src/lib/master-navigation.ts`; `src/lib/route-metadata.ts`; `contracts/openapi.yaml`; `src/server/auth/permissions.ts`; permission catalog and runtime permission matrix used by access administration.

- [x] Record the actual branch and dirty AI-related files before implementation; preserve concurrent changes. Baseline `5be2ffc`, branch `main`; initial local URL and schema state were not established.
- [x] Map each capability to its actual page, route, service, permission, return envelope, and tests. The matrix below records remaining gaps explicitly.
- [x] Verify permission codes against the real catalog. Cost permissions are catalog entries assigned to OWNER only; capability filtering uses real permission codes rather than role names. Cost read denial is covered by integration test.
- [x] Define a server-side capability registry for the hub: authorized visibility, available page, engine configured, and explicit reason when an authorized user cannot run a tool. Do not disclose internal configuration to unauthorized roles.
- [x] Document the capability registry and dashboard endpoints in OpenAPI with their current envelopes, auth boundary, nullable fields, and readiness/exception values. Other planned endpoints remain open.
- [x] Add a dated cross-reference to this plan in the parent completion plan. Earlier phase checkmarks are retained as historical work; the note distinguishes this UI remediation and its still-open gates.

**Verification:** Every workbook ID in scope has an owner phase, screen, API decision, and acceptance case. No invented existing methods or unregistered permission codes. OpenAPI parses.

**Guards:** Do not apply the reference SQL wholesale, remove the workspace modal guard globally, or import demo graph-store state into operational screens.

## Phase 1 — Make CoreAI visible and navigable

**How this serves the primary goal:** Users immediately see where AI lives and which tools they can use.

**Modify:** `src/lib/master-navigation.ts`, `src/lib/route-metadata.ts`, `src/components/topbar.tsx`, `src/components/floating-copilot.tsx`, dashboard AI entry, and scoped styles in `src/app/globals.css`.

**Create:** `src/app/(workspace)/ai/page.tsx`, `src/features/intelligence/components/CoreAIHub.tsx`, and server capability registry/client contract files under the existing intelligence module/feature boundaries.

- [x] Add a CoreAI sidebar destination using the existing typed `brain` icon and permission filtering. Keep existing functional groups and shell ownership.
- [x] Change visible global launcher copy to Ask AI; name the destination ManuOS AI/CoreAI consistently. Preserve Cmd/Ctrl+J and accessible names.
- [x] Build the hub with a compact introduction, available tools, a real dashboard-exception preview, and a direct link to the existing Workflow Studio. Preview is limited to the dashboard's current exception set; no complete risk count is shown.
- [x] Add a protected `GET /api/intelligence/capabilities` because the client hub loads role-filtered readiness dynamically.
- [x] Show authorized-but-unconfigured tools with a concrete setup/prerequisite explanation. Do not add sidebar links to unfinished pages or generic Unavailable dialogs.
- [x] Add explicit metadata for each implemented child route and direct-link support after refresh.

**Verification:** Extend `src/lib/master-navigation.test.ts` for owner, planner, engineer, technician, and customer visibility; verify active parent and route titles. In a browser, CoreAI and Ask AI are visible at desktop and mobile widths, and every enabled hub action reaches its intended flow.

**Guards:** No seven-item sidebar expansion, new shell, demo persona authority, or automatic model calls when the hub loads.

## Phase 2 — Share the assistant and build risk drilldown

**How this serves the primary goal:** The most accessible AI tool explains current work and lets users follow its evidence to a real record.

**Existing APIs:** `POST /api/ai/brain-qa` with `{ question }` returns `{ data, explanation }`; `GET /api/intelligence/dashboard`; `POST /api/intelligence/impact`.

**Modify:** `src/features/brain/workspace-brain-drawer.tsx`, `src/server/ai/brain.ts`, `src/server/modules/intelligence/grounded-brain.ts`, `src/server/modules/intelligence/dashboard.ts`, dashboard and order detail contextual actions.

**Create:** assistant and risks workspace pages; shared conversation/evidence components; `src/features/intelligence/api.ts` and hooks; `src/server/modules/intelligence/risks.ts`; authenticated risk list/detail routes.

- [x] Reuse the existing operational conversation in both the drawer and assistant page, preserving cancellation, pending state, retry, membership reset, and SUCCESS versus FALLBACK labeling.
- [x] Extend the question request with optional validated record context `{ type: 'ORDER' | 'ITEM' | 'TASK', id }`. Each type is server-resolved; existing question-only clients still work.
- [x] Return typed evidence references with authorized record identity, label, and supported destination. The server maps only verified order/item/task tokens to internal links; the assistant renders links and keeps unmapped verified tokens as badges.
- [x] Add `GET /api/intelligence/risks` with search, severity/type filters and server pagination, and `GET /api/intelligence/risks/[id]` for current-scope source resolution. Coverage remains explicitly incomplete because order-derived sources are limited to the dashboard's latest 50 orders.
- [x] Risk detail shows cause, observation time, affected order/job/task/material demand, source evidence, missing data, and permitted next actions for the supported dashboard exception types. Internal material evidence is hidden from customer principals.
- [x] Define dashboard risks as derived, with deterministic identifiers and no acknowledge/resolve mutation.
- [x] Add contextual Ask AI on order detail with visible selected order context and a clear action. Context is re-resolved against the authenticated principal; no cost evidence is added.
- [x] Add task-context launch and server resolution for planning-authorized users and technician-only principals assigned to that task. Task references become typed links to task detail; cross-customer scope is covered by integration test.

**Verification:** Extend `tests/integration/ai-context.test.ts` and `tests/integration/impact.test.ts`; add risk list/detail tests for scope, pagination, count consistency, and missing evidence. Browser: launch, ask, follow evidence, retry provider failure, switch workspace without stale answers, open a risk from dashboard.

**Guards:** Record summaries are not AI success; missing facts remain missing; customer users cannot open internal risk/people/cost records.

## Phase 3 — Deliver real RFQ/document intake and review

**How this serves the primary goal:** Sales and engineering can find extraction from their normal order workflow and turn reviewed facts into a draft.

**Existing patterns:** `src/app/api/ai/extract-rfq/route.ts` accepts `{ rfqText }` up to 20,000 characters and can return `aiResult:null`; `src/server/modules/engineering/copilot.ts`; document upload/download services; order draft creation; builder proposal review components.

**Create:** `/orders/intake`, `src/features/intake/components/IntakeWorkbench.tsx`, typed intake client/hooks, extraction/review contracts and service under engineering, and routes for saved extraction/review if no suitable proposal aggregate exists.

- [x] Complete the text-only source, extracted fields/questions, review-save, and order-draft handoff workflow. Uploaded documents and line-level citations remain open.
- [x] Add Import RFQ to Order Hub and an alternate action on New order. The page now persists a review record and links to a new order draft after review.
- [x] Support bounded pasted text first. Authorized stored-document upload, OCR and unsupported file states remain open and are disclosed in the UI.
- [x] Add bounded `POST /api/engineering/intake/extractions` for text only. It never accepts filesystem paths or caller URLs; stored document IDs await the upload slice.
- [x] Persist text SHA-256, model/schema version, original extraction, reviewer edits, unresolved questions and review state in the existing proposal record. Document identity and page/text-span citations remain open.
- [x] Display original text beside editable extracted fields, master-match status, quantity, material, BOM/routing/QC suggestions and questions. Suggestions do not create masters. Confirmed master selection remains in the order draft.
- [x] Ensure the newly used intake path has no deterministic extraction fallback. Provider failure returns unavailable and does not persist a review or order draft.
- [x] Save a reviewed extraction, then attach it atomically to the existing order-draft command with idempotency and audit lineage. Quantity remains subject to the order command's exact decimal/UOM validation.
- [x] Link the created order draft and preserve extraction lineage in the command audit. No automatic document/workflow publication or engineering release.

**Verification:** `tests/integration/engineering-intake.test.ts` covers provider-backed persistence/provenance, review edits, workspace scope, order handoff, duplicate-link guard, and provider unavailable (2/2); `tests/integration/recovery-proposal.test.ts` covers queue/detail scope (4/4). Combined focused run: 6/6. Authenticated browser proof for the new end-to-end RFQ handoff remains open.

**Guards:** Demo intake seeded text and graph-store mutations are not production behavior. Confidential document dispatch requires the configured provider policy; unsupported OCR is disclosed rather than simulated.

## Phase 4 — Make factory memory truthful and usable

**How this serves the primary goal:** Engineers can find genuinely similar work and assess the strength of measured duration evidence.

**Modify:** `src/server/modules/intelligence/memory.ts`, existing memory route, related contracts. **Create:** `/ai/memory`, memory table/detail components and scoped query hooks.

- [x] Keep planned and actual duration separate. Missing measured or planned duration is null and excluded from duration statistics; zero is not substituted with plan duration.
- [x] Define comparable cohorts using available item/process/node/workflow version/facility fields and a completion coverage window. Filters are workspace-scoped before cohort statistics and pagination; focused integration verifies workflow-version isolation and bounded date coverage.
- [x] Exclude duplicate/reinspection quantities from yield evidence and preserve integer atoms through summaries.
- [x] Extend `GET /api/intelligence/memory` with validated item/department/process/version/facility/date filters and server pagination for evidence runs; cohort statistics are calculated before page slicing.
- [x] Show actual versus planned table, order links, measured-sample coverage and insufficient-evidence state. Unsupported fixed buffer recommendations are removed.
- [x] Treat the current three-run threshold as an explicit provisional rule, not manufacturing validation. The UI discloses the provisional threshold; approved configuration/backtesting remain open.
- [x] Link Similar jobs from order and engineering detail with authorized item context preselected. The scoped filter is restored server-side from the route.

**Verification:** Extend `tests/integration/factory-memory.test.ts` for missing actuals, measured samples, sparse cohorts, version separation, pagination-independent statistics, fractional quantities and tenant isolation. Browser shows unavailable duration and insufficient evidence without fake buffer percentages.

**Guards:** A completed task is not automatically a measured run; missing data cannot become zero or an apparent on-time result.

## Phase 5 — Expose technician recommendations and safe schedule proposals

**How this serves the primary goal:** Planners see explainable eligible choices where they assign work, rather than discovering an unused service in code.

**Existing interfaces:** `TechnicianRecommendationService.recommendTechnicians(principal, input)` in `src/server/modules/planning/recommendations.ts`; `PlanningService.scheduleTasks(principal, rawInput)`; `POST /api/planning/schedule`; existing evaluate/assign/reschedule/published-schedule commands.

**Modify:** `src/features/planning/components/PlanningScheduleView.tsx`, planning client/hooks/contracts/services and `src/engines/schedule.ts`.

- [x] Add `POST /api/planning/technician-recommendations` accepting task ID and ISO slot start/end. Facility is derived from the authenticated principal; requirements are not caller-overridable.
- [x] Normalize and validate time intervals and scope, and reuse the existing service eligibility/rank/capacity-gap DTO for verified skills/certifications.
- [x] Show ranked suggestions inside the existing centered assignment modal. Selecting a candidate fills current controls; Confirm still invokes the existing authoritative assignment command with expected version.
- [x] Label the existing planning output as a dependency sequence estimate and disclose its unsupported finite-capacity constraints; its dates are not presented as a Promise or validated schedule proposal.
- [x] Expose schedule proposals directly in Planning with explicit order/job, derived facility and bounded horizon. Render task/resource/time rows, predecessor links, unscheduled reasons, assumptions, and task/workflow/engineering evidence versions.
- [x] Audit the proposal engine against mandatory workflow requirements, verified skills/certifications, published full-slot availability (shifts/breaks/leave/downtime/bookings), machine class, reserved/issued BOM materials and dependencies. Missing evidence yields UNSCHEDULED; resource capacity is conservatively exclusive and unsupported work remains explicit.
- [x] Use one deterministic scheduling core for preview, Promise and Recovery. Preserve dry-run semantics; applying a reviewed proposal uses an audited command and revalidates current versions/constraints atomically.
- [x] Keep official versioned schedule publication as a separate human action after assignments are reviewed; copy states that this snapshots confirmed bookings and does not change customer delivery commitments.
- [x] Strengthen schedule API contracts: typed request/response, 30-day horizon and 50-task bounds, bounded resource lookup, explicit partial/unscheduled states. The caller cannot override site rosters or facility.

**Verification:** Extend `tests/integration/phase10-r2-finite-capacity.test.ts` and planning assignment tests: multiple simultaneous skills/certificates, expired-mid-slot, break/leave/overnight, occupied resources, capacity greater than one, missing material ETA, parallel dependencies, no feasible candidate, stale selection and concurrent publish. Browser recommendation → select → real assignment; preview never mutates bookings.

**Publish range follow-up (2026-10-17):** The Planning form now treats the chosen end date as inclusive through 23:59:59.999 UTC; previously it submitted midnight and silently excluded most bookings on that date. The modal now states that publishing snapshots confirmed bookings and does not change customer delivery commitments. Unit coverage verifies inclusive end-of-day and rejects invalid/reversed ranges; typecheck and diff-check pass. Browser review remains with the user.

**Guards:** Human approval cannot waive mandatory qualification. Do not label dependency-only scheduling as optimized capacity or silently default missing durations.

## Phase 6 — Replace Promise assumptions and connect its page

**How this serves the primary goal:** Sales can evaluate a candidate delivery date using the actual requested product and capacity, with honest uncertainty.

**Depends on:** Phase 5's validated deterministic scheduling contract. UI layout/form work can proceed earlier, but authoritative feasibility cannot ship ahead of its data corrections.

**Modify:** `src/server/modules/intelligence/promise.ts`, `promise-contracts.ts`, `/api/intelligence/promise`, OpenAPI. **Create:** `/ai/promise`, Promise workbench and typed client/hooks.

- [x] Remove legacy false-positive Promise output while the selected routing, BOM-specific material state and validated finite-capacity result are disconnected. Return null feasibility values and explicit missing inputs; disable the old explanation route instead of asking a model to explain client-supplied claims.

- [x] Scope evaluation to one explicitly selected released order and active job. The result is labeled as that job's estimate; no workspace-default routing lookup is used. A new-order quote and multi-item shipment allocation remain unsupported.
- [x] Accept decimal display quantity as a validated string and convert through quantity helpers. Align client, DTO and service contracts; serialize atoms as strings. Bind feasibility to exactly one selected MO and reject partial/different quantities as NOT_CONNECTED until duration scaling is supported.
- [x] Match component requirements to task-linked issued/active-reserved demand and show same-item approved supply ETAs as unallocated evidence. Exact supply-to-demand allocation and receipt readiness remains open. Pooled RAW stock, unrelated PO, fixed shortage buffer, 480-minute blanket capacity, default process durations and named fictional bottlenecks remain excluded.
- [x] Evaluate against the same published calendars, current bookings, resources, workflow requirements, materials, and hard constraints as schedule proposals. Return a candidate date only for a complete schedule; otherwise return missing constraints and unscheduled reasons.
- [x] Return evaluation identity/hash, evaluated time, input scope, task/workflow/engineering evidence references and assumptions. Alternative strategies and evidence-backed coverage are still unmodeled.
- [x] UI shows requested versus candidate date, bottleneck, component readiness, capacity evidence and missing inputs. Alternative strategies remain open. Existing customer promise remains separate from this estimate.
- [x] A user choosing a feasible evaluated date can submit it through the existing controlled DATE change-request flow. Submission remains pending review; evaluation never mutates the order date or committed promise.

**Verification:** Extend `tests/integration/promise.test.ts`: wrong-product routing, unrelated RAW/PO, reserved stock, fractional demand, no released routing, calendar/qualification conflict, partial shipment assumptions, bounded runtime and insufficient history (AC-14). Browser checks estimate, opens evidence, changes inputs, sees old result marked stale, and reviews any requested date change separately.

**Guards:** Do not reuse `src/features/promise/promise-modal.tsx` client feasibility as authority. An unresolved constraint is not a feasible promise.

## Phase 7 — Complete recovery discovery, lifecycle and controlled application

**How this serves the primary goal:** Users can reopen and compare recovery proposals, then apply only supported, current, explicitly approved actions.

**Existing:** `src/features/recovery/recovery-studio.tsx`, `api.ts`; recovery service/contracts; schedule review, Apply, date-request and rejection routes. Legacy tranche simulations still deliberately cannot be applied because they have no real shipment-allocation command.

- [x] Add scoped paginated `GET /api/intelligence/recovery`, `GET /api/intelligence/recovery/[id]`, and `POST /api/intelligence/recovery/[id]/reject`; validate payloads and authorize within workspace scope.
- [x] Build `/ai/recovery` and saved proposal detail using real order/line/job context. Queue/detail use real scoped saved records; historical proposal snapshots are labeled as simulation-only.
- [x] Keep the legacy recovery narrative endpoint disabled; require an explicit released order/job for the proposal route, and return `NOT_CONNECTED` without persistence when the finite-capacity result is incomplete.
- [x] Save complete schedule reviews through an idempotent audited command with proposer, order/task/workflow/engineering versions, facility scope, assumptions and task-level resource/time evidence. Transactionally recheck order/task versions before saving; the detail page remains review-only.
- [x] Allow a current schedule review to submit its projected local completion date as an idempotent DATE change request after refreshing capacity and rechecking saved versions/date; keep this distinct from recovery Apply.
- [ ] Generate additional options from Phase 5/6 constraint results. Compare overtime, routing, split batch and outsourcing only where approved data/configuration supports them; the saved schedule review is not labeled as one of these alternatives.
- [ ] Persist additional recovery option effects and scoped atom tranches only when supported by approved routing, shipment and cost data.
- [ ] Extend whole-order/safe-range simulation to line/job atom quantities before claiming fractional or multi-item recovery. Show explicit current scope limits until that extension passes tests.
- [ ] Render side-by-side option consequences: schedule changes, required approvals, customer promise impact, QC-accepted stock allocation, and evidenced cost; unavailable costs stay unavailable.
- [ ] Implement supported application commands inside a single transaction, using transaction-aware domain handlers rather than nested independent transactions: resolve persisted proposal/option, authorize, revalidate all hard constraints and versions, reserve/reassign actual resources or eligible shipment quantities, audit, notify, and mark applied.
- [x] Enable Apply only for schedule reviews with persisted resource IDs; apply task assignments and confirmed resource bookings transactionally after revalidation. Legacy simulation and old resource-less snapshots remain non-applicable. A date-change request alone does not count as applied recovery.
- [x] Use centered rejection and Apply confirmation dialogs; refresh after successful commands and show resolution time and note.

**Verification:** Existing tests cover complete versus incomplete schedule review, idempotent persistence, audit and no booking writes for proposal generation. Apply transaction rollback/concurrency, stale availability, cross-tenant access, and actual booking effects still need integration coverage and were not run in this continuation. Browser review/rejection/apply journeys remain open.

**Guards:** Do not remove the existing unconditional rejection until actual effects are implemented and proven. No fixed scenario percentages or client-authoritative quantities/dates.

## Phase 8 — Add evidence-based cost variance explanations

**How this serves the primary goal:** Owners can see why a job deviated from budget using the existing Costing tab, without an invented margin claim.

**Existing:** `src/server/modules/costing/service.ts`; `GET/POST /api/orders/[id]/costing`; costing section in `src/features/orders/components/order-detail.tsx`.

- [x] Add an Explain variance action and structured category/source-record breakdown in the Costing tab. Reuse existing standard/actual summary and integer minor-unit values; the explanation is deterministic and does not infer revenue/margin.
- [x] Correct foundation gaps before explanation: verify order existence and scope, prevent caller body overriding route order ID, validate task ownership, separate currencies, and distinguish missing cost/rate coverage from measured zero.
- [x] Add `GET /api/orders/[id]/costing/explanation` backed by deterministic ranked variance contributors, source-entry IDs, order evidence links, coverage and explicit unavailable reasons. No model narration or unsupported financial values are used.
- [x] Require the catalog-backed cost permission at route, service and UI boundaries. Never expose internal cost evidence through customer assistant answers or portal routes.
- [x] Use the label Cost variance when revenue/margin evidence is absent. Actual margin leakage requires authorized revenue and cost basis; missing revenue is a disclosed limitation, not a zero-margin assumption.

**Verification:** Extend `tests/integration/phase11-r2-costing-customer.test.ts` for integer math, currencies, missing versus zero, route/body order mismatch, task scope and denied cost access. Browser explanation figures reconcile to displayed ledger categories and open authorized evidence.

**Guards:** No floating-point financial calculations, invented rates, cross-currency sum or confident favorable result from missing actual costs.

## Phase 9 — Define and implement assisted visual QC as a gated workflow

**How this serves the primary goal:** QC sees a real assisted-review capability inside inspections, with clear readiness and human authority.

**Existing pattern:** `src/features/quality/components/InspectionDetailView.tsx` persisted per-check attachment flow; DocumentService; authoritative QC disposition/finalize commands.

- [x] Show a clearly explained capability state in CoreAI and inspection detail. Inspection detail says no inference adapter is connected, keeps manual QC available, and lists pilot prerequisites; photo upload is not presented as AI analysis.
- [ ] Define the pilot inspection scope, supported defect classes, camera/image requirements, provider policy, retention, human reviewer role, labeled holdout set and agreed false-accept/false-reject limits. Record owner decisions; no model or threshold is invented by the implementer.
- [ ] Implement a server inference adapter against the chosen documented provider/model. Accept stored document and inspection/check IDs, verify scope/MIME/size, bind image hash, model version, observations and uncertain regions to an immutable analysis run.
- [ ] Add `POST /api/quality/inspections/[id]/image-analyses`, scoped retrieval, and an idempotent human-review command. Store suggested finding, accepted/rejected reviewer decision, note, actor and time separately from final QC disposition.
- [ ] UI displays the original image, accessible observation list, optional region overlays, uncertainty and reviewer controls. Persist decisions; keep manual inspection available on inference failure.
- [ ] Final QC remains an explicit existing authorized command, with quantity conservation and required measurements/evidence. A model response cannot release stock or finalize inspection.
- [ ] Enable the assisted analysis action only after configured inference and workflow tests pass. Declare production validation separately using the labeled manufacturing holdout and agreed owner criteria.

**Verification:** Tests for unauthorized image/inspection, changed attachment hash, unsupported file, timeout, replay, human rejection, version trace and no autonomous QC release. Browser stored image → analysis → human review → persisted inspection. Report measured holdout performance separately from local workflow correctness.

**Guards:** No autonomous QC, fabricated industrial accuracy, unapproved document dispatch, or silent camera/retention policy assumptions. This phase is a real R3 dependency, not a cosmetic UI checkbox.

## Phase 10 — Polish existing AI authoring and remove operational dead ends

**How this serves the primary goal:** Existing AI tools become discoverable and consistent without duplicate implementations or demo shortcuts.

**Modify:** form/workflow definition editors, `src/features/builder-proposals/components/generation-panel.tsx`, `proposal-review.tsx`, `src/components/modal-manager.tsx`, CoreAI hub and contextual actions.

- [x] Give draft form/workflow editors a visible Draft with AI action and useful examples. Preserve manual editing, read-only released versions, expected-revision validation and review-before-apply.
- [x] Present generated form fields and workflow steps as a readable diff/preview before raw JSON. Display assumptions, validation failures and concrete apply effects using existing proposal contracts.
- [ ] Route operational entry points to the new real pages/components. Keep demo-only promise, intake and memory isolated; do not broaden the modal allowlist to accidentally expose them.
- [ ] Register explicitly supported read-only contextual drawers with typed data. Remove generic workspace dead ends only when each replacement is real and authorized.
- [ ] Verify all hub links, dashboard actions, order detail links, editor actions and shortcuts. Preserve return context and browser back.

**Verification:** Existing `tests/integration/builder-proposals.test.ts` remains green; verify stale apply, denied edit and published read-only behavior. Browser draft generation → readable review → explicit apply → persistence; scan operational imports for demo-state dependencies.

**Guards:** No second proposal engine, automatic publication, provider key in frontend, or enabled navigation to an unfinished flow.

## Phase 11 — Integrated verification and evidence-backed completion

**How this serves the primary goal:** Establish that users can actually find and use the features, and that UI claims match server and database behavior.

- [x] Run each changed service/contract's focused tests during implementation. Added regression coverage for risk access, missing memory/cost values, currency integrity, and cost idempotency.
- [x] Use `createFactoryFixture()` for isolated integration environments and `afterAll` fixture cleanup. Migration/restore tests operate on disposable copies, not the user's working database.
- [x] Update OpenAPI for every added/changed route and response. Reuse local contracts; no Postman workspace publication is required by this plan. YAML parsed locally; no shared Postman workspace changes made.
- [x] Run final `rtk npm run typecheck`, `rtk npm test`, `rtk npm run build`, `rtk npm run db:reconcile` against a declared nonproduction dataset, and `rtk git diff --check` after implementation edits. Full suite passed 84 files / 448 tests; typecheck/build passed after the Command Center chart edits; the latest DEMO reconciliation remains balanced at 194 movements / 113 buckets; OpenAPI parsed; diff check passed.
- [ ] Execute actual authenticated browser journeys for owner, planner, engineer, QC, technician and customer, with cross-tenant denial tests. Existing scripts named test:e2e run Vitest and do not alone establish rendered browser behavior.
- [ ] Browser checklist: CoreAI discoverability; Ask AI/shortcut; evidence navigation; dashboard risk drilldown; RFQ review/save; memory missing-data state; technician suggestion/assignment; schedule proposal/publish; Promise insufficient-data/valid case; saved recovery lifecycle; cost coverage; configured vision human review; form/workflow proposal apply.
- [ ] Check 1440px desktop, 1024px tablet, 390px mobile and 320px narrow layout, plus 200% zoom. Verify focus/keyboard/Escape/restore, readable evidence, no page overflow and no duplicate shells/copilot hosts.
- [ ] Exercise provider unavailable/timeout/invalid schema, unauthorized and stale contexts, empty evidence, pagination, workspace switch, page refresh and repeated mutation submission. No success banner survives a failed command.
- [ ] Record proof by capability: source/test/browser/database/provider/pilot evidence separately. A blocked provider or pilot leaves its gate open, with exact reason; it does not invalidate already proven UI work or justify a false completion claim.
- [ ] Update the parent completion plan and requirement matrix with actual current status. Do not mark all AI complete from route presence, plan checkmarks or a broad passing suite.

**Acceptance:** Every enabled CoreAI action is reachable, authorized and backed by real records; completed actions survive refresh; unsupported actions explain their prerequisite; no fake operational facts or unsafe application paths are introduced.

## API change checklist

The following are design contracts to implement and document, not claims that endpoints already exist.

| API work | Decision |
| --- | --- |
| Brain question/context/evidence | Extend existing route compatibly; preserve `{ data, explanation }` |
| Capability state | Server page result preferred; one protected GET only if needed by client hub |
| Risk list/detail | Add scoped paginated read routes; reuse deterministic rules |
| RFQ extraction/review/apply | Reuse document and proposal infrastructure; add saved review contract and draft command |
| Memory filters/evidence | Extend existing GET; nullable actuals, measured coverage, pagination |
| Technician recommendations | New validated POST; service already exists; no mutation |
| Schedule proposals | Reuse existing POST; strengthen actual constraints/result contract |
| Promise | Correct existing POST; scope to routing/BOM/constraints; atoms/unknowns explicit |
| Recovery | Add list/detail/reject; harden propose and implement supported transactional approve |
| Cost explanation | Add scoped read endpoint; keep deterministic integer basis |
| Vision | New versioned analysis/review contract after pilot/provider definition |

For new JSON read/evaluation routes use `{ data: ... }` with the existing route/error helpers; mutation responses preserve the existing command receipt contract. Use `requirePrincipal`, catalog-backed permissions, Zod validation, and `executeCommand` for persisted business mutations. Do not return HTTP success as proof that a provider succeeded; expose the actual result status.

## Delivery order and release gates

1. **Visible UI increment:** Phases 0–2. CoreAI discovery, assistant and risk drilldown become usable first.
2. **Engineering/planning increment:** Phases 3–5. Real intake, measured memory and recommended assignment; draft scheduling only after its constraint checks.
3. **Decision tools increment:** Phases 6–8. Promise, saved recovery and cost explanations ship only with their prerequisite backend corrections.
4. **Advanced/consistency increment:** Phases 9–10. Vision remains configuration/pilot-gated; existing AI authoring gains consistent discovery and review.
5. **Completion increment:** Phase 11. Browser/server/data evidence closes individual gates. No feature is labeled production-ready from UI completion alone.

**External decisions, tracked separately:** approved document/provider dispatch policy; manufacturing vision model and labeled validation scope; cohort/backtest thresholds; production release acceptance. Preparation and reversible implementation proceed without waiting for these, while dependent production claims and activations remain explicitly gated.

**Out of scope:** general ERP/accounting, payroll, machine actuation, autonomous qualification/QC/engineering release, a global visual redesign, automatic branding rename, unrelated integrations, commits/pushes/deployment.
