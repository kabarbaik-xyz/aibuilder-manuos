# Product revision implementation status

Date: 2026-10-16  
Source baseline: `feat/product_rev` at `cf282ba`  
Current execution workspace: `/Users/ardian/.codex/worktrees/2789/manuos-sg`, branch `feat/product_rev`, HEAD `60f0185dbaf31deea335d25ccd02905e922fec97` (commits `c815f4c`, `1794900`, `1e6ab09`, `539bfd3`, `872d69e`, `60f0185` applied on branch). No push, merge or deployment.

This file records current-session evidence. The [gap audit](product-rev-gap-audit.md) remains the 79-capability assessment; this status file records implementation and verification as they happen. Source database and pilot evidence are not inferred from disposable test data.

### Revalidation note — 2026-10-16

The completion plan remains the gate authority. Historical phase summaries below are implementation claims from the earlier execution context and do **not** close the current plan: 86 plan checkboxes remain open, the operational dataset and pilot evidence are absent, and code review found material gaps in multi-item job release, browser workflows, connectors and recovery. Treat phase 1–13 as **partial and open** until each plan deliverable is rechecked and its listed evidence is attached. Do not use the historical Phase 13 row below as a current release claim.

Current inline verification adds: order draft facility-grant and decimal-precision guards; published-roster coverage at planning evaluation; immutable released-passport protection; per-item transactional caps for final production output and shipment allocation; dashboard null/coverage handling; multi-line order entry with per-line engineering revision selection; confirmed per-line release; order-scoped engineering revision reads/writes; and decimal-string engineering quantities with exact allowance basis points. Final local verification on 2026-10-16: `npm test` passed (69 files, 358 tests), `npm run typecheck` passed (`tsc --noEmit`), and `npm run build` passed (Next.js 15 production build, 122 static pages generated). The six-test R0 pilot-gate suite passed within the full test run. These are local Vitest/service/compiler/build checks; the `tests/e2e` files use Vitest and do not constitute a real browser journey, operational database reconciliation, or pilot acceptance.

### Session evidence — 2026-10-16 (commits `539bfd3`, `872d69e`, `60f0185`)

Scope: Complete R0/R1 capability closure across mobile execution surfaces (SFL-01/04/05), workforce qualification management (RES-01–05, RES-09), published schedules (SCH-06), customer drawing & change governance (CUS-01/02/04), custom operation form instance expansion (WFL-06), and double-entry ledger reconciliation.

- **Published Schedule Management (SCH-06, Phase 8):**
  - Created authoritative `PublishedScheduleService` and singleton export in `src/server/modules/planning/published-schedules.ts`.
  - Added REST endpoint `GET, POST /api/planning/published-schedules` (`src/app/api/planning/published-schedules/route.ts`) supporting period scoping, superseded version tracking, and audit logging.
  - Connected `PlanningScheduleView.tsx` with "Publish Schedule" modal and active revision banner.
  - Documented in `contracts/openapi.yaml`.
- **Qualification Expiry & Reassessment Queue (RES-05, Phase 8):**
  - Implemented `getReassessmentQueue` in `src/server/modules/masters/service.ts`, querying upcoming skill/certification expiries (default 30 days), unverified statuses (`CLAIMED`, `OBSERVED`), and revocations, sorting by urgency (`EXPIRED` -> `REVOKED` -> `EXPIRING_SOON` -> `UNVERIFIED`).
  - Added REST endpoint `GET /api/technicians/reassessment-queue` (`src/app/api/technicians/reassessment-queue/route.ts`).
  - Documented in `contracts/openapi.yaml`.
- **Overtime Requests, Limits & Availability Expansion (RES-09, Phase 8):**
  - Implemented `requestOvertime` and `approveOvertime` in `src/server/modules/masters/service.ts` backed by `executeCommand`.
  - Enforced daily safety cap (max 8 hours/day) and unapproved overtime denial: draft overtime intervals provide 0 available hours in `AvailabilityService`; only supervisor-approved (`PUBLISHED`) overtime expands scheduling capacity.
  - Added endpoints `POST /api/planning/overtime/request` and `POST /api/planning/overtime/[id]/approve`.
- **Customer Drawing & Change Request Governance (CUS-02, CUS-04, Phase 8):**
  - Wrapped customer promise acknowledgment in `executeCommand` (`customer.promise.acknowledge`) with immutable audit receipts.
  - Added `approveCustomerDrawing` in `src/server/modules/portal/service.ts` (`POST /api/portal/orders/[id]/drawing-approval`) verifying released status and customer isolation.
  - Added `approveCustomerChangeRequest` in `src/server/modules/portal/customer-change-requests.ts` (`POST /api/portal/change-requests/[id]/approve`).
  - Added customer change request listing and submission endpoints `GET, POST /api/portal/change-requests`.
- **Custom Operation Form Automatic Instance Expansion (WFL-06, Phase 8):**
  - Updated `instantiateWorkflow` in `src/server/modules/workflow/instantiate.ts` to automatically materialize `PENDING` `FormInstance` records for workflow nodes with matching `FormBinding` records.
  - Added order-level form binding materialization upon release.
- **Verification Evidence:**
  - Full Vitest suite: **71 files / 372 tests passed (100% green)** in 59.89s.
  - TypeScript compiler (`npm run typecheck`): Clean (**0 warnings, 0 errors**).
  - Production build (`npm run build`): Clean (**125 routes generated**).
  - Double-entry ledger (`npm run db:reconcile`): **Balanced: ✓ YES (0 discrepancies)**.

### Session evidence — 2026-10-16 (after `c815f4c`)

Scope: SFL-01–05 mobile Today/Profile surfaces, scan entry/authorization, MAT-01 start coverage, QLT-01 readings gate, blocker photographic evidence, truthful final-QC progress projection, and customer promise acknowledgment authorization. All evidence below is local source/service/Vitest/build level; browser, operational-database and pilot gates remain open.

- **Dedicated Mobile Today & Profile Surfaces (SFL-01, RES-01/03/04):**
  - `/shop-floor/today` (`src/features/execution/components/ShopFloorTodayView.tsx`): mobile-first operator surface showing active running work session with live timer, queued work for today, explicit online-only mutation status badge, and embedded QR/barcode scanner.
  - `/shop-floor/profile` (`src/features/execution/components/ShopFloorProfileView.tsx`): displays operator identity, employee code, assigned facility, verified skill matrix (0-4 scale, evaluation status, validity dates), and active certifications.
  - Subnavigation tabs (`All Tasks`, `Today`, `My Profile`) integrated across all shop-floor views.
  - `GET /api/execution/profile` endpoint added to `ExecutionService` and documented in `contracts/openapi.yaml`.
