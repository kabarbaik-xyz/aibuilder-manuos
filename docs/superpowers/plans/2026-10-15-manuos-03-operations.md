# ManuOS Inventory-to-Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation and commits require separate user authorization.

**Goal:** Deliver M3–M4: reconcilable materials, real work/quality/shipment transactions and customer evidence for newly created orders.

**Architecture:** Domain command services use F03 transactions/quantities and W01–W04 process/version/transition rules; inventory is an append-only ledger with guarded balance/reservation projections. Pages consume actual scoped read models.

**Tech Stack:** Existing Next/React/Zod/Vitest, Prisma/SQLite, query layer and meaningful browser checks. No external ERP/WMS or fabricated ledger/QC certification.

## Global Constraints

F01–F07 and W01–W06 are prerequisites. Master-plan constraints apply. Follow the numerical acceptance fixture exactly; use real item/UOM/lot/location/work IDs, preserve physical versus accepted versus shipped quantities, and never claim M3 from a counter-edit UI.

## O01 — Stock ledger, lots, balances and opening records

**Files:** create `src/server/modules/inventory/contracts.ts`, `repository.ts`, `ledger.ts`, `service.ts`, inventory/lot/serial/balance/reservation migrations, `src/app/api/inventory/balances/route.ts`, `movements/route.ts`, `opening-balances/route.ts`; create `tests/integration/inventory-ledger.test.ts`; extend factory fixture.

**Produces:** `postMovement(tx, principal, movement)`, `getBalances(principal, filters)`, `reconcileStock(db, workspaceId)` and stable stock-bucket keys. Typed moves have positive atoms, real source/destination/disposition and references; virtual boundaries have explicit semantics.

- [x] Write migration/ledger tests for opening receipt, transfer preserving global physical quantity, QC disposition move, illegal negative source, missing lot/serial and cross-workspace item/location.
- [x] Add SQL checks, unique normalized stock buckets even when lots are absent, append-only posting/event protection and transactionally maintained balance projections.
- [x] Implement opening balances as a privileged explicit setup command. No editable quantity cells or startup reset; production/receipt/shipment source FKs are added as their source tables migrate.
- [x] Verify reconciliation matches independent sum-of-movement queries. A failed balance/ledger update must roll back both sides.
- [x] Run `rtk npm run test:integration -- tests/integration/inventory-ledger.test.ts`; expected: quantity invariants and no-lot uniqueness pass in actual SQLite.

## O02 — Basic supply orders and actual partial receipt

**Files:** create `src/server/modules/supply/{contracts,repository,service}.ts`, supply/receipt migrations and handlers under `src/app/api/supply-orders/`, `src/app/api/inventory/receipts/`; create `src/features/supply/{api,hooks}.ts`, supply list/detail/editor components and catalog pages B01–B03/I03–I04; create `tests/integration/supply-receipt.test.ts`.

**Produces:** `createSupplyOrder`, `approveSupplyOrder`, `changeSupplyEta`, `receiveSupply` returning source/open/received quantities and canonical posted receipt. Approved expected supply is distinct from stock.

- [x] Implement supplier/item/UOM/rate/date line validation, draft/review/approval and open-quantity read models. Approval posts audit but zero physical stock.
- [x] Actual receipt resolves source line/item/supplier, creates lot/serial records as required, posts raw or quarantine stock and source receipt quantities in one transaction.
- [x] Test partial receipt/open quantity, over-receipt rejection, required incoming QC, duplicate command and repeated different-key receipt beyond remaining source quantity.
- [x] Build usable supply/receipt forms with actual source/open qty and clear review summary; pending/failure do not show received success.
- [x] Run `rtk npm run test:integration -- tests/integration/supply-receipt.test.ts` plus typecheck; verify posted quantity by DB readback and UI refresh.

## O03 — Reservations, WIP issue/return and actual consumption

**Files:** create `src/server/modules/inventory/reservations.ts`, `issues.ts`, `consumption.ts`, task/material read-model additions and API handlers for reservations/issues/transfers/returns/consumption; add `tests/integration/material-custody.test.ts`, `tests/integration/stock-concurrency.test.ts`.

**Produces:** `reserveStock`, `releaseReservation`, `issueToProduction`, `returnUnusedMaterial`, `consumeIssuedMaterial`, `getTaskMaterialReadiness`. Services accept F03 command inputs; browser cannot declare its own available quantity.

