# ManuOS product foundation gap audit

Implementation planning package (not shipped functionality):
[R0+R1 master plan](superpowers/plans/2026-10-15-manuos-functional-prototype.md),
following the user's selection of operational functionality plus all six
intelligence capabilities, staged delivery, and SQLite. Its linked DB/UI/API/
permission/acceptance designs turn this audit into an implementation backlog.

Date: 2026-10-15
Basis: current local BRD, PRD, architecture, roadmap, route inventory, domain
types/schemas, store actions, workflow code, selectors, and API implementations.
Evidence is static inspection; no new tests, browser walkthrough, API execution,
database readback, provider calls, or deployment verification were performed.

This audit supersedes the implementation ordering in
`functionality-audit-and-sqlite-plan.md`. The earlier audit identified persistence
and broken demo paths but did not adequately establish identity, authorization,
master data, and workflow configuration as prerequisites.

Expanded on 2026-10-15 to explicitly specify inventory, basic purchasing,
production material accounting, finished goods, delivery, and an end-to-end
functional completion contract. Sections 9–12 define the consolidated minimum
prototype baseline. It is not an implemented-feature inventory.

The user's subsequent roadmap image is mapped in section 13. It is the target
module direction, not an instruction to ship every roadmap capability in the
current release. P0/P1/P2 labels in that section are roadmap priorities, distinct
from the earlier audit's implementation phase labels.

## 1. Assessment

The repository implements a scenario-driven manufacturing demonstration with
React surfaces, seeded domain records, client-side state transitions, several
deterministic algorithms, and Gemini routes. It does not yet implement a
complete configurable business application.

Adding a SQLite file or persisting the existing Zustand graph would retain the
same missing relationships and scenario-specific behavior. The required change
is a product foundation: identity and ownership, master records, versioned process
configuration, server-owned transactions, and operational evidence.

### Document scope versus the requested functional baseline

| Topic | Existing document position | Current functional direction |
| --- | --- | --- |
| Authentication and durable storage | BRD §10.2 and PRD §6 explicitly exclude production authentication and persistence from the competition prototype | The user now identifies auth, RBAC, and database-backed records as basic expectations; include a practical application baseline, without assuming enterprise SSO |
| Personas | Four demo personas, switching a view | Authenticated users with memberships and server-enforced permissions; persona preview may remain only in an explicitly isolated demo |
| Customer and business masters | Customer names and operational fixtures; no complete master-data administration specification | Establish manageable, referenced master records before building generic transactions |
| Workflow | BRD BR-24 limits the prototype to generation/validation/approval; PRD §8.5 and architecture §10.7 still require activation and order instantiation | Add order types, versioned templates, approval/activation, and an actual execution runtime |
| Product architecture | References a larger ManuOS system and an enterprise roadmap | Referenced components are not proof of implementation in this repository |

The original prototype exclusions explain why some foundations are absent. They
do not establish that the requested usable application is complete, and they do
not justify calling unfinished in-scope actions functional.

## 2. Capability and evidence inventory

| Foundation | Current implementation | Gap and effect | Priority |
| --- | --- | --- | --- |
| Database and migrations | No database dependency/repository/migrations; graph initialized from seed in `src/store/graph-store.ts` | No durable system of record, transactional writes, restart continuity, or migration lifecycle | P0 |
| Users and authentication | `PERSONA_PROFILES` constants and `currentPersona`; account logout only changes component state | No user records, credentials/session lifecycle, real logout/revocation, disabled-user enforcement, or protected application entry | P0 |
| Membership, roles, permissions | `allowedPersonas` exists only in navigation metadata; source search finds no enforcement consumers | No authoritative action authorization, workspace ownership, own-task restrictions, or customer access scope | P0 |
| Company/workspace and organization | Seeded `Factory` profiles; department and machine class are strings | No workspace setup, department/resource ownership, managed calendar/shift definitions, or access memberships | P0/P1 |
| Customers | `Order.customerName` is a string; no `Customer` entity, API, or page | No customer IDs, contacts, active status, order ownership, or portal-user linkage | P1 |
| Suppliers and partners | `Material.supplier` is a string; seeded factories contain offers | Supplier identity/contact master and external partner accounts are absent; network matching profiles are not vendor management | P1 |
| Order types | Intake passes a local `workflowName` as `orderTypeName`; no `OrderType` entity | No order-type catalog, stable IDs, active status, default workflow, or reusable engineering configuration | P1 |
| Workflow definitions and versions | Local `WorkflowNode[]`/`WorkflowEdge[]`; no `WorkflowTemplate` in the actual domain types/store | No saved draft, review, publication, version pinning, retirement, or template selection | P1 |
| Workflow runtime | DAG validator plus independent scheduling/store actions | No order workflow instance, generic node instances, allowed-transition engine, join/condition evaluation, rework attempts, or runtime authorization | P1/P2 |
| Production resource masters | Machines/materials/technicians exist as seeded types and arrays | No management screens/APIs, machine assignment relation, material UOM/spec references, technician-to-user mapping, or managed skill/cert catalogs | P1 |
| Product/process/QC masters | Operation names, part families, routing and QC instructions are embedded in code or AI drafts | No referenced operation library, item/material master, BOM/routing revisions, or QC checklist definitions | P1; keep the first iteration limited to data needed by working orders |
| Orders and engineering intake | Seed orders plus two confirmation handlers that show a toast | No real order creation, customer/type/version FKs, retained RFQ questions, approval lifecycle, or generic detail route | P2 |
| Planning and scheduling | CPM/calendar/capacity functions and scenario graph | No persisted resource reservations; capacity results include fixed bottleneck/date assumptions rather than deriving all constraints from masters | P2 |
| Shop-floor execution | Local timer and client quantity updates | No durable task sessions/output records, generic task-to-order resolution, or actor identity from a session | P2 |
| QC and traceability | A `QCRecord` interface exists, but no QC collection in the graph store; fixed passport page | Type existence is not QC persistence; unit inspection/rework evidence and truthful per-serial lookup are missing | P2 |
| Inventory transactions | Material totals and fixed TB-24 receipt mutation | No stock ledger, lot-level reservation/receipt/consumption, UOM checks, or generic release of only eligible successors | P2 |
| Basic purchasing/inbound supply | Supplier text, ETA fields, and a fixed network supply acceptance | No purchase/supply order lines, approval/open quantities, partial receipts, incoming-quality disposition, or supplier-to-receipt traceability | P2 |
| Finished goods and delivery | Order counters and a split-delivery promise | No finished-goods stock postings, shipment allocation, dispatch/receipt records, shipped quantity, or partial-delivery reconciliation | P2/P3 |
| Engineering document control | RFQ text, AI/sample BOM/routing, drawing UI references | No persisted reviewed BOM lines, document revisions, released specifications or attachment metadata linked to actual work | P1/P2 |
| Operational reports | Scenario dashboards and audit displays | No stock card, shortage/open-supply report, WIP/QC queue or order-to-shipment reconciliation from authoritative records | P2/P3 |
| Recovery/network/customer decisions | Some local state mutations, fixed targets and actors | No durable requests, permission checks, stale-revision conflicts, idempotent approval/receipt, or general bilateral lifecycle | P2/P3 |
| AI boundary | Server-only provider calls, browser-supplied snapshots and partial cache keys | No authenticated context builder; numeric fallback facts can be fixed samples; cache identity is not a full authorized workspace/revision/context key | P3; authentication and scoping are prerequisites for real data |

