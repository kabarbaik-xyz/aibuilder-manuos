# Workflow Studio and Form Builder readiness

Date: 2026-10-18. Scope: existing authoring, published contracts, runtime consumption, authorization, scheduling, AI and evidence history. No feature implementation or operational-data mutation.

## Decision

Not ready to serve as the end-to-end, cross-department order lifecycle engine. Workflow Studio is a usable production-routing foundation. Form Builder has usable schema/version/submission foundations, but its configuration-to-operational-use path is incomplete. Preserve these foundations and harden/extend them before wiring the entire order lifecycle.

## Evidence level

- Current source, API handlers, domain contracts and maintained tests inspected.
- Local SQLite opened read-only: 7 workflow templates, 9 workflow versions, 60 workflow instances; 8 form templates, 9 form versions, zero bindings/instances/submissions. This is local DEMO usage, not production adoption.
- Focused verification: 9 files / 41 tests passed (workflow definition/runtime, form validation, workflow versions/independence, form versions/submissions/domain gates/history context).
- Whole-workspace typecheck currently fails in in-progress Recovery/subcontract changes (`src/server/modules/intelligence/recovery.ts` and `tests/integration/phase10-r2-finite-capacity.test.ts`); no builder-specific compiler errors were reported. Those unrelated working changes were left untouched.
- No browser walkthrough, concurrent-write probe, live form mutation or role-login journey. Passing tests do not establish those properties.

## Capability assessment

| Capability | Existing evidence | Readiness for proposed lifecycle |
|---|---|---|
| Visual workflow editor | Canvas/list and node properties, graph validation, department, planned duration, machine/skill/cert requirements | Usable routing foundation |
| Workflow publish/version/fork | Immutable published editing path, hashes, command wrapper, instance version pin | Usable foundation; publish can go directly from DRAFT |
| Sequential/parallel dependencies | DAG runtime and AND predecessors | Present; conditional/XOR decisions and loops not established |
| Dynamic conditions | conditionCode/conditionParams stored and carried through canvas | Partial: no operational evaluator found consuming those conditions |
| Department ownership | departmentId stored on workflow node | Partial: not a complete department queue/assignment policy |
| PIC/role assignment | requiredPermission stored; actual execution assignment is technician/machine based | Missing general member/team ownership, fallback/escalation and stage-specific task dispatch |
| Stage types/actions | OPERATION / INSPECTION / APPROVAL in contracts | Partial: not explicit lifecycle actions for sales intake, engineering approval, planning, shipping etc. Labels alone do not supply handlers |
| Scheduling | Planning reads pinned workflow nodes and machine/skill/cert requirements for actual production tasks | Existing production capacity integration; no administrative-vs-capacity stage contract |
| Form authoring | 9 declared field kinds, rules, preview, conditional visibility, draft/review/publish/fork | Partial: declared capabilities exceed runtime controls |
| Form field runtime | Text, textarea, decimal, boolean and select controls | Multiselect lacks its own renderer branch; attachment displays instructions without an uploader; reference uses raw IDs; date uses native browser input |
| Workflow-to-form binding | FormService.bindFormVersion supports ORDER_TYPE / WORKFLOW_NODE / QC_CHECKLIST | Backend service only: no product binding management UI/API caller found |
| Operational form UI | SubmissionPanel and renderer exist | No SubmissionPanel consumer found on order/workstation/inspection operational pages |
| Saved evidence/history | Draft/final, actor/time, correction reason, supersedes link, formVersionId | Foundation present; not yet an integrated lifecycle evidence trail |
| Required form gates | Release, task output and inspection finalization call required-form checks | Present but onboarding/materialization and binding freeze need correction |
| AI integration | AI draft assistance in both builders; focused test exercises AI-assisted form proposal | Does not establish that operational assistant uses submitted form answers across lifecycle |
| Traceability | Workflow events, pinned versions, form submissions/corrections | Partial: one end-to-end form/assignment/schedule/approval timeline is not established |

## Blockers before broad integration

### P0: Runtime form authorization and command discipline

`src/server/modules/forms/submissions.ts`, `assertInstanceAccess`, checks workspace and broad permissions/roles. For TASK it does not fetch the task to verify current assigned technician/member or granted order facility. ORDER and INSPECTION checks similarly do not resolve the subject's ownership/facility. Treat this as a source-confirmed authorization gap, not a live exploit claim.