- [x] Use material-demand IDs and reviewed requirements. Hard reserve only eligible actual stock; unmet demand remains a shortage, not a negative reservation.
- [x] Guard stock/balance versions with conditional updates inside the DB transaction. Test two independent connections trying to reserve 60 each from 100: total reserved cannot exceed 100, and the losing request has a clear domain/conflict result.
- [x] Issue raw → WIP and consume WIP → consumed separately; release relevant reservation on issue. Return unused WIP → raw without inventing another supplier receipt.
- [x] Test held stock, incompatible UOM, over-issue/consume/return, wrong task/order and replay. Once a unit is consumed it is not also counted as unconsumed WIP.
- [x] Run the two named integration files. Expected: independent sum/available/custody checks and race behavior pass; state is not protected only by a JavaScript mutex.

Representative fixture assertion (fixture/service signatures are established in F07 and this task):

```ts
import { expect, it } from 'vitest';
import { parseQuantity } from '@/domain/quantity';

it('defines the reviewed BOM demand in exact base atoms', () => {
  const ordered = parseQuantity('10', 0);
  const rawPerFinished = parseQuantity('6', 0);
  const required = ordered * rawPerFinished / 1000000n;
  expect(required).toBe(60000000n);
  expect(parseQuantity('100', 0) - required).toBe(40000000n);
});
```

This arithmetic assertion supplements, not replaces, actual two-connection service/ledger tests and database readback.

## O04 — Material Readiness UI, stock cards and count/corrections

**Files:** create `src/features/inventory/{api,hooks}.ts`, typed balance/ledger/posting/count components, catalog pages I01–I09 and item stock tabs; add count/line migrations and APIs; create `scripts/verify-reconciliation.ts`, `tests/integration/inventory-counts.test.ts`, `tests/e2e/material-readiness.spec.ts`; add `db:reconcile` script.

**Produces:** actual balance/stock-card/demand/supply view and controlled count/reversal workflow; no route named “inventory” backed only by seed Material arrays.

- [x] Show eligible on-hand, hard reservations, available, quarantine and WIP with item/UOM/lot/location scope. Link every movement to actual actor/source document.
- [x] Implement issues/transfers/returns/count forms over O01–O03. Counts capture versioned book snapshot, reason and approval; stale counts require reconciliation.
- [x] Posted corrections create linked reversing/adjusting entries and retain the original event. Restrict correction commands; source document reversals cannot silently invalidate already consumed/shipped evidence.
- [x] Demonstrate an unused-material return and approved count discrepancy apart from the main numeric fixture.
- [x] Run `rtk npm run test:integration -- tests/integration/inventory-counts.test.ts`, `rtk npm run test:e2e -- tests/e2e/material-readiness.spec.ts`, and `rtk npm run db:reconcile` against the isolated fixture. Expected: no ledger/balance/reservation mismatch.

## O05 — Actual planning, assignment and operator sessions

**Files:** create `src/engines/schedule.ts`, `src/engines/schedule.test.ts`, `src/server/modules/planning/{contracts,repository,service}.ts`, `src/server/modules/execution/{contracts,repository,service}.ts`, booking/session migrations and planning/task/my-task handlers; create planning/shop-floor feature modules and P01–P02/S01–S02 pages; modify calendar/dispatch functions; add `tests/integration/task-execution.test.ts`.

**Produces:** `scheduleTasks(input)`, `evaluateAssignment`, `assignTask`, `startTask`, `pauseTask`, `resumeTask` and persisted server-timestamp sessions. `scheduleTasks` uses real work intervals/resources/material constraints; I01 adds integrated CPM/slack/disruption analysis on the same scheduler.

- [x] Define authorized resource/calendar/remaining-duration inputs and timezone-aware interval behavior. Remove hardcoded availability dates and unrelated-skill fallback in assignment; test expiry/skill minimum/capacity and existing bookings.
- [x] Reserve actual resource slots through a versioned assignment/plan command; repeated assignment does not increment reserved workload again.
- [x] Build authoritative readiness snapshots from W04/O03, apply legal start/pause/resume transitions and session timestamps atomically, denying wrong operator/predecessor/material/resource state.
- [x] Render task instructions/pinned revisions/material evidence and a timer derived from server sessions. Reload/pause/offline behavior cannot create elapsed time/output records from a local ticking counter alone.
- [x] Run `rtk npm test -- src/engines/schedule.test.ts` and `rtk npm run test:integration -- tests/integration/task-execution.test.ts`; check real assignment/session readback and blocked action paths in UI.

## O06 — Output, inspection/rework and actual released FG

**Files:** extend execution module with `output.ts`; create `src/server/modules/quality/{contracts,repository,service}.ts`, output/inspection/result/rework migrations and action handlers; build Q01–Q03/S02 posting forms; create `tests/integration/output-quality.test.ts`, `tests/e2e/production-quality.spec.ts`.