P0 is the application foundation; P1 configures a workspace; P2 runs a complete
manufacturing loop; P3 integrates intelligence and ecosystem behavior on that
foundation. These are dependency priorities, not completion percentages.

### Concrete code anchors

- `src/domain/types.ts:70`: Order has `customerName`, but no customer, order type,
  workflow version, or workspace relationship. `Material.supplier` is also text.
- `src/lib/navigation.ts:1`: the four personas are a TypeScript union. Their
  `allowedPersonas` metadata is not consumed by access-control logic.
- `src/store/graph-store.ts:525`: changing persona is a client `set`, not login.
- `src/components/account-menu.tsx`: Profile reads constants, Settings changes
  persona, and Logout changes `sessionEnded` React state. These are demo controls.
- `src/store/selectors.ts:44`: the customer projection selects hardcoded order
  1042. It does not resolve orders from an authenticated customer membership.
- `src/app/api/ai/brain-qa/route.ts:4` and the other AI route handlers do not
  establish an authenticated principal or an authorized workspace snapshot.
- `src/app/orders/new/page.tsx:207` and
  `src/features/intake/intake-modal.tsx:247`: both confirm handlers report success
  without creating a domain order.
- `src/engines/capacity.ts:42`: a fixed anchor and assembly buffer drive the date;
  the supplied machines are not used to derive actual load/capacity constraints.
- `src/engines/network.ts:47`: capacity results use all available hours and mark
  partners eligible without evaluating the supplied department/certification
  needs. Supply arrival/date savings are fixed constants at lines 78–79.

## 3. Workflow analysis: what exists versus an engine

### Present code

`workflow-validate.ts` checks empty definitions, duplicate node IDs, missing edge
endpoints, self-edges, and cycles through topological sorting. Isolated nodes only
produce warnings, so the result can still be valid. An edge `condition` is a
string field that is not interpreted. There is no role coverage validation in
this function despite the reference inventory and UI claiming it.

The generation route returns structured provider/sample output. It does not
validate the DAG through the domain validator on the server or store a template.
The page/drawer holds the returned graph in React state. A graph preview and a
valid topological order do not create orders or execute transitions.

### Required layers

1. **Order type:** reusable business classification, code/name/description,
   active status, and a published default process version.
2. **Definition:** typed nodes/actions, departments/roles, dependencies and joins,
   resource/material requirements, forms, QC gates, and approved condition types.
3. **Version lifecycle:** draft → review → published → retired, with approver and
   timestamp. Published versions are immutable; edits create a new version.
4. **Instantiation:** an order pins a published version and creates its actual
   manufacturing orders/jobsheets/tasks and required-material records atomically.
   New template versions do not silently rewrite in-progress orders.
5. **Runtime:** commands such as start, pause, record output, submit QC, pass/fail,
   and release enforce current state, actor permission, dependency completion,
   materials, resource eligibility, and quantity rules on the server.
6. **Evidence:** transitions, assignments, output, inspections/rework, and approvals
   become linked persisted records that power scheduling, audit and passports.

The docs' wording "DAG with loop-backs" needs an explicit semantic resolution.
Keep scheduling dependencies acyclic; represent rework as versioned attempts or
explicit runtime rework transitions with their own work/evidence, not an
unconditional cycle handed to CPM. Human/AI condition text must not be evaluated
as arbitrary executable code; use a bounded registry of supported predicates.

## 4. Minimum master data and user-facing modules

