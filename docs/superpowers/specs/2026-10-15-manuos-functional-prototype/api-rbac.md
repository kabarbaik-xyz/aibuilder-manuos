# API, authorization and command design

Status: proposed contracts. Extend `contracts/openapi.yaml` as the implementation source of truth in M0; do not maintain a competing spec or claim these operations exist today. Existing AI input contracts change deliberately when browser snapshots are removed.

## 1. Principal and authorization

Resolve a valid auth-provider session and active workspace membership on the server. API request bodies cannot set actor IDs, permission grants or customer scope. Check action permission **and** object ownership/relation before loading protected details or posting.

```ts
export interface Principal {
  userId: string;
  workspaceId: string;
  membershipId: string;
  permissions: ReadonlySet<string>;
  customerId: string | null;
  technicianId: string | null;
}

export interface CommandInput<T> {
  idempotencyKey: string;
  expectedVersion: number;
  payload: T;
}

export interface Committed<T> {
  data: T;
  meta: {
    resourceVersion: number;
    workspaceRevision: number;
    requestId: string;
    replayed: boolean;
  };
}
```

`requirePrincipal(request)` and `requirePermission(principal, code)` are shared server-only boundaries. Module repositories additionally scope every resource query by `workspaceId`; customer reads scope by `customerId`, operator reads/commands by assignment/technician identity. A permission grant alone does not remove ownership predicates.

Membership/grant changes must affect subsequent commands; do not cache a permission snapshot in a long-lived browser token. Provider administration access is separate from workspace business roles. Authorization checks cover uploads/downloads, AI snapshots, search, read models and simulated/recovery actions.

## 2. Initial role bundles

These are seedable bundles of explicit permissions; one real membership may hold multiple roles. Do not infer a seven-role hierarchy from unavailable external repositories.

The exact proposed initial grants are in [permission-matrix.json](permission-matrix.json). Default deny; bootstrap initially grants ACCESS_ADMIN and OWNER, not an implicit wildcard. Add additional memberships/roles explicitly to perform engineering, warehouse, operator or QC duties in the demonstration. The table below explains intent; the JSON catalog resolves exact grant coverage.

| Role | Initial capabilities | Boundary |
| --- | --- | --- |
| ACCESS_ADMIN | `access.manage`, `workspace.manage` | Users/memberships/grants; business approvals require additional role/grant |
| OWNER | Operational reads, `order.release`, `engineering.approve`, `workflow.publish`, `supply.approve`, `inventory.adjust_approve`, `recovery.approve`, internal intelligence/audit | Workspace ownership; consequential changes still follow state/rule guards |
| SALES | `customer.manage`, `order.read`, `order.create`, `promise.evaluate` | Create/manage commercial draft; no engineering publication or stock postings |
| ENGINEER | `engineering.read`, `engineering.write`, `workflow.read`, `workflow.author`, `item.manage`, `quality.configure`, history/intelligence reads | Author/review content; publish/approve only with explicit extra grant |
| PLANNER | `planning.read`, `planning.write`, `task.assign`, internal order/inventory/workflow reads, `promise.evaluate`, `recovery.propose` | Cannot bypass certification, stock, capacity or approval |
| TECHNICIAN | `task.read_assigned`, `task.execute_assigned` | Assigned work only; no independent QC sign-off or role switching |
| QC | `quality.read`, `quality.inspect`, traceability reads | Valid inspections/evidence; cannot fabricate output or approve their own permission change |
| WAREHOUSE | `inventory.read`, `inventory.receive`, `inventory.issue`, `inventory.transfer`, `inventory.count`, `delivery.read`, `delivery.dispatch` | Approved source/eligible stock; count discrepancy approval separate |
| BUYER | `supplier.manage`, `supply.read`, `supply.create`, inventory shortage reads | Draft procurement/ETA input; approval and physical receipt require their grants |
| CUSTOMER | `customer_order.read_own`, `customer_order.acknowledge_own`, own profile | Linked customer orders/documents/passports only; no internal cost/resource visibility |

Shared master grants include `resource.manage`, `location.manage`, `audit.read`, `history.read`, `brain.query`; seed them only in appropriate role bundles. Use a checked-in permission catalog so a typo cannot grant a new arbitrary action. A user-management screen edits bundles/grants through the same server policy and audit.

Initial review policy records the author and approver and requires a publish/approval grant. A strict different-person/dual-approval rule is configurable but not claimed as default without explicit enforcement and test evidence.

## 3. HTTP conventions

