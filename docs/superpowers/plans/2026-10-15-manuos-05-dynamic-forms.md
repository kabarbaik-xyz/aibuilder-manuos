# ManuOS Dynamic Forms and AI-assisted Workflow Builder Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Do not delegate without user authorization. Track execution with the checkboxes below.

**Goal:** Add versioned schema-driven forms for order specifications, production tasks and quality evidence, a React Flow drag-and-drop workflow builder, and human-reviewed AI drafting for both builders after the existing functional-prototype execution is complete.

**Architecture:** Extend the existing Next.js modular monolith, Prisma/SQLite, server authorization and command infrastructure. A shared bounded schema drives both React rendering and server validation. Relational identities, quantities, inventory and workflow state remain authoritative domain records; form answers supplement them.

**Tech Stack:** Reuse the versions of React, TypeScript, Zod, Prisma/SQLite, API/query layer, Gemini provider and test tooling actually installed by the preceding implementation. Add and pin a compatible `@xyflow/react` version for the workflow canvas at execution time. No new form-builder platform or arbitrary expression evaluator.

## Execution boundary

- This is a queued follow-up, not an addition to the execution currently underway. Start only after F01–F07, W01–W06, O01–O09 and I01–I08 from the [master plan](2026-10-15-manuos-functional-prototype.md) pass their gates. If the previous run only completes foundation, keep this queued until its remaining plans finish.
- At entry, inspect actual migrations, service signatures, permission catalog, routes and test scripts. Record their mapping in `docs/dynamic-forms-integration.md`; the paths below are proposed additions, not assertions that preceding implementation used identical filenames.
- Preserve the active run's dirty files. Do not switch branches or apply application migrations during this planning task.
- At execution time create a separate `feat/manuos-dynamic-forms` branch from the verified completed implementation. If work is dirty, preserve it and resolve the branch baseline before dependent writes; never reset, clean or silently stash.
- Do not commit, push, merge, deploy or publish without a user request. Prefix shell commands with `rtk`.
- Keep English product copy, Plus Jakarta Sans and existing responsive design. No redesign of the application shell.
- Published schemas and finalized answers are immutable. Old work must never silently start using a newer form.
- No unrestricted scripts, formula language, nested repeaters, rich HTML or form-field drag-and-drop canvas in this release. Use an ordered field editor with accessible move-up/down controls.

The previous restriction on drag-and-drop canvas applies to the **form field editor only**. The workflow editor must provide React Flow drag-and-drop per the user's subsequent decision. Both editors support AI-generated drafts, preview, edits and explicit human validation; neither may auto-publish or activate an AI proposal.

## Product behavior and pages

**Confirmed builder expansion:** Workflow Studio uses a React Flow node palette/canvas/inspector with drag-and-drop and a Generate with AI action. Form Builder also offers Generate with AI. Both use the lifecycle `request → generated candidate → preview and deterministic validation → human edits/acknowledgment → apply to editable draft → ordinary review/publish`. Applying to a draft and publishing are separate authenticated commands. No application runtime or existing process instance changes when generating or previewing.

**Confirmed user requirement:** My Work is a primary consumer of dynamic forms. The assigned worker opens a work item, sees its pinned form in work detail, saves answers as a draft, submits evidence and completes the work only when required evidence and existing operational prerequisites pass. Do not implement forms only as a configuration feature disconnected from My Work.

My Work list/detail must expose evidence status (`Not started`, `Draft`, `Submitted`, or `Not required`) derived from authorized persisted instances. Required forms missing from a work item due to configuration/instantiation failure must show a blocking actionable error, never `Not required`. Reuse the existing My Work route and assignment policies; do not create a parallel work inbox. The detail displays form name/version, required fields, attachments and save/submission state. Draft save does not complete a task; form submission does not automatically finish work or post stock. Server completion commands verify the latest eligible finalized evidence in their transaction.

