# Acceptance and evidence contract — R0 + R1

Status: planned checks, not executed results. This file defines when the selected prototype can be called functional. Reference `database.md`, `ui-pages.md` and `api-rbac.md` for exact semantics.

## 1. Evidence levels and completion record

Every completed work package records source paths, focused unit/integration checks, local HTTP result, SQLite readback/reconciliation, browser path where applicable, and deployment status separately. An AI response mocked in a test is not a real provider call. A screenshot, route file, build, or passing seed-only example is insufficient on its own.

Maintain a task-to-evidence table in `docs/execution-status.md` and replace historical claims only when the corresponding capability passes. Use NOT_STARTED / IN_PROGRESS / VERIFIED_LOCAL / VERIFIED_DEPLOYED / BLOCKED_EXTERNAL, with concrete evidence rather than percentage estimates.

## 2. Canonical reusable fixtures

Use IDs/codes below in test fixtures only. No production engine branch may special-case them.

| Fixture | Content |
| --- | --- |
| Workspace A / B | Different memberships/resources/customers; default A timezone Asia/Jakarta, one currency, Mon–Sat 08:00–16:00 |
| Users | Access admin, owner/reviewer, engineer, planner, warehouse/buyer as granted, operator A, QC, customer A and customer B; disabled membership case |
| Customers | Customer A and B with distinct portal memberships and orders |
| Items | RAW-A: piece, precision 0; FG-A: piece/lot tracked; RAW-KG: kg, precision 3; additional serialized output item for per-unit passport checks |
| Locations | External supplier, raw store, WIP, quarantine/FG released, consumed/scrap/customer boundaries |
| Order A | 10 FG-A for customer A, BOM 6 RAW-A per FG, reviewed process/version 1 |
| Order B | Different customer/item/type with parallel operations and a QC gate; no raw material/type/operation constants shared by assumption |
| Workflow A | Prepare 2h → machine 4h → assemble 2h (material gate) → inspect 1h → pack 1h; total 10 working hours at fixture quantity |
| Workflow B | Two independently runnable branches, AND join, inspection and explicit rework attempt |
| Supply | Approved 100-piece RAW-A line; actual receipts are separate commands |
| History | Empty case, unrelated samples case, and measured planned/actual runs with known independently calculated aggregate; policy padding separate |

Use an injected clock with baseline 2026-11-24 08:00 Asia/Jakarta for deterministic schedule tests. Ordinary workspace behavior uses its actual configured clock/calendar. The existing 120/82/78 hero seed is a separate labeled sandbox fixture with reconcilable opening/evidence entries; it does not constrain new orders to those numbers.

## 3. R0 gates

| ID | Scenario | Required result |
| --- | --- | --- |
| A01 | Clean DB/bootstrap, first login, logout, expiry/disable | Actual user/session/membership persists; expired/revoked/disabled access fails; public privilege-changing persona switch absent |
| A02 | Direct unauthorized requests and wrong workspace/customer IDs | 401/403 or scoped 404 as specified; no protected records in responses, downloads or AI contexts |
| A03 | Customer/item/resource/order-type create/edit/archive | UI and API create real IDs; referenced masters cannot be removed or reinterpreted; reload shows actual saved data |
| A04 | Empty workspace, no seed or no authorized records | Useful setup/empty states; no first-order/hero non-null assertion crash |
| A05 | Draft workflow, invalid edge/role/resource, publication | Missing references/cycles/unsupported guards rejected; published immutable version saved with reviewer/evidence |
| A06 | Order creation/review/release/replay | Actual order, engineering, process instance/tasks/dependencies/demand committed once; questions retained; no toast-only confirmation |
| A07 | Publish version 2 while order A runs version 1 | Existing work/instructions stay pinned to version 1; new order can select version 2 |
| A08 | Stock lifecycle below | Every line reconciles to DB postings after commit/reload; no negative/oversubscribed eligible stock |
| A09 | Partial receipt/quarantine/UOM/duplicate command | Open supply quantity correct; held stock unavailable; incompatible/excess-precision qty rejected; same receipt does not post twice |
| A10 | Assignment/start/dependency/material gate | Only authorized eligible assigned operator/resource can start; missing predecessor/required usable material blocks the actual server command |
| A11 | Work timer/output/rework/QC | Time survives reload; output tied to task/order; accepted units counted once; inspector permissions and required checks enforced |
| A12 | Partial allocation/dispatch/delivery | Only QC-released FG ships, quantities and stock reconcile; over-shipment/repeated dispatch rejected or idempotently replayed |
| A13 | Customer evidence/documents/passport | Own records and actual files only; unknown serial not found; real trace from input lot to task, inspection, release and shipment |
| A14 | Concurrent stock reservation and stale approval | At most available stock reserved; no negative balance, stale plan cannot apply, loser receives explicit conflict/retry outcome |
| A15 | Inject write failure before commit | No partial stock/output/audit/success receipt; command can retry safely under its original key |
| A16 | Server restart, new browser, backup/restore | Masters/work/state/evidence survive; restored DB/files reconcile and authorize correctly |

### Inventory numerical fixture