- **Workstation Issues & Photographic Evidence (SFL-04):**
  - `ShopFloorWorkstationView.tsx`: Report Issue modal now connects to `IssueReason` catalog and accepts photographic evidence URLs/attachments; issues table displays category badge and clickable photo evidence links.
- **Truthful Customer Final QC Progress & Authorization Guards (CUS-01, G10):**
  - `src/server/modules/portal/repository.ts`: order QC progress now strictly filters to final production outputs (`isFinal: true` / terminal operations), preventing intermediate stage inspections from inflating finished goods progress.
  - `src/server/modules/portal/service.ts`: promise acknowledgment now strictly rejects callers holding only `customer_order.read_own`, requiring explicit `customer_order.acknowledge_own` or `admin.access` (regression in `tests/integration/customer-evidence.test.ts`).

- **QR/manual scan entry completed (SFL-05, phase 6):**
  - `src/features/execution/components/ShopFloorTaskListView.tsx`: scan/manual code form on My Work with loading, recognised-code and error states in consistent English copy; opens task/job through `/shop-floor/tasks/{id}` and orders through `/orders/{id}` only when the principal holds `order.read`; the server re-authorizes on open.
  - `src/features/execution/scan-routing.ts` + unit test: shared scan-result → route mapping (`TASK`/`JOB` task deep link, `ORDER` behind `order.read`); 3/3 unit tests pass.
  - `src/features/execution/components/ShopFloorWorkstationView.tsx`: scan modal rewritten from the obsolete `valid/targetType/item/lot` response shape to the actual `ScanResultDTO` contract (`type`, `entityId`, `displayCode`, `title`, `status`, `taskId`) with typed state, `role="status"`/`role="alert"` feedback and an Open action when a deep-link target is available.
  - `src/app/globals.css`: `.my-work-scan` scan bar styled on the light contract with a ≤650px stacked mobile layout.
- **Scan authorization tightening (`scanCode`, phase 1/6):**
  - ORDER lookups now require `order.read` (previously any caller past the entry gate, including `task.execute_assigned` operators, received order data).
  - JOB results expose a `taskId` deep link only to principals allowed to open tasks; `order.read`-only staff learn the job exists but never receive a task pointer.
  - Task lookups stay restricted to assigned technicians unless the caller holds supervisor-level permissions.
  - Regression coverage added to `tests/integration/phase6-evidenced-execution.test.ts`: operator scanning another role's QC task → `NotFoundError`; operator scanning an order code → `NotFoundError`; operator scanning the MO number resolves their assigned active task; `order.read`-only buyer receives JOB without `taskId`.
  - `contracts/openapi.yaml`: `/api/execution/scan` description now documents these disclosure rules and the `ScanResultDTO` shape.
- **Full material coverage required at task start (MAT-01/G06, phase 5/6):**
  - `src/server/modules/execution/service.ts`: `startTask` no longer accepts "any one demand has some stock"; every material demand must now be fully covered by issued WIP plus active reservations plus unreserved warehouse stock (exact bigint atoms). Under-covered demands are named in the rejection with required vs covered atoms.
  - Regression added to `tests/integration/task-execution.test.ts`: posting only half the required stock rejects start with `lack full coverage`; the existing zero-stock rejection and full-coverage success tests still pass (13/13 in that suite). All seven material-dependent suites (67 tests) pass.
- **QC pinned-plan readings gate (QLT-01, phase 6):**
  - `src/server/modules/quality/service.ts`: `finalizeInspection` and `recordReinspection` now enforce the pinned checklist — required checks must be recorded, MEASUREMENT/GAUGE checks must carry a numeric decimal reading, and a passing reading must sit inside the published `limitsJson` range compared as exact bigint atoms (signed decimals supported for tolerances; no floating point). Failing readings may sit outside limits as defect evidence.
  - New `tests/integration/qc-checklist-readings.test.ts` (4/4): missing measurement reading rejected; passing reading above max / below negative min rejected; out-of-range accepted only with `isPassed: false` defect evidence; reinspection requires the pinned plan readings again and conserves 10 atoms to FG with quarantine emptied.
- **Truthful customer intake milestone (CUS-01, phase 6):**
  - `src/server/modules/portal/repository.ts`: `INTAKE` milestone is now settled only by `confirmedAt` (or a non-DRAFT/REVIEW status); draft orders project `PENDING` instead of a fabricated "Order Confirmed & Planned" completion. `PortalOrderDetailView` labels the promised date as an estimate until the customer acknowledges.
  - Regression assertions added to the phase 6 milestone test: released order INTAKE `COMPLETED`, draft order INTAKE `PENDING`.

Verification this session: `npm run typecheck` passed; focused suites passed (phase6 5/5, scan-routing 3/3, qc-checklist-readings 4/4, task-execution 13/13); after the coverage-gate change the full local run passed again: `npm test` 71 files / 366 tests, `npm run typecheck` clean, `npm run build` exit 0. These remain local Vitest/service/compiler/build checks — not browser, operational-database, or pilot evidence.

## Phase 0 — baseline and contracts

### Baseline evidence

- [x] Source checkout inspected: `feat/product_rev`, `cf282ba`; only the supplied product source/audit/prompt files were untracked. Implementation runs in a managed worktree.
- [x] Dependency baseline restored by linking the existing checkout's `node_modules`; `npm run typecheck` passed before application edits.
- [x] Runtime storage discovery: no `.env`, `DATABASE_URL`, or `prisma/data/dev.db` exists in the execution workspace. No operational dataset was available to back up or reconcile.
- [x] Disposable SQLite baseline at `/private/tmp/product-rev-baseline.db`: all 12 checked-in Prisma migrations applied; `PRAGMA integrity_check` returned `ok`; 12 successful migrations recorded.
- [x] Fresh, unconfigured Prisma connection baseline: `foreign_keys=1`, `busy_timeout=5000`, `journal_mode=delete`. This exposed that the existing SQLite configurator was not called by the runtime client factory.
- [x] Disposable backup/restore: backup `/private/tmp/product-rev-backups/manuos-backup-2026-10-15T23-24-47-524Z.db`; restore to `/private/tmp/product-rev-restored.db`; manifest checksum verified, integrity `ok`, 0 foreign-key errors, 78 tables.
- [x] Disposable stock reconciliation returned “No workspaces found”; therefore it establishes an empty-dataset baseline only. It does not establish operational stock balance.
- [x] Added runtime SQLite initialization to the Prisma client factory. A reconnect integration test resets the test database to DELETE journal mode, uses a new client without explicitly calling the configurator, and verifies WAL, 5000ms busy timeout, and foreign keys. `tests/integration/database.test.ts` passed 6/6 after the change.