| Surface | Route or integration | Behavior |
| --- | --- | --- |
| Template catalog | `/settings/forms` | Search/filter by purpose and status; create, duplicate, archive; show usage |
| Template editor | `/settings/forms/[id]` | Version list, draft field editor, preview and validation errors; review/publish permission |
| Version detail | `/settings/forms/[id]/versions/[versionId]` | Immutable definition and publication audit; published-version preview |
| Workflow canvas | Existing Workflow Studio draft editor | Drag operation/inspection/approval nodes, connect dependencies, edit inspector, preview and validate; published versions read-only |
| AI proposal review | In both existing builder editors | Prompt, authorized context, assumptions/questions, editable candidate preview, validation findings, diff and explicit Apply to draft action |
| Assignment | Existing order-type and workflow draft editors | Select published form version by context; show version and required-completion policy |
| Order entry/detail | Existing order intake and order detail | Render supplemental order specification; keep master selectors/quantity in their existing components |
| Work detail | Existing task detail | Render operator evidence and completion errors beside work context |
| Inspection detail | Existing QC detail | Render supplemental evidence; existing authoritative QC measurements/dispositions remain in QC module |

Editor layout: field list at left, selected field configuration in the middle, preview at right on wide screens. On mobile use tabs for Fields / Configuration / Preview; avoid horizontal overflow. Support keyboard ordering, persistent labels, focus on error summary, inline errors, unsaved-change guard and explicit save/finalize states. File upload must show permission, size and failure states. No success toast before commit.

## Persistent model

Introduce additive migrations only. All business tables inherit workspace scope, actor/timestamps and the existing optimistic revision conventions. Use existing IDs and parent relationships rather than encoding IDs only in JSON.

| Model / proposed table | Required content and rules |
| --- | --- |
| `FormTemplate` / `form_templates` | ID, workspace, code, name, purpose `ORDER_SPEC` / `TASK_EVIDENCE` / `QC_EVIDENCE`, archived timestamp; unique workspace/code |
| `FormVersion` / `form_versions` | Template FK, version number, `DRAFT/REVIEW/PUBLISHED/RETIRED`, schema format version, definition JSON, content hash, publisher/time; unique template/version; published contents immutable |
| `FormBinding` / `form_bindings` | Version FK and exactly one typed parent: order type, workflow node or QC checklist revision; context and required flag. Workflow/QC published bindings immutable with their parent. Order-type defaults affect future orders only |
| `FormInstance` / `form_instances` | Pinned version/binding, exactly one actual subject: order, task or inspection; lifecycle and revision; unique subject/binding; created atomically with domain object or applicable workflow activation |
| `FormSubmission` / `form_submissions` | Instance, sequence, `DRAFT/FINAL`, answer JSON, actor, finalized time, supersedes FK and correction reason. Final records immutable; one editable draft and one current finalized revision per instance, enforced transactionally and with applicable SQLite indexes |
| `FormSubmissionDocument` / `form_submission_documents` | Submission, stable field key, document FK; no unverified arbitrary URL. Parent scope/visibility checked on upload, link and download |

JSON is appropriate for bounded versioned field definitions and supplemental answer values. Stock movements, BOM quantities, machine bookings, QC acceptance, shipment and core order identity must not be inferred or overwritten from arbitrary form JSON. Use composite workspace FKs and existing command/audit receipts. Define SQLite CHECKs for exactly-one parent and partial unique indexes where Prisma cannot express them.

Existing records: do not attach new mandatory forms retroactively. Preserve old orders/tasks and their existing completion rules. Newly released work pins the selected published version. Adding/changing bindings on published workflows/checklists requires a new parent revision. If prior implementation already has form JSON, explicitly migrate only validated definitions; quarantine unsupported definitions with an actionable report, never discard them silently.

## Shared schema and interfaces

Create `src/domain/forms/schema.ts`, `conditions.ts`, `validation.ts` and `types.ts`. These are contracts to implement, not existing exports.

