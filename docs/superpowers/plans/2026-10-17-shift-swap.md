# Shift swap

Approved request: implement shift swaps now. Manager workflow uses existing roster authority (`resource.manage` or `planning.write`), centered request/review dialogs, and durable PENDING/APPROVED/REJECTED history. No invented supervisor role or employee consent workflow.

Swap semantics: exchange owners of two future published SHIFT intervals in one facility. Dates, break patterns and machine bookings stay attached to the original time slot. Confirmed technician bookings wholly contained in each shift transfer with their task assignment to the incoming technician. Running/paused/completed tasks, partial/out-of-sync bookings, outside-scope facilities, other roster conflicts and weekly resource limits reject the swap. Approval recomputes the exact reviewed snapshot and rechecks actual assignment qualifications and availability in the command transaction. Any failure rolls back shifts, tasks, bookings, events and decision state. Existing self-service Technician permissions do not grant manager approval.

- [x] Durable request schema, migration and contracts.
- [x] Scope/snapshot validation, atomic approval/rejection and assignment eligibility reuse.
- [x] Person Availability entry, candidates, request history and decision confirmation.
- [x] Isolated success, rejection, rollback, stale/concurrent/idempotency and access tests.
- [x] Local schema deployment, typecheck and proportionate verification; no commit/push.

Verification: Shift swap suite 6/6 passed, covering pending-only request, atomic/idempotent approval, stale/cross-workspace/pending conflicts, leave and weekly caps, missing/expiring skills with complete rollback, real task/booking transfer preserving machine reservation, injected late-write failure and concurrent approval one-winner behavior. Related Phase 4 workforce (5), Phase 5 dispatch (9), and People & Access (7) passed in the focused pass; total 27 focused cases. Final typecheck passed after regenerating stale Next route types with `next typegen`. OpenAPI parsed (99 paths), whitespace check passed, local DEMO ledger balanced (194 movements/113 buckets). Migration applied after integrity-checked backup `/tmp/manuos-before-shift-swap-20261017-221003.db`; dev server restarted at port 3000. No full build/suite or browser actions, per user speed request.
