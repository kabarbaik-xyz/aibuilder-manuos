# CoreOS product revision: implementation gap audit

Date: 2026-10-16. Source baseline: branch `feat/product_rev`, commit `cf282ba`.

## Scope and evidence

This audit compares the five files in `docs/product_rev/` with the current Prisma schema, migrations, domain services, route handlers, workspace features, demo boundary and test sources. The product documents call themselves **v1.0 working drafts** dated 16 October 2026. They define **79 capabilities: 36 R0, 24 R1, 12 R2 and 7 R3**. The workbook's `Planned` column describes the proposed backlog; it is not an implementation assessment.

The deliverable is analysis and a [completion plan](superpowers/plans/2026-10-16-product-rev-completion.md). No application code, database data, product source documents or earlier plans were changed. Source inspection establishes behavior and missing contracts; it does not establish deployed behavior, successful browser journeys, safety certification or pilot outcomes.

Source documents read:

| Source | How to locate requirements |
| --- | --- |
| [BRD](product_rev/CoreOS_BRD_v1.docx) | Sections 5–9: release scope, BR-01–BR-17, mandatory policies and G0–G5 pilot gates; sections 10 and 12: unresolved pilot decisions |
| [PRD](product_rev/CoreOS_PRD_v1.docx) | Section 5: stable feature IDs; section 6: qualifications and scheduling; section 8: AC-01–AC-15; sections 10–14: AI, nonfunctional targets, releases and open questions |
| [Feature workbook](product_rev/CoreOS_Feature_Breakdown_v1.xlsx) | All nine sheets: Overview, Feature Backlog, Tech Scheduling, Acceptance Tests, Release Plan, Roles & Access, KPIs & Risks, Data Model, Decisions. Feature Backlog rows 7–85 contain all 79 IDs; columns E/F are release/priority; I is dependency |
| [Database architecture](product_rev/CoreOS_Database_Architecture_Schema_v1.docx) | Domain schema, reference types, transaction validators, migration/operations and phase guidance |
| [SQL reference](product_rev/CoreOS_SQLite_Schema_v1.sql) | Logical entities and overlap triggers; explicitly a reference schema, not a migration to apply to the live database |

Validation performed in this audit: `npm run typecheck` exited 0. No integration suite, browser test, production request, database reconciliation, migration or load test was run. Existing test files are cited as reusable coverage, never as freshly passing evidence. The `tests/e2e/*.spec.ts` files use Vitest, imported route handlers and fixture services; their name alone does not imply browser automation.

Artifact checks: all 79 capability IDs are unique, all capability phase references resolve to the 14 plan phases, local Markdown links resolve, and both new documents have no trailing whitespace. `git diff --check` passed for tracked changes; the new untracked documents were checked directly as well.

## Executive findings

The application has a substantial persistent foundation: Better Auth, workspace RBAC, audited/idempotent commands, published workflow versions, engineering review, atom quantities, inventory ledger, execution sessions, output/QC/rework, shipment lifecycle, customer projections and dynamic forms. The latest documents require extending that foundation rather than replacing it.

The biggest mismatch is **safe resource assignment**, followed by **multi-item production tracking** and **trusted workforce/calendar data**. Sophisticated demo screens and existing intelligence endpoints do not close those operational gaps. R0 cannot be considered complete while assignment overlap is advisory or missing material can still allow execution/output.

### Priority gaps with implementation evidence

