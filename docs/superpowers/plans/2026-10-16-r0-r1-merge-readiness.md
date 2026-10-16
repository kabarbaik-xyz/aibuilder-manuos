# Alternative plan: R0+R1 merge readiness (scoped release)

Companion to [product-rev-completion](2026-10-16-product-rev-completion.md). That plan stays the long-term roadmap. This one defines the smallest honest scope to merge `feat/product_rev` and release to a pilot.

## Principle

Merge what is verified. Anything unverified is either (a) finished with evidence, (b) hidden behind a fail-closed/disabled state, or (c) explicitly marked DEFERRED. No mock features, no inflated claims.

## Scope decision

| Scope | Decision | Rule |
| --- | --- | --- |
| Phases 0–7 (R0) | In release | Must have evidence |
| Phases 8–9 (R1) | In merge if code is green; pilot-gated | Browser evidence needed for planner publish, customer approval, offline queue |
| Phase 10–11 (R2) | Merge existing code only if tests green; marked "not pilot-validated" | Backtests need real history (G5), so no accuracy claims |
| Phase 12 (R3) | Open items DEFERRED: telemetry, visual QC, cross-factory sharing | Remove or hide any UI entry point; add no stubs |
| Phase 13 | Reduced to the checklist below | |

## Stage A — Close open R0 code gaps (Phase 6)

- [ ] Pause/finish structured reason codes and pinned work-instruction display in the workstation.
- [ ] Per-operation good/reject/rework quantities against stage WIP, with partial output not completing the operation.
- [ ] Issue evidence: use uploaded file IDs only (no arbitrary URLs).
- [ ] QC per-check evidence attachment, or document it as deferred.
- [ ] Customer milestone/document share policy UI, or hide the share entry points.

Exit: `npm run typecheck`, targeted tests per item.

## Stage B — Fail-closed audit of everything deferred

- [ ] List every route/UI entry for R3 and unfinished R2 items (telemetry, vision QC, partner sharing, recovery apply).
- [ ] Each must return an explicit "not available" state or be hidden. Confirm no fake data (AGENTS.md §6.4).
- [ ] Record the DEFERRED list with owner in [implementation status](../../product-rev-implementation-status.md).

## Stage C — Technical gates (automatable now)

- [ ] `npm run typecheck`, serial full Vitest, `npm run build`, `git diff --check`.
- [ ] Fresh migration deploy, then incremental migration on a copy of the demo DB; `integrity_check`, `foreign_key_check`.
- [ ] `npm run db:reconcile` shows zero discrepancies.
- [ ] Review the migration list (23+) for ordering and rerun safety.
- [ ] OpenAPI matches routes for every changed endpoint.
- [ ] Update the plan checkboxes and status doc with only the commands actually run.

## Stage D — Browser evidence (the main remaining gap)

Run actual browser journeys (Playwright or manual with recorded results), kept separate from Vitest:

- [ ] Desktop: multi-line order → release → split jobs → qualified assignment → conflict rejection.
- [ ] Mobile: operator login → scan/manual entry → start/pause/output → issue with photo.
- [ ] QC → rework → delivery → customer portal (customer A cannot see customer B).
- [ ] Keyboard behavior for dialogs; failed-request recovery.
- [ ] UI review by you (Shop Floor Today/Profile, inbox, planning) against `docs/DESIGN.md`.

## Stage E — Deployment contract

- [ ] Document single-writer durable SQLite deployment; remove stale Cloud Run multi-instance guidance.
- [ ] Backup + restore rehearsal with documents on a disposable copy, plus restart persistence.
- [ ] Measure P95 CRUD < 800 ms and submit < 1.5 s in a declared environment, or record "not measured".

## Stage F — Merge procedure

- [ ] Rebase or merge the target branch; resolve conflicts, then rerun Stage C.
- [ ] PR description: scope, DEFERRED list, evidence links, known limitations, rollback (DB backup + migration notes).
- [ ] Commit, push and PR only on your explicit go-ahead.

## Definition of done (merge)

Typecheck/tests/build green, reconcile zero discrepancies, migrations verified on a copy, deferred items hidden or fail-closed and documented, no claims beyond the evidence.

## Definition of done (pilot release)

Merge criteria plus Stage D browser evidence, Stage E restore proof, and pilot owner sign-off (G0–G4). Metrics such as 99.5% availability and business-improvement targets stay hypotheses until the pilot measures them.

## Suggested order

A → B → C → D → E → F. A and B can run in parallel.
