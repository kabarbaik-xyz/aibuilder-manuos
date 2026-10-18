# ManuOS Dynamic Forms Integration & Architecture Contract

## AI builder generation (18 October 2026)

Form Builder drafts expose **Draft with AI**; production routing exposes **Build with AI**; lifecycle workflow drafts expose **Draft lifecycle with AI**. The shared proposal API accepts `FORM`, `WORKFLOW` and `LIFECYCLE`. Generation uses the configured `GEMINI_API_KEY` and optional `GEMINI_FLASH_MODEL` through the existing server client. Missing provider, timeout or malformed responses return explicit retryable errors; production never substitutes a canned template.

The server loads the saved draft and workspace-scoped active catalogs. Form purpose stays fixed to the target template. Lifecycle proposals can reference only available departments, authorized roles/members and compatible published form versions/hashes. Schema, graph and reference findings block application. Generating never changes the draft. Authors compare the proposed definition, acknowledge review, then apply via the normal draft-save domain command. `baseRevision` and `expectedTargetRevision` refer to the draft's optimistic-lock `version`, not its publication `versionNumber`. Applying never publishes automatically. Unsaved local edits are compared in the review but are not sent as authoritative provider context; save the draft before asking AI to refine those edits.

## 1. Preceding Gate Verification
- All functional prototype milestones (M1–M4 / Foundation, Workflow Orders, Operations, Intelligence) are 100% complete and green (48 test files, 191 tests passing).
- SQLite ledger reconciliation confirmed balanced with 0 discrepancies.
- Branch `feat/manuos-dynamic-forms` established.

## 2. Dynamic Forms Domain Architecture
- **Schema & Types**: Located in `src/domain/forms/types.ts`, `schema.ts`, `conditions.ts`, and `validation.ts`.
- **Validation**:
  - `validateDefinition`: Enforces 1–100 fields, valid keys matching `^[a-z][a-z0-9_]{0,63}$`, allowed kinds (`text`, `textarea`, `decimal`, `date`, `select`, `multiselect`, `boolean`, `attachment`, `reference`), and conditions strictly referencing earlier boolean or select fields.
  - `evaluateVisibility`: Cascading conditional visibility engine.
  - `validateAnswers`: Rejects unknown answer keys; strips stale hidden answers; enforces required visible fields only in `FINAL` mode; validates format, decimal precision (0–6), date formatting, option validity, and file attachment limits (max 5).

## 3. Permissions Catalog
- `forms.read`: View form templates, versions, and instances.
- `forms.create`: Create form templates.
- `forms.edit_draft`: Modify draft version definitions.
- `forms.submit_review`: Submit form draft for review.
- `forms.publish`: Approve and publish version (immutable).
- `forms.retire`: Retire a published form version.
- `forms.bind`: Bind a form version to an order type, workflow node, or QC checklist.
- `forms.correct`: Propose and finalize corrections on finalized submissions.

## 4. Planned API Endpoints
- `GET /api/forms`: List form templates.
- `POST /api/forms`: Create new form template.
- `GET /api/forms/[id]`: Get template details and version list.
- `POST /api/forms/[id]/versions`: Create a draft version.
- `PATCH /api/forms/[id]/versions/[versionId]`: Update draft definition with optimistic version locking.
- `POST /api/forms/[id]/versions/[versionId]/actions`: Submit review, publish, retire, or fork.
- `GET /api/form-instances/[id]`: Read form instance, pinned version, and answers.
- `PUT /api/form-instances/[id]/draft`: Save draft answers.
- `POST /api/form-instances/[id]/finalize`: Finalize answers with validation and idempotency.
- `POST /api/form-instances/[id]/corrections`: Create authorized correction.