| Gap | Requirement | Current evidence | Required result |
| --- | --- | --- | --- |
| G01 — Confirmed bookings can overlap | SCH-02/03; AC-05/06 | `src/server/modules/planning/service.ts:151` and `:203` append booking conflicts to `warnings`; `:215` bases eligibility only on `violations`. `assignTask` evaluates before `executeCommand` at `:235`/`:249`; `repository.ts:127` cancels/recreates bookings without an overlap guard | Hard rejection inside the committing transaction, with concurrent-writer protection and a database backstop for exclusive resources |
| G02 — Qualifications lack verified provenance and full-slot validity | RES-03/04; AC-01/02 | `prisma/schema.prisma:625` stores one level; `:661` has date-string certification validity. `planning/service.ts:98` reads level; `:115` compares expiry with today's date | Supervisor-reviewed skill evidence, scope/revocation/effective dates, and credentials valid for the entire assignment window |
| G03 — Roster/calendar truth is missing from assignment | RES-07/08; AC-03/04 | `prisma/schema.prisma:496`/`:518` provide basic calendar/date exceptions. `planning/service.ts:393` chooses request/default calendar; `src/engines/schedule.ts:134` uses UTC hour/day operations. Resource inputs are accepted but not consumed for finite scheduling | Facility timezone, published shift intervals minus breaks/leave/training/downtime, unknown availability blocked, actual free resource intervals |
| G04 — One order cannot express the new production hierarchy | ORD-02; BR-01 | `prisma/schema.prisma:832` has one `itemId` and `orderedAtoms`; `workflow/instantiate.ts:27` reuses an order-level instance and `:80` creates one manufacturing order/jobsheet | Order → multiple lines → bounded production jobs/batches → pinned workflow/engineering, with line/job quantity accounting through QC and delivery |
| G05 — Tenant exists, facility scope does not | PLT-01/02; RES-01/06 | `Workspace` and composite workspace keys exist at `schema.prisma:93`; `Principal` at `src/server/auth/principal.ts:1` has no authorized facility set; no Facility or WorkCenter model | Multiple facilities under one workspace, explicit access grants and correct resource/operational ownership; no cross-facility write by guessed ID |
| G06 — Execution identity/readiness can be inferred incorrectly | SFL-01/02; MAT-01; SCH-01 | `execution/service.ts:91` falls back to the first active technician. `:111` accepts any one demand with any stock. Assignment can promote PENDING directly at `planning/service.ts:284` | Principal-derived operator, all required prerequisites/material coverage checked at assignment/start, explicit quantity-bound partial-release authority |
| G07 — Output safeguards are incomplete | SFL-03; AC-08; AGENTS arithmetic rules | `execution/output.ts:86` checks cumulative final-task output before transaction. `:205` finds workspace-wide WIP by item; after consumption loop it does not reject positive `remainingToConsume`. `engineering/service.ts:127` converts floating quantities by multiplication/rounding | Per-stage/job WIP ownership, atomic output bounds, no output without required consumption, exact atom/rational arithmetic, rejection of malformed/fractional atom inputs |
| G08 — Evidence/version gates have lifecycle holes | ENG-01/03; WFL-04/06; QLT-01; AC-10 | Engineering snapshots are JSON/BOM records (`schema.prisma:901`), generic documents lack released drawing revision ownership. `forms/completion.ts:24` checks existing instances only; `forms/service.ts:419` creates instances but no release/execution caller was found. QC uses mutable checklist relations (`quality/service.ts:148`) | Pin document/checklist/form versions and materialize mandatory bindings; absence of required evidence must block, not pass as an empty set |
| G09 — Notification and exception ownership contracts are absent | PLT-05; MAT-02; SFL-04 | Audit/events and dashboard-derived exceptions exist; no persisted user inbox, owned blocker lifecycle or photo issue registry in Prisma/routes | Assignment/release/blocker/approval notifications with read state; reason, owner, expected resolution, photo links and closure history |
| G10 — Customer milestones can overstate completion | ORD-03; CUS-01 | `portal/repository.ts:237` marks intake complete without confirmed state and delivery complete when any shipment is delivered. Promise acknowledgement writes directly (`portal/repository.ts`) instead of an audited command | Server-approved visible milestones, estimate labels, fulfillment only when all line balances settle; customer approval writes governed by release policy |
| G11 — Reachable legacy AI endpoints lack scoped authorization | PLT-02; AII-01; PRD §10 | `src/app/api/ai/dispatch-rationale/route.ts:4`, plus explain-impact, partner-fit, recovery-options, promise-explain and memory-recommend handlers accept caller context without principal/permission checks. Dispatch fallback invents Level 4 certification and 94% history at `:49` | Protect or retire every exposed route, derive evidence from scoped server reads, remove fabricated operational fallback claims; shared caches must include authorization scope |
| G12 — Passport output is not safe unit genealogy | QLT-04/05; CUS-03 | `quality/passport.ts:200` fetches the first ten workspace stock movements without order/serial scope; output includes operator/inspector names. Publication at `:341` hashes workspace/serial/time, not immutable evidence | Immediate external redaction/scope containment; later real material/job/serial genealogy, content-addressed immutable publication and explicit shares |
| G13 — Advanced engines do not satisfy their names' new contracts | SCH-07/08; AII-04/05/06; INT-06 | `engines/schedule.ts` ignores resource availability inputs. `intelligence/promise.ts` selects a first workflow and pooled RAW availability. `components/modal-manager.tsx:25` restricts legacy advanced modals to `/demo`; operational UI does not connect those services | Reuse pure helpers, replace assumed capacity/data paths with authoritative constraints, connect authorized UI, require historical coverage and approval checks |
| G14 — Connected/enterprise contracts are missing | ORD-04; ENG-05; SCH-06; CMD-03; CST; INT | No schedule revision, engineering change/NCR approval, job cost, integration outbox, API credential, webhook delivery or offline queue models/routes were found | Incremental R1–R3 implementation with durable state, approved APIs, delivery/replay semantics and real accounting for costs |
| G15 — Production operations and localization are not established | PRD §11; BRD G0–G5 | Backup scripts/runbooks exist, but this audit did not exercise restore. `docs/deployment-runbook.md:99` recommends up to five Cloud Run instances while DB/doc storage use local paths; current UI copy is English and no localization layer was found | Deployment architecture compatible with durable single-writer SQLite, durable file storage, tested restore, measured targets, Bahasa default and facility-aware dates |
| G16 — Runtime DB/event guarantees need enforcement | PLT-03; DB-05/06/10/11 | `src/server/db/client.ts:18` defines SQLite configuration but runtime `getDb`/`createPrismaClient` do not call it; audit/stock triggers exist but workflow event append-only triggers were not found. Command replay reads before transaction and is scoped per principal | Verify actual connection settings, initialize safely, protect immutable events and prove concurrent replay/version semantics rather than assuming the shared wrapper supplies every invariant |