```ts
type FormPurpose = 'ORDER_SPEC' | 'TASK_EVIDENCE' | 'QC_EVIDENCE';
type FieldKind = 'text' | 'textarea' | 'decimal' | 'date' | 'select'
  | 'multiselect' | 'boolean' | 'attachment' | 'reference';
type Condition = {
  fieldKey: string;
  operator: 'equals' | 'notEquals' | 'in';
  value: string | boolean | string[];
};
type FormField = {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  helpText?: string;
  visibleWhen?: Condition;
  options?: { value: string; label: string }[];
  referenceType?: 'customer' | 'item' | 'machine';
  min?: string;
  max?: string;
  maxLength?: number;
  precision?: number;
};
type FormDefinition = {
  schemaVersion: 1;
  purpose: FormPurpose;
  fields: FormField[];
};
type Answers = Record<string, string | string[] | boolean | null>;
type FormIssue = { fieldKey?: string; code: string; message: string };
type FormValidation = { valid: boolean; normalized: Answers; issues: FormIssue[] };
```

`validateDefinition(definition: unknown)` parses the schema and rejects invalid combinations. `evaluateVisibility(definition: FormDefinition, answers: Answers): Set<string>` returns visible keys. `validateAnswers(definition: FormDefinition, answers: unknown, mode: 'DRAFT' | 'FINAL'): FormValidation` rejects invalid supplied types/values in either mode and enforces required visible fields only in FINAL. Server additionally resolves references and documents with the principal and subject.

Definition rules: 1–100 fields; stable unique keys matching `^[a-z][a-z0-9_]{0,63}$`; plain-text labels/help; select/multiselect require 1–100 unique option values; decimal precision 0–6 with decimal-string bounds; date uses real calendar `YYYY-MM-DD`; references use the allowed registry only; attachment accepts document IDs up to 5 files, each at most 10 MiB, allowed PDF/PNG/JPEG using existing secure document handling. Text maximum 4,000 characters, textarea 20,000, help 1,000, label 120; reject unknown configuration keys and request bodies over 256 KiB at the application boundary.

Conditions reference only an earlier boolean/select field; operators and comparison values must match its type/options. No cycles or arbitrary expressions. Hidden values are removed from normalized answers on every save/finalize; the UI clears them on visibility change and warns before discarding entered values. Unknown answer keys are rejected. Decimal strings use existing exact decimal helpers without float rounding; business UOM quantities remain outside forms.

## API and access contract

Extend `contracts/openapi.yaml` before wiring clients. Reuse real session, Principal, command transactions, idempotency and error envelopes from the completed implementation. Do not accept client-selected workspace, actor, validation result or schema as authority.

| Operation | Contract |
| --- | --- |
| `GET/POST /api/forms` | Scoped paginated catalog / create template |
| `GET /api/forms/[id]` | Template, permitted versions and binding usage |
| `POST /api/forms/[id]/versions` | Create draft from a specified version, or validated initial definition |
| `PATCH /api/forms/[id]/versions/[versionId]` | Update DRAFT only with expectedVersion |
| `POST .../[versionId]/validate`, `/submit-review`, `/publish`, `/retire` | Named lifecycle commands; publication validates full definition and freezes hash |
| `POST /api/forms/[id]/archive` | Prevent future assignment; preserve referenced history |
| `GET /api/form-instances/[id]` | Authorized subject, pinned definition, current answer and revision |
| `PUT /api/form-instances/[id]/draft` | Validate supplied data, normalize hidden values, optimistic revision |
| `POST /api/form-instances/[id]/finalize` | Required-field, reference/document and subject checks; immutable final revision |
| `POST /api/form-instances/[id]/corrections` | Explicit reason and authorized correction draft; original evidence retained |

Binding edits belong to existing parent draft/update commands, not an unscoped generic association endpoint. Finalization uses Idempotency-Key and expectedVersion; save uses optimistic revision. Return 401 unauthenticated, 403 denied operation, scoped 404 for invisible resources, 409 stale/immutable/invalid lifecycle and 422 schema/answer errors with field keys. Replay still rechecks current access.

