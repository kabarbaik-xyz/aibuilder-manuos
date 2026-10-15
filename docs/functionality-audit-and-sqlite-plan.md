# Functionality audit and SQLite implementation design

> **Superseded implementation ordering:** The
> [product foundation audit](product-foundation-gap-audit.md) expands the analysis
> to real authentication/RBAC, master-data administration, customer ownership,
> order types and workflow definition/runtime. Its foundation-first ordering
> replaces the narrower sequence below, including the earlier deferral of auth.

Date: 2026-10-15
Evidence level: current source and document inspection. No new browser, HTTP,
database, provider, or deployment verification was performed for this audit.
SQLite and the API changes below are a proposed implementation, not shipped code.

## Scope in the existing documents

PRD section 12.3 specifies seven surfaces: Command Center, Production
Orchestrator, Workstation, Customer Portal, Factory Network, Recovery Studio,
and New Order Intake. Recovery Studio may be a panel. The execution prompt
explicitly requires usable direct links for orders, passports, and major screens.
Five sidebar items therefore do not mean five complete workflows.

PRD section 10.5 permits seed-on-load Zustand state. Section 6 excludes a
production database. EXECUTION_PROMPT_MANUOS.md also excludes a production
database and real authentication, but explicitly requires buttons to perform
their named actions rather than report success through a toast alone.

The current user request changes the persistence direction: use an actual
database, with SQLite acceptable. Keep the approved visual identity and domain
invariants while replacing session-only mutations with server-owned writes.

## Source-confirmed gaps

| Area | Current evidence | Consequence |
| --- | --- | --- |
| Persistence | `src/store/graph-store.ts` initializes from imported seed arrays and mutates Zustand; no database package, database module, or domain-write API exists | Operational changes have no durable backing; a new page load initializes seed state |
| New order | `src/app/orders/new/page.tsx:handleConfirmOrder` only calls `showToast` and `router.push('/')` | Confirmation does not create an order, jobsheets, tasks, or customer questions |
| Detail actions | Callers open `order-detail`, `task`, `documents`, `drawing`, and `support`; `src/components/modal-manager.tsx` has no matching branches | Several visible buttons open no usable content |
| Direct navigation | The route files are `/`, `/orders/new`, and `/passports/[serial]`; main screens are selected through `currentScreen` | Most surfaces and order details lack shareable routes |
| Execution | Workstation timer is local React state; `recordOutput(taskId, ...)` updates hardcoded order 1042 rather than resolving the task's order | Time is lost on remount and output is not a generic task operation |
| QC/passport | `recordQCInspection` changes quantities and audit without inserting QC records or updating passports | Inspections lack durable per-unit evidence; repeated passes are not deduplicated |
| Passport route | The serial route interpolates the requested serial into a fixed order/timeline, including a fixed hash and verification claims | Unknown serials can display the same purportedly verified record |
| Network | Existing acceptance/receipt actions use fixed TB-24, quantity 42, task IDs, and dates | The flow is tied to the authored scenario and is not a generic deal lifecycle |
| Documents | `downloadSample` generates plain text even for filenames ending in `.zip` | Downloads are samples, not the requested document/archive formats |
| Readiness reporting | `docs/execution-status.md` and the requirements matrix label all areas complete/verified | Those labels overstate current functional coverage and are not accepted as fresh evidence |

Existing deterministic engines and some in-memory transitions are implemented.
This audit does not claim the entire app is static or that historical checks
failed; it distinguishes those implementations from complete persisted flows.

## Proposed functional architecture

Use Next.js server routes and a SQLite repository. The server loads authoritative
records, validates a typed command, invokes the existing deterministic engines,
and commits the resulting domain changes plus audit events in one transaction.
Zustand holds the UI selection and a fetched client projection, not authoritative
operational records. Do not accept a whole client-supplied graph as a write API.

### Data model

- Workspace and customer references; orders, manufacturing orders, jobsheets,
  tasks, task dependencies, material requirements, and delivery allocations.
- Machines, materials/lots, technicians, assignments, skills, and certifications.
- Execution/time events, output records, QC inspections/rework, passports, and
  passport events linked to the actual unit/order/task.
- Recovery proposals, options, approvals, network deals, accept/decline events,
  capacity reservations, and physical receipts.
- RFQ drafts, retained customer questions, versioned workflow templates, history,
  and append-only operational audit events.

Use migrations, foreign keys, quantity checks, transactions, and stable command
IDs to prevent duplicate output, QC, receipt, or approval submissions. Seed once
into an empty workspace. Reset is an explicit demo operation rather than a
side effect of refresh. Preserve `0 <= qcPassed <= completed <= ordered` and
quantity-conserving delivery allocation.

### Contract and UI behavior

Extend `contracts/openapi.yaml` with resource reads and explicit mutation
commands for order creation, task assignment/start/pause/output, inspection,
recovery approval, customer acknowledgment, and network propose/accept/decline/
receipt. Validate input and entity relationships on the server. Reject stale
revisions and duplicate invalid transitions. Return canonical persisted records.

Provide loading, pending-write, error/retry, empty, not-found, and success states.
Only report a mutation as saved after the database commit succeeds. Details use
actual selected IDs. Unknown passport/order/task IDs return not found, without
falling back to the hero record. Preserve the existing human approval gates.

## Implementation sequence and acceptance

1. **Database and command foundation:** migrations, reproducible seed, repository,
   validated command services, OpenAPI, and client loading/error handling. Verify
   fresh database setup and readback after process restart.
2. **Orders and intake:** direct list/detail routes and real order creation from
   reviewed RFQ/workflow, with retained customer questions. Verify a new order
   appears in the dashboard and survives refresh/restart.
3. **Tasks, output, and QC:** real assignment/time/output/inspection records with
   task-to-order resolution and quantity guards. Verify repeated submissions do
   not create duplicate output or QC passes and failed transactions roll back.
4. **Recovery, network, and customer:** persisted proposal/approval/receipt and
   acknowledgment flows with actual entity references. Verify restart continuity,
   consent gates, stock/capacity conservation, and no premature material release.
5. **Traceability and routes:** database-backed passports, real evidence downloads,
   missing detail surfaces, and direct links for major views. Remove unsupported
   certification/cryptographic claims. Verify unknown-ID and customer projection
   behavior.
6. **Readiness evidence:** update the requirements matrix per proven flow with
   source, automated checks, local HTTP, database readback, and browser evidence
   clearly separated. Claim deployment only after verifying the deployed system.

The initial storage target is one local/single-server workspace with a persistent
SQLite file and backups. A Cloud Run rollout needs a separately resolved durable
storage strategy; retaining the current standalone container alone does not
establish persistent storage. Real authentication/tenant authorization is a
separate product decision; the current persona selector is not authorization.

## References

- `docs/PRD_MANUOS_PROTOTYPE.md` sections 6, 10.5, and 12.3.
- `docs/EXECUTION_PROMPT_MANUOS.md` architecture and full-scope requirements.
- `docs/IMPLEMENTATION_PLAN_MANUOS_PROTOTYPE.md` P2–P7 acceptance checks.
- SQLite driver transaction API: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md
- Next.js server package handling: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