Line references identify the inspected baseline; implementations may move during execution. Read each cited function before copying it. Some cited paths are patterns to extend, while the gaps above are examples to correct.

## Reuse and conflict decisions

1. **Workspace remains the tenant boundary.** Add facilities and grants beneath it. Do not duplicate Better Auth users/sessions or replace workspace RBAC with parallel `tenants/users` tables merely to match reference naming.
2. **Prisma remains the migration owner.** The architecture document's Drizzle examples and standalone SQL are conceptual guidance. Translate needed constraints into reviewed Prisma migrations, preserving existing data, audit triggers, IDs and command receipts.
3. **Quantities stay bigint atoms at 10^6 scale.** Existing `src/domain/quantity.ts` actually exports `parseQuantity(value: string, allowedPrecision = 6): bigint` and `formatQuantity(atoms: bigint): string`; do not assume the broader signatures described in AGENTS are implemented. Keep decimal strings at HTTP/UI boundaries. Resolve reference quantity/measurement/cost scales explicitly. Fix existing BOM Float allowance and number-rounding paths.
4. **Inventory remains double-entry.** New readiness/reservation/genealogy integrates with `postMovement`; do not replace it with mutable material counters or the reference schema's simpler quantity event representation. Existing supply/count functionality is an asset, not a request to expand into a full ERP/WMS.
5. **Centered CRUD modals remain mandatory.** PRD §5 suggests an order drawer, but AGENTS and the visual contract require centered Add/Edit dialogs. Keep the current shell, light tokens, icon facade and shared primitives; use drawers only for contextual inspection.
6. **Explicit state mapping precedes migration.** Existing engineering `APPROVED`, task `RUNNING`/`WAITING_QC`/`COMPLETED` and order `RELEASED`/`DELIVERED` can map to new business terminology where semantics match. A bulk enum rename does not implement CONFIRMED order or published assignment governance. Record mappings and transition authorities first.
7. **Separate safety publication from schedule publication.** R0 manual booking is an atomic, confirmed assignment. R1 adds a versioned whole-plan draft/publish workflow. R0 must not wait for R1 to prevent overlaps or expired credentials.
8. **Reference triggers need adaptation.** SQL lines 1437–1466 reject all same-machine overlaps. This covers exclusive capacity, but not configured machine capacity >1, staffing units, or resource changes. Adapt to the existing polymorphic ResourceBooking schema and enforce units/scope in the service and transaction.
9. **Advanced features stay in their release gates.** Existing demo functionality and early APIs may be retained behind clear boundaries; they do not make R2/R3 production-ready. Security/privacy fixes apply immediately even to features whose completion is later.
10. **Documentation needs a new baseline.** `docs/execution-status.md` simultaneously claims persistence is absent and some milestones complete. Older gap audits are historical. This audit and the new plan supersede their completion ordering for the revised product; refresh status/requirements/API docs during implementation rather than using old percentages as proof.

## Acceptance coverage map

These are source assessments and required future checks, not test results.