**Produces:** `recordOutput`, `createInspection`, `finalizeInspection`, `authorizeRework`, `recordReinspection`. Final output posts FG to held stock and distinct actual evidence; QC reclassifies the same held population.

- [ ] Validate output against task/attempt/pinned item and reviewed required material. Record explicit consumption with output or reconcile prior linked consumption; never consume it twice.
- [ ] Do not sum intermediate operation outputs as additional ordered final units. Lot/serial tracking follows item policy; reject overproduction in this release rather than clamp silently.
- [ ] Finalize required check results and pass/rework/scrap dispositions under an inspector grant. A failed result is held/rework until an explicit disposition, not automatic physical scrap.
- [ ] Test repeated same-key and different-key QC passes for the same units, quantity conservation, rework attempts, missing measurements, fake actor/client role, and full rollback on ledger failure.
- [ ] Run the named integration/browser files and `db:reconcile`. Expected: 10 produced → 8 accepted + 2 held → reinspection totals 10 accepted, never 12.

## O07 — Shipment allocation, dispatch and delivery

**Files:** create `src/server/modules/delivery/{contracts,repository,service}.ts`, shipment/line/ack migrations, shipment action APIs, delivery feature components/pages D01–D03; add `tests/integration/delivery.test.ts`, `tests/e2e/shipping.spec.ts`.

**Produces:** `allocateShipment`, `dispatchShipment`, `confirmDelivery`; order detail reads actual allocated/shipped/delivered quantities separately from produced/accepted history.

- [ ] Allocate eligible accepted FG to actual order/customer/lot/units, preserving reservation semantics. No picking quarantine or another customer's order units.
- [ ] Dispatch posts the stock movement and consumes reservation once. Delivery confirmation records actual evidence; promise-tranche approval alone never counts as shipment.
- [ ] Test partial shipments, over-allocation/dispatch, repeat requests and cancellation before/after dispatch under explicit reversal policy.
- [ ] Run named integration/browser checks and reconcile the complete stock fixture through two shipments. Final accepted history remains 10 while FG stock becomes zero.

## O08 — Private documents, factual passports and customer portal

**Files:** create `src/server/modules/documents/{contracts,repository,service}.ts`, `src/server/modules/portal/{contracts,repository,service}.ts`, `src/server/modules/quality/passport.ts`, document/link/passport migrations, private upload/download/portal/passport APIs; implement pages T01/C01–C02 and account reuse; replace fixed passport/customer UI; add `tests/integration/customer-evidence.test.ts`, `tests/e2e/customer-traceability.spec.ts`.

**Produces:** `getCustomerOrder`, `acknowledgePromise`, `getPassport`, `authorizeDocumentDownload`. Reads resolve actual session customer/order relationships and stored evidence; no client label is an ownership credential.

- [ ] Store private file metadata/content under configured persistent root with allowlisted size/type, server-generated storage key and typed parent links; reject arbitrary filesystem paths. Files have actual checksums, not invented certification claims.
- [ ] Generate passport projection from actual unit/lot, input use, operation/operator/instruction, QC/rework/release/shipment evidence. Unknown/unowned serial returns scoped not-found.
- [ ] Implement portal list/detail/acknowledgment and real downloads. Remove unsupported “download ZIP” or generate an actual archive matching media type; plain text renamed `.zip` is not accepted.
- [ ] Test customer B/workspace B via direct API/download URLs and cached-query boundaries, then complete the real customer UI path after staff shipping.
- [ ] Run named integration/browser checks. Expected: actual file content/record links and privacy behavior; no whole internal graph sent then hidden with CSS.

## O09 — R0 end-to-end/restart milestone

**Files:** create `tests/e2e/operational-loop.spec.ts`, `tests/integration/operational-reconciliation.test.ts`; update setup/runbook/status/matrix with concrete evidence.

- [ ] Execute acceptance A01–A16 and the numeric stock fixture through actual endpoints/DB-backed UI. Use order A and different customer/type/order B, not only hero data.
- [ ] Reconnect/restart the application and use a fresh browser session; masters, versions, stock, work/QC/shipping and authorization persist.
- [ ] Run focused full-loop checks, `rtk npm run db:reconcile`, typecheck and production build after domain changes settle. Perform one batched desktop/tablet/mobile review and one confirmation pass after collected fixes.
- [ ] Document R0 completion with actual command/query/browser evidence and exact remaining M5/M6 gates. Preserve the six intelligence target; do not stop this overall project by labeling R0 as full R1 completion.
