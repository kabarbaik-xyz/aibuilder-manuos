# ManuOS Operating Guide

**Source baseline: 18 October 2026.** This guide describes the implemented application. Screen labels are quoted as they appear in the UI. Available menus and actions depend on your active workspace membership and permissions. Procedures describe intended use of the current code; they are not a claim that every browser journey or hosted deployment has been reverified.

[README](../README.md) · [Detailed Feature Catalog](feature-catalog.md)

## Contents

1. [Understand the operating model](#1-understand-the-operating-model)
2. [Sign in and find your work](#2-sign-in-and-find-your-work)
3. [Set up people and access](#3-set-up-people-and-access)
4. [Prepare master data and availability](#4-prepare-master-data-and-availability)
5. [Create and publish forms](#5-create-and-publish-forms)
6. [Configure workflows](#6-configure-workflows)
7. [Create an order and review engineering](#7-create-an-order-and-review-engineering)
8. [Manage materials and procurement](#8-manage-materials-and-procurement)
9. [Schedule and assign work](#9-schedule-and-assign-work)
10. [Execute production and inspect quality](#10-execute-production-and-inspect-quality)
11. [Ship, confirm delivery, and trace evidence](#11-ship-confirm-delivery-and-trace-evidence)
12. [Use CoreAI](#12-using-coreai)
13. [Resolve common problems](#13-resolve-common-problems)
14. [Daily operating checklist](#14-daily-operating-checklist)

## 1. Understand the operating model

Four definitions work together:

| Concept | What it controls | Example |
| --- | --- | --- |
| Order lifecycle | Cross-department stages, owners, handoffs, conditions, deadlines, and stage evidence. | Sales review → Engineering approval → PPIC planning. |
| Production routing | Actual operation/inspection/approval steps and their production dependencies. | Cut → Mill → Inspect. |
| Published form | The versioned questions and validation rules used to collect evidence. | Required dimensions, pass/fail result, and conditional defect notes. |
| Schedule and assignment | When work happens and which technician/machine is reserved. | Milling on a qualified technician's published shift. |

A lifecycle stage is not necessarily a machine task. Sales and Engineering work use membership ownership; production tasks use technician profiles, equipment, and bookings.

Three workforce concepts must also stay separate:

- **Calendar:** recurring work patterns and exceptions.
- **Published roster:** explicit availability, leave, training, or approved overtime in actual dates/time windows.
- **Booking:** capacity already allocated to a production task.

A calendar does not automatically mean that a person is free. A published shift does not itself assign a task.

Department is organizational ownership. Role grants permissions. Facility grants and customer/technician links provide supported operational scopes. Assigning a department does not automatically create an organization-wide row-level access boundary.

## 2. Sign in and find your work

1. Open `/login` and sign in with an administrator-provisioned account. Technicians use the same login page.
2. Confirm the workspace shown in the application shell.
3. Use the sidebar groups to locate your work. A menu being hidden can be correct when you lack its capability.
4. Use the account menu to sign out. Report a failed sign-out rather than assuming that navigating to the login page ended the session.

Typical starting destinations are:

| Role/persona | Typical destination |
| --- | --- |
| Owner / demo Superadmin | Dashboard: `/dashboard` |
| Sales / Marketing | Order Hub: `/orders` |
| Engineering | Engineering Hub: `/engineering` |
| PPIC / Planner | Planning: `/planning` |
| Technician | My Work: `/shop-floor` |
| QC | Inspection queue: `/quality/inspections` |
| Warehouse | Inventory: `/inventory` |
| Buyer | Supply Orders: `/supply-orders` |
| Customer | Customer Portal: `/portal/orders` |

A permitted preferred landing page can override the normal destination. Multi-role accounts follow the implemented role priority, so do not assume every account lands on Dashboard.

For local demonstration credentials and seeding, use the [README account table](../README.md#local-demo-accounts-and-scenarios). Existing account passwords may differ from the new-account default.

## 3. Set up people and access

### 3.1 Prepare the organization

1. Create the departments you actually use under **Resources → Departments** (`/settings/departments`).
2. Review roles under **Roles** (`/settings/roles`) and the read-only capability catalog under **Permissions** (`/settings/permissions`).
3. Use **People & Access** (`/settings/users`) to create or manage workspace members.
4. Set the person's department, job information, supervisor, and allowed landing page where those fields are available.
5. Assign roles and supported scopes. Review the menu/access preview before finishing.

An account can have several roles. System roles are inspectable; use supported custom-role editing for your own role definitions. At least one active access administrator must remain. Disabling a membership prevents its workspace access without erasing the person's historical records.

**Sales / Marketing** is the implemented commercial persona. ManuOS does not provide a separate campaign-marketing suite. **PPIC / Planner** handles scheduling; **QC** handles inspection. Department labels do not replace these capability assignments.

### 3.2 Onboard a technician

1. Create a technician profile from **Technicians** (`/settings/technicians`). Set its identity/code, department, facility, and working calendar.
2. Create or edit the login account in People & Access. Assign `TECHNICIAN` and link the matching technician profile. If the account flow requires a profile first, create it before completing the account.
3. Open the person's detail page. Review **Account & access**, **Skills & certifications**, **Availability**, and **Assigned work**.
4. Record and verify the required skills. Skill levels run from 0 (none) through 4 (expert); the configured minimum level matters at assignment time.
5. Record certificates and validity dates. A certificate must remain valid for the relevant assignment window.
6. Publish availability for the intended dates. Then use Planning to assign qualified work.

The login account and technician resource are linked records, not interchangeable identifiers. Creating an account alone does not make the person ready for production assignment.

### 3.3 Change or remove access

Edit roles, scopes, or active/disabled status from People & Access. Changes are checked again on authenticated requests. Editing an account email can revoke sessions and require a new login. A linked account shared across workspaces has additional identity-edit authorization checks; do not treat a read-only identity field as a UI defect.

## 4. Prepare master data and availability

Prepare records before releasing real work:

| Setup | Entry point | Operating purpose |
| --- | --- | --- |
| Customers and suppliers | `/settings/customers`, `/settings/suppliers` | Commercial counterparties. |
| Items and units | `/inventory/items`, `/settings/units` | Materials, finished goods, tracking, precision, and conversions. |
| Locations | `/settings/locations` | Storage, WIP, quarantine, and finished-goods locations as configured. |
| Departments and machines | `/settings/departments`, `/settings/machines` | Owning teams and equipment resources. |
| Skills and certificates | `/settings/skills-certifications` | Qualification catalogs and eligibility requirements. |
| Working calendars | `/settings/calendars` | Recurring shifts and exceptions. |
| Workforce and overtime | `/settings/workforce` | Workspace overtime limits and requests awaiting the current approver. |
| Order types and QC checklists | `/settings/order-types`, `/settings/qc-checklists` | Order configuration and inspection requirements. |

Use supported Edit/Archive actions rather than creating duplicate master records to correct a name or retire an unused record. Archiving must not be used to rewrite historical evidence.

### Availability and shift swaps

Open the technician's **Availability** section to inspect the calendar pattern, published intervals, and shift-swap panel. Select the correct date range and pay attention to the displayed timezone.

To request a swap:

1. Ensure both technicians have future **published SHIFT** intervals in the same facility. Each swap interval must be positive and no longer than 24 hours.
2. Choose **Request swap**, select both shifts, and enter a reason.
3. Review affected work and conflicts. Sending the request does not change either shift.
4. An authorized roster/planning manager approves or rejects the request.
5. Approval rechecks current shifts, qualifications, booking conflicts, work state, facility access, and configured working limits. Review the resulting schedule afterwards.

Only supported, unstarted task assignments may move with the swapped time slots. A task crossing a shift boundary, started work, conflicting leave/training, stale records, or missing qualification can block the swap. This is not a general technician self-service shift marketplace.

For overtime, use the configured request/review flow and the technician's direct-supervisor requirements. Unapproved overtime does not add schedulable capacity. The **Workforce & overtime** page manages policy and approval, while production assignment remains in Planning.

## 5. Create and publish forms

Open **Form templates** (`/settings/forms`).

1. Create a template with a readable name/code and the correct purpose:
   - `ORDER_SPEC`: order specifications and supported administrative lifecycle evidence.
   - `TASK_EVIDENCE`: production/task evidence, including supported planning stages.
   - `QC_EVIDENCE`: inspection evidence.
2. Edit the draft definition. Add field labels, types, requiredness, options, and any conditional visibility.
3. Preview the form with both normal and exceptional inputs. A hidden conditional question should not remain a required visible answer.
4. Save the draft. Submit for review or publish only when your permissions and the version status allow it.
5. Attach the **published version** to a compatible workflow stage, operation binding, order-type binding, or QC-checklist binding through the available editor.

Supported fields include text, long text, decimal, date, select, multiselect, boolean, attachment, and supported record references. Decimal precision is bounded, and conditions reference earlier supported questions. You cannot build an unrestricted scripting language inside a form.

Choose whether a lifecycle form is required or optional, and whether it must be completed **before the stage action** or **before stage completion**. Draft answers are not finalized evidence. Complete and submit the form in the operational record where it appears.

A published form is immutable. Fork a new version to change it. An existing order/task keeps its historical pin instead of silently adopting the latest form.

### Draft a form with AI

In an editable form version, expand **Draft with AI**. Describe the actual questions, types, units, options, and conditions you need. Generate, review added/changed/removed fields and validation findings, then apply the reviewed proposal. The server keeps the target template's purpose fixed. Publish separately after review.

Save local manual edits first if you want AI to use them: generation uses the saved draft. Applying a reviewed AI proposal saves to the server draft; manual stage-modal **Apply changes** has a different meaning described below.

## 6. Configure workflows

Open **Workflow Studio** (`/workflows`). Author access is required; read access alone does not expose the authoring menu.

### 6.1 Order lifecycle

Create/select an **Order lifecycle** template for the relevant order type. Its stages determine departmental work and handoffs.

- **Node view** shows the stage/dependency graph.
- **Edit view** lists stages and opens their configuration.
- **Add stage** opens a centered modal. Clicking a node or the list's Edit action opens the same modal.

The stage modal has three sections:

| Section | Configure |
| --- | --- |
| General | Stage name/action, owning department, a specific eligible person or department/role queue. |
| Routing | Deadline or supported resource-capacity policy, predecessor stages, and supported branch conditions. |
| Forms | Compatible published form versions, required/optional status, completion point, and field preview. |

New stages require explicit department and role choices. Review the execution preview to see the intended owner, evidence, timing policy, and successors.

**Manual modal behavior:** Apply changes retains the stage in the editor's local draft. **Save draft** persists the workflow. Cancel discards the modal's edits, including a newly added stage that has not been applied. Published versions open read-only; fork a version before editing.

Registered stage actions connect to real domain work:

| Stage action | Where the user works | What actually completes it |
| --- | --- | --- |
| Confirm customer order | Order detail | Successful order confirmation. |
| Approve engineering | Engineering review | Approved engineering evidence. |
| Plan production | Planning | Application of the validated schedule proposal. |
| Complete production work | My Work / workstation | Completion of the required production tasks. |
| Finalize inspection | Quality Control | Finalized QC across the required output, including applicable rework closure. |
| Confirm delivery | Delivery & Shipping | Delivery confirmation for all required shipment quantities. |
| Review evidence | Lifecycle work queue | Explicit evidence-review completion after the relevant guards. |

Use production-capacity scheduling for planning/production actions. Administrative Sales, approval, or delivery work uses deadlines; do not invent machine requirements for those stages.

Dependencies may fan out and merge. A stage waits for its defined predecessors. Supported conditional routes read a predecessor's finalized, pinned order-form selection or finalized QC outcome. A nonmatching branch is skipped; missing facts are not assumed to match. Nested/general-purpose expressions and arbitrary loops are not supported by this lifecycle contract.

### 6.2 Production routing

A **Production routing** template defines the operations that become shop-floor tasks. Add operation, inspection, or approval steps, connect dependencies in the React Flow editor, and configure durations and applicable resource/qualification/checklist requirements. Publish a valid version for selection by orders/engineering.

This routing is distinct from the lifecycle. A lifecycle production stage coordinates the actual production tasks; it does not turn a Sales review into a machining operation.

### 6.3 AI-assisted workflow authoring

Use **Build with AI** in a routing draft or **Draft lifecycle with AI** in a lifecycle draft. Describe the intended work, departments, dependencies, and evidence. The provider receives the saved draft plus relevant workspace catalogs. Review the candidate, changed/removed entries, assumptions, and findings before acknowledgment/application. Invalid references block application. Apply saves an editable draft; publication remains a separate action.

## 7. Create an order and review engineering

### 7.1 Start manually or from an RFQ

1. Open **Order Hub → New order** (`/orders/new`), or use **RFQ intake** (`/orders/intake`).
2. For intake, paste the request text or upload a supported UTF-8 TXT/CSV document. Review extracted fields and ambiguities before saving/handoff to an order draft.
3. Select the customer, order type, item lines, quantities, requested date, and optional promised date as appropriate.
4. In **Order workflow**, select a compatible published **Order lifecycle**. Review its name/version and initial owner/stage preview. An explicit legacy flow without lifecycle stages is also supported.
5. Select the **Production routing**, or use the available order-type default.
6. Save the order draft. Check its forms and next lifecycle action in order detail.

Lifecycle selection is governed by `NEXT_PUBLIC_MANUOS_ORDER_LIFECYCLE_ENABLED`. If it is disabled, adoption is blocked by the supported flow. Existing draft orders can use the explicit attach-workflow action when eligible. Already released/in-progress work cannot silently switch lifecycle versions.

The lifecycle version is pinned at intake/adoption. Production routing and engineering evidence are pinned at their applicable approval/release boundary. Forking a template does not migrate running work.

### 7.2 Follow cross-department ownership

Open **Order lifecycle work** (`/lifecycle-work`). Review your assigned stages or your eligible department queue. Claim a queue stage when permitted. An authorized manager can reassign a stage to an eligible active member with a reason.

Use each row's operational link—order, engineering, planning, My Work, inspections, or delivery—to perform the real action. Only evidence-review stages expose their own generic **Complete review** action; a delivery stage cannot be completed by bypassing delivery records.

### 7.3 Engineering review and release

1. Open the order in **Engineering Hub**.
2. Review the required item/job configuration, BOM material requirements, production routing, and supporting records.
3. Resolve clarifications and required order forms. Save and approve through the available engineering actions.
4. Check material availability/reservations and release prerequisites before releasing production work.
5. After release, confirm that the intended production operations/tasks exist and that their workflow/routing version is the expected one.

Multi-item orders can produce separate manufacturing jobs. Plan and inspect the relevant job rather than assuming one job represents every line. A completed administrative lifecycle stage does not fabricate stock or production output.

## 8. Manage materials and procurement

### Procurement and receipts

Use **Supply Orders** (`/supply-orders`) to create supplier orders and material lines. Approve where required, then record actual received quantities against the supply lines and selected receiving locations/lots. Partial receipts leave the remaining quantity outstanding. Review the receipt list under `/inventory/receipts`.

### Inventory and WIP

Check **Inventory** for on-hand, reserved, and available balances by item, location, and lot. Use supported transaction pages:

| Operation | Entry point | What it does |
| --- | --- | --- |
| Transfer stock | `/inventory/transfers/new` | Moves existing stock between locations. |
| Issue to production | `/inventory/issues/new` | Transfers material for a selected production demand into WIP custody. |
| Return unused WIP | `/inventory/returns/new` | Returns unused production material to storage against the appropriate demand. |
| Physical count | `/inventory/counts` | Records and reconciles supported count differences through the controlled process. |
| Movement history | `/inventory/movements` | Shows ledger transactions and their source context. |

Select materials, demands, locations, and lots by their readable records. Check source availability and units before confirming. A reservation is not a physical WIP issue. A WIP return is not a new supplier receipt. Posting revalidates current balances; an old screen balance does not guarantee the operation will still succeed.

## 9. Schedule and assign work

1. Open **Planning** (`/planning`) and locate the released job/task.
2. Confirm that routing requirements, material reservations, resources, qualifications, and published availability are complete.
3. Use the available assignment flow or open the finite-capacity schedule proposal at `/ai/schedule`.
4. Select the order/job and planning horizon. Preview the schedule.
5. Inspect scheduled and unscheduled operations, resource choices, conflicts, and estimated completion. Missing requirements/availability are blockers, not evidence that a resource is free.
6. Review and apply through the authorized action. Confirm the resulting task assignments and bookings in Planning and the person's Assigned work view.

A preview/dry-run does not reserve capacity. Apply revalidates the reviewed evidence and can reject a stale result. The current engine treats machine use as exclusive and does not split an operation across shifts. Proposals are job-scoped; do not assume global multi-job optimization.

Use **Check delivery date** (`/ai/promise`) to compare a requested date with a complete finite-capacity result for a released job. This evaluation does not automatically change the contractual customer promise.

For disruptions, use **Recovery** (`/ai/recovery`). Review supported alternate-machine, overtime, reschedule, and subcontract options. Approvals and application recheck current evidence. Subcontract return is not automatic production output or QC; the operation returns to the normal internal execution/evidence flow. Alternate routing and optimized split-shipment recovery remain unsupported.

## 10. Execute production and inspect quality

### Technician work

1. Sign in with the technician-linked account and open **My Work**.
2. Select the assigned task and open its workstation.
3. Read the order/item/operation context, assigned equipment, work instructions, predecessor status, material readiness, and required forms.
4. Start work when the server confirms readiness. Use Pause/Resume with the required reasons rather than recording uninterrupted time for stopped work.
5. Record actual output, required evidence, and any issues. Do not enter more cumulative output than the ordered quantity.
6. Finalize required task forms and complete the operation when the domain checks allow it.

Assignment, elapsed work time, and produced quantity are separate facts. A booking does not mean execution started. A completed work session does not by itself mean the output passed QC.

### Quality inspection

1. Open **Quality Control** and the relevant output inspection.
2. Review the checklist, lot/output context, and pinned QC evidence form.
3. Record the inspection quantities and dispositions.
4. Ensure inspected quantity equals passed + rework + scrap.
5. Finalize the inspection through the permitted action.
6. For rework, follow authorization, rework, and reinspection; review the final disposition before stock is released for shipment.

Reinspection reclassifies held stock; it does not create new physical units. Failed/held output cannot simply be treated as finished, shippable stock. Lifecycle QC routing uses finalized domain facts rather than a free-text AI answer.

## 11. Ship, confirm delivery, and trace evidence

1. Open **Delivery & Shipping** (`/delivery/shipments`).
2. Create a shipment for the order using available QC-passed stock and appropriate lot/location details.
3. Review the allocation and dispatch data. Dispatch through the allowed action and record tracking details as available.
4. Confirm actual delivery with the required recipient/evidence information.
5. If the shipment is partial, inspect the remaining order balance. A partial delivery does not complete the entire order.
6. Verify order and lifecycle progress after all required quantities have been delivered.

The supported shipment progression is **Allocated → Dispatched → Delivered**. Output, QC pass, allocation, dispatch, and delivery are distinct records.

Use order history/evidence, inventory movements, inspections, and available serial/passport links to trace the work. Public passport access follows publication controls; an internal serial record is not automatically a publicly released passport. Customer Portal users see their authorized customer orders, not the full internal workspace history.

## 12. Using CoreAI

Open **CoreAI** (`/ai`) to see the capabilities visible to your account and their readiness/prerequisites.

| Tool | Use it for | Check before acting |
| --- | --- | --- |
| Ask AI / assistant | Questions about authorized orders, materials, tasks, lifecycle, and linked evidence. | Open the cited source records; an explanation is not a mutation. |
| Risk inbox | Outstanding operational exceptions and source drilldown. | Treat missing evidence separately from a confirmed risk. |
| RFQ intake | Structured extraction from request text/TXT/CSV. | Review every field and ambiguity before creating an order draft. |
| Similar jobs / Factory Memory | Recorded durations and inspection cohorts. | Check sample size and unavailable measurements. |
| Schedule proposal / date check | Deterministic capacity and date comparison for supported released jobs. | Review unscheduled operations and explicit engine limits. |
| Recovery | Supported reschedule/resource/overtime/subcontract proposals. | Apply with the required approval and current evidence. |
| Builder AI | Draft form, routing, or lifecycle definitions from descriptions. | Review differences, purpose, owners, references, and validation findings before apply. |

Ask AI can be scoped from an order/task context. Its recent-chat view is loaded for the current membership/workspace. Treat stored chats as assistance history, not a substitute for finalized task forms or audit evidence.

Provider configuration controls language-model features. The assistant can return its supported record-summary fallback; builder generation instead returns an explicit unavailable/error response when the provider cannot generate. A configured key is not proof that the provider accepted a live request.

Example builder prompts:

- **Form:** “Create a task safety form with a required guard check, measured gap in mm, and notes required when the check fails.”
- **Lifecycle:** “Sales confirms requirements, Engineering approves, PPIC schedules, Production executes, QC inspects, then Warehouse confirms delivery. Use existing department queues and compatible published forms.”
- **Routing:** “Create a cutting, milling, and final inspection route. Propose durations and use only existing machine classes and verified-skill requirements.”

AI cannot grant permissions, guarantee capacity, publish definitions without the relevant action, mark QC passed, or mark an order delivered through chat.

## 13. Resolve common problems

| Symptom | What to check |
| --- | --- |
| A sidebar menu or action is missing | Active workspace, membership status, role grants, and the capability required by that menu/action. Roles and departments are different. |
| Permission denied from a bookmarked page | Ask an access administrator to review grants; direct URLs do not bypass API authorization. |
| Login fails after reseeding | Confirm the actual database/environment and email. Existing passwords are preserved by default; check whether a deliberate reset was run. |
| Technician cannot log in or has no work | Account/profile link, membership activity, technician activity, and actual task assignment. |
| Workflow cannot be selected | Template kind, order type, published status, lifecycle rollout setting, and current draft eligibility. |
| Published workflow/form is not editable | Fork a new version. Publication deliberately locks the old definition. |
| Modal changes disappeared | Cancel rolls back modal edits. Manual stage Apply changes must be followed by Save draft. |
| AI applied a different revision conflict | Reload the draft, save intended changes, regenerate, review, and apply using the current revision. |
| AI fails to generate | Provider configuration, timeout/error message, and proposal findings. There is no static builder fallback. |
| Stage does not advance | Predecessors, claim/PIC eligibility, required finalized forms, and actual domain completion facts. |
| No availability / shift swap unavailable | Date range, future published shifts, interval length, same-facility requirement, conflicts, and permissions. |
| Assignment rejected | Skills, certificate validity for the full slot, published roster, facility scope, material/prerequisite readiness, and conflicting bookings. |
| Schedule has unscheduled tasks | Read the explicit missing evidence/resource/material reasons. A longer horizon alone may not solve missing requirements. |
| Cannot issue or ship quantity | Correct item/lot/location, current balance/reservation, WIP demand, QC disposition, and remaining order/shipment quantity. |
| Stale version / record changed | Refresh and review current state before retrying. Do not repeatedly submit an obsolete version. |

When reporting a problem, include the page, readable order/task name, action, exact error text, and relevant date range. Never include login passwords or provider secrets.

## 14. Daily operating checklist

1. Review Dashboard/Risk Inbox and current lifecycle queues.
2. Check pending engineering, required forms, material shortages, and supplier receipts.
3. Verify published availability and changes to technician qualifications.
4. Review/apply schedules and assignments only after current checks pass.
5. Record production sessions, issues, output, QC, and delivery as they happen.
6. Review remaining quantities and order evidence before treating an order as finished.

For administrators, follow the repository backup/restore runbook and reconciliation procedures. Do not reset a working database to make a demo screen look clean.

[Back to README](../README.md) · [Detailed Feature Catalog](feature-catalog.md)