| Scenario | Current source assessment | Execution gate |
| --- | --- | --- |
| AC-01 verified required skill | Missing trust state; stored level alone qualifies | Phase 4/5 |
| AC-02 credential covers full interval | Today's date-string check is insufficient | Phase 4/5 |
| AC-03 shift excludes break | Generic continuous shift calculation, no published break intervals | Phase 4/5 |
| AC-04 approved leave | Calendar exceptions exist, not enforced by assignment | Phase 4/5 |
| AC-05 exclusive resource overlap | Warning only | Phase 1 then 5 |
| AC-06 simultaneous conflicting publish | Validation outside write, no booking trigger | Phase 1 then 5 |
| AC-07 released drawing/predecessor/material | Release/start guards partly exist; assignment and all-demand coverage incomplete | Phase 3/5/6 |
| AC-08 WIP quantity bound | Final-task order guard exists; stage/WIP allocation and transaction gaps remain | Phase 1/6 |
| AC-09 rework without inflated acceptance | Rework/reinspection ledger path exists; NCR/activity genealogy incomplete | Phase 6/8 |
| AC-10 active job pinned to prior drawing | Workflow/engineering IDs pinned; file revision lifecycle/change application incomplete | Phase 3/8 |
| AC-11 guessed customer ID | Scoped portal read exists; test documents/passports/multi-line/site projections too | Phase 1/7/13 |
| AC-12 offline duplicate | Command receipts exist; durable offline queue/reconnect conflict handling absent | Phase 9 |
| AC-13 schedule change history/notification | Bookings cancel/recreate; no published schedule revision | Phase 8 |
| AC-14 unsupported ETA | Scoped assistant exists; Promise assumptions and legacy fallbacks need correction | Phase 10 |
| AC-15 approved AI suggestion still gated | Guard shared by manual/intelligence paths is not yet complete | Phase 5/10 |

The workbook places AC-09 in R1; PRD's final checklist names AC-01–AC-11 critical. Preserve the existing quantity-safe reinspection baseline in the R0 gate and require the full linked NCR/rework workflow in R1. Do not silently move all R1 scope into R0.

## Complete capability matrix

Status legend: **Present** = the requested core behavior is identifiable in source, still requiring current release verification; **Partial** = related implementation exists but a specific documented contract is missing; **Missing** = no implementing operational path was found. None of these labels means production or pilot acceptance. File references point to evidence or the nearest existing extension pattern. New route/model names in the plan are proposals.