- Session cookie auth, server mutation-origin/CSRF protections and configured trusted origins. No `NEXT_PUBLIC_` secrets. Public signup off; bootstrap/provisioning uses supported server auth APIs and a dedicated permission gate.
- All app-domain URLs use `/api/...`; app shell routes use the route catalog. Standard library auth routes remain under `/api/auth/[...all]` according to the pinned provider integration.
- Lists: `q`, allowlisted `status`, `cursor`, `limit` (default 25, max 100); deterministic `updatedAt,id` ordering. Filter/sort fields are allowlisted, not raw SQL/order strings.
- Successful resource reads: `{data, meta:{requestId,resourceVersion,workspaceRevision}}`. Lists add `{nextCursor,hasMore}`; IDs/quantities/timestamps are explicit strings/ISO formats.
- Mutations: POST a named business action. `Idempotency-Key` is required for creation, release, posting, inspection finalize, shipment and approval; version-sensitive commands carry `expectedVersion`. Same key and hash returns the original result; different payload produces 409.
- Failure: `{error:{code,message,fieldErrors},requestId,retryable}`. 400 malformed, 401 no session, 403 forbidden capability, 404 scoped object unavailable, 409 stale state/conflict, 413 size limit, 415 unsupported file type, 422 domain/input violation, 503 transient backing-service/busy failure.
- Use stable error codes, e.g. `INSUFFICIENT_STOCK`, `HELD_STOCK`, `WORKFLOW_NOT_PUBLISHED`, `STALE_VERSION`, `INVALID_TRANSITION`, `DUPLICATE_KEY_PAYLOAD`, `INSUFFICIENT_HISTORY`. Field errors identify form fields; never expose SQL/provider stack traces or session secrets.

## 4. Resource and action catalog

`[id]` in this table is a path parameter, not an optional client-selected workspace boundary. Master create/read/update/archive share DTO patterns but use module-specific validation, not a generic arbitrary table endpoint.

| Resource group | Reads | Creates/commands | Core policy |
| --- | --- | --- | --- |
| Account/access | `GET /api/me`, `/api/users`, `/api/users/[id]`, `/api/roles` | Provider sign-in/out/change-password; protected user provisioning, membership disable, grant/revoke | Real session; access grants; final-admin protection |
| Company/masters | `GET /api/settings/company`, `/api/customers`, `/api/suppliers`, `/api/items`, `/api/locations`, `/api/uoms`, `/api/resources/machines`, `/api/resources/technicians`, `/api/calendars`, `/api/order-types` and scoped details | Resource-specific POST create, PATCH versioned edit, POST `[id]/archive`; catalogs for departments/classes/skills/certs | Active same-workspace references and used-master safeguards |
| Orders | `GET /api/orders`, `/api/orders/[id]`, `/api/orders/[id]/materials`, `/api/orders/[id]/history` | POST `/api/orders`, `[id]/submit-review`, `[id]/release`, `[id]/cancel` | Customer/type/version refs; release creates instance/work atomically |
| Engineering | `GET /api/orders/[id]/engineering` | POST revisions, PATCH draft, POST `[revisionId]/submit-review`, `[revisionId]/approve`, question answer/waive | Approved snapshots immutable; unresolved blocking questions |
| Workflow | `GET /api/workflows`, `/api/workflows/[id]/versions/[versionId]` | POST template/version, PATCH draft, POST version `/validate`, `/submit-review`, `/publish`, `/retire` | Typed nodes/guards, same-version edges, role/resource coverage and no cycles |
| Planning | `GET /api/planning`, `/api/tasks/[id]`, `/api/tasks/[id]/candidates` | POST `/api/planning/evaluate`, `/api/planning/commit`, `/api/tasks/[id]/assign` | Actual resources/calendar/revision and valid skill/cert/capacity |
| Supply | `GET /api/supply-orders` and detail/open lines | POST supply draft, PATCH draft, POST `[id]/approve`, `[id]/change-eta`, `[id]/cancel` | No stock on approval; actual source quantities/date |
| Inventory | `GET /api/inventory/balances`, `/api/inventory/movements`, item/lot/demand scoped detail | POST `/api/inventory/opening-balances`, `/receipts`, `/reservations`, `/issues`, `/transfers`, `/returns`, `/consumption`, `/counts`; counts `[id]/submit`, `/approve`, `/post`; posting `[id]/reverse` | Quantity/UOM/lot/source/quality checks; transaction ledger and conditional balances |
| Execution | `GET /api/my-tasks`, task/events/output | POST `/api/tasks/[id]/start`, `/pause`, `/resume`, `/output`, `/finish` | Actual assignment, eligible workflow state, inputs and operator session |
| Quality | `GET /api/quality/queue`, inspections/rework details | POST inspection draft/results/finalize, rework authorization/attempt and reinspection | Check requirements, held units, inspector grant, distinct acceptance |
| Delivery | `GET /api/shipments` and detail | POST shipment draft, `[id]/allocate`, `/dispatch`, `/confirm-delivery`, `/cancel` | Customer/order/eligible FG and shipment reservations |
| Evidence | `GET /api/passports/[serial]`, `/api/audit`, `/api/documents/[id]/download` | POST document upload/link with typed parent | Parent authorization and visibility; real file/record, not sample content with wrong extension |
| Customer | `GET /api/portal/orders` and detail/evidence | POST `/api/portal/orders/[id]/acknowledge` | Session membership's customer only; promise revision checked |

## 5. Typed payload examples

Creation DTOs have no existing aggregate version and use a resource-specific body plus the `Idempotency-Key` header. Commands on existing aggregates use the `CommandInput<T>` envelope below.