Add explicit permissions: `forms.read`, `forms.create`, `forms.edit_draft`, `forms.submit_review`, `forms.publish`, `forms.retire`, `forms.bind`, `forms.correct`. Engineer authors, Owner reviews/publishes/retires; QC may author QC evidence forms when explicitly granted. Binding also requires the parent edit permission. ACCESS_ADMIN gets no implicit business privileges. Submission read/save/finalize inherits actual parent permission, assignment and lifecycle: sales for editable orders, assigned technician for work, QC inspector for inspection. CUSTOMER receives no internal-form access by default; customer-visible release is outside this follow-up. Grants must be represented in the actual permission catalog, not only UI controls.

## Task DF01 — Reconcile completed implementation and freeze contracts

**Files:** create `docs/dynamic-forms-integration.md`; modify `contracts/openapi.yaml` and the completed permission catalog; create `src/domain/forms/{types,schema,conditions,validation}.ts`, `src/domain/forms/validation.test.ts`.

- [x] Verify preceding gates and record actual auth, command, DB, documents, workflow, order and QC integration points; stop dependent work if the prerequisite implementation is incomplete.
- [x] Define the discriminated Zod field schema implementing the bounds above; export the three shared functions and types verbatim in meaning.
- [x] Write tests before implementation: duplicate keys, unknown kind, invalid field configuration, forward/cyclic condition, invalid date/decimal/option, unknown answer, hidden required field, and hidden stale value removal.
- [x] Add an exact fixture: `finish` select with `painted/raw`; required `paint_code` text visible only when finish equals painted. FINAL `{finish:'painted'}` fails at paint_code; `{finish:'raw',paint_code:'OLD'}` succeeds normalized to `{finish:'raw'}`.
- [x] Run `rtk npm test -- src/domain/forms/validation.test.ts`; require all named cases passing. Update OpenAPI schemas/examples for the same semantics.

## Task DF02 — Persist templates, publication and pinned instances

**Files:** modify `prisma/schema.prisma`; create next additive `prisma/migrations/*_dynamic_forms/migration.sql`; create `src/server/modules/forms/{contracts,repository,service,policy}.ts`, `tests/integration/forms-versioning.test.ts`.

**Interfaces:** `publishFormVersion(principal,input): Promise<{versionId:string;hash:string}>`; `createFormInstance(tx,input): Promise<{instanceId:string}>`. Use the completed Principal/command types; createFormInstance must run inside the domain transaction, not start an unrelated commit.

- [x] Write integration cases against a temporary SQLite database for cross-workspace links, invalid parent combinations, duplicate subject/binding, immutable publication and rollback.
- [x] Implement the tables, constraints, publication lifecycle, usage lookup and scoped policies; new version cloning preserves old field keys but permits deliberate schema evolution.
- [x] Prove publishing v2 cannot alter an existing instance pinned to v1; retired/archive versions remain readable to authorized historical subjects and cannot be newly assigned.
- [x] Run `rtk npm run test:integration -- tests/integration/forms-versioning.test.ts`; inspect applied constraints and DB rows, not only service return values.

## Task DF03 — Real submission commands and private evidence

**Files:** create `src/server/modules/forms/submissions.ts`, `src/app/api/forms/route.ts`, `src/app/api/forms/[id]/route.ts`, version/action handlers for the API table, `src/app/api/form-instances/[id]/route.ts`, `draft/route.ts`, `finalize/route.ts`, `corrections/route.ts`; create `tests/integration/forms-submissions.test.ts`.

**Interfaces:** `saveFormDraft(principal,input)`, `finalizeFormSubmission(principal,input)`, `createFormCorrection(principal,input)` return existing committed-command envelopes with instance/submission IDs and revision. Server resolves the pinned definition itself.