Form authoring and submission writes use direct Prisma updates/transactions. `expectedVersion` checks happen before the write/transaction, with no version predicate on the mutation. There is no executeCommand idempotency/command-audit boundary on these paths. Existing tests cover a sequential stale input but do not prove concurrent one-winner behavior. Fix these guarantees before exposing forms across roles.

### P0: Binding is not yet a safe released configuration

`src/server/modules/forms/service.ts`, `bindFormVersion`, verifies the form is published, but does not validate complete target/context combinations, target existence/same-workspace ownership, purpose compatibility, duplicate policy or immutable released binding revisions.

`src/server/modules/forms/completion.ts` resolves required bindings live. A later required binding can therefore introduce a new prerequisite on an already-released task whose form instances were created earlier. Pin form bindings and requiredness together with the released workflow/task configuration.

### P0: Order-form creation happens too late for the release gate

`src/server/modules/orders/release.ts` checks required order forms before calling instantiateWorkflow. `src/server/modules/workflow/instantiate.ts` materializes order forms inside that later instantiation. No other production caller of createFormInstance was found. Required order forms need to exist and be fillable before release, otherwise configuring a required order form can block release with no normal UI path to satisfy it.

### P1: Complete renderer contract

`src/domain/forms/types.ts` and `schema.ts` accept field kinds that `src/features/forms/components/form-renderer.tsx` does not fully implement. Multiselect falls through to generic text input; attachments have no file interaction; references demand an ID. Complete these controls or prevent publishing unsupported definitions. Use the repository DatePicker and accessible unique field IDs per instance.

### P1: General stage contract is absent

`src/server/modules/workflow/contracts.ts` carries department and requiredPermission, but no generic member PIC/team queue/assignment strategy, SLA, stage action, form binding bundle or capacity scheduling policy. Searches of runtime consumers find requiredPermission and conditionCode persisted rather than enforced/evaluated. Do not represent these fields as functioning lifecycle policies yet.

## Recommended sequence

1. **Builder/runtime hardening:** shared strict contracts, target-safe binding, complete supported form controls, subject-scoped authorization, executeCommand writes, CAS/idempotency, frozen version/binding rules.
2. **Workflow stage configuration:** stage action type, department, role/team/PIC assignment strategy, deadlines and capacity scheduling policy, deterministic branch conditions. Preserve the production-routing engine; define its boundary from lifecycle stages explicitly.
3. **Binding and sandbox validation:** configure published forms on stage in Studio; preview who receives work, what form is shown, what blocks completion and what happens next. Validate missing/inactive departments, users, skills/forms and action adapters before publish.
4. **Only then lifecycle wiring:** materialize forms at the correct stage, route tasks to authorized queues/My Work, use planning for resource-bound stages, append auditable stage/form/assignment/booking events, let AI read authorized current context and propose validated changes.

## Acceptance gate for readiness

- A builder-authored example can publish only if every stage action, ownership policy, form and transition is supported and valid.
- Every advertised field kind can be filled, validated, saved, finalized and corrected through real UI/API paths.
- A user cannot read/submit another out-of-scope task's form by changing an ID; assignments/facilities and role changes are tested.
- Concurrent save/finalize/publish and duplicate requests are deterministic and audited.
- Publishing/editing new workflow/form/binding revisions never changes a running instance's requirements.
- A required order form can be completed before release; task/QC forms appear where the corresponding worker operates.
- Capacity-bound stages use verified schedules/bookings; administrative stages do not invent machine/technician capacity requirements.
- A controlled scenario proves conditional handoffs, rejection/rework, scheduling impact, authorized AI evidence and traceability links before claiming end-to-end readiness.

## Source pointers

- Workflow definition: `src/domain/workflow-definition.ts`, `src/server/modules/workflow/contracts.ts`.
- Authoring/version persistence: `src/server/modules/workflow/service.ts`, `src/features/workflows/components/node-inspector.tsx`.
- Production instantiation: `src/server/modules/workflow/instantiate.ts`.
- Form schema/controls: `src/domain/forms/schema.ts`, `src/features/forms/components/form-renderer.tsx`.
- Form binding/versioning: `src/server/modules/forms/service.ts`.
- Form read/write access: `src/server/modules/forms/submissions.ts` and `src/app/api/form-instances/`.
- Completion checks: `src/server/modules/forms/completion.ts`, `src/server/modules/orders/release.ts`, `src/server/modules/execution/output.ts`, `src/server/modules/quality/service.ts`.
- Production scheduling consumer: `src/server/modules/planning/schedule-proposals.ts`.