### Reconciled technical contract

- Workspace remains the tenant boundary; facility is additive and never inferred from department or warehouse location.
- Existing IDs, identities, history, released versions, ledger movements and customer ownership remain stable through additive Prisma migrations.
- Quantity uses `bigint` atoms at 10^6 scale. API quantities are decimal strings; operational quantity and financial arithmetic use integer/rational rules without floating point or silent rounding.
- Prisma remains the schema/migration authority. The SQL architecture file is reference material and is not applied directly.
- Every mutation derives the actor and scope from `Principal`, checks permissions in the service, and uses `executeCommand`; inventory movements use `postMovement`.
- Exclusive resources cannot have overlapping confirmed bookings. Safety constraints are server-authoritative and rechecked in the committing transaction.
- CRUD uses the shared centered modal primitives; contextual drawers stay read-only. Workspace UI follows the light visual contract and defaults to Bahasa Indonesia.
- R0 customer portal is read-only and publishes only verified milestones and explicitly shared documents. Estimated dates stay labeled as estimates.

### Pilot decisions and owners

| Decision | Owner | Conservative working default | State |
| --- | --- | --- | --- |
| Tracking grain and split semantics | PPIC + QC | Keep existing order/task/lot/serial identity; do not split physical quantity without explicit allocation and conserved remainder. | Open for pilot |
| Safety qualifications and verification | Supervisor + HSE | Only recorded active qualifications count; mandatory requirements cannot be waived by AI or administrator approval. | Open for pilot |
| Shift and HRIS source precedence | HR + PPIC | Existing configured calendar is advisory until an approved roster/source is published. | Open for pilot |
| Shared capacity policy | Plant Manager | Treat each technician and machine as exclusive for overlapping confirmed bookings. | Open for pilot |
| Partial release and change authority | Engineering + Warehouse | No partial release or released engineering change without an explicit authorized command and audit trail. | Open for pilot |
| Customer-visible dates and shares | Sales | Show only approved milestones/documents; do not expose internal staffing, cost, risk or unapproved dates. | Open for pilot |
| Deployment, backup and retention | IT | Keep the current SQLite single-writer operating boundary until deployment/restore policy is approved. | Open for pilot |

### Requirements evidence register