This is a proposed usable-product baseline, not a claim that every administration
page was promised by the competition PRD. Some domain concepts are explicit in
the docs; separate CRUD/catalog pages and lifecycle rules fill dependencies the
prototype left implicit.

| Area | Required usable surfaces and relationships |
| --- | --- |
| Access and account | Login, real profile/session/logout, user administration, workspace membership, role/permission assignments |
| Organization | Workspace/company profile, departments, shifts/calendar, basic workspace settings |
| Commercial masters | Customers and contacts; suppliers/partner references; portal-account to customer linkage |
| Manufacturing masters | Order types, operations, machines/classes, materials/items and UOM, technician skills/certifications, minimal BOM/routing and QC checklist definitions |
| Workflow configuration | Template list/detail, draft editing, deterministic validation, preview, review/publish, version history and retirement |
| Orders | List/detail, RFQ/intake, engineering questions/review, type/version selection, approval/release and generated production structure |
| Operations | Plan/dispatch, own-task queue, start/pause/output, QC/rework, stock receipt/consumption, recovery/approval |
| Evidence and external views | Audit, passport-by-serial, actual document evidence, customer-owned orders/acknowledgment, consented network proposals/deals |

Navigation should reflect these modules and permissions. It is not appropriate
to decide completeness by a fixed sidebar-item count: several modules need a
list/detail/edit lifecycle, while dialogs remain suitable for bounded actions.

### Master-record behavior

- Stable codes and workspace-scoped uniqueness; referenced records are linked by
  ID. Keep historical name/spec snapshots where needed alongside those links.
- Create/read/update/archive with validation and referenced-record safeguards;
  archive a used master rather than deleting operational history.
- Active customer, order type, published workflow, departments, machine classes,
  material/UOM and technician requirements are validated before order release.
- Version BOM/routing/QC requirements attached to released work; changing a master
  must not rewrite approved production instructions without an explicit revision.

## 5. Identity and RBAC baseline

Authentication, permission grants, and ownership are distinct requirements.
The server resolves the user and workspace membership from a real session;
client-submitted persona, actor name, customer ID or workspace ID is not proof of
authority. Logout revokes the session. Disabled memberships lose access.

Use a permission catalog and role-to-permission mappings rather than relying only
on a role-name hierarchy. Suggested capabilities include `customer.manage`,
`order.create`, `order.release`, `workflow.publish`, `task.assign`,
`task.execute_assigned`, `qc.inspect`, `material.receive`, `recovery.approve`,
and `customer_order.read_own`. Exact initial role groupings remain a product
configuration choice; the four personas are insufficient to express all these
responsibilities by themselves.

| Actor group | Proposed boundary |
| --- | --- |
| Access administrator | Users, memberships and grants; business approval permissions are separate explicit grants |
| Owner/manager | Workspace visibility and approvals only where granted |
| Sales/engineering/planning | Customer/order entry, engineering configuration, workflow authoring or planning according to grants |
| Supervisor | Authorized production planning, assignment and operational oversight |
| Technician | Assigned operations and allowed execution actions; cannot grant themselves roles or record independent QC approval |
| QC inspector | Inspection/rework decisions and evidence for authorized work |
| Warehouse | Authorized stock receipt/reservation/issue transactions |
| Customer portal user | Read/acknowledge only orders linked to their customer and workspace; no internal costing or other customers' data |

Apply both permissions and ownership predicates in server reads/writes, including
documents/passports and AI context generation. Hiding navigation is only a UI
projection of the same policy. Cross-factory deals also need the authenticated
party's authority plus channel-specific sharing consent.

The present repository holds fictional seed data; this source audit does not
claim a verified disclosure of real customer records or a performed attack.

## 6. Revised SQLite architecture and dependencies

```text
Authenticated user + workspace membership
                ↓
Permission and record-ownership checks
                ↓
Validated resource reads / business commands
                ↓
Master data + published workflow version
                ↓
Order → production instances → execution/QC/material transactions
                ↓
SQLite transaction: domain changes + audit + command/revision checks
                ↓
Authorized UI projections, customer portal, engines and AI explanations
```

At minimum the data model must cover users, sessions, workspaces, memberships,
roles/permissions/grants, customers/contacts, suppliers, departments/calendars,
machines/classes, material items/UOM/lots, technicians/skills/certifications,
order types, workflow definitions/versions/nodes/edges, orders and engineering
drafts/questions, production instances/tasks/dependencies/assignments, execution
and QC records, stock movements/reservations, shipments, recovery/deal/approval
records, documents/passports/events, history and audit.

Use relationships, constraints and transactions. Typed/versioned configuration
JSON can hold supported workflow/form schemas; a saved UI graph is not a
substitute for the relational business records. Server services compute and
validate mutations; Zustand becomes a fetched projection plus UI state.

SQLite is the requested initial persistence target, not a reason to omit schema
migrations, seed-once behavior, referential integrity, command idempotency, or
revision conflict handling. A single server/workspace can be the first deployment
scope while still modeling ownership explicitly. Broader multi-instance hosting,
SSO, distributed queues/event buses, IoT, ERP connectors, blockchain and RAG are
not prerequisites for this functional baseline.

## 7. Revised implementation order and completion gates

1. **P0 — Foundation and access:** schema/migrations/seed, workspace ownership,
   real user/session lifecycle, users/roles/permission grants, authorization
   service and API contracts. Gate: persistent records after restart; anonymous,
   disabled-user, missing-permission and wrong-workspace requests denied.
