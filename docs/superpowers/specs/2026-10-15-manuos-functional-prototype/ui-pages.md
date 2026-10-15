# UI design, information architecture and page catalog

Status: proposed R0/R1 design, extending `docs/DESIGN.md`; not a claim these routes exist. Product copy is English. Page IDs are traceability identifiers, not sidebar labels. Each page consumes authenticated server read models and explicit commands defined in `api-rbac.md`.

## 1. Navigation and entry

```text
Operational workspace
  Order Hub                 Orders, order intake/detail
  Engineering Hub           Review queue, specs/BOM/routing/questions/documents
  Workflow Studio           Templates, versions, validation/publication
  Planning & Dispatch       Schedule, shortages, assignments
  Shop Floor                My work, active task, output/history
  Material Readiness        Stock, items, supply, receipts, issue/return/count
  Quality & Traceability    QC queue, inspection/rework, passports, delivery
  Command Center            Cross-module exceptions/metrics (R1)
  CoreAI Intelligence       Brain, promise, recovery, memory (R1)
  Settings                  Company, masters/resources, users/access, own account

Customer workspace
  My orders                 Own-order detail, promise acknowledgment, documents
  Profile                   Own account and real logout
```

The material module groups basic purchasing without pretending supplier purchase orders are the full Factory Network marketplace. Delivery is grouped with traceability for the first release; its routes/data remain separate so it can become a navigation group later. Customer accounts enter the customer shell directly. Staff also viewing customer evidence do so through explicit read permissions, not an impersonation dropdown.

Default staff landing: `/orders` until R1 Command Center is functional. Planner/technician/warehouse/QC may have role-appropriate landing preferences, validated against grants. `/` redirects to the authorized preferred landing; `/workspace` is not a second competing route root. Safe internal `returnTo` preserves deep links after login.

## 2. Page catalog — R0

All detail pages support loading, authorized not-found, stale record, empty related list and actual error/retry. `New/edit` denotes form variants, not duplicate data models. A tab is part of the parent detail URL with a validated query/segment and must survive refresh.

Machine-readable [page-catalog.json](page-catalog.json) maps each catalog entry to its proposed route/file and release. It is a future-route inventory, not actual implementation status. There are 62 entries, including one existing-flow Copilot entry, and 61 unique proposed routes; shared archetypes/forms mean these are not 61 independent visual designs. Activate navigation with each functional slice rather than exposing unfinished routes.