| ID / capability | Release | Source status | Missing contract / action | Implementation evidence | Plan phase |
| --- | --- | --- | --- | --- | --- |
| PLT-01 — Tenant & facility | R0 / P0 | Partial | Tenant/workspace present; facility ownership, setup and timezone policy missing. | `prisma/schema.prisma:93` | 2 |
| PLT-02 — Users, roles & permissions | R0 / P0 | Partial | Workspace/customer RBAC exists; facility grants and legacy API permission boundaries incomplete. | `src/server/auth/principal.ts:1` | 1,2 |
| PLT-03 — Audit & append-only business events | R0 / P0 | Partial | Audit/command receipts present; workflow event immutability, correction reasons and correlation propagation incomplete. | `src/server/db/transaction.ts:62` | 1,2 |
| PLT-04 — Configurable units & reference data | R0 / P0 | Partial | UOM/order type/calendar catalogs exist; configurable issue reasons, priorities and terminology incomplete. | `src/server/modules/masters/service.ts:31` | 2 |
| PLT-05 — Notifications & inbox | R0 / P0 | Partial | Persisted inbox, unread/read state, command dedupe and ORDER/TASK/INSPECTION entity links exist. Per-event user preferences and durable failure observability remain missing; verify assignment/release/blocker coverage by event and recipient. | `src/server/modules/notifications/service.ts`, `src/components/notification-inbox.tsx`, `src/features/notifications/notification-links.ts` | 2 |
| ORD-01 — Customer & order intake | R0 / P0 | Partial | Persistent single-item intake exists; order confirmation, per-order delivery address/contract and attachment flow incomplete. | `src/server/modules/orders/service.ts` | 3 |
| ORD-02 — Order items & partial jobs | R0 / P0 | Missing | No multi-line order or bounded split job model; one order-level instance is reused. | `src/server/modules/workflow/instantiate.ts:27` | 3 |
| ORD-03 — Order health and milestones | R0 / P0 | Partial | QC/material status exists; customer milestones can overstate intake/full delivery and lack explicit publishing policy. | `src/server/modules/portal/repository.ts:230` | 6 |
| ORD-04 — Change request & revision | R1 / P1 | Missing | No controlled order change request, approval and active-job revision application lifecycle. | `src/server/modules/engineering/service.ts` | 8 |
| ORD-05 — Partial shipment & delivery close | R1 / P1 | Partial | Allocate/dispatch/confirm/POD exists; per-line partial balances, aggregate caps, race safety and QC origin need completion. | `src/server/modules/delivery/service.ts:27` | 8 |
| WFL-01 — Template builder | R0 / P0 | Present | Versioned graphical builder and publish validation exist; retain and verify against new job model. | `src/features/workflows/components/definition-editor.tsx` | 3 |
| WFL-02 — Dependencies and parallel nodes | R0 / P0 | Present | DAG dependencies, parallel branches and cycle validation exist; preserve tested joins. | `src/domain/workflow-definition.ts` | 3 |
| WFL-03 — Versioned workflow instance | R0 / P0 | Present | Instances pin published workflow and engineering versions; extend ownership to production jobs. | `src/server/modules/workflow/instantiate.ts:22` | 3 |
| WFL-04 — Approval & gated transition | R0 / P0 | Partial | Bounded transitions and signoffs exist; drawing release, segregation and missing evidence-instance guards incomplete. | `src/domain/workflow-runtime.ts` | 3,5 |
| WFL-05 — Conditional route and rework loop | R1 / P1 | Partial | Rework attempts/reinspection exist; explicit conditional activity routing and controlled return genealogy incomplete. | `src/server/modules/quality/service.ts:362` | 8 |
| WFL-06 — Custom operation forms | R1 / P1 | Partial | Typed versioned forms, conditions, submissions/corrections exist; binding lifecycle and automatic instance expansion missing. | `src/server/modules/forms/completion.ts:24` | 8 |
| ENG-01 — Technical documents | R0 / P0 | Partial | Generic secure file API exists; drawing family/revision access, released instructions and integrated viewer incomplete. | `src/server/modules/documents/service.ts` | 3 |
| ENG-02 — Routing and standard time | R0 / P0 | Partial | Workflow nodes hold durations/skills/machine class; versioned job routing/work center context incomplete. | `src/domain/workflow-definition.ts` | 3 |
| ENG-03 — Document release & revision | R0 / P0 | Partial | Engineering draft/review/approval and pins exist; separate released file revision and controlled supersession incomplete. | `src/server/modules/engineering/service.ts:221` | 3 |
| ENG-04 — BOM and material requirements | R0 / P0 | Partial | Operation BOM/demands exist; arithmetic precision, line/job ownership and release snapshots need completion. | `src/server/modules/engineering/service.ts:127` | 1,3 |
| ENG-05 — Engineering change impact | R1 / P1 | Missing | No engineering change impact review and authorized application to running jobs. | `src/server/modules/orders/release.ts` | 8 |
| MAT-01 — Material readiness per job | R0 / P0 | Partial | Demand/readiness/reservation projections exist; any-stock start and unowned WIP consumption violate complete coverage. | `src/server/modules/execution/service.ts:111` | 5,6 |
| MAT-02 — Shortage and blocker registry | R0 / P0 | Partial | Shortage projections exist; owned blocker registry with ETA, closure and impact history missing. | `src/server/modules/intelligence/dashboard.ts` | 6 |
| MAT-03 — Reservation and consumption | R1 / P1 | Partial | Ledger-backed reservation/issue/return/consumption exists; task/job allocated WIP and concurrency need hardening. | `src/server/modules/inventory/consumption.ts` | 6,8 |
| MAT-04 — Substitute approval | R1 / P1 | Missing | No engineering-approved substitute/versioned BOM exception command. | `src/server/modules/engineering/service.ts` | 8 |
| RES-01 — Technician profile | R0 / P0 | Partial | Technician identity, active flag, department/calendar exist; employee code, site/team/work center incomplete. | `prisma/schema.prisma:579` | 4 |
| RES-02 — Skill catalog | R0 / P0 | Partial | Skill catalog exists but scale defaults to 5; fixed 0-4 semantics, category/evidence policy incomplete. | `prisma/schema.prisma:607` | 4 |
| RES-03 — Verified technician skill matrix | R0 / P0 | Partial | Single assessed level stored; no claimed/observed/verified status, evidence, validity or revoke lifecycle. | `prisma/schema.prisma:625` | 4 |
| RES-04 — Certification & authorization | R0 / P0 | Partial | Certification assignment/date stored; no scoped full-slot validity, revocation and evidence enforcement. | `prisma/schema.prisma:661` | 4 |
| RES-05 — Skill expiry and reassessment | R1 / P1 | Missing | No reassessment workflow, expiry risk queue or owner notifications. | `src/server/modules/masters/service.ts:1277` | 8 |
| RES-06 — Work center & machine catalog | R0 / P0 | Partial | Machine class/status/calendar exist; facility work centers, compatible scope, capacity units/downtime incomplete. | `prisma/schema.prisma:554` | 4 |
| RES-07 — Shift templates & weekly rosters | R0 / P0 | Partial | Weekly shift JSON exists; published weekly roster/template/break/overnight lifecycle absent. | `prisma/schema.prisma:496` | 4 |
| RES-08 — Availability exceptions | R0 / P0 | Partial | Per-date calendar exceptions exist; approved leave/training/unavailability/downtime intervals not enforced. | `prisma/schema.prisma:518` | 4 |
| RES-09 — Overtime policy and approval | R1 / P1 | Missing | No requested/approved overtime policy, limits or availability effect. | `src/server/modules/planning/service.ts` | 8 |
| RES-10 — Competency gap dashboard | R2 / P2 | Missing | No skill-qualified demand versus eligible capacity dashboard. | `src/server/modules/planning/service.ts` | 10 |
| RES-11 — Technician performance history | R2 / P2 | Partial | Work sessions/output/QC history exists; scoped technician trends and reassessment-safe profile UI incomplete. | `src/server/modules/execution/repository.ts` | 10 |
| SCH-01 — Operations dispatch queue | R0 / P0 | Partial | Schedule/task lists exist; dispatch ready/waiting/blocked truth and prerequisite/material gates incomplete. | `src/features/planning/components/PlanningScheduleView.tsx` | 5 |
| SCH-02 — Manual technician assignment | R0 / P0 | Partial | Assignment mutation exists; full safety gate, operator/time-slot selection and lifecycle incomplete. | `src/server/modules/planning/service.ts:226` | 1,5 |
| SCH-03 — Machine and staff conflict detection | R0 / P0 | Partial | Overlap query exists but only warns; no atomic exclusion, roster/capacity enforcement. | `src/server/modules/planning/service.ts:139` | 1,5 |
| SCH-04 — Capacity board | R1 / P1 | Missing | No qualified daily/weekly capacity board based on actual rosters and bookings. | `src/server/modules/planning/service.ts:376` | 8 |
| SCH-05 — Gantt schedule & drag reschedule | R1 / P1 | Partial | Schedule table/preview exists; Gantt drag/reschedule with guarded commit absent. | `src/features/planning/components/PlanningScheduleView.tsx` | 8 |
| SCH-06 — Schedule draft, publish and revision | R1 / P1 | Missing | No persisted draft/published schedule revisions, acknowledgement and affected-staff notification. | `prisma/schema.prisma:1406` | 8 |
| SCH-07 — Recommended eligible technicians | R2 / P2 | Partial | Legacy ranking helper exists; fixed clock/assumed skills and no authoritative workspace recommendation flow. | `src/engines/dispatch.ts:27` | 10 |
| SCH-08 — Finite capacity scheduling | R2 / P2 | Partial | Precedence/calendar helper exists; resources/bookings accepted but not used by solver. | `src/engines/schedule.ts:172` | 10 |
| SCH-09 — What-if recovery scenarios | R3 / P3 | Partial | Demo recovery scenarios and API skeleton exist; no constraint-safe saved what-if plans. | `src/server/modules/intelligence/recovery.ts:25` | 12 |
| SFL-01 — Mobile task list | R0 / P0 | Partial | Principal-scoped active task list, current-work queue, manual QR/barcode entry, profile and online-only UI exist. No date-filtered Today feed or pinned instruction content exists; authenticated browser/installability evidence is open. | `src/features/execution/components/ShopFloorTaskListView.tsx`, `ShopFloorTodayView.tsx`, `ShopFloorProfileView.tsx`, `src/server/modules/execution/service.ts` | 6 |
| SFL-02 — Start, pause, resume, finish | R0 / P0 | Partial | Start/pause/resume/work-session actor and readiness guards exist; pause reason is catalog-backed. Completion is coupled to output, but structured finish reason and full browser evidence remain incomplete. | `src/server/modules/execution/service.ts`, `src/server/modules/execution/output.ts` | 1,6 |
| SFL-03 — Production quantity log | R0 / P0 | Partial | Ledger-backed per-task output, cumulative caps and proportional BOM consumption exist. Stage input allocation and explicit per-operation good/reject/rework-in/out reporting remain incomplete. | `src/server/modules/execution/output.ts`, `src/server/modules/quality/service.ts` | 1,6 |
| SFL-04 — Issues and photographic evidence | R0 / P0 | Partial | Owned task issue create/resolve/reopen lifecycle, reason, owner, ETA and evidence metadata exist. Workstation accepts evidence URLs; authorized file upload/annotation and browser proof remain incomplete. | `src/server/modules/execution/service.ts`, `src/features/execution/components/ShopFloorWorkstationView.tsx`, `/api/execution/tasks/{id}/issues` | 6 |
| SFL-05 — QR work order scan | R0 / P0 | Partial | Authenticated task/order/job and item barcode lookup plus manual entry/open flow exist with permission-scoped task disclosure. Real device camera scanning and browser/mobile journeys remain unverified. | `src/server/modules/execution/service.ts`, `src/features/execution/scan-routing.ts`, `src/features/execution/components/ShopFloorTaskListView.tsx` | 6 |
| SFL-06 — Offline queue and idempotent sync | R1 / P1 | Missing | Server command replay exists; durable offline queue, conflict review and reconnect lifecycle absent. | `src/server/db/transaction.ts:79` | 9 |
| QLT-01 — Inspection checklist & measurements | R0 / P0 | Partial | Checklist/results and required-check presence exist; pinned QC plan, numeric bounds/readings/evidence incomplete. | `src/server/modules/quality/service.ts:148` | 6 |
| QLT-02 — Accepted quantity and QC release | R0 / P0 | Partial | Exact QC split and held-stock disposition exist; per-job acceptance, concurrency and release ancestry need proof/hardening. | `src/server/modules/quality/service.ts:115` | 6 |
| QLT-03 — NCR and rework | R1 / P1 | Partial | Rework/reinspection ledger exists; NCR cause/owner/corrective action/closure and linked operations absent. | `src/server/modules/quality/service.ts:362` | 8 |
| QLT-04 — Lot, batch and serial genealogy | R1 / P1 | Partial | Lots/serials/movements exist; explicit material-to-output genealogy and split/merge/rework trace incomplete. | `prisma/schema.prisma:1118` | 8 |
| QLT-05 — Digital product passport | R3 / P3 | Partial | Passport API/page exists; incorrect material scope, PII and mutable non-content digest prevent acceptance. | `src/server/modules/quality/passport.ts:89` | 1,12 |
| CUS-01 — Read-only customer order milestones | R0 / P0 | Partial | Customer ownership projection exists; milestone truth, share policy and read-only R0 boundary need hardening. | `src/server/modules/portal/service.ts:27` | 6 |
| CUS-02 — Customer approvals | R1 / P1 | Partial | Promise acknowledgement exists; not audited command or drawing/change approval identity lifecycle. | `src/server/modules/portal/service.ts:54` | 8 |
| CUS-03 — Documents and shipment details | R1 / P1 | Partial | Visible document links, shipments/POD summaries exist; per-release sharing, line balances and redaction incomplete. | `src/server/modules/portal/repository.ts` | 8 |
| CUS-04 — Customer change requests | R2 / P2 | Missing | No customer request submission/engineering review workflow without direct plan mutation. | `src/server/modules/portal/service.ts` | 11 |
| CMD-01 — Operations overview dashboard | R1 / P1 | Partial | Real dashboard exists; bounded counts, utilization assumptions and legacy deep links need correction. | `src/server/modules/intelligence/dashboard.ts:56` | 9 |
| CMD-02 — Exception inbox | R1 / P1 | Partial | Derived overdue/material exceptions exist; absent qualifications, roster conflicts, owned action lifecycle incomplete. | `src/server/modules/intelligence/dashboard.ts` | 9 |
| CMD-03 — Baseline operational KPIs | R1 / P1 | Partial | Basic counts/FPY display exist; workbook KPI denominators, initial-pass isolation, completeness and baselines missing. | `src/app/(workspace)/dashboard/page.tsx` | 9 |
| AII-01 — Production-context assistant | R1 / P1 | Partial | Scoped read-only workspace Brain exists; strict citations, richer scoped evidence, durable runs/feedback/evals incomplete. | `src/server/ai/brain.ts` | 9 |
| AII-02 — Risk rules and explanation | R1 / P1 | Partial | Deterministic ripple/overdue rules exist; evidence-backed live constraint risks and coverage labels incomplete. | `src/server/modules/planning/impact.ts` | 9 |
| AII-03 — RFQ/document extraction draft | R2 / P2 | Partial | RFQ text extraction/copilot draft exists; trusted uploaded-file ingestion and reviewed provenance incomplete. | `src/server/modules/engineering/copilot.ts` | 10 |
| AII-04 — Promise Engine | R2 / P2 | Partial | Promise API prototype exists; arbitrary routing/pooled material/fixed capacity cannot establish feasible date. | `src/server/modules/intelligence/promise.ts:26` | 10 |
| AII-05 — Factory memory and similar jobs | R2 / P2 | Partial | Historical task query exists; planned duration substituted for actual and mixed cohorts undermine benchmarks. | `src/server/modules/intelligence/memory.ts` | 10 |
| AII-06 — Recovery copilot | R3 / P3 | Partial | Recovery propose/approve API exists; proposal not persisted and approval trusts client quantities/dates. | `src/server/modules/intelligence/recovery.ts:132` | 1,12 |
| AII-07 — Camera-assisted visual QC | R3 / P3 | Missing | No camera anomaly model, human adjudication or manufacturing validation protocol. | `src/server/modules/quality/service.ts` | 12 |
| CST-01 — Estimated standard job cost | R2 / P2 | Missing | No standard material/labor/machine/outsourced job budget with rate versions/currency. | `prisma/schema.prisma` | 11 |
| CST-02 — Actual vs estimated variance | R2 / P2 | Missing | No actual job cost ledger or estimate/actual variance projection. | `prisma/schema.prisma` | 11 |
| CST-03 — Margin leakage explanation | R3 / P3 | Missing | No evidence-backed margin variance explanation. | `src/server/ai/brain.ts` | 12 |
| INT-01 — Public API and inbound import | R1 / P1 | Partial | Internal session APIs/OpenAPI exist; versioned external credentials/scopes and validated inbound import absent. | `contracts/openapi.yaml` | 9 |
| INT-02 — Outbound webhooks | R1 / P1 | Missing | No signed tenant-scoped transactional outbox, retry/backoff/dead letter/replay delivery. | `src/server/db/transaction.ts` | 9 |
| INT-03 — Email/WA notification connectors | R2 / P2 | Missing | No opt-in email/WA connectors, secret/config lifecycle or delivery logs. | `prisma/schema.prisma` | 11 |
| INT-04 — HRIS/absence integration | R2 / P2 | Missing | No HRIS import/mapping/source precedence, absence reconciliation or audit. | `src/server/modules/masters/service.ts` | 11 |
| INT-05 — IoT machine telemetry | R3 / P3 | Missing | No optional telemetry ingestion, dedupe/late event rules or manual fallback reconciliation. | `src/server/modules/planning/service.ts` | 12 |
| INT-06 — Cross-factory subcontract exchange | R3 / P3 | Partial | Consent-filtered demo matching exists; no server partner consent/deal/contract/reservation/receipt lifecycle. | `src/engines/network.ts` | 12 |