2. **P1 — Master data:** customer/contact, organization/resources, materials and
   production catalogs, order types, referenced status/archival rules. Gate:
   create/edit/archive through UI and API; invalid references and used-record
   deletion rejected; no code edit required to add a customer or order type.
3. **P2 — Inventory, inbound supply and workflow core:** stock ledger, balances,
   lots/locations, opening balances, stock reservation, basic purchasing/receipts,
   typed workflow definitions, review/publish/versioning, graph validation,
   instantiation and allowed transitions. Gate: reconcile stock to ledger; no
   stock increase on purchase approval; publish two different workflows without
   hardcoded operation logic or rewriting existing work.
4. **P3 — One complete manufacturing loop:** customer → reviewed order → release
   → assignment → execution/output → QC/rework → delivery/passport, with material
   movements and ownership-aware UI. Gate: restart continuity, quantity/stock
   conservation, failed-write rollback, idempotency and correct dependency gates.
5. **P4 — Planning and decisions:** recalculation from actual resources/calendars,
   recovery proposals and approvals, network propose/accept/decline/receive,
   customer acknowledgments. Gate: changes to master availability affect results;
   approvals are authorized and reservations cannot be double-booked.
6. **P5 — AI and completion evidence:** build snapshots from authorized persisted
   records, validate outputs/references, include workspace/user scope and input
   revision in cache identity, provide truthful fallback/source labels, complete
   missing UI paths. Gate: functional flows work without AI; AI cannot bypass
   permissions, invent evidence, mutate records, or reuse stale contexts.

Exercise fresh/empty workspaces and a second customer/order type as well as the
authored hero fixture. A passing seed-specific example does not prove generic
operation. Track source, unit/integration, local HTTP, DB readback, browser and
deployment evidence separately per capability.

## 8. Documentation corrections

- `execution-status.md` and `requirements-matrix.md` contain broad historical
  completion claims that must not be used as current product readiness evidence.
- `SOFTWARE_ARCHITECTURE_MANUOS.md` references `src/lib/auth.ts`, middleware,
  `prisma/schema.prisma`, and `docs/DYNAMIC_WORKFLOW_BLUEPRINT.md` from other
  ManuOS work. Those files are absent here. `reference-inventory.md` confirms
  external provenance for several of them. This audit did not inspect an
  external repository or establish that those implementations can be ported.
- The reference inventory promises role validation in `workflow-validate.ts`,
  but the actual validator does not enforce role coverage.
- The earlier SQLite proposal deferred real authentication and did not put master
  catalogs before transactional work. That ordering is superseded by this audit.
- Existing BRD/PRD prototype scope remains historical context. This document
  records the new functional expectations; it does not silently claim the old
  prototype spec originally included a complete enterprise application.

Deliverable of this pass: expanded source-grounded analysis and revised dependency
ordering. No database, authentication, RBAC or workflow-runtime implementation
was added during this analysis.

## 9. Inventory: actual gap and minimum behavior

### Current source evidence

`src/domain/types.ts:102` defines Material as supplier text, two aggregate
quantity fields, status and ETA. There is no item/base-UOM relationship,
warehouse/location, lot balance, movement, reservation entity or receipt line.
`src/store/graph-store.ts:463` ignores the supplied deal ID when selecting the
material and adds a fixed 42 to TB-24, then releases fixed tasks. It does not
post a transaction ledger, validate an outstanding receipt, or prevent duplicate
receipt of the same supply. API contracts contain no inventory transactions.

`src/data/seed.ts:531` includes TB-24 with on-hand 0 and reserved 42. This is an
unresolved semantic distinction: required future demand may legitimately exceed
stock, but a hard reservation against usable physical stock must not. Do not
migrate those quantities as hard stock reservations without reconciling them.
Passport `materialLot` is text, not evidence of lot-level stock genealogy.

### Minimum inventory model

| Concept | Required meaning |
| --- | --- |
| Item | Stable code, type (raw/component/semi-finished/finished), specification, base UOM, active status and lot/serial tracking policy |
| UOM | Explicit compatible units, precision/rounding and bounded conversions; quantities in unlike units cannot be added |
| Warehouse/location | Identified owned storage locations; raw storage, production/WIP, quarantine and finished-goods can be simple locations rather than a complex WMS |
| Lot/serial | Supplier/manufacturing lot and optional unit serial, linked receipt and production/QC evidence; enforce the item's tracking policy |
| Physical balance | Item + lot/serial + location + quality disposition; a reproducible projection of posted movements |
| Material demand | Versioned BOM/operation requirement for an order/task, required quantity/UOM/date and shortage; this is not an on-hand reservation |
| Hard reservation | Allocation of usable physical stock to an order/task; prevents concurrent double allocation without changing physical on-hand |
| Expected supply | Open approved PO/deal lines, expected date and quantity; can cover future demand but does not become physical stock |
| Stock movement | Posted source/destination, item, quantity/UOM, lot/serial, reference, actor, timestamp and idempotency identity |
| Count/adjustment | Counted versus book quantity, reason, required permission/approval, and correcting movement rather than a silent overwrite |

Use fixed quantity precision compatible with the selected UOM policy. Define
conversion and rounding rules before posting. Integer pieces must not accept a
fractional unit just because another material can be measured in fractional kg.

### Minimum transaction lifecycle

1. **Opening balance:** explicit, traceable opening entries for initial stock;
   optional seed creates these once, not on every page load.