| ID | Canonical route | Job and essential contents | Primary write / policy |
| --- | --- | --- | --- |
| A01 | `/login` | Email/password, pending/failure, session-expired notice; no public signup | Provider sign-in; real session |
| A02 | `/account` | Actual name/email, sessions, change-password flow supported by pinned provider | Own profile/password/session revocation |
| A03 | `/settings/company` | Company name, timezone/currency, default calendar, bootstrap checklist | `workspace.manage`; no silent reinterpretation of posted quantities |
| A04 | `/settings/users` | Users/memberships, status, role grants, customer/operator links | `access.manage`; account creation and activation policy |
| A05 | `/settings/users/[id]` | User/membership detail, grants, disable/revoke sessions, linked customer/technician | `access.manage`; preserve final admin |
| A06 | `/settings/roles` | Role definitions, permission matrix, assignments | `access.manage`; no self-escalation via client input |
| M01 | `/settings/customers` | Code/name/contact/status, search/filter; create/edit drawer | `customer.manage` |
| M02 | `/settings/customers/[id]` | Contacts, customer-owned orders, portal memberships | `customer.manage`; scope portal links explicitly |
| M03 | `/settings/suppliers` | Supplier code/name/contact/lead time; create/edit drawer | `supplier.manage` |
| M04 | `/settings/suppliers/[id]` | Profile, supply orders, receipt history | `supplier.manage` |
| M05 | `/inventory/items` | Item code/type/base UOM/tracking/status; create/edit | `item.manage`; do not change used base UOM |
| M06 | `/inventory/items/[id]` | Spec/UOM conversion, stock by lot/location, ledger, open demand/supply | `item.manage`; typed links, no direct balance editing |
| M07 | `/settings/locations` | Raw/WIP/quarantine/FG locations and active status | `location.manage` |
| M08 | `/settings/units` | Base UOM, precision/dimension; item conversion links | `item.manage` |
| M09 | `/settings/departments` | Code/name/status and assigned resources | `resource.manage` |
| M10 | `/settings/calendars` | Working week, shifts and exceptions; clear timezone | `resource.manage`; invalid/overlapping interval errors |
| M11 | `/settings/machines` | Machine/class/calendar/status/load links | `resource.manage` |
| M12 | `/settings/technicians` | User-linked technicians, skills, certificates/expiry, calendar | `resource.manage`; no fake actor/profile constants |
| M13 | `/settings/skills-certifications` | Skill/cert catalog, levels, active state | `resource.manage` |
| M14 | `/settings/order-types` | Type code/name/default template/active state | `workflow.author`; only published default usable |
| M15 | `/settings/qc-checklists` | Checklist/version/method/criteria; draft/review/publish | `quality.configure`; immutable used versions |
| W01 | `/workflows` | Templates by order type, draft/published versions, owners | `workflow.read`; create with author grant |
| W02 | `/workflows/new` | Order type/name, start manually or draft from description | `workflow.author`; no save represented by preview alone |
| W03 | `/workflows/[id]/versions/[versionId]` | Operation map, inspector, requirements/guards, validation, version history | Author edit draft; owner/reviewer `workflow.publish` |
| O01 | `/orders` | Number/customer/item/qty, due/predicted date, material/work/QC/shipping status | `order.read`; create action with `order.create` |
| O02 | `/orders/new` | Select customer/type/item/qty/date; manual entry/RFQ draft; engineering prerequisites | `order.create`; saved draft ID after commit |
| O03 | `/orders/[id]` | Overview, production, material demand, engineering, quality/delivery, history tabs | Explicit release/cancel/acknowledgment according to state/grants |
| E01 | `/engineering` | Draft/review queue, customer questions and revision status | `engineering.read` |
| E02 | `/engineering/orders/[orderId]` | Editable specs/drawing revision, BOM qty/UOM, routing/version, QC checklist, questions | Save draft, submit review, authorized approve; no unresolved blocking question on release |
| P01 | `/planning` | Order/resource scope, dependency graph/Gantt/task list, shortage/availability, exact dates | `planning.read`; schedule proposal/commit and authorized assignment |
| P02 | `/planning/tasks/[id]` | Task constraints, predecessor/material evidence, eligible operator/machine candidates | `task.assign`; eligibility rejection reasons visible |
| S01 | `/shop-floor` | My assigned tasks with readiness, machine, instructions and next action | `task.execute_assigned`; no other operator's queue by default |
| S02 | `/shop-floor/tasks/[id]` | Pinned instructions/revision, material allocation, state/timer, produced/QC/held quantities, event history | Start/pause/resume/output/finish commands, actual pending states |
| I01 | `/inventory` | Eligible on-hand/reserved/available/quarantine/WIP, lot/location filters, shortages | `inventory.read`; balances derived, not editable cells |
| I02 | `/inventory/movements` | Stock-card ledger with source/destination, qty/UOM, lot/ref/actor; export matching actual format | `inventory.read`; link to posted document |
| I03 | `/inventory/receipts/new` | Approved source lines/open qty, actual qty/lot/location, incoming QC disposition | `inventory.receive`; validate source and no duplicate posting |
| I04 | `/inventory/receipts/[id]` | Posted lines, source order, lot, quality and movement links | Read-only posted evidence; authorized correction via reversal |
| I05 | `/inventory/issues/new` | Released order/task demand, eligible buckets/reservations, issue qty/WIP destination | `inventory.issue`; no negative/held stock issue |
| I06 | `/inventory/transfers/new` | Same-workspace item/lot source/destination and available qty | `inventory.transfer`; quantity conservation |
| I07 | `/inventory/returns/new` | Issued WIP balance, unused qty, return location/reason | `inventory.issue`; no new stock fabricated |
| I08 | `/inventory/counts` | Count queue, location, submitted discrepancies/status | `inventory.count`; approve grant separate |
| I09 | `/inventory/counts/[id]` | Book snapshot, counted values, delta/reason and approval/posting | `inventory.adjust_approve`; stale snapshot/recount handling |
| B01 | `/purchasing` | Supply orders, supplier, expected/open qty/date, approval/receipt status | `supply.read`; create draft with buyer grant |
| B02 | `/purchasing/new` | Supplier, actual item/UOM/qty/date/rate, linked shortage reference | `supply.create`; single workspace currency |
| B03 | `/purchasing/[id]` | Approved lines, partial receipts, open quantities, ETA changes/history | `supply.approve` or `inventory.receive` as granted |
| Q01 | `/quality` | Incoming/final inspection queue, held/rework, due operation | `quality.read`; assigned/authorized scope |
| Q02 | `/quality/inspections/[id]` | Actual source lot/units, checklist measurements, pass/rework/scrap disposition, attachments | `quality.inspect`; required checks and distinct quantities |
| Q03 | `/quality/rework/[id]` | Original defect, affected units, approved instructions, new attempt and reinspection | Authorized assign/execute/inspect; evidence links to original output |
| D01 | `/delivery` | Shipments, order/customer, allocated/dispatch/delivery quantities/status | `delivery.read`; new shipment with granted dispatch |
| D02 | `/delivery/new` | Order, promise tranche, QC-released lot/units, packing/destination | `delivery.dispatch`; allocate before dispatch |
| D03 | `/delivery/[id]` | Shipment lines, movement, actual dispatch/received confirmation, documents | Dispatch/confirm delivery under state and permission |
| T01 | `/passports/[serial]` | Actual item/order, lots, operations, QC/rework, final release/shipment evidence | Staff trace permission or customer ownership; unknown serial = not found |
| C01 | `/portal/orders` | Only linked customer's orders and truthful quantities/dates | `customer_order.read_own` |
| C02 | `/portal/orders/[id]` | Order progress/shipments/milestones, permitted docs/passports, promise revision | Own-order acknowledgment only; internal costs/other customers excluded |
| X01 | `/audit` | Authorized operational events by resource/actor/date; evidence links | `audit.read`; no edit/delete actions |