- [x] Test unauthorized and other-workspace/customer requests; wrong assignment; stale expectedVersion; retired subject; forged document/ref IDs; reference archived after draft save; final edits and correction without reason.
- [x] Implement shared server validation and scoped reference/document resolution. Draft may be incomplete but cannot contain invalid supplied values. Preserve existing finalized evidence until an authorized correction finalizes atomically.
- [x] Test concurrent finalize and retry: one finalized revision, one audit result, identical authorized idempotent replay; hash mismatch returns 409; failed validation creates no final/audit success.
- [x] Keep uploaded files private. Apply existing abandoned-upload cleanup policy; no raw URLs or new public attachment directory.
- [x] Run `rtk npm run test:integration -- tests/integration/forms-submissions.test.ts`; verify persisted answer/document links and denial responses through real local HTTP in the test harness.

## Task DF04 — Accessible editor and shared renderer

**Files:** create `src/features/forms/{api,hooks}.ts`, `components/{template-list,definition-editor,field-editor,form-preview,form-renderer,submission-panel}.tsx`; add the three pages under `src/app/(workspace)/settings/forms/`; create `tests/e2e/forms-editor.spec.ts`.

**Interfaces:** `FormRenderer({definition,value,onChange,issues,readOnly})` uses shared definition/validation types. `SubmissionPanel({instanceId})` owns fetching, draft save, finalization, conflicts and evidence links. Parent components never recreate validators.

- [x] Build actual catalog/create/edit/version/review/publish paths with fetched state; permissions apply to controls and server commands.
- [x] Implement ordered field editing, allowed conditions, bounded options/reference registry, desktop preview and mobile tabs. Render every supported kind with a stable input ID, visible label and help/error association.
- [x] Draft edits remain recoverable after network failure; stale save presents reload/review options and never silently overwrites another editor. Final evidence renders read-only with version/actor/time.
- [x] Browser test create → configure conditional field → preview → save → publish → reload; verify required errors, keyboard ordering, focus management and no overflow at 390 px and 320 px.
- [x] Run `rtk npm run test:e2e -- tests/e2e/forms-editor.spec.ts`. Record desktop/mobile evidence separately from component or mocked network tests.

## Task DF05 — Bind order, task and QC contexts to completion gates

**Files:** extend completed order-type, order creation/release, workflow publication/runtime and inspection-finalize services; extend their existing feature editors/detail pages; create `src/server/modules/forms/completion.ts`, `tests/integration/forms-domain-gates.test.ts`, `tests/e2e/forms-operational-loop.spec.ts`.

**Interface:** `assertRequiredFormsFinalized(tx,{subjectType,subjectId,workspaceId}): Promise<void>` checks the transaction snapshot and pinned required instances; it never finalizes submissions or bypasses ordinary domain prerequisites.

- [x] Assign one ORDER_SPEC to an order type, one TASK_EVIDENCE to an operation node and one QC_EVIDENCE to a checklist revision. Validate matching purpose and published version on assignment/publication.
- [x] Instantiate order evidence atomically at creation using selected type default; task/inspection instances use pinned published parent revisions. Existing records receive no retroactive blockers.
- [x] Integrate the shared SubmissionPanel directly into existing My Work detail and expose persisted evidence status in its list/read model. Keep the actual assignment policy and existing operational context; direct links and API calls must enforce the same access rules.
- [x] Require applicable order evidence at release, task evidence at finish and QC evidence at inspection finalize. Starting, saving drafts and partial production retain their existing semantics. A finalized supplemental form never authorizes inventory/QC/workflow side effects by itself.
- [x] Gate checks and domain transition share the same short transaction; concurrent correction must not invalidate checked evidence silently. Once consumed by a released/completed record, correction requires the domain's authorized amendment/review path and preserves provenance; do not reopen completed work automatically.
- [x] Prove a technician cannot finish missing evidence through direct API, and QC cannot accept output merely by setting an answer named passed. Prove existing authoritative stock and outcome invariants still hold.
- [x] Browser-test My Work list → assigned detail → conditional field/attachment → save draft → reload → submit → finish. Verify draft survives reload, missing required answers block submission/completion, unassigned users cannot write, and submission alone causes no completion or stock posting.
- [x] Run `rtk npm run test:integration -- tests/integration/forms-domain-gates.test.ts` and `rtk npm run test:e2e -- tests/e2e/forms-operational-loop.spec.ts` with actual DB-backed requests.