2. **Receive:** post actual partial/full quantities against an authorized supply
   order/deal and supplier lot. Incoming quarantine is physically received but
   unavailable until accepted. Approving or accepting a PO/deal does not add stock.
3. **Reserve/unreserve:** allocate eligible stock against production demand;
   release on authorized cancellation or issue. Do not confuse allocation with
   warehouse movement or count it twice.
4. **Transfer/issue to WIP:** move material from an eligible storage location to
   production/WIP against a released order/task. Preserve ownership, lot and
   remaining reservation relationships.
5. **Consume/return unused:** record actual consumption from issued material;
   return unused material from WIP to eligible storage. An unused return is a
   location movement, not a second supplier receipt or new physical stock.
6. **Record output:** post the actual produced semi-finished/finished item with
   order/task/lot references. Raw material consumption and produced output are
   distinct item movements; intermediate operation quantities are not summed as
   additional finished units.
7. **QC disposition/rework/scrap:** move output between pending/quarantine and
   accepted/rework states. Passing QC changes eligibility, not physical quantity.
   Failed inspection is not automatically scrap; authorized scrap posts one
   disposal movement. Reinspection must not duplicate accepted units.
8. **Ship:** allocate specific QC-released finished units, post dispatch, retain
   shipment lines and partial-delivery history, then record delivery confirmation.
   A promised split shipment is not proof that stock was shipped.
9. **Count/correct:** reconcile balances to counts with an approved adjustment;
   reverse erroneous posted movements through linked compensating entries.

For the first prototype, supplier rejection/return and customer-return flows may
be limited to explicit held dispositions and authorized reversal/return records.
Do not claim a full returns/RMA or financial credit-note system is implemented.

### Inventory invariants

- Per item/lot/location/disposition, on-hand equals posted inflows minus outflows.
  Opening entries are part of that ledger; stored balance projections reconcile.
- Reservable stock excludes quarantine, rework, scrap and production-held/WIP
  stock. Available eligible stock equals eligible on-hand minus active hard
  reservations in that same scope. No physical or available balance goes negative.
- Same-item transfers debit the source and credit the destination atomically;
  transfer alone does not change the workspace's physical total.
- Consumption and shipment reduce their actual source balance once. Issuing a
  material to WIP and later consuming it must not deduct the raw warehouse twice.
- Receipt cannot exceed the open source quantity without an explicitly permitted
  tolerance/change. Repeating the command does not receive stock twice.
- Reservation/issue/consumption and final output are linked to actual production
  records. Changing quantity in a label or order counter is not a stock posting.
- Material receipt may release only operations whose complete dependencies,
  required usable material quantities, resource checks and workflow guards pass;
  it must not mark every downstream QC/release task ready unconditionally.
- Completed, QC-accepted, rework/scrap, allocated-for-shipment and shipped quantities
  have explicit meanings and reconciliation. QC and shipping do not manufacture
  extra units; partial shipments cannot exceed accepted available output.

### Numerical reconciliation fixture

Use a new 10-unit order with a reviewed BOM of 6 pieces of raw component per
finished unit. Start from zero stock and receive 100 raw pieces. This is a
proposed verification fixture, not a result observed in the current application.

| Posted step | Raw storage | Raw WIP | Active raw reservation | FG pending/rework | FG released on-hand | Cumulative shipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Receive 100 raw | 100 | 0 | 0 | 0 | 0 | 0 |
| Reserve 60 | 100 | 0 | 60 | 0 | 0 | 0 |
| Issue 60 to WIP; consume the reservation | 40 | 60 | 0 | 0 | 0 | 0 |
| Consume 60 raw and record 10 finished units pending QC | 40 | 0 | 0 | 10 | 0 | 0 |
| Accept 8; hold 2 for rework | 40 | 0 | 0 | 2 | 8 | 0 |
| Ship 5 accepted units | 40 | 0 | 0 | 2 | 3 | 5 |
| Rework/reinspect the remaining 2; no extra material in this fixture | 40 | 0 | 0 | 0 | 5 | 5 |
| Ship the remaining 5 | 40 | 0 | 0 | 0 | 0 | 10 |

Immediately after reservation, raw on-hand is still 100 and available is 40.
After final shipping, cumulative completed/QC-accepted quantities are both 10
while FG on-hand is zero. Shipment must not reduce historical QC acceptance,
and reinspection must not turn 10 produced units into 12. Attempting an 11th
shipment or posting the same receipt again must be rejected or replay the
original command result without changing balances.

## 10. Consolidated proper-prototype functional baseline

The baseline follows the BRD's ten-department path (Marketing, Engineering Design,
Engineering Process, PPIC, Warehouse, Purchasing, Production, Assembly, QC,
Delivery). These can share modules and services; ten departments do not require
ten independent applications or microservices.