New/edit master drawers are deliberately bounded forms; large engineering/order/workflow editing has a full page. A route catalog entry is not an instruction to build disconnected empty pages first: deliver the page with its API, rule, persisted data and failure behavior.

## 3. Page catalog — R1 intelligence

| ID | Route / entry | Behavior and source |
| --- | --- | --- |
| R01 | `/command-center` | Real cross-module exception queue, orders at risk, stock/material blockers, pending approvals and traceable quantities; drill-down to actual records |
| R02 | `/intelligence/brain` and global assistant | Read-only question over authorized persisted snapshot; evidence links, revision/time and AI/computed/unavailable source |
| R03 | `/intelligence/promise` and order entry action | Quantity/type/routing/date feasibility; resource/material/calendar drivers, uncertainty and validated alternatives; does not silently book capacity |
| R04 | `/intelligence/impact/[eventId]` and planning panel | Actual disruption target, affected/runnable branches, before/after schedule/slack and order ETA deltas |
| R05 | `/intelligence/recoveries/[id]` | Side-by-side feasible options, resource/quantity changes and evidence; explicit human approval applies ordinary commands with revision checks |
| R06 | `/intelligence/memory` | Search evidence by family/operation/material/resource/version, actual planned-vs-actual samples, no-history state and separate policy recommendation |
| R07 | Existing E02/W02 draft actions | Engineering Copilot assists RFQ/spec/BOM/routing/workflow drafting with editable review; resulting records use the same R0 commands |

Cost Intelligence and a full Factory Network marketplace do not get active unfinished navigation entries. A roadmap view may explicitly label them as planned; do not create apparently working navigation that leads to a toast or a canned business result.

## 4. Shared design language and interaction rules

- Follow Plus Jakarta Sans and `docs/DESIGN.md` semantic color meanings. Use existing tokens; body/forms 14px, labels/support 12px where practical; numbers tabular. Dense tables retain useful legibility.
- Desktop uses the existing 228px rail and utility header. Rail scrolls independently; the page owns its primary vertical scroll. Avoid nested full-page scroll regions.
- Header right contains actual account/avatar → Profile, Settings and real Logout. Normal mode has no privilege-changing persona switch. Staff/customer shells reflect granted actions.
- 851–1060px: compact rail/resource inspectors as needed. At <=850px: navigation drawer with backdrop/focus/Escape/close behavior, independent from desktop collapse state. Opening/closing/resizing never leaves a blocking backdrop.
- At <=680px: short page title, compact utility actions, avatar remains reachable. The assistant becomes an accessible icon. Form fields stack; the main submit/approve action stays reachable without covering content.
- Native touch/wheel/keyboard scroll and hidden scrollbar chrome follow the user's request. Focused graph/table regions have a label and visible overflow cue; reduced motion disables smooth programmatic scroll. Do not hijack wheel gestures or animate layout properties.
- Full-width forms have a readable max width; supporting evidence can use a desktop side inspector and become a disclosure section on mobile.
- One primary next action per local context. State why an unavailable action is blocked. Confirmation summarizes actual changes for release/approval/posting/dispatch.
- Browser/server validation errors appear beside fields and in a focused summary. Unsaved edits get navigation protection; successful writes show saved revision/time and actual resulting state.
- Conservative mutations for stock, approval, QC and shipping: pending state until commit; no optimistic stock/quantity changes or success-only toast on failure.
- Unknown entities show not-found; forbidden list entry points explain lack of access without revealing resource data; owned-resource lookup follows the API's enumeration policy.

