# ManuOS Detailed Feature Catalog

**Source baseline: 18 October 2026.** This catalog describes the current repository implementation, including the latest lifecycle UI and provider-backed builder changes. It is not a statement that every feature has been exercised in a browser, tested against a live provider, or deployed to a particular environment.

[README](../README.md) · [Operating Guide](operating-guide.md)

## How to read this catalog

- **Implemented:** an application/domain path exists for the described behavior.
- **Conditional:** operation depends on configuration, permissions, published definitions, available evidence, or approval.
- **Backend/supporting:** server contracts or services exist, but a complete standalone operator journey is not established by a dedicated page.
- **Not connected / limited:** the restriction is explicit in the current contract or capability registry.

Role names do not guarantee a permission. Unless noted otherwise, records are workspace-scoped and state-changing actions are checked on the server. Public/customer evidence has separate access rules.

## 1. Application shell, navigation, and authentication

**Entry points:** `/login`, `/account`, and the authenticated workspace shell.

Implemented behavior:

- Better Auth login with administrator-provisioned credentials; public self-registration is disabled.
- Membership-based workspace identity and capabilities reconstructed on authenticated requests.
- Sidebar groups follow functional areas: Overview, Sales, Engineering, Order lifecycle, Production, Procurement, Inventory, Quality, Delivery, Resources, and Access & Integrations.
- Menu visibility checks declared capabilities, including additional required permissions where configured. Workflow Studio requires author access; form authoring entries require the relevant form permissions.
- Persona-aware landing selection uses the active roles, allowed destinations, and permitted preferred landing page.
- Sign-out calls the server sign-out endpoint and treats a failed response as failure.
- Shared light-theme controls, centered CRUD dialogs, and contextual inspection/AI drawers.

**Limits:** hiding a menu does not replace endpoint authorization. Setting a department does not automatically restrict every record to that department. A shared account may have membership in more than one workspace; editing identity is subject to the supported cross-workspace administration rules.

**Primary source:** [navigation rules](../src/lib/master-navigation.ts), [persona destinations](../src/lib/persona-navigation.ts), [authentication](../src/server/auth/).

## 2. People, roles, permissions, and organizational assignment

**Entry points:** `/settings/users`, `/settings/users/[id]`, `/settings/roles`, `/settings/permissions`.

Implemented behavior:

- Account provisioning and membership creation with active role assignment.
- People metadata, department, supervisor, job information, preferred landing page, and supported facility/customer/technician associations.
- Account identity editing with uniqueness/version checks and additional safeguards for shared identities.
- Active/disabled memberships, synchronized technician links, and role-based access previews.
- Custom-role creation/editing with catalog capabilities. System roles are inspectable and have protected definitions.
- A read-only permission catalog and active-role grant information.
- Protection against removing the final active access administrator.
- Session consequences for identity/password changes where applicable.

### Implemented personas

| Persona | Responsibility |
| --- | --- |
| OWNER | Cross-functional operational oversight, subject to granted capabilities. |
| ACCESS_ADMIN | People, role, permission, and access administration. |
| SALES | Customer order entry and commercial requirements; labeled Sales / Marketing in persona navigation. |
| ENGINEER | Engineering configuration and permitted workflow authoring/approval. |
| PLANNER | PPIC planning, capacity review, and assignment. |
| TECHNICIAN | Linked-person production execution. |
| QC | Inspection and quality disposition. |
| WAREHOUSE | Inventory, receipts, and shipping according to grants. |
| BUYER | Supplier procurement and supply orders. |
| CUSTOMER | Customer-linked portal access. |

The demo Superadmin is a multirole account. There is no separate role code named `SUPERADMIN`. Marketing campaign automation, HR payroll, and a full HR information system are outside this capability set.

**Primary source:** [access service](../src/server/modules/access/service.ts), [person detail](../src/features/access/person-detail.tsx).

## 3. Master data

**Entry points:** customer/supplier settings, `/inventory/items`, unit/location/order-type settings, and resource/quality settings.

Implemented records include:

- Customers and suppliers with identity/contact information and supported active/archive lifecycle.
- Raw/finished items, base unit of measure, precision, tracking configuration, and supported unit conversions.
- Storage/WIP/quarantine/finished-goods locations as configured in the workspace.
- Order types with compatible workflow defaults and associated configuration.
- Departments, machine classes, machines, technicians, calendars, skills, certifications, and QC checklists.
- Supporting production/issue reason catalogs through the relevant domain services.

Master-data forms and APIs validate references before operational use. Resource activity and archived state affect eligibility. An existing historical reference is not retroactively rewritten by creating a replacement master record.

**Limits:** unit conversions and tracking settings are configured per supported item model; the application does not infer arbitrary industry units or traceability rules from item descriptions.

**Primary source:** [master-data services](../src/server/modules/masters/), [master navigation](../src/lib/master-navigation.ts).

## 4. Workforce, qualifications, availability, and shifts

**Entry points:** `/settings/technicians`, technician/person detail, `/settings/calendars`, `/settings/workforce`.

Implemented behavior:

- Technician profile creation and account linkage.
- Per-person account/access, skills/certifications, availability, and assigned-work sections.
- Skill assessments with level and verification information.
- Certificate records and validity windows.
- Working calendars with recurring shifts and exceptions.
- Published roster intervals for working shifts, leave, training, and supported overtime.
- Assignment/eligibility checks against roster coverage, qualifications, bookings, resource activity, and facility scope.
- Workforce overtime policy and request review; policy is distinct from production assignment.

### Shift swaps

- Requests choose two different future published technician shifts in one facility.
- Shift duration must be positive and no longer than 24 hours.
- A request does not change either shift until authorized approval.
- Approval rechecks versions, roster conflicts, booking conflicts, supported unstarted task assignments, qualifications, and working limits.
- Eligible scheduled task ownership can move with the swapped time slots.
- Tasks crossing a shift boundary or already started cannot be transferred through this shortcut.

**Limits:** a calendar alone is not published availability; a shift alone is not a task assignment. This is a controlled management flow, not unrestricted employee self-service trading. Overtime recovery also requires the supported direct-supervisor approval and capacity revalidation.

**Primary source:** [person profile](../src/server/modules/masters/person-profile.ts), [shift-swap service](../src/server/modules/masters/shift-swap.ts), [overtime policy](../src/server/modules/masters/overtime-policy.ts).

## 5. Order Hub and RFQ intake

**Entry points:** `/orders`, `/orders/new`, `/orders/[id]`, `/orders/intake`.

Implemented behavior:

- Draft order creation with customer, order type, item lines/quantities, requested/promised dates, and RFQ context.
- Compatible published order-lifecycle selection with readable workflow/version and initial-stage preview.
- Separate production-routing selection or supported order-type default.
- Order detail, operational progress, linked work, requirements, forms, history/evidence, and supported cost information.
- Multi-item/job structures for supported manufacturing-order execution.
- Explicit lifecycle adoption for eligible existing drafts with validation and audit.
- Reviewed RFQ extraction from pasted text or supported stored UTF-8 TXT/CSV documents.
- Handoff of reviewed intake fields to a new order draft.

**Limits:** lifecycle adoption is controlled by `NEXT_PUBLIC_MANUOS_ORDER_LIFECYCLE_ENABLED`. A legacy order without lifecycle stages is still supported. Published workflow versions must match the supported order type/kind. Released/in-progress work cannot silently adopt a new lifecycle. RFQ PDF/image OCR and page/line-span citations are not connected; text extraction still requires human review.

**Primary source:** [order form](../src/features/orders/components/order-form.tsx), [order service](../src/server/modules/orders/service.ts), [engineering intake](../src/server/modules/engineering/intake.ts).

## 6. Workflow Studio: order lifecycle

**Entry point:** `/workflows` and `/workflows/[id]/versions/[versionId]` for `ORDER_LIFECYCLE` templates.

Implemented behavior:

- Versioned cross-department stages separate from production-operation definitions.
- **Node view** projects stage predecessors into a React Flow graph, including parallel layers and conditional-edge labels.
- **Edit view** provides a compact stage list.
- Add-stage and node/list selection open the shared centered stage modal.
- **General / Routing / Forms** sections organize identity/action, ownership, scheduling, dependencies, branch configuration, and evidence pins.
- Manual stage **Apply changes** updates the local editor; **Save draft** persists it. Cancel restores the modal baseline, including removal of an uncommitted new stage.
- Stage removal updates predecessor references; remaining configuration still has to validate before save/publication.
- Specific-member or eligible department/role-queue assignment.
- Deadline policies for administrative stages; approved-routing capacity policies for supported planning/production stages.
- Published form pins store exact version/hash, requiredness, and completion point.
- Execution previews explain intended owner, evidence, scheduling, and successor behavior without reserving capacity.
- Draft/review/published/retired version controls, read-only published views, and fork actions.
- Provider-backed **Draft lifecycle with AI**, followed by readable proposal review and explicit apply.

### Supported lifecycle action adapters

| Action | Required capability | Completion fact |
| --- | --- | --- |
| `ORDER_CONFIRM` | `order.create` | Order confirmation. |
| `ENGINEERING_APPROVE` | `engineering.approve` | Engineering approval. |
| `PLAN_PRODUCTION` | `planning.write` | Validated schedule proposal applied. |
| `EXECUTE_PRODUCTION` | `task.execute_assigned` | Required production tasks completed. |
| `FINALIZE_QC` | `quality.inspect` | Required QC inspections finalized, including applicable rework handling. |
| `CONFIRM_DELIVERY` | `delivery.dispatch` | Required shipment quantities delivered. |
| `REVIEW_EVIDENCE` | `order.read` | Explicit evidence-review completion. |

Dependencies support fan-out/AND convergence. Bounded branch conditions use finalized predecessor order-form selections or QC outcomes (`PASSED`, `PASSED_AFTER_REWORK`, `PARTIAL`, `REJECTED`). Nonmatching branches are skipped; missing facts fail closed.

**Limits:** lifecycle is dynamic within the registered action, graph, and evidence contracts. It is not an arbitrary BPMN/script engine. General loops, nested condition expressions, arbitrary executable stage code, and silent migration of running instances are not supported. Publishing does not imply mandatory two-person approval: current permissions/status rules allow the supported direct draft-publication path.

**Primary source:** [lifecycle editor](../src/features/workflows/components/lifecycle-definition-editor.tsx), [definition validation](../src/domain/order-lifecycle-definition.ts), [action registry](../src/server/modules/order-lifecycle/action-registry.ts).

## 7. Production routing, engineering, and release

**Entry points:** Workflow Studio for `PRODUCTION_ROUTING`, `/engineering`, `/engineering/orders/[orderId]`.

Implemented behavior:

- React Flow routing canvas with operation, inspection, and approval nodes.
- Dependencies and supported duration, department, qualification, machine-class, and QC-guard configuration.
- Workflow draft/review/publication/fork/retirement controls.
- Engineering BOM/routing configuration and approval for relevant order/job records.
- Release creates the applicable production workflow/task instances and preserves approved configuration.
- Required material demand/reservation relationships and supported clarification/change services.
- **Build with AI** drafts routing definitions through the shared review/apply proposal flow.

**Limits:** order lifecycle and production routing are not interchangeable. A template's planned duration is an estimate; measured execution comes from work sessions. Running jobs retain their pinned definition rather than following future authoring edits. Supporting engineering-change/substitution services do not mean every possible engineering process has a dedicated UI wizard.

**Primary source:** [routing editor](../src/features/workflows/components/definition-editor.tsx), [engineering services](../src/server/modules/engineering/), [release command](../src/server/modules/orders/release.ts).

## 8. Form Builder and finalized evidence

**Entry points:** `/settings/forms`, template/version pages, and embedded forms on operational subjects.

Implemented behavior:

- Template purposes: `ORDER_SPEC`, `TASK_EVIDENCE`, `QC_EVIDENCE`.
- Field types: text, textarea, decimal, date, select, multiselect, boolean, attachment, and supported record references.
- Requiredness, labels/help, option lists, type-specific bounds, decimal precision, and supported conditional visibility.
- Validation against unique field keys, valid preceding condition references, permitted values, and attachment constraints.
- Preview and draft/review/publish/retire/fork version lifecycle.
- Supported order-type, workflow-node, and QC-checklist bindings, plus exact lifecycle-stage form pins.
- Draft and finalized submissions with server-side guards; applicable correction/submission history remains traceable.
- Required evidence can block a stage action or stage/task completion according to its binding.
- Runtime instances retain the pinned form rather than switching to the latest template version.
- **Draft with AI** uses the saved template purpose and provider-generated fields; a purpose mismatch blocks application.

**Limits:** forms collect evidence; filling a form does not itself create stock, allocate a machine, finalize an inspection, or deliver a shipment. Only the relevant domain commands produce those facts. Conditional visibility is bounded and is not an unrestricted expression language.

**Primary source:** [form schema](../src/domain/forms/schema.ts), [form services](../src/server/modules/forms/), [form editor](../src/features/forms/components/definition-editor.tsx).

## 9. Lifecycle work, production planning, and recovery

**Entry points:** `/lifecycle-work`, `/planning`, `/planning/tasks/[id]`, `/ai/schedule`, `/ai/promise`, `/ai/recovery`.

### Lifecycle work queue

Shows authorized assigned/eligible department work with claim/reassign actions and links to the appropriate operational module. Evidence-review stages expose explicit review completion. Other stages advance through their actual action adapters.

### Production planning

- Schedule list, Gantt, calendar, task context, dependencies, and assignment actions.
- Qualified technician recommendations based on verified skills, certificate validity, availability, and current load/bookings.
- Finite-capacity dry-runs for a selected released job using approved routing, material reservations, resources, published roster coverage, and existing bookings.
- Reviewed schedule application rechecks current evidence and persists authorized assignments/bookings.
- Dependency/critical-path information where exposed by the planning views.

**Scheduling limits:** absent requirements/roster/material evidence leave work unscheduled. Machines are exclusive, operations are not split across shifts, and proposals are job-scoped. A graph sequence estimate is distinct from a capacity-validated proposal. A preview neither reserves capacity nor commits a customer promise.

### Delivery-date evaluation

Compares a requested date with the same supported finite-capacity evaluation for an existing released job. It returns a supported date only with a complete proposal; missing/partial evidence is not silently promoted to a promise.

### Recovery

Persists and reviews supported schedule changes, alternate machine choices, overtime proposals, and subcontract batches. Applying revalidates evidence and follows required approval/supervisor checks. Subcontract send/return is auditable; return places the operation back in the supported internal execution flow rather than fabricating output or QC.

**Recovery limits:** alternate production routing and optimized split-shipment allocation are unsupported. Machine cost uses configured-rate estimates; overtime labor cost is not modeled by this recovery evaluation.

**Primary source:** [lifecycle work queue](../src/features/work-items/lifecycle-work-queue.tsx), [planning services](../src/server/modules/planning/), [recovery service](../src/server/modules/intelligence/recovery.ts).

## 10. Shop-floor execution, quality, and issues

**Entry points:** `/shop-floor`, `/shop-floor/today`, task workstation pages, `/quality/inspections`.

Implemented behavior:

- Technician-linked assigned work, operation context, instructions, readiness, resource/material/prerequisite information, and task evidence.
- Start, pause, resume, recorded sessions/work intervals, supported issue reporting, and actual output recording.
- Overproduction checks against ordered quantity.
- Applicable document uploads and barcode/QR lookup/scanning paths.
- Inspection/checklist evidence, quantity dispositions, finalization, rework authorization/reinspection, scrap, and non-conformance services.
- Finalized QC and held/rework stock remain tied to actual output and ledger effects.

Quantity invariants include **inspected = passed + rework + scrap**. Reinspection reclassifies existing held stock and cannot spawn new physical output. Recorded execution, physical output, QC acceptance, and delivery remain distinct.