| Module | Minimum usable capabilities | Persistent evidence of completion |
| --- | --- | --- |
| Access and administration | Login/logout, account, users, roles/permissions, workspace membership and customer-user mapping | Real sessions and permission/ownership checks on reads and commands |
| Company and resource setup | Departments, calendar/shifts, machines/classes, people/skills/certifications, UOM and locations | Editable referenced masters with archival and dependency validation |
| Business and item masters | Customers/contacts, suppliers, item/material/product definitions, order types | New records usable in transactions without changing source or seed |
| Engineering | RFQ/manual intake, reviewed specifications/drawing revision, BOM quantities/UOM, routing durations/resources, QC criteria, unresolved questions | Saved reviewed revisions pinned to released work |
| Workflow setup | Saved templates, bounded node/transition types, parallel dependencies/joins, review/publish/versioning | Different order types instantiate different approved work structures |
| Orders and commitments | List/detail, customer/type/version, quantity/dates, draft/review/release/cancel rules, material demand and production breakdown | Real order and task records; changes/reservations/audit commit together |
| Planning/PPIC | Material availability/shortage, resource calendar and load, task assignment, planned start/finish, dependency and capacity checks | Persisted assignments/reservations and reproducible schedule from actual input |
| Purchasing/inbound supply | Supplier/supply order, lines, required quantities/date, approval, expected supply, partial receipts | Open supply quantities reconcile to posted receipts and held/accepted material |
| Inventory/warehouse | Balance and stock-card views, receive, reserve, issue/transfer, consume/return, count/adjustment, lot and disposition | Transaction ledger and balances reconcile after refresh/restart |
| Production/assembly | Assigned work, instructions/version, start/pause/resume/finish, actual material/time/output, blockers | User-attributed execution records with valid runtime transitions |
| Quality/rework | Incoming/final inspections as applicable, actual checklist results, pass/fail, held stock, rework attempt, release | Inspection evidence linked to lot/unit/task; accepted quantity counted once |
| Finished goods/delivery | Available accepted FG, shipment allocation, packing/delivery records, partial dispatch and delivery confirmation | Actual shipment movements and remaining order quantities reconcile |
| Customer/traceability | Own-order list/detail, factual progress/ETA, promise acknowledgment, available evidence, passport-by-serial | Auth-scoped data and documents resolved from stored records |
| Intelligence/decisions | Actual-data dashboard, CPM/ripple, shortage/capacity impact, recovery approval, consented network supply/capacity decisions | Calculations use current persisted inputs; approved changes create normal business transactions |
| Shared application behavior | Search/filter/paging where useful, direct links, validation, loading/empty/error/retry/not-found, audit/history | Named actions complete or explain rejection; failures never fake a saved success |

Simple RFQ review and an order commitment are sufficient for the first commercial
flow. Full CRM, quote-pricing automation, AP/AR, invoicing/tax, accounting valuation,
payroll, advanced WMS, ERP connectors and enterprise SSO are follow-on scope, not
requirements to finish this baseline. Basic source quantity, rates when used in
cost calculations, inbound supply and material/FG custody cannot be skipped.

### Navigation proposal

- **Overview:** operational dashboard and attention queue.
- **Orders & engineering:** orders, RFQ review, specifications/BOM/routing.
- **Planning & production:** schedule/orchestrator, assignments, own workstation.
- **Inventory:** balances, stock card/movements, receipts, issues/returns,
  transfers and counts; use tabs/details where appropriate.
- **Purchasing:** suppliers and open supply/purchase orders with receipt links.
- **Quality & delivery:** inspections/rework, finished goods, shipments/passports.
- **Configuration:** customers/items, order types, workflow versions, organization
  and resource masters, users/access settings according to permissions.
- **Customer portal / network:** separate authorized projections and partner flows.

This describes information architecture, not a mandate to add every leaf as a
sidebar item. Page count cannot be the acceptance criterion.

## 11. One operational slice must prove the whole foundation

The following acceptance script is proposed. It has not been executed against
the current app, and the current implementation cannot yet satisfy it.

1. Log in as a configured staff user. Create a customer, supplier, material and
   finished item, base UOM, storage locations and eligible resources through UI.
2. Create an order type and a workflow including parallel preparation and one QC
   gate. Save/review/publish it. Create a second version without rewriting the first.
3. Enter an RFQ/order for the new customer, review BOM/material quantities and
   instructions, select the published version and release it. The order pins that
   version and creates real production instances/tasks/material demand.
4. Demonstrate a shortage. Create and approve supply for it. Stock stays unchanged
   until an actual receipt; partial receipt leaves an outstanding supply quantity.
5. Post receipt to the right lot/location and required incoming quality state.
   Only accepted eligible stock becomes reservable. Reserve for the order.
6. Issue/transfer material to WIP; an assigned operator starts eligible work,
   records actual consumption/time/output, and returns any unused material.
7. Complete predecessor operations and verify the join/gates. Run one failed
   inspection, one rework attempt and successful reinspection without doubling output.
8. Release finished goods, ship part of the accepted quantity, then ship the
   remainder. Compare stock ledger, QC-accepted quantity and order delivery totals.
9. Log in as that customer; see only their order, acknowledgment and actual
   available evidence. Another customer's identifier must not expose their data.
10. Open the resulting passport and trace the receipt lot, material use,
    operator/task versions, inspection/rework, release and shipment records.
11. Restart the server and open a fresh browser session. Masters, orders, stock,
    work and audit persist. Workflow versions, quantities and permissions hold.
12. Repeat with a second customer/item/order type and a materially different
    workflow. Introduce a material delay and resource change; impact/recovery
    recompute from those actual records, not from fixed hero IDs/dates.

Negative gates are part of completion: unauthorized role/customer/workspace;
expired session; missing/archived master; unpublished workflow; invalid transition;
insufficient stock; incompatible UOM; held stock; repeated receipt/QC/output;
over-shipment; conflicting concurrent reservation; rollback on failed posting;
unknown order/lot/serial; provider unavailable. A UI screenshot does not prove
any of those contracts.

## 12. Delivery sequence and evidence standard

1. **Application/data foundation:** schema and migrations including stock concepts,
   SQLite repository, seed-once/bootstrap, users/sessions/RBAC and ownership,
   command/API contracts, audit/idempotency/revision checks, durable runtime path.