## 5. Page archetypes and wireframes

### A. Operational list: Orders / receipts / tasks

```text
Header: breadcrumb / page title                         account
Page title + short scope                  [primary action]
Search     status filter     date/scope filter      reset
Number | customer/item | quantity | readiness | due | state
Row links to a real ID; pending actions show committed state
Empty: why no records + one allowed setup/create action
Footer: result count, paging, filter-preserving URL
```

Mobile: keep identity/state/next action first; show secondary fields in a row detail or horizontal table region. Do not shrink every column into unreadable text or hide required decision evidence.

### B. Order detail: overview with linked work and evidence

```text
Order number · customer · status             [review/release]
Ordered | final output | QC accepted | allocated | shipped
Tabs: Overview / Engineering / Work / Materials / Quality & delivery / History
Main: current blockers, promised vs expected, production/delivery timeline
Inspector: pinned type/process/spec revisions, owner, next allowed action
```

Customer view uses the same definitions but a different authorized read model, not CSS-hidden internal columns. Shipments do not decrease historical QC-accepted output.

### C. Workflow Studio: definition versus runtime

```text
Template name · type · version · Draft/Published       [save / submit / publish]
Left: bounded node/action catalog
Center: operation graph with dependencies/parallel joins; validation overlay
Right: selected node's department, duration, resources, QC/approval guard
Bottom disclosure: validation errors, version notes, affected-order usage
Published: read-only + Create new version; running orders retain old version
```

Do not require a complex visual editor to make the engine usable. Initial authoring may use a structured node/edge form with the exact same graph preview and persisted definition. Mobile switches between graph and inspector; nodes/edges can be edited in a structured list without precision dragging.

### D. Inventory and posting

```text
Material readiness                          [receive] [issue]
Item / location / lot / disposition filters
Eligible on-hand | reserved | available | quarantine | WIP
Balances table → item/lot stock card
Posting form: source document + item + actual qty/UOM + lot + destination
Side evidence: open source qty / eligible balance / linked order demand
Review summary → [Post receipt/issue] → persisted transaction detail
```

Available stock is not an editable input. A purchase approval never flashes a received quantity. On mobile, keep source selection and quantity validation together and the review summary before the submit action.

### E. Shop Floor and QC

```text
Task · order · process/instruction revision     readiness/status
Current operation / machine / assigned person
Material availability + predecessors     start/pause/resume
Actual timer derived from server records
Produced / awaiting inspection / accepted / held / scrap
[Record output] → quantity/evidence review → save
QC page: actual units + required checks + results + disposition → finalize
```

QC is a distinct authorized operation. A task timer is not proof of output; an operator cannot grant themselves an independent inspection action by changing persona.

### F. Intelligence and recovery

```text
Question / event / order context                snapshot revision + time
Computed facts and linked evidence
AI explanation OR labeled computed summary / unavailable state
Recovery only: option consequences, feasibility reasons, assumptions
[Approve option] → actual proposed changes review → authorized commit
```

AI drafts remain editable and attributable; resource IDs/numeric claims must resolve against evidence. No 18%/15% recommendation when history is empty. No fabricated telemetry, certification or blockchain seal.

## 6. UI delivery and review order

1. Authenticated shell, access states and master-list/form archetype, including mobile navigation/account behavior.
2. Customer/item/order type masters, Order Hub and Engineering Hub using actual saved draft records.
3. Workflow template/preview/version publication and order release with generated task detail.
4. Inventory/supply list/detail/posting archetype and stock card, then material demand on order/task.
5. Shop Floor, inspection/rework, shipment and customer evidence with quantity reconciliation.
6. Intelligence panels/recovery/Command Center connected to those actual records.

For each archetype, review one populated, empty, failure and permission state at desktop/tablet/mobile in a bounded batch. Preserve working components and compare to the incumbent reference; do not spend cycles polishing disconnected shells. Only introduce a shared component after its actual consumers are known.