**Limits:** browser/hardware camera access, physical scanners, offline operation, and plant devices require environment-specific verification. An offline-sync backend service is not proof of a complete offline-first workstation. Visual image-based QC inference is not connected; human QC remains authoritative.

**Primary source:** [execution services](../src/server/modules/execution/), [quality services](../src/server/modules/quality/).

## 11. Inventory, procurement, and costing

**Entry points:** `/inventory`, item/movement/count/receipt pages, WIP issue/return/transfer pages, `/supply-orders`, and authorized order costing.

### Inventory

- On-hand, reserved, and available views by supported item/location/lot contexts.
- Reservation/release and opening/receipt/transfer/WIP/consumption/output/QC/shipment/count-related movements through the ledger.
- Readable source selection for material demand and tracked stock where supported by transaction forms.
- Physical count and controlled correction/reversal services.
- Atomic balance projections, strictly positive movement quantities, and server-side conservation checks.

### Procurement

- Supplier supply orders with expected date, material lines, approval, receipt, and partial/full receipt behavior.
- Linkage from outstanding supply to supported material-shortage views.

### Costing

- Standard/actual cost entries and variance by category where the user has `cost.read` and relevant source evidence.
- Source-linked cost review rather than inferred financial results.

**Limits:** reservations are not physical issues; WIP returns are not supplier receipts. Unsupported overdrafts/overproduction are rejected rather than clamped. Cost variance is not a full accounting, invoicing, revenue-recognition, or margin system.

**Primary source:** [inventory](../src/server/modules/inventory/), [supply](../src/server/modules/supply/), [costing](../src/server/modules/costing/service.ts).

## 12. Delivery, customer visibility, and traceability

**Entry points:** `/delivery/shipments`, shipment detail, `/portal/orders`, customer order detail, and published `/passports/[serial]` evidence.

Implemented behavior:

- Allocation of eligible stock to shipments and separate dispatch/delivery confirmation.
- Partial shipments/receipts within supported quantities; the full order remains incomplete until required quantities are delivered.
- Tracking/recipient and supported delivery evidence.
- Customer-linked portal views and supported customer change-request services.
- Order/lifecycle evidence containing actor/department handoffs, definition pins, form submissions, scheduling/recovery records, lot movements, QC/rework, and shipment milestones as available.
- Serial/passport evidence and explicit publication controls for supported public evidence.

**Limits:** partial shipment support is not optimized split-shipment recovery. Internal audit visibility differs from customer/public evidence. A passport record is not automatically published, and traceability does not imply external certification or cryptographic attestation.

**Primary source:** [delivery](../src/server/modules/delivery/), [portal](../src/server/modules/portal/), [lifecycle traceability](../src/server/modules/order-lifecycle/traceability.ts), [passport publication](../src/server/modules/quality/passport-publication.ts).

## 13. CoreAI and Builder AI

**Entry points:** `/ai`, assistant/contextual Ask AI actions, `/ai/risks`, `/orders/intake`, `/ai/memory`, `/ai/schedule`, `/ai/promise`, `/ai/recovery`, and the three builder editors.

| Capability | Implementation | Boundary |
| --- | --- | --- |
| Operational assistant | Authorized record context, explanations, source links, supported order/task scoping, and recent chat history loaded per membership/workspace. | Read-only assistance; limited evidence remains unavailable/restricted. Supported deterministic summary fallback is distinct from model output. |
| Risk inbox | Operational exception summaries and source drilldown. | Does not manufacture evidence or automatically resolve an exception. |
| RFQ extraction | Provider-backed text/TXT/CSV extraction with review/handoff. | No PDF/image OCR or page/line-span citation pipeline. |
| Factory Memory | Measured duration/inspection cohort comparisons. | Buffer recommendations remain disabled until the cohort rule is validated. |
| Technician recommendation | Deterministic ranking of eligible resources. | Actual assignment rechecks current evidence. |
| Schedule/date/recovery | Connected deterministic evaluations and authorized application where implemented. | A language-model narrative cannot establish capacity or change a promise by itself. |
| Form AI | Provider-generated fields/conditions against the saved draft and fixed purpose. | Invalid output blocks apply; no automatic publication. |
| Routing AI | Provider-generated production nodes/dependencies against supported catalogs. | Estimates remain proposals; unknown references are blocked. |
| Lifecycle AI | Provider-generated stages, owners, schedules, dependencies, and published-form pins from scoped catalogs. | Registered actions only; no invented departments, role eligibility, or capacity. |