```json
{
  "customerId": "cus-demo-1",
  "orderTypeId": "type-panel",
  "itemId": "item-panel",
  "quantity": "10",
  "requestedDate": "2026-11-25",
  "workflowVersionId": "wfv-panel-1",
  "notes": "RFQ reviewed before release"
}
```

Order creation returns a DRAFT order ID/number. It does not pretend to release unapproved engineering or make a capacity promise. The editor follows up using the returned ID, not a hero-order constant.

```json
{
  "expectedVersion": 3,
  "payload": {
    "supplyOrderLineId": "sol-raw-1",
    "quantity": "100",
    "uomId": "uom-piece",
    "lotCode": "LOT-IN-001",
    "destinationLocationId": "loc-raw",
    "incomingDisposition": "RELEASED"
  }
}
```

The source line determines item/supplier/workspace/open quantity. If incoming inspection is required, the server rejects a request to bypass quarantine. Command actor/cost/source references are not accepted as untrusted substitutes for source records.

```json
{
  "expectedVersion": 8,
  "payload": {
    "optionId": "recovery-option-1",
    "confirmedChangesHash": "computed-change-set-hash"
  }
}
```

Recovery approval rechecks base revision, authorized actor and business prerequisites, then applies the stored validated command set. The browser cannot submit arbitrary `feasible=true`, numeric benefits, actor names or a replacement graph.

## 6. Intelligence contracts

| Feature | Computation/read contract | AI-assisted contract and responsibility |
| --- | --- | --- |
| Brain | Server builds permitted snapshot from question scope/order ID and current revision | Existing `/api/ai/brain-qa` accepts question/scope, not operational snapshot; read-only answer and evidence refs |
| Promise | POST `/api/intelligence/promise` with reviewed routing/engineering ID, qty/date; returns actual constrained evaluation/run ID | `/api/ai/promise-explain` receives evaluation ID and explains its verified drivers |
| Dependency | POST `/api/intelligence/impact` for typed simulation, or authorized actual disruption command; recalculates schedule | `/api/ai/explain-impact` receives impact run ID; explains exact affected/runnable sets |
| Self-Healing | POST `/api/intelligence/recoveries` generates/simulates bounded options; returns plan revision | `/api/ai/recovery-options` narrates validated plan; `[planId]/approve` is separate human command |
| Engineering Copilot | Reviewed draft/version contracts remain the R0 source | `/api/ai/extract-rfq` drafts typed fields/questions; `/api/ai/generate-workflow` drafts allowed definitions, max two automated validation/redraft attempts; never auto-publishes |
| Memory | GET `/api/intelligence/memory` with permitted filters; returns actual samples/aggregates or insufficient-history state | `/api/ai/memory-recommend` receives evidence-query/run ID and policy context, not browser-invented sample statistics |

```ts
export type Explanation<T> =
  | { source: 'AI'; snapshotRevision: number; evidenceRefs: string[]; value: T }
  | { source: 'COMPUTED'; snapshotRevision: number; evidenceRefs: string[]; value: T }
  | { source: 'UNAVAILABLE'; snapshotRevision: number; evidenceRefs: string[]; value: null; reason: string };
```

A valid request with provider unavailable may return 200 with explicit UNAVAILABLE and null explanation; computed facts are rendered independently. It must not return a canned successful `aiResult`. Malformed/unauthorized requests use ordinary error statuses. Provider secrets/raw traces never reach the client.

Cache key includes function, membership/data scope, canonical input hash, workspace/aggregate revision, model, prompt and schema versions. Resolve evidence IDs and reject invented facts/unknown actions before displaying or storing a proposed recommendation. Bound context size, timeout/cancellation and retries through supported provider SDK APIs; actual cancellation is tested.

## 7. Atomicity and idempotency checklist

1. Authenticate and authorize the operation, then validate DTO/types/ownership.
2. Compute request hash and inspect a scoped command receipt. Replay same request; reject key collision with different content.
3. Load authoritative versions; compute outside the write transaction when needed.
4. In a short transaction, recheck versions/guards and conditional capacity/stock rows.
5. Write all aggregate/event/ledger changes and command receipt, increment revision, then commit.
6. Return canonical records and invalidate affected query keys. On error leave no partial ledger/audit/success receipt.

Replaying after session/grant revocation must not reveal a previously authorized response to a now-forbidden caller. Authentication/authorization precede receipt replay. Tests include different-principal key reuse and the same key on a changed payload.

## 8. API artifact delivery

M0 updates `contracts/openapi.yaml` to describe the above route/DTO/error conventions. Each later task adds its concrete operation/examples before UI integration. Generate an optional runnable Postman collection from that spec and keep fixtures/assertions local; no workspace push, monitor or external publication is part of planning.

UI adapters reuse typed contracts, consistent error mapping and query keys. No duplicated axios/fetch clients per page. Contract/transport tests and actual SQLite tests are separate from provider-mocked AI tests and actual live-provider evidence.
