# ManuOS Dynamic Forms Integration & Architecture Contract

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