### Builder proposal lifecycle

1. An authorized author submits requirements for `FORM`, `WORKFLOW`, or `LIFECYCLE`.
2. The server loads the persisted editable target, revision, and relevant workspace records.
3. The configured Gemini client generates a structured candidate.
4. Schema/domain/reference validation produces blocking findings when necessary.
5. A review displays proposed changes and removals, assumptions, and questions.
6. Explicit acknowledgment plus the reviewed content hash and current draft revision are required to apply.
7. Normal domain draft-save commands perform persistence; publication is a separate action.

Generation does not change the target draft. Apply checks stale revisions, target kind/purpose, candidate integrity, and authority. Local unsaved edits are not authoritative provider context; save them before generation if they must be considered.

Missing provider, timeout, or malformed response returns an explicit error. **There is no canned builder-generation fallback.** The shared client has a bounded request deadline and cache; a configured key or a mock-provider specification does not establish a successful live provider call.

**Primary source:** [builder generation](../src/server/modules/builder-proposals/generation.ts), [proposal service](../src/server/modules/builder-proposals/service.ts), [Gemini client](../src/server/ai/gemini-client.ts), [capability registry](../src/server/modules/intelligence/capabilities.ts).

## 14. Integrations, notifications, and supporting server capabilities

**Entry point:** `/settings/integrations` for supported administration, plus the maintained API surface.

Supporting modules include API-key management, inbound imports, outbound webhooks, notification records/connectors, telemetry ingestion, and cross-factory sharing/commitment services.

These services should be evaluated against their actual endpoints, configuration, and permission rules. They do not establish a complete ERP/MES connector, a live equipment dashboard, guaranteed external notification delivery, or automatic partner-capacity procurement. External delivery, activation, retries, device traffic, and production integration must be verified in the target environment.

**Primary source:** [integrations](../src/server/modules/integrations/), [notifications](../src/server/modules/notifications/), [telemetry](../src/server/modules/telemetry/), [sharing](../src/server/modules/sharing/), [API contract](../contracts/openapi.yaml).

## 15. Data integrity and operational safeguards

- SQLite/Prisma persistence with the repository's transaction boundary and command receipts.
- Workspace authorization and supported facility/customer/technician scope.
- Optimistic-lock versions for supported edits/application; a publication version number is not the optimistic-lock revision.
- Audit/event evidence and stable historical definition/form references.
- Double-entry inventory movements with atomic projections and bigint quantities.
- Required finalized evidence before the guarded action/completion point.
- Backup, restore, reconciliation, schema migration, and demo-seed scripts.

**Limits:** a local database, passing isolated tests, or a Docker build alone is not proof of production recovery, multi-instance SQLite safety, hardware readiness, provider availability, or external integration delivery.

## 16. Demonstration and verification scope

The demo seeder prepares persisted scenarios across product families, roles, resources, forms, routings, material/QC/shipment states, and a cross-department lifecycle example. `superadmin.demo@manuos.test` is the default workspace's multirole administrator account. New demo passwords default to `Password123!`; existing passwords are preserved unless reset is explicitly requested.

`/demo` is a separate UI demonstration. Authenticated operational routes use database records. Scenario counts and statuses can change after users interact with the seeded workspace.

The latest builder change was checked with **26 focused specifications**, typecheck, and OpenAPI parsing. Provider responses in those specifications are injected fixtures. This does not constitute live Gemini or browser E2E verification; a complete regression or deployment claim must cite its own run.

For operator procedures, use the [Operating Guide](operating-guide.md). For setup and commands, use the [README](../README.md).