2. **Master setup and engineering configuration:** customer/supplier/item/UOM/
   location/resource catalogs, order types, reviewed BOM/routing/QC definitions,
   workflow draft/publish/versioning. Referenced masters precede transactions.
3. **Inventory and inbound supply slice:** opening balances, supply orders/receipts,
   ledger, eligible balances, reservations, issue/return/consumption, stock cards
   and controlled corrections. Prove quantities and transactions before coupling
   production automation to them.
4. **End-to-end manufacturing slice:** real order release/instantiation, runtime
   transitions, assignments/time/output, quality/rework, FG posting, shipment,
   customer projection and passports. Implement Sections 9–11 as one coherent loop.
5. **Planning and intelligence integration:** actual calendars/capacity/material
   inputs, disruptions and recalculation, recovery/network actions using the same
   receipt/reservation/production commands, and AI on authorized server snapshots.
6. **Hardening and operational handoff:** empty-workspace onboarding, multiple
   customer/type cases, restart/backup/restore and denied/conflicting operations,
   browser verification of complete paths, and evidence-linked requirements status.

Use a modular Next.js server application and SQLite first; neither a new
microservice fleet nor a generic framework for arbitrary business code is needed.
Choose one durable server/file deployment for SQLite and document its backup and
restore procedure. Do not treat a serverless container's local file as verified
durable hosting without resolving and checking that deployment explicitly.

Each capability is complete only when its **UI → authenticated API/command →
validated business rule → committed SQLite records → fresh readback** path is
demonstrated, including meaningful failure states. Keep source inspection, unit/
integration checks, HTTP behavior, DB reconciliation, browser flow and deployed
proof separately labeled. Update status from that evidence, not from file or
screen counts. All gates in this document remain proposed until implemented
and verified.

## 13. User roadmap: workflow engine and CoreAI boundary

Source: the user-supplied roadmap image in this conversation. Its target modules
and priorities are Order Hub, Engineering Hub, Shop Floor, Material Readiness,
Workflow Studio, Planning & Dispatch, Quality & Traceability, Customer Portal
(P0); Command Center and CoreAI Intelligence (P1); Cost Intelligence (P2).
These are target priorities, not current completion statuses or a demand to
implement every feature in one release.

### Current answer: workflow engine

**A generic persisted workflow execution engine is not implemented.** There is
an AI generation route, local graph preview, and a partial DAG validator. These
are usable starting components, but there is no persisted order-type template
lifecycle or runtime instances, and the order-confirm actions do not instantiate
production work. CPM/ripple scheduling functions do not replace workflow state
transitions, permission checks, or execution evidence.

For the first selected operational slice, implement a deliberately bounded
engine: typed operation/QC/approval nodes, dependency/parallel joins, a registry
of supported guards/actions, saved draft/published versions, per-order pinned
instances, and server commands that validate/commit transitions and audit in
SQLite. Rework uses explicit attempts/transitions while the scheduling graph
remains acyclic. Manual definition is supported; AI-generated definitions are
optional drafts passing the same validation/approval path.

This does not require a distributed durable-workflow service, arbitrary scripts,
an unrestricted low-code form builder, extensive plugins, or a full BPMN editor.
Those are possible later extensions, not prerequisites for the first workflow
that actually runs work.

### Current answer: AI intelligence

**Provider integration exists in source; a complete grounded CoreAI product is
not implemented or verified.** `src/server/ai/gemini-client.ts` invokes Google Gen
AI SDK when configured. There are nine server route handlers. This pass did not
make a provider call, inspect secret values, or verify live Gemini success.

| AI route | Explicit UI caller found in current source | Functional assessment |
| --- | --- | --- |
| `brain-qa` | Brain drawer | Chat connected in source; browser snapshot and scenario-specific fallback facts; no persisted authorized context builder |
| `extract-rfq` | Intake drawer and new-order page | Extraction connected in source; reviewed result still does not create an actual order |
| `generate-workflow` | Intake drawer and new-order page | Draft/preview connected in source; no published template or instantiated workflow runtime |
| `promise-explain` | Promise panel | Explanation connected in source; underlying capacity model still has fixed assumptions |
| `explain-impact` | No explicit UI caller found | Route exists; end-to-end feature is not established by route existence |
| `recovery-options` | No explicit UI caller found | Route exists; displayed recovery UI and sample cost outcomes are not proof of live AI simulation |
| `memory-recommend` | No explicit UI caller found | Route exists; no established live recommendation path in this inspection |
| `dispatch-rationale` | No explicit UI caller found | Route exists; no established live rationale path in this inspection |
| `partner-fit` | No explicit UI caller found | Route exists; no established live partner explanation path in this inspection |

The current helper parses JSON with a TypeScript assertion rather than applying
an independent runtime domain validator. Its AbortController is not supplied to
the provider request; a timer by itself does not enforce the stated timeout.
Several route cache keys include only a question prefix/order-type name rather
than full input context and revision. Some fallback objects are returned through
`aiResult` with static example facts/IDs. These need truthful source labeling,
validation and authorized context handling before real business records are used.

CoreAI should build on (a) authoritative domain records, (b) computed engine
results, (c) permission-scoped context and references, (d) validated explanation/
proposal outputs, and (e) separate human-authorized business commands. AI must
not become a bypass around workflow, inventory or approval rules. The selected
operational slice must remain functional when the provider is unavailable.

### Map to the target module roadmap