Triage counts (not completion percentages): **3 Present, 54 Partial, 22 Missing**. A partial item may require substantial work; release gates decide readiness.

| Release | Capabilities | Present in source | Partial | Missing |
| --- | --- | --- | --- | --- |
| R0 / Operational MVP | 36 | 3 | 29 | 4 |
| R1 / Connected | 24 | 0 | 15 | 9 |
| R2 / Intelligent | 12 | 0 | 6 | 6 |
| R3 / Adaptive | 7 | 0 | 4 | 3 |

R0's four missing core paths are the persistent inbox (PLT-05), multi-item/split jobs (ORD-02), owned photographic issues (SFL-04) and QR workstation entry (SFL-05). The 29 partial capabilities include the highest-risk safety gaps; counting missing screens alone would understate the work.

## Recommended implementation order

Start with Phase 1's reachable authorization/privacy and transaction defects, then add facility/order-job/workforce truth before making safe dispatch the shared authority. Complete and verify R0 end-to-end before R1 publication/change/integration work. Rebuild advanced feasibility claims on measured data and the same safety gate in R2; complete recovery/passport/network/vision/IoT through separate R3 acceptance gates.

The [completion plan](superpowers/plans/2026-10-16-product-rev-completion.md) maps all 79 IDs into these phases, names current extension patterns, sets migration rules and defines verification/anti-pattern guards. No implementation has started in this audit.