## Task DF06 — History, intelligence compatibility and release proof

**Files:** extend existing authorized intelligence-context builders and document read models; create `tests/integration/forms-history-context.test.ts`; update `docs/dynamic-forms-integration.md`, backup/restore verification and existing acceptance evidence.

- [x] Expose only authorized finalized supplemental answers to intelligence with form/version/subject/submission provenance. Treat answer text and filenames as untrusted data; no instructions or automatic commands from form content.
- [x] Schema/answer revision changes invalidate relevant computed/AI caches. Do not silently inject newly captured fields as scheduling durations, stock quantities or Promise Engine parameters; map any future domain input through an explicit reviewed adapter.
- [x] Test tenant/customer privacy, draft exclusion, stale-cache invalidation and v1/v2 history. Verify corrections preserve original audit evidence.
- [x] Run focused suites, `rtk npm run typecheck`, `rtk npm test` and `rtk npm run build`; resolve failures attributable to this change and record unrelated baseline failures separately.
- [x] Restart and restore an isolated backup; verify templates, bindings, pinned versions, answers and attachments remain accessible under the same policies. Never restore over a live developer DB implicitly.
- [x] Record completion against the acceptance matrix below. Runtime, browser, database and live AI-provider evidence remain separate; no provider call is required to prove the form engine itself.

## Acceptance matrix

| ID | Required observable result | Owning task |
| --- | --- | --- |
| DF-A01 | Definition bounds, conditional visibility and exact value validation agree on server and renderer | DF01/DF04 |
| DF-A02 | Version publication/retirement and parent binding preserve immutable historical versions | DF02/DF05 |
| DF-A03 | Direct API denies cross-scope, unassigned, forged reference/document and unauthorized lifecycle actions | DF03 |
| DF-A04 | Concurrent saves/finalize, retries and transaction rollback preserve one valid authoritative result | DF03 |
| DF-A05 | New order → required form → release → task evidence → finish → QC evidence → finalization works after reload | DF05 |
| DF-A06 | Missing evidence blocks the real command; complete supplemental evidence cannot bypass stock/QC rules | DF05 |
| DF-A07 | Existing orders/tasks remain usable without retroactive form requirements | DF02/DF05 |
| DF-A08 | Mobile/keyboard/error/unsaved/conflict behavior works in a real browser | DF04 |
| DF-A09 | Correction history and authorized intelligence provenance survive revision/cache changes | DF06 |
| DF-A10 | SQLite restart and isolated backup/restore retain answer data and private files | DF06 |

## Plan review

- [x] Queued explicitly after the complete prior execution; no application changes authorized by this document alone.
- [x] Database, API, permission, UI, workflow gates, history and tests have assigned tasks and concrete failure cases.
- [x] Existing core manufacturing records remain authoritative; form version changes do not mutate historical work.
- [x] Initial builder scope is bounded; arbitrary scripting and a full low-code platform are excluded.
- [x] At execution entry, verify actual integration paths and preceding completion evidence.
- [x] Complete DF01–DF06 and WB01–WB03 and record evidence before claiming the complete follow-up is implemented.

## Task WB01 — React Flow canvas over the existing workflow engine

**Dependency:** Completed W01–W06 and DF01–DF05. Reuse the actual published workflow domain contract; React Flow is a presentation adapter, not a replacement runtime.

**Files:** modify `package.json` and its actual lockfile; create `src/features/workflows/components/{workflow-canvas,node-palette,node-inspector}.tsx`, `src/features/workflows/canvas-adapter.ts`, `src/features/workflows/canvas-adapter.test.ts`; modify the existing definition editor; add `tests/e2e/workflow-canvas.spec.ts`.

**Interfaces:** `toCanvas(definition,layout)` returns React Flow nodes/edges; `fromCanvas(nodes,edges)` returns a typed domain definition for ordinary server validation. `layout` stores bounded node positions and viewport separately from executable definition content. Reuse stable domain node keys; exclude React callbacks, selection state and arbitrary node data from persistence.