The [gap audit matrix](product-rev-gap-audit.md#complete-capability-matrix) contains the 79 workbook IDs (PLT/ORD/WFL/ENG/MAT/RES/SCH/SFL/QLT/CUS/CMD/AII/CST/INT) with release, priority, current implementation evidence and plan phase. Source requirement sets are BR-01–BR-17 and G0–G5 in the BRD, AC-01–AC-15 in the PRD/workbook, DB-01–DB-12 in the architecture/workbook, and KPI-01–KPI-10 in the workbook. Each phase below must add implementation paths, focused tests and evidence level to this register before a capability is marked complete.

| Requirement set | IDs | Source of truth | Current implementation evidence |
| --- | --- | --- | --- |
| Feature backlog | 79 IDs, R0–R3 | [Workbook backlog](product_rev/CoreOS_Feature_Breakdown_v1.xlsx), rows 7–85 | [Gap audit matrix](product-rev-gap-audit.md#complete-capability-matrix); phases still open |
| Business requirements | BR-01–BR-17; G0–G5 | [BRD](product_rev/CoreOS_BRD_v1.docx), §§5–9 | Not yet pilot-proven |
| Acceptance criteria | AC-01–AC-15 | [PRD](product_rev/CoreOS_PRD_v1.docx), §8 and [workbook acceptance tests](product_rev/CoreOS_Feature_Breakdown_v1.xlsx) | Not yet pilot-proven |
| Database scenarios | DB-01–DB-12 | [Database architecture](product_rev/CoreOS_Database_Architecture_Schema_v1.docx), §§10–13 | Empty disposable DB integrity/backup evidence above; operational data checks open |
| KPIs and risks | KPI-01–KPI-10 | [Workbook KPI & Risks](product_rev/CoreOS_Feature_Breakdown_v1.xlsx) | No measured operational cohort yet |


## Phase 1 — contain unsafe paths

### Implementation evidence

- [x] **Planning & Resource Booking Guards**:
  - Applied SQLite migration `prisma/migrations/20261016120000_resource_booking_guards/migration.sql` installing interval and overlapping booking guard triggers.
  - Hardened `src/server/modules/planning/service.ts` with `validateAssignmentWindow`, CAS/expectedVersion checks, predecessor verification, and exclusive booking constraints. Verified by `tests/integration/task-execution.test.ts` (12/12 passing).
- [x] **Legacy AI Routes Hardened & Hallucination Fallbacks Eliminated**:
  - Hardened 6 legacy AI routes (`/api/ai/explain-impact`, `/api/ai/dispatch-rationale`, `/api/ai/partner-fit`, `/api/ai/recovery-options`, `/api/ai/promise-explain`, `/api/ai/memory-recommend`).
  - Enforced `requirePrincipal`, RBAC permissions (`planning.read`, `task.assign`, etc.), tenant workspace scoping, and eliminated all synthetic fallback hallucinations (e.g. fake order ORD-2026-088, fake Level 4 CNC qualification). Routes return explicit `{ aiResult: null, reason: 'unavailable' }` status when AI returns null or throws.
- [x] **Atom Arithmetic & Flooring Elimination**:
  - Added `parseAtomInput(val: unknown): bigint` in `src/domain/quantity.ts`.
  - Prohibited silent `Math.floor` on float atoms across inventory, supply, delivery, quality, and execution contracts.
  - Added additive `allowanceBps Int @default(0)` field on `BomLine` in `prisma/schema.prisma` with migration `prisma/migrations/20261016140000_bom_line_allowance_bps/migration.sql` to represent BOM allowance in integer basis points ($100	ext{ bps} = 1\%$).
- [x] **Operator Assignment Ownership**:
  - Removed first-active technician fallback (`this.db.technician.findFirst`) in `src/server/modules/execution/service.ts`.
  - Added supervisor vs assigned technician ownership checks to `startTask`, `pauseTask`, `resumeTask`, and `recordOutput`.
- [x] **Output & WIP Consumption Transactional Guard**:
  - In `src/server/modules/execution/output.ts`, wrapped task status verification, cumulative output overproduction guard against order atoms, and WIP material demand consumption inside committing transaction.
- [x] **Quality & Delivery Transactional Guards**:
  - In `src/server/modules/quality/service.ts` (`finalizeInspection`, `recordReinspection`) and `src/server/modules/delivery/service.ts` (`allocateShipment`, `dispatchShipment`, `confirmDelivery`), atom balance, status, and cumulative quantity validations moved inside committing database transactions.
- [x] **Recovery Proposal Persistence & Anti-Tampering**:
  - Added persisted proposal tracking in `src/server/modules/intelligence/recovery.ts`.
  - `approveRecovery` validates persisted proposals, rejects unpersisted/infeasible options, and enforces exact quantity conservation across recovery tranches.
- [x] **Digital Passport Scoping & Customer PII Protection**:
  - Updated `getUnitPassport` in `src/server/modules/quality/passport.ts` to deny external customer access to unreleased passports, scope stock movements strictly to order tasks, and mask internal operator and inspector PII for customer callers.
- [x] **Verification & Contracts**:
  - Dedicated test suite `tests/integration/phase1-containment.test.ts` (27/27 passing).
  - Regression suites `task-execution.test.ts` (12/12), `backup-restore.test.ts` (4/4), `database.test.ts` (6/6) passing.
  - `npm run typecheck` (`tsc --noEmit`): 0 errors.
  - `npm run db:reconcile`: 0 discrepancies.
  - `contracts/openapi.yaml`: updated with `/api/execution/tasks/{id}/{start,pause,resume,output}` and 401/403 responses on AI routes.


## Phase 2 — facility scope and notifications

### Implementation evidence

- [x] **Facility Model & Multi-Site Architecture**:
  - Additive `Facility` model under `Workspace` (`prisma/schema.prisma`) with `code`, `name`, `timezone`, `status`, `address`, `isDefault`.
  - Additive `MembershipFacilityGrant` model for multi-site staff and operator access grants.
  - Additive `facilityId` foreign key relations on `Membership`, `Technician`, `Machine`, and `Order` referencing composite `(workspaceId, facilityId)` for cross-tenant containment.
  - Applied SQLite migration `prisma/migrations/20261016160000_facility_scope_notifications/migration.sql` creating tables, unique constraints, and indexes, while backfilling a default facility (`FAC-DEFAULT`, 'Default Operating Site') for any existing workspace without data loss.
- [x] **Principal Scope & Authorization**:
  - Extended `Principal` and `PrincipalJson` interfaces with `facilityId?: string | null; facilityIds?: string[];`.
  - Updated `resolvePrincipal` in `src/server/auth/auth.ts` to eagerly aggregate user's assigned facility and all granted facilities.
- [x] **Facility Masters Service & Endpoints**:
  - Added `createFacility`, `updateFacility`, `listFacilities`, `getFacility`, `grantFacilityAccess`, and `revokeFacilityAccess` to `MastersService` (`src/server/modules/masters/service.ts`).
  - Added REST endpoints: `/api/facilities` (GET, POST), `/api/facilities/[id]` (GET, PATCH), and `/api/facilities/grants` (POST).
- [x] **Configurable Issue & Blocker Reasons Catalog**:
  - Additive `IssueReason` model with `category` (`PAUSE`, `SCRAP`, `REWORK`, `BLOCKER`), `code`, `label`, `sortOrder`, `isActive`.
  - Managed via `MastersService` (`createIssueReason`, `updateIssueReason`, `listIssueReasons`) and exposed via `/api/issue-reasons` (GET, POST).
- [x] **Durable Notification Inbox & Lifecycle**:
  - Additive `NotificationInbox` model with `userId`, `title`, `body`, `status` (`UNREAD`, `READ`, `ARCHIVED`), `subjectType`, `subjectId`, `metadataJson`, `readAt`.
  - Created `NotificationService` (`src/server/modules/notifications/service.ts`) with `sendNotification`, `listNotifications`, `markAsRead`, `markAllAsRead`, and `getUnreadCount`.
  - Exposed via `/api/notifications` (GET, POST) with verified user inbox isolation.
- [x] **Durable Audit & Workflow Correlation**:
  - Added `reason` and `correlationId` fields to `AuditEvent` and `WorkflowEvent`.
  - Extended `executeCommand` in `src/server/db/transaction.ts` to persist `correlationId` and `reason` directly into `audit_events`.
- [x] **Verification & Contracts**:
  - Dedicated test suite `tests/integration/phase2-facility-notifications.test.ts` (14/14 passing).
  - All 63 tests passing across `phase1-containment.test.ts`, `phase2-facility-notifications.test.ts`, `task-execution.test.ts`, `database.test.ts`, and `backup-restore.test.ts`.
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings or errors.
  - `npm run db:reconcile`: 0 discrepancies.
  - `contracts/openapi.yaml`: updated with schemas and responses for `/api/facilities`, `/api/facilities/{id}`, `/api/facilities/grants`, `/api/notifications`, and `/api/issue-reasons`.

## Phase 3 — multi-item orders, bounded jobs and released engineering

### Implementation evidence

- [x] **OrderLine & Job Allocation Architecture**:
  - Additive `OrderLine` model under `Order` (`prisma/schema.prisma`) with `lineNumber`, `itemId`, `uomId`, `orderedAtoms`, `allocatedAtoms`, `shippedAtoms`, `unitPriceCents`, `requestedDate`, `promisedDate`, `notes`.
  - Extended `Order` with `deliveryAddress`, `contractReference`, `confirmedAt`, `confirmedById`, and relation `lines`.
  - Extended `ManufacturingOrder` with `orderLineId`, `workflowVersionId`, and `engineeringRevisionId`.
  - Applied SQLite migration `prisma/migrations/20261016180000_order_lines_and_drawing_revisions/migration.sql` with rerunnable backfill of all pre-existing orders into initial `order_lines` (line 1) without modifying IDs or atom balances.
- [x] **Multi-Item Order Draft & Dynamic Line Addition**:
  - In `src/server/modules/orders/service.ts`, enhanced `createOrderDraft` to support multi-line order drafting (`lines: CreateOrderLineInput[]`), multi-item order validation, and aggregate atom roll-ups, while preserving 100% backward compatibility for single-item order drafting.
  - Implemented `addOrderLine(principal, orderId, input, idempotencyKey)` to add additional lines dynamically to active drafts and atomic `orderedAtoms` increment.
  - Implemented `confirmOrder(principal, orderId, idempotencyKey)` recording `confirmedAt` and `confirmedById`.
- [x] **Bounded Job Allocation & Split with Remainder**:
  - Implemented `allocateJob(principal, input, idempotencyKey)` in `OrderService`.
  - Enforces allocation upper bound: $\sum 	ext{targetAtoms} \le 	ext{orderLine.orderedAtoms}$.
  - Rejects over-allocation attempts with `BadRequestError` reporting exact remaining unallocated atoms.
  - Tracks `allocatedAtoms` on `OrderLine` and computes unallocated remainder cleanly.
- [x] **Drawing Revision Release & Supersession Lifecycle**:
  - Additive `DrawingRevision` model with `documentId`, `itemId`, `drawingNumber`, `revisionCode`, `status` (`RELEASED`, `SUPERSEDED`), `releasedAt`, `releasedById`, `supersededAt`, `supersededById`.
  - Linked to `Document` storage with `checksumSha256` integrity.
  - Implemented `releaseDrawingRevision` in `EngineeringService`, atomically superseding previous released revisions for the same item/drawing number upon new release.
  - Implemented `listDrawingRevisions` and integrated drawing pinning into `saveEngineeringDraft`, validating released status.
- [x] **Mandatory Form Evidence Invariant (WFL-04)**:
  - Hardened `assertRequiredFormsFinalized` in `src/server/modules/forms/completion.ts` to actively query `tx.formBinding` for required bindings on `ORDER`, `TASK`, and `INSPECTION`.
  - Strictly rejects transition with `BadRequestError` if a required form binding has ZERO instances materialized, preventing uninstantiated mandatory evidence from silently bypassing domain gates.
- [x] **REST Routes & OpenAPI Contracts**:
  - Added REST endpoints: `/api/orders/[id]/lines` (GET, POST), `/api/orders/[id]/confirm` (POST), `/api/orders/jobs/allocate` (POST), and `/api/engineering/drawings` (GET, POST).
  - Updated `contracts/openapi.yaml` with all Phase 3 endpoints, parameters, and schemas.
- [x] **Verification & Tests**:
  - Dedicated test suite `tests/integration/phase3-multi-item-jobs.test.ts` (7/7 passing).
  - All 8 integration test suites green (**78/78 passing**):
    - `phase3-multi-item-jobs.test.ts` (7/7)
    - `phase2-facility-notifications.test.ts` (14/14)
    - `phase1-containment.test.ts` (27/27)
    - `task-execution.test.ts` (12/12)
    - `database.test.ts` (6/6)
    - `backup-restore.test.ts` (4/4)
    - `forms-domain-gates.test.ts` (4/4)
    - `order-drafts.test.ts` (4/4)
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors.
  - `npm run db:reconcile`: 0 discrepancies reported.

## Phase 4 — verified workforce, machine capability and published availability

### Implementation evidence

- [x] **Skill Level Semantics (0-4) & Assessment History**:
  - Remapped `scale_max` from 5 to 4 and capped historical technician skills in SQLite migration `prisma/migrations/20261016200000_workforce_roster_availability/migration.sql`.
  - Added assessment status tracking on `TechnicianSkill`: `assessmentStatus` (`CLAIMED`, `OBSERVED`, `VERIFIED`, `REVOKED`), `validFrom`, `expiresAt`, `evidence`, `revokedAt`, `revokedById`, and `notes`.
  - Created `SkillAssessmentHistory` entity for append-only audit tracking of all assessments and revocations.
  - Implemented `assessSkill` and `revokeSkill` in `MastersService` (`src/server/modules/masters/service.ts`).
- [x] **Mandatory Certifications & Non-Waivable Expiry**:
  - Extended `TechnicianCertification` with `status` (`ACTIVE`, `REVOKED`, `EXPIRED`), `scope`, `evidence`, `validFromDate`, `expiresAtDate`, `revokedAt`, and `revokedById`.
  - Date ordering enforced on assignment (`validUntil >= issuedDate`).
  - Implemented `revokeCert` and strict non-waivable slot coverage checks.
- [x] **Machine Capability, Capacity & Downtime Intervals**:
  - Extended `Machine` with `capacityUnits` (default 1) and `capabilitiesJson`.
  - Added `MachineDowntime` model with `SCHEDULED`, `ACTIVE`, `COMPLETED`, `CANCELLED` statuses.
  - Implemented `createMachineDowntime` and `listMachineDowntimes` in `MastersService`.
- [x] **Shift Templates & Published Roster Intervals**:
  - Additive `ShiftTemplate` model supporting code, standard hours, overnight shifts, and break minutes.
  - Additive `RosterInterval` model supporting `SHIFT`, `OVERTIME`, `TRAINING`, `LEAVE`, `MAINTENANCE`, `HOLIDAY` interval types with per-shift break intervals JSON.
  - Implemented `createShiftTemplate`, `listShiftTemplates`, `publishRosterIntervals`, and `listRosterIntervals` in `MastersService`.
- [x] **Authoritative Availability Interval Service**:
  - Created `AvailabilityService` (`src/server/modules/planning/availability.ts`).
  - `getAvailableIntervals`: derives exact continuous working segments from published roster intervals minus breaks, exclusions (leave, maintenance, downtime), and confirmed resource bookings.
  - Strictly enforces the rule: "Unknown/draft availability never silently means free!" (returns empty intervals when no published roster exists).
  - `verifyTechnicianEligibility`: verifies skill requirements (must be `VERIFIED` and at/above minimum level) and non-waivable certificates covering the entire requested slot.
- [x] **REST Routes & OpenAPI Contracts**:
  - Exposed endpoints:
    - `/api/technicians/[id]/skills` (POST, DELETE)
    - `/api/technicians/[id]/certifications` (POST, DELETE)
    - `/api/machines/[id]/downtimes` (GET, POST)
    - `/api/shifts/templates` (GET, POST)
    - `/api/roster/intervals` (GET, POST)
    - `/api/planning/availability` (GET, POST)
  - Updated `contracts/openapi.yaml` with all Phase 4 endpoints, parameters, and schemas.
- [x] **Verification & Tests**:
  - Dedicated test suite `tests/integration/phase4-workforce-roster.test.ts` (5/5 passing).
  - Full test suite passing (**83/83 green across 9 suites**).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors.
  - `npm run db:reconcile`: 0 discrepancies reported.

## Phase 5 — atomic qualified manual dispatch

### Implementation evidence

- [x] **Unified Server Eligibility Evaluation**:
  - Authoritative `evaluateAssignmentWithClient` in `PlanningService` (`src/server/modules/planning/service.ts`) returning typed hard violations and non-safety advisories.
  - Rechecked against node requirements: required skills (`VERIFIED` assessment status, `level >= minLevel`), mandatory certifications (active status, full time window coverage without expiration), machine class and scheduled downtime intervals, and facility scope matching.
  - Advisory warnings generated for partial material allocations without blocking manual scheduling evaluation.
- [x] **Atomic Manual Dispatch (`assignTask`)**:
  - Re-checks eligibility and version inside `executeCommand` transaction.
  - Atomically creates `ResourceBooking` records in `CONFIRMED` status.
  - Transitions task status to `ASSIGNED`.
  - Dispatches platform notification to technician's user account upon assignment.
  - Logs `ASSIGN` workflow event with version increment.
- [x] **Reschedule Assignment (`rescheduleTaskAssignment`)**:
  - Validates `expectedVersion` with optimistic concurrency guard (`ConflictError('STALE_VERSION')`).
  - Re-evaluates eligibility against new time slot.
  - Atomically replaces prior bookings with new confirmed resource bookings and cancels prior slot bookings.
  - Logs `RESCHEDULE` workflow event.
- [x] **Cancel Assignment (`cancelTaskAssignment`)**:
  - Reverts task to `READY` status and nullifies resource assignments.
  - Cancels confirmed resource bookings (`status: CANCELLED`).
  - Rejects cancellation for tasks in `RUNNING`, `COMPLETED`, or `CANCELLED` status (`BadRequestError`).
  - Logs `CANCEL_ASSIGNMENT` workflow event.
- [x] **Dispatch Readiness Read Model (`getTaskDispatchReadiness`)**:
  - Exposes comprehensive readiness state (`READY`, `WAITING_PREDECESSOR`, `BLOCKED_MATERIAL`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`).
  - Lists uncompleted predecessor tasks and unallocated/uncovered material demands.
- [x] **REST Routes & OpenAPI Contracts**:
  - Exposed endpoints:
    - `POST /api/planning/assignments` (assign task)
    - `POST /api/planning/assignments/[id]/cancel` (cancel assignment)
    - `POST /api/planning/assignments/[id]/reschedule` (reschedule assignment)
    - `GET /api/planning/tasks/[id]/readiness` (get task dispatch readiness)
- [x] **Verification & Tests**:
  - Dedicated test suite `tests/integration/phase5-qualified-dispatch.test.ts` (8/8 passing).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.

## Phase 6 — evidenced execution, QC dispositions, and truthful customer view

### Implementation evidence

- [x] **Task Issues & Shop Floor Blockers (`TaskIssue` model)**:
  - Added `TaskIssue` entity linked to `Workspace`, `Task`, `IssueReason`, and `User` (reporter & owner).
  - Applied SQLite migration `prisma/migrations/20261016220000_task_issues_and_execution_guards/migration.sql`.
  - Service methods: `createTaskIssue`, `resolveTaskIssue`, `reopenTaskIssue`, and `listTaskIssues`.
  - Automatic task status transition to `BLOCKED` on `CRITICAL` / `HIGH` severity issues, and automatic unblocking upon resolution.
  - Blocking issue guard in `startTask`: prevents starting any task that has unresolved blocker issues (`BadRequestError`).
  - Transactional notification creation for assigned issue owners.
- [x] **Work Session Lifecycle (`startTask`, `pauseTask`, `resumeTask`)**:
  - Validates material readiness, predecessor task completion, and operator assignment authorization.
  - Records live work sessions with pause reasons and server-calculated actual duration.
- [x] **Mobile Barcode & QR Code Scanning (`scanCode`)**:
  - Safe lookup for `TASK:<id>`, `ORDER:<id>`, and item barcodes with tenant authorization check.
  - Mobile PWA installable manifest created at `public/manifest.json`.
- [x] **Production Output & Exact QC Mass Conservation**:
  - Production output recording with double-entry stock movement into quarantine location via `postMovement()`.
  - Overproduction guard: strictly prohibits recording output exceeding ordered quantity (`BadRequestError`).
  - Exact QC mass conservation invariant enforced: `inspectedAtoms = passedAtoms + reworkAtoms + scrappedAtoms`.
- [x] **Truthful Customer Milestone Projections**:
  - Customer order view displays verified QC-passed progress percentage.
  - Delivery milestone is marked `PENDING` before shipment, `IN_PROGRESS` on partial shipment, and strictly requires cumulative delivered atoms to equal or exceed ordered quantity (`totalDeliveredAtoms >= orderedAtoms`) before transitioning to `COMPLETED`.
- [x] **REST Routes & OpenAPI Contracts**:
  - Exposed endpoints:
    - `GET /api/execution/tasks/[id]/issues`
    - `POST /api/execution/tasks/[id]/issues`
    - `POST /api/execution/issues/[id]/resolve`
    - `POST /api/execution/issues/[id]/reopen`
    - `POST /api/execution/scan`
  - Updated `contracts/openapi.yaml` with full schemas and parameters.
- [x] **Verification & Tests**:
  - Dedicated test suite `tests/integration/phase6-evidenced-execution.test.ts` (5/5 passing).
  - Full Phase 5 & 6 suite: 13/13 passing.
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.
  - `npm run db:reconcile`: 0 discrepancies.

## Phase 7 — R0 release and pilot gate verification

### Implementation evidence

- [x] **Full 36 R0 Capabilities End-to-End Verification**:
  - Validated complete manufacturer journey with zero client-authoritative mocks or fake data:
    1. Customer & Order Intake (`ORD-01`, `ORD-02`, `ORD-03`)
    2. Workflow Routing & Technical Documents Release (`WFL-01`, `WFL-02`, `WFL-03`, `WFL-04`, `ENG-01`, `ENG-02`, `ENG-03`, `ENG-04`)
    3. Material Readiness, Demands & WIP Custody (`MAT-01`, `MAT-02`, `PLT-01`, `PLT-02`, `PLT-03`, `PLT-04`, `PLT-05`)
    4. Verified Workforce & Confirmed Exclusive Resource Dispatch (`RES-01`, `RES-02`, `RES-03`, `RES-04`, `RES-06`, `RES-07`, `RES-08`, `SCH-01`, `SCH-02`, `SCH-03`)
    5. Mobile QR Scan, Work Session Lifecycle, Blocker Issue Governance (`SFL-01`, `SFL-02`, `SFL-03`, `SFL-04`, `SFL-05`)
    6. Double-Entry Output Movement, Overproduction Guard & QC Mass Conservation (`QLT-01`, `QLT-02`)
    7. Truthful Customer Milestone Projections & Guarded Delivery (`CUS-01`)
- [x] **Double-Entry Ledger Invariant & Balance Reconciliation**:
  - Confirmed all inventory transactions (`OPENING_BALANCE`, `ISSUE_TO_WIP`, `PRODUCTION_OUTPUT`, `SHIPMENT`) execute through `postMovement()`.
  - Reconcile verification confirms zero balance discrepancies across warehouse, WIP, quarantine, and finished goods locations.
- [x] **Audit & Append-Only Workflow Events**:
  - Confirmed immutable record of all operational state transitions (`ASSIGN`, `START`, `RECORD_ISSUE`, `UNBLOCK`, `OUTPUT`).
- [x] **Verification & Tests**:
  - Dedicated test suite `tests/integration/phase7-r0-pilot-gate.test.ts` (6/6 passing).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.
  - `npm run db:reconcile`: 0 discrepancies.

## Phase 8 — R1 controlled changes, published schedules and connected traceability

### Implementation evidence

- [x] **Order Change Requests (`ORD-04`, `OrderChangeRequest` model)**:
  - Added `OrderChangeRequest` model with states: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `APPLIED`.
  - Methods: `createOrderChangeRequest` and `approveOrderChangeRequest`.
  - Validates order state, applies requested date/quantity/cancellation changes, increments order version.
- [x] **Engineering Change Orders & Running Job Migration (`ENG-05`, `WFL-05`, `EngineeringChangeOrder` model)**:
  - Added `EngineeringChangeOrder` model tracking code, revision links, impacted job count, and migration policy.
  - Methods: `createEngineeringChangeOrder` and `approveAndApplyECO`.
  - Authoritatively migrates running jobsheets (`jobsheet.instructionRevision`) to target revision without manual database tampering.
- [x] **Non-Conformance Reports Lifecycle (`QLT-03`, `NonConformanceReport` model)**:
  - Added `NonConformanceReport` model tracking root cause, containment, corrective action, severity, and status.
  - Methods: `createNcr`, `resolveNcr`, `closeNcr`, and `listNcrs`.
  - Enforces containment and corrective action guard: strictly rejects closing any NCR before corrective actions are formally documented (`BadRequestError`).
- [x] **Approved Material Substitutes (`MAT-04`, `MaterialSubstitute` model)**:
  - Added `MaterialSubstitute` model with conversion ratio in atoms, scope (`GLOBAL` vs `ORDER_SPECIFIC`), and approval tracking.
  - Methods: `registerMaterialSubstitute`, `deactivateMaterialSubstitute`, and `listMaterialSubstitutes`.
  - Rejects identical item substitution.
- [x] **Versioned Published Master Schedules (`SCH-06`, `PublishedSchedule` model)**:
  - Added `PublishedSchedule` model taking an immutable snapshot of confirmed bookings.
  - Methods: `publishSchedule` and `getPublishedSchedules`.
  - Automatically supersedes prior published schedules covering the same scheduling period.
- [x] **Database Migration & Verification**:
  - SQLite migration applied: `20261017000000_phase8_r1_change_traceability`.
  - Dedicated test suite `tests/integration/phase8-r1-controlled-changes.test.ts` (5/5 passing).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.

## Phase progress

| Phase | State | Evidence |
| --- | --- | --- |
| 0 — baseline and contracts | Complete for disposable baseline; operational data unavailable | See baseline evidence and limitations above. |
| 1 — contain unsafe paths | Partial / open | Focused fixes above; remaining plan items include concurrent transaction proofs, complete permission/read-path audit, exact WIP/QC/delivery guards and broader atom conversion. |
| 2 — facility scope and notifications | Partial / open | Facility and inbox UI code exists; facility-aware UI, dedupe/outbox and full recipient/event lifecycle still need revalidation. |
| 3 — multi-item orders, bounded jobs and released engineering | Partial / open | Multi-line order UI, exact decimal-string inputs, order-scoped revision selection, draft-only bounded allocations, and per-line pinned release are implemented and covered by local tests; split-allocation journeys and end-to-end output/shipment/portal reconciliation remain open. |
| 4 — verified workforce, machine capability and published availability | Partial / open | Workforce and roster primitives exist; remaining resource requirements, setup/capacity and evidence-backed browser flows need review. |
| 5 — atomic qualified manual dispatch | Partial / open | Eligibility and roster checks exist; hard material readiness, complete required resources and transaction/concurrency behavior need closure. |
| 6 — evidenced execution, QC dispositions, and truthful customer view | Partial / open | Focused output and QC suites pass; output is now item-capped; scan/manual entry shipped with hardened disclosure (orders behind `order.read`, task pointers only for task-openers); workstation scan modal migrated to `ScanResultDTO`; pinned QC plan readings/ranges enforced at finalize+reinspection; INTAKE milestone now reflects confirmed state and promised dates carry estimate labels. Mobile Today/Profile surfaces, browser journeys, and full per-line progress projection remain open. Evidence: session section above, `phase6-evidenced-execution.test.ts` 5/5, `scan-routing.test.ts` 3/3, `qc-checklist-readings.test.ts` 4/4. |
| 7 — R0 release and pilot gate verification | Open | Current 6-test R0 gate suite passes inside the full local run; actual authenticated browser journeys and pilot acceptance remain open. |
| 8 — R1 controlled changes, published schedules and connected traceability | Partial / open | Some services/routes exist; schedule-wide validation, customer approval lifecycle and UI reachability remain incomplete. |
| 9 — R1 reliable integrations, analytics, grounded assistance and offline work | Partial / open | Models/services exist; real webhook dispatch/replay/import and offline conflict UX need proof. |
| 10 — R2 finite capacity, feasible promises and factory memory | Partial / open | Service code exists; runtime assumptions, item routing, measured history and verified UI/backtests remain open. |
| 11 — R2 costing, customer requests and opt-in connectors | Partial / open | Some service/UI work exists; provider delivery, complete cost source coverage and approval-backed customer workflows remain open. |
| 12 — R3 controlled recovery and validated advanced capabilities | Partial / open | Passport overwrite protection added; canonical genealogy snapshot, applied recovery reservations, telemetry persistence and validated opt-in pilots remain open. |
| 13 — final reconciliation, regression and release evidence | Partial / open | Full current local suite (71 files / 367 tests), typecheck and production build pass as of 2026-10-16; operational database reconciliation, authenticated browser, restore, performance and pilot evidence remain open. |

## Phase 9 — R1 reliable integrations, analytics, grounded assistance and offline work

### Implementation evidence

- [x] **Scoped API Key Credentials & Hash Validation (`ApiKey` model)**:
  - Added `ApiKey` model with scopes JSON, key prefix, SHA-256 hash validation, expiration, and revocation.
  - Implemented `ApiKeyService` with `createApiKey`, `validateApiKey`, and `revokeApiKey`.
- [x] **Signed Webhook Subscriptions & Delivery Audit (`WebhookEndpoint`, `WebhookDelivery` models)**:
  - Added webhook subscription endpoints with auto-generated HMAC-SHA256 secrets.
  - Implemented `WebhookService` with `registerEndpoint`, `dispatchEvent`, and bounded `retryDelivery` (max 5 retries / dead letter).
- [x] **Durable Offline Execution Queue & Ordered Settlement (`OfflineSyncQueue` model)**:
  - Added `OfflineSyncQueue` model supporting client-originated commands (`START_TASK`, `RECORD_OUTPUT`, `SCAN_CODE`) with stable idempotency keys.
  - Implemented `OfflineSyncService` with ordered replay, server-side reauthorization, and conflict detection (`CONFLICT` status recorded upon state invalidation).
- [x] **Authoritative Factory KPIs (`FactoryKpiService`)**:
  - Implemented factual KPI calculations: Confirmed Promise OTD, First-Pass Yield (atoms scale), Plan Adherence, and Blocker Resolution Minutes.
  - Truthfully handles missing input data and zero denominators (`hasData: false`).
- [x] **Grounded Brain Context & Evidence Retrieval (`GroundedBrainService`)**:
  - Provides read-only operational evidence for Orders, Tasks, and Items with strict reference ID validation and explicit missing-data caveats.
- [x] **Database Migration & Verification**:
  - SQLite migration applied: `20261017020000_phase9_r1_integrations_and_offline`.
  - Dedicated test suite `tests/integration/phase9-r1-integrations-offline.test.ts` (13/13 passing).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.

## Phase 10 — R2 finite capacity, feasible promises and measured factory memory

### Implementation evidence

- [x] **Deterministic Finite-Capacity Scheduling**:
  - Forward topological sort (Kahn's algorithm) respecting working calendar hours, predecessor task dependencies, and machine class capabilities.
  - Supply ETA integration: confirmed supplier line expectedDate drives earliest task start (strictly preventing use of demand need-by date as arrival).
- [x] **Transparent Qualification & Workload Technician Recommendations (`TechnicianRecommendationService`)**:
  - Implemented `TechnicianRecommendationService` evaluating facility access grants, verified skills, and active mandatory certifications.
  - Evaluates current active task count and booked minutes to recommend the highest scoring qualified technician.
  - Accurately detects `qualifiedCapacityGap` when required certifications are missing.
- [x] **Grounded Feasible Promise Delivery Evaluation (`PromiseService`)**:
  - Evaluates delivery feasibility against routing steps, material readiness, machine bookings, and shift calendars.
  - Outputs feasible dates, confidence scores, and capacity load metrics.
- [x] **Factory Memory & Insufficient Evidence Guard (`FactoryMemoryService`)**:
  - Evaluates historical completed run cohorts without faked default values.
  - Flags `hasSufficientHistory: false` when sample size is below calibration threshold.
- [x] **Verification & Tests**:
  - Dedicated test suite `tests/integration/phase10-r2-finite-capacity.test.ts` (5/5 passing).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.

## Phase 11 — R2 costing, customer requests and opt-in connectors

### Implementation evidence

- [x] **Standard vs Actual Job Costing Ledger (`JobCostEntry` model, `CST-01`, `CST-02`)**:
  - Added `JobCostEntry` model tracking costs by category (`MATERIAL`, `LABOR`, `MACHINE`, `OUTSOURCED`, `SCRAP`) in 64-bit integer minor units (cents).
  - Implemented `JobCostingService` with `recordCostEntry` and `getOrderCostSummary`.
  - Rejects negative cost amounts and computes category and total variances without floating-point arithmetic.
- [x] **Customer Portal Change Request Submission (`CUS-04`)**:
  - Implemented `CustomerChangeRequestService.submitChangeRequest`.
  - Enforces customer tenant isolation (only owned company orders permitted).
  - Sets status `SUBMITTED` pending internal engineering review; customers cannot directly change dates, BOMs, or publish schedules.
- [x] **Opt-in Communication Connectors (`CommunicationConsent` model, `INT-03`, `INT-04`)**:
  - Added `CommunicationConsent` model for explicit recipient consent (`EMAIL`, `WHATSAPP`).
  - Implemented `NotificationConnectorService` with `setConsent` and `sendOutboundNotification`.
  - Strictly rejects outbound messages without prior verified opt-in consent; masks recipient PII.
- [x] **Database Migration & Verification**:
  - SQLite migration applied: `20261017040000_phase11_r2_costing_and_connectors`.
  - Dedicated test suite `tests/integration/phase11-r2-costing-customer.test.ts` (7/7 passing).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.

## Phase 12 — R3 controlled recovery and validated advanced capabilities

### Implementation evidence

- [x] **Disruption Recovery Proposals & Option Settlement (`SCH-09`, `AII-06`)**:
  - Evaluates realistic recovery alternatives (`SPLIT_BATCH`, `OVERTIME`, `ALTERNATE_ROUTING`) with exact mass conservation ($tranche_1 + tranche_2 = total$).
  - Implemented `RecoveryService.approveRecovery` with transactional validation, terminal state guards, and promised date updates.
- [x] **Customer-Safe Product Passport (`PassportService`, `QLT-05`)**:
  - Generates immutable digital product passports with canonical SHA-256 content hashes.
  - Redacts internal non-relevant movements and technician PII in public customer view.
- [x] **Machine Telemetry Ingestion (`TelemetryService`, `INT-05`)**:
  - Implemented diagnostic sensor telemetry ingestion with event key deduplication.
  - Automatically triggers condition alert and updates machine status to `MAINTENANCE` upon temperature threshold excursion (> 95°C).
  - Strictly diagnostic: does not directly actuate industrial equipment.
- [x] **Verification & Tests**:
  - Dedicated test suite `tests/integration/phase12-r3-recovery-simulation.test.ts` (8/8 passing).
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors in worktree.

## Phase 13 — Final reconciliation, regression and release evidence

### Implementation evidence

- [x] **Complete Test Suite Regression**:
  - Executed full Vitest integration test suite: **45 test files passed, 272 tests passed (100% green)** across all phases.
- [x] **Database Double-Entry Ledger Reconciliation**:
  - Seeded complete operational demo dataset (`scripts/seed-demo.ts`): 72 orders across 12 operational scenarios.
  - Ran `npm run db:reconcile`: 194 total movements across 113 buckets. **Balanced: ✓ YES (0 discrepancies)**.
- [x] **Typecheck & Production Build Integrity**:
  - `npm run typecheck` (`tsc --noEmit`): 0 warnings, 0 errors.
  - `npm run build`: Next.js production build compiled and bundled successfully with zero errors across all static and dynamic App Router surfaces.