| Roadmap module | Priority in image | Current basis | First bounded capability / later depth |
| --- | --- | --- | --- |
| Order Hub | P0 | Dashboard order table and intake presentation | Persisted customer-linked order list/detail, lifecycle and workflow selection; expand commercial capabilities later |
| Engineering Hub | P0 | RFQ extraction and sample routing/BOM presentation | Saved reviewed spec/BOM/routing/QC revisions and open questions; advanced document comparison later |
| Workflow Studio | P0 | Generate/preview/validate components | Saved versioned templates plus working bounded runtime; sophisticated authoring/editor components later |
| Planning & Dispatch | P0 | Orchestrator views and scheduling/ranking functions | Real-resource calendar/load, dependencies, assignment and material-readiness gates; advanced optimization later |
| Shop Floor | P0 | Workstation UI, local timer/output actions | Persistent assigned-task transitions, time/material/output records; hardware/IoT later |
| Quality & Traceability | P0 | Inspection types and passport presentations | Actual inspection/rework/release/lot-unit evidence and factual passport; camera AI/cryptographic certification later |
| Material Readiness | P0 | Material seed quantities and fixed supply receipt | Item/UOM/location/lot, stock ledger, reservations, shortages and basic inbound supply; advanced WMS/procurement later |
| Customer Portal | P0 | Fixed hero-order projection | Authenticated own-order progress/evidence/acknowledgment; broader external collaboration later |
| Command Center | P1 | Scenario dashboard presentation | Derived cross-module metrics, exceptions, approvals and navigable evidence; forecasting depth later |
| CoreAI Intelligence | P1 | SDK helper, nine routes, four named UI integration paths | One read-only grounded explanation/assistant path proven on actual records first; recommendation breadth later |
| Cost Intelligence | P2 | Example recovery cost percentages | Future rate/cost model and planned-versus-actual material/labor/rework/subcontract analysis; current constants do not constitute costing |

### Recommended current-release boundary

Select one operational journey across the necessary P0 modules rather than
declaring every P0 module complete: create/review/release an order using a
published process, obtain/reserve/consume its materials, execute assigned work,
inspect/rework, ship and show the correct customer evidence. Authentication/RBAC,
master records, basic supply/inventory and SQLite underpin that journey even
though they are not separate tiles in the image.

Prepare module boundaries and durable relationships for P1/P2. Store actual
material quantities, time, scrap/rework, supplier prices or resource-rate
snapshots when applicable, so later costing has provenance. Do not implement
profit/margin claims or prescribe a complete costing system now. The first P1
AI demonstration can explain why an actual order is blocked using authorized
material/dependency evidence; it does not require every existing route to be
declared complete at once.

This mapping refines scope and status only. It does not establish a shipped
workflow runtime, live AI validation, persisted operations, or P0/P1/P2 completion.

## 14. Status of the six named intelligence capabilities

The user's named capabilities are assessed separately below. None should currently
be marked complete end-to-end. Partial engine code and provider integration are
real implementation assets, but are not proof of a generic persisted workflow
or a verified live-AI outcome. Evidence in this section is source inspection.

| Capability | Present in current code | Missing for functional completion |
| --- | --- | --- |
| AI Production Brain | Brain drawer calls `brain-qa`; route invokes the Gemini helper and has keyword fallback responses | Server-built authorized persisted snapshot, truthful fallback attribution, validated references, input/revision-aware caching and live-provider evidence |
| Promise Engine | Promise form invokes `checkPromiseFeasibility`, then `promise-explain` | Machine input is not used to derive actual capacity; fixed anchor/bottleneck and sample alternatives must be replaced by actual routing/material/calendar/resource availability and checked commitments |
| Production Dependency Intelligence | `analyzeRippleEffect` traverses material/dependency edges and is called on disruption; a separate `calculateCPM` function exists | Hero IDs/dates are special-cased; source search finds no non-test consumer of `calculateCPM` beyond its declaration. Current disruption flow does not establish generic CPM recalculation or complete machine/task-overrun handling |
| Self-Healing Production | Rules generate recovery options; client approval updates order allocation/recovery/audit | Fixed split/cost/outcome assumptions, no general simulation/command application or persisted stock/resource reservations, no authorized/idempotent approval transaction; recovery AI route has no explicit UI call site found |
| AI Engineering Copilot | RFQ extraction and workflow generation are called by intake/page and rendered as drafts/previews | Saved engineering review, customer questions and master references, approved versioned BOM/routing/workflow, actual order/task creation; both confirmation handlers currently only report success |
| Factory Memory | `queryFactoryMemoryStats` filters/calculates some seed history; AI recommendation route exists | Evidence UI maps fixed rows and displays literal 18%/15%; source search finds no non-test consumer of the stats function or UI caller of recommendation route. No persisted execution/QC learning loop or evidence-based routing selection |

Additional Factory Memory caveat: the stats function returns 18% when no matching
rev-1 runs exist and always recommends rev 2 and 15% padding. An empty evidence
set must instead report insufficient history; a proposed planning policy must
remain distinct from observed historical performance.

Acceptance for the six capabilities should use a newly created order and changed
inputs: an actual material/resource disruption changes affected nodes and CPM;
promise feasibility responds to those constraints; approved recovery commits
normal operational records; the Brain explains the current authorized state;
Copilot review creates a real order; completed execution/QC becomes queryable
history that changes subsequent Memory results. Provider unavailable, unknown
IDs, no-history and stale-state cases must remain honest and functional.