- [x] Pin `@xyflow/react` only after checking the installed React/Next versions; import its stylesheet in the scoped integration and test production build. Follow official [custom node](https://reactflow.dev/learn/customization/custom-nodes) and [connection validation](https://reactflow.dev/examples/interaction/validation) guidance.
- [x] Implement custom OPERATION, INSPECTION and APPROVAL nodes, handles, palette drag/drop, selection inspector, edge connect/delete, zoom/pan/fit, undo/redo and explicit save. Keep structured add/connect controls available for keyboard/touch users; mobile uses palette buttons and an inspector sheet rather than requiring precision drag.
- [x] Map existing saved workflows into the canvas without losing guards, form bindings, resources, durations or completion policies. Persist layout with the draft revision; moving a node never changes dependency semantics or mutates a published version.
- [x] Use connection checks to reject self/duplicate edges and visibly flag cycles/missing references; always rerun the existing authoritative graph validator on save/review/publish. Render errors against node/edge/inspector fields. Published views are read-only and edits explicitly fork a new version.
- [x] Test round-trip semantic equivalence and reload of saved positions. Browser test palette → drag → connect → configure form binding → save → reload; reject cyclic publish by direct API as well as UI. Test keyboard/touch alternate path and stale concurrent save.
- [x] Run `rtk npm test -- src/features/workflows/canvas-adapter.test.ts`, `rtk npm run test:e2e -- tests/e2e/workflow-canvas.spec.ts` and `rtk npm run build`.

## Task WB02 — Authorized AI draft proposals for workflows and forms

**Files:** extend actual AI-run models/provider infrastructure; create `src/server/modules/builder-proposals/{contracts,service,policy}.ts`, `src/app/api/ai/builder-proposals/route.ts`, `src/app/api/ai/builder-proposals/[id]/route.ts` (GET/PATCH), `src/app/api/ai/builder-proposals/[id]/apply/route.ts`; modify `contracts/openapi.yaml`; add `tests/integration/builder-proposals.test.ts`.

**Persistent proposal:** ID/workspace/actor, target `WORKFLOW/FORM`, target draft ID or explicit new-template intent, base revision/hash, authorized context IDs/hash, prompt/model/schema provenance, candidate JSON/hash, validation findings, assumptions/questions, status `GENERATED/APPLIED/DISCARDED/FAILED`, applied draft reference and audit. Use the existing AI-run table for provider metadata rather than duplicating secrets/raw transport data. Add a bounded proposal table only if existing AI runs cannot express these fields safely.

**Contracts:** POST create accepts target, prompt (1–8,000 characters), optional editable draft ID/base revision and allowed source record IDs. Server fetches authorized context/catalogs. GET returns only scoped proposal data. POST apply accepts expected target revision, exact reviewed candidate hash, explicit human acknowledgment and idempotency key; server resolves stored candidate, rechecks current authority/references, rejects unresolved blocking findings/questions and writes a draft only. `PATCH /api/ai/builder-proposals/[id]` accepts expected proposal revision and edited candidate/question resolutions, regenerates candidate hash/validation, and invalidates acknowledgment. Never accept a client assertion that validation succeeded. Document all four operations in OpenAPI.

- [x] Write denial and lifecycle tests before provider wiring: no permission, cross-workspace source, published target, stale draft, changed candidate hash, unresolved blockers, missing human acknowledgment and retry with changed body.
- [x] Generate workflow candidates using existing typed node/edge/guard registry and real allowed resources/forms; generate form candidates using DF01's schema and purpose. Do not invent valid-looking master IDs or unsupported field/node types. Surface unknown requirements as explicit questions; do not assign authority or publish status based on model output.
- [x] Parse structured output with Zod and run the same deterministic domain validators used for manual drafts. Limit workflow candidates to 100 nodes/300 edges and forms to existing 100-field bounds; reject oversized/malformed output. Use actual provider timeout/cancellation, scoped cache keys, permission checks and request limits. Treat source text as untrusted content.
- [x] Missing provider credentials/timeouts/invalid output produce an explicit unavailable/failed generation result with no draft changes; retain manual builder use. Mock results are labelled and confined to tests/demo; never claim a canned workflow/form came from a live provider.
- [x] Implement apply as a short atomic command, separate from provider calls. Grant generation only to actual permitted authors; require existing target create/edit permissions to apply. Human acknowledgment authorizes draft application only, not publication. Normal review/publish still requires the corresponding business permission.
- [x] Test generation creates only a proposal, preview changes no domain records, apply creates/updates one draft once, stale/hash mismatch denies, and no published versions/instances/stock/task state changes. Run `rtk npm run test:integration -- tests/integration/builder-proposals.test.ts` using mocked provider plus actual SQLite/HTTP; record live-provider proof separately if available.

## Task WB03 — Preview, human validation and end-to-end acceptance

**Files:** create `src/features/builder-proposals/{api,hooks}.ts`, `components/{generation-panel,proposal-review}.tsx`; integrate existing workflow/form editors and validators; add `tests/e2e/builder-ai-review.spec.ts`; update `docs/dynamic-forms-integration.md`.

- [x] Both builders expose Generate with AI and a bounded request/context selector. Render source/model status, assumptions, unanswered questions and node/field validation findings. Keep original draft unchanged until explicit application.
- [x] Workflow preview renders the proposed graph in the same React Flow adapter; form preview uses the same FormRenderer, including conditional/sample-answer behavior. Preview answers are local test inputs and never production submissions. Show a semantic diff for an existing draft and warn about removed fields/bindings/nodes.
- [x] Human can edit the candidate, rerun validation, answer blocking questions, discard, or explicitly acknowledge and apply the exact reviewed hash. Any candidate/context/base change invalidates prior acknowledgment. Block Apply when stale or invalid; block Publish until the current exact draft has a persisted authorized human review record tied to its content hash/version. Apply alone does not count as publication review.
- [x] Save review actor/time/hash through the existing review lifecycle; where it lacks this guarantee, extend the server lifecycle and its tests. Any semantic edit invalidates review. Layout-only changes may preserve semantic review when a separate layout hash makes this distinction explicit. Manual drafts also use the ordinary validated human publish action.
- [x] E2E for each builder: generate candidate → preview → observe validation warning/question → edit/resolve → acknowledge → apply → review → publish. Assert no side effects before apply, no auto-publish after apply, edited/stale content cannot reuse acknowledgment/review, and unauthorized direct publication fails.
- [x] Prove a newly published workflow with a newly published AI-assisted form can instantiate into an actual order/task and be completed through My Work; original in-flight work stays on pinned versions. No AI authorship grants extra privileges or bypasses manufacturing checks.
- [x] Run `rtk npm run test:e2e -- tests/e2e/builder-ai-review.spec.ts`, affected integration tests, typecheck and build. Record actual browser/mobile, database and provider evidence independently.

## Expanded acceptance gates

| ID | Required observable result | Owning task |
| --- | --- | --- |
| WB-A01 | React Flow drag/drop/connect/save/reload and keyboard/touch alternate controls preserve domain semantics | WB01 |
| WB-A02 | AI workflow and form generation use authorized context and typed bounded definitions | WB02 |
| WB-A03 | Generation/preview never mutate active definitions, instances, work or stock | WB02/WB03 |
| WB-A04 | Apply requires current valid candidate, explicit human acknowledgment and matching revision/hash | WB02/WB03 |
| WB-A05 | Publish requires current human review; edits invalidate approval; direct API enforces the gate | WB03 |
| WB-A06 | Provider failure preserves manual editing and never fabricates successful AI output | WB02 |
| WB-A07 | AI-assisted workflow/form reaches My Work through ordinary publication/release without changing old work | WB03 |

Execution order for this queued follow-up is DF01–DF05 → WB01 → WB02 → WB03 → DF06 final regression/history/restore verification. DF06 must cover proposal/review records and workflow layout in backup/restore as well as form data.