| Step | Raw store | Raw WIP | Raw reserved | FG pending/rework | FG released | Cumulative shipped |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Receipt 100 | 100 | 0 | 0 | 0 | 0 | 0 |
| Reserve 60 | 100 | 0 | 60 | 0 | 0 | 0 |
| Issue 60; consume reservation | 40 | 60 | 0 | 0 | 0 | 0 |
| Consume 60; output 10 | 40 | 0 | 0 | 10 | 0 | 0 |
| QC accept 8, rework 2 | 40 | 0 | 0 | 2 | 8 | 0 |
| Ship 5 | 40 | 0 | 0 | 2 | 3 | 5 |
| Rework/reinspect remaining 2, no extra material in this fixture | 40 | 0 | 0 | 0 | 5 | 5 |
| Ship remaining 5 | 40 | 0 | 0 | 0 | 0 | 10 |

Final completed=10, historical QC-accepted=10, shipped=10, FG stock=0. QC pass and dispatch never produce new physical quantity. Repeating receipt or reinspection cannot create 200 raw or 12 FG. Demonstrate unused-material return and count correction separately so their semantics are not hidden by this fixture.

## 4. R1 gates — six capabilities

| ID / feature | Required behavior | Negative / sensitivity proof |
| --- | --- | --- |
| AI01 Production Brain | Answer a new actual order/material/work question from an authorized server snapshot; every evidence ID resolves; show source/revision/time | Customer B/workspace B cannot contaminate context/cache; stale revision invalidates result; provider unavailable shows truthful state, not fixed facts |
| AI02 Promise Engine | Compute date/uncertainty from reviewed quantity/routing, material readiness and machine/operator calendars/bookings; explanation cites those drivers | Change material ETA/resource calendar/quantity and observe independently justified changed result; missing inputs report uncertainty; evaluation alone does not reserve capacity |
| AI03 Dependency Intelligence | Recompute connected CPM/ripple for material delay, machine downtime and task overrun; show exact affected/runnable sets, slack and ETA deltas | Unrelated branch stays runnable; completed work is not rescheduled from zero; no special hero IDs; invalid graph is rejected rather than guessed |
| AI04 Self-Healing Production | At least two meaningful fixture-supported options are simulated when feasible; explain blocked choices; approving one applies actual normal commands and audit | Material shortage cannot be solved by overtime alone; no fabricated stock/quality; stale/repeated approval cannot double reserve/apply. If only one feasible option exists, display that honestly |
| AI05 Engineering Copilot | Real provider-assisted extraction of a new RFQ, editable review/ambiguities/BOM/routing draft, optional validated workflow draft, then actual persisted order creation | Unknown master references/unresolved critical ambiguity cannot silently release; malformed/hallucinated output rejected; without provider manual engineering remains functional |
| AI06 Factory Memory | Completed work/QC/rework feed queryable history, actual sample aggregates and evidence-based comparison; policy recommendation is separately labeled | Empty/unrelated history reports insufficient evidence rather than 18%/rev2 defaults; new execution changes later results; proposed estimates do not become measured history |

For baseline scheduling fixture A with all inputs available at opening, 10h of sequential work finishes on Nov 25 at 10:00 local under an 8h shift. Moving the assembly-required material to Nov 26 at 08:00 shifts assembly → QC → pack to Nov 26, while preparation/machining remain eligible. Validate exact timestamps with the same explicit calendar, not by copying current fixed Nov 28 results.

Recovery fixtures include ready accepted units for a real partial-shipment option and resource shortage where reassignment/rescheduling is valid. Recalculate cost/time from known rates/resources or mark cost unknown; `+0.8/+4.2/+7.5%` are never accepted as universal constants.

## 5. UI/browser contract

- Inspect representative desktop (1440×900), tablet (1024×768) and mobile (390×844), plus a 320px narrow/short-height overflow check where relevant.
- Login → create/review order → material receipt/issue → assigned execution → QC/rework → dispatch → customer evidence is walked with real records.
- Keyboard focus/labels, menu Escape/outside-close, drawer/backdrop resize, native hidden-scrollbar scrolling and reduced-motion behavior work. Header account actions remain reachable.
- Forms display validation, pending, permission, stale/conflict and failed-save states. No disabled control hides the only explanation of a blocked operation.
- Quantities/source/progress definitions match on order, shop floor, stock, customer view and passport. History/file downloads contain actual evidence and match their declared format.
- Bound visual passes per archetype: inspect viewport/state cases together; fix one collected batch and confirm once. Passing broad checks are not repeatedly rerun without new risk.

## 6. Commands and evidence artifacts

During implementation M0 adds scripts for DB migrate/seed/bootstrap/reconcile and focused integration tests. The master plan defines their intended names. Existing `rtk npm run typecheck`, `rtk npm test` and `rtk npm run build` remain real repo commands; planned scripts must exist before execution.

Run focused module checks per task, then the integrated R0/R1 acceptance suite when its dependencies exist. Use temporary SQLite files isolated from a developer's actual workspace DB. Provider-mocked tests run without external secrets; live-provider verification uses configured server secrets and records sanitized request IDs/model/source/results only.

Store integration fixture definitions under `tests/fixtures/`, meaningful DB/service tests under `tests/integration/`, and browser paths under `tests/e2e/`. Save an evidence index in docs with references to generated reports, SQL reconciliation summaries, screenshots where useful and honest deployment status. Never commit DB files, session cookies, API keys or real customer data as test output.

R1 is done only when all six capabilities and the R0 gates pass, including one live-provider result for every AI-assisted path claimed live. If credentials or hosting are unavailable, mark those checks blocked externally and describe the exact unverified behavior; do not replace them with invented evidence.
