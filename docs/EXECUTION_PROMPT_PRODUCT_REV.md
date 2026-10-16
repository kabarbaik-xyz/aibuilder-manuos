# Execution prompt — CoreOS product revision

Copy the prompt below into a coding-agent session opened in this repository. The plan and gap audit are the implementation authority. This prompt asks the agent to execute the whole roadmap through the available session, preserving phase gates and reporting any external pilot decision separately.

---

You are implementing the latest CoreOS product revision in this repository.

## Goal

Complete the product capabilities and release gates in `docs/superpowers/plans/2026-10-16-product-rev-completion.md`, using the evidence in `docs/product-rev-gap-audit.md` and the source requirements in `docs/product_rev/`. The user wants the working product completed, not another audit, plan, mockup or implementation prompt.

The target outcome is a traceable multi-item manufacturing order flowing through released engineering, qualified conflict-free dispatch, evidenced execution, reconciled QC and truthful customer milestones, followed by the specified R1–R3 capabilities. Complete each gate with evidence before progressing.

## Read first

1. Read `AGENTS.md`, `docs/DESIGN.md`, `docs/superpowers/specs/2026-10-15-manuos-ui-restoration/visual-contract.md`, the complete product revision plan and its gap audit.
2. Read the five source files in `docs/product_rev/`; preserve the workbook release IDs, dependencies, acceptance tests and pilot decisions.
3. Inspect the live branch, working tree and current code before changes. The audit references `feat/product_rev` at `cf282ba`; revalidate every cited path and preserve user changes made since then.
4. Read existing implementation patterns and API contracts before changing them. If the available coding environment has execution-planning skills, use its plan-execution workflow. Load `postman:api-engineer` before API contract or route changes.

## Rules

- Execute the dated plan from Phase 0 through Phase 13 in dependency order. Do not stop after discovery, after producing tickets, at the first green typecheck or at the R0 checkpoint. Continue to the complete authorized roadmap. If the session cannot finish, leave a precise continuation record naming the last verified phase, remaining work and blocker.
- Keep checkboxes honest: mark one done only after its deliverable and listed verification succeed. Maintain a dated implementation evidence/status document. Update the requirement matrix with source paths, tests and actual evidence as each capability lands.
- Resolve reversible design choices from the product documents and repo rules without repeatedly asking. Ask only when an unresolved business or external decision materially changes data ownership, safety authority, privacy, integration behavior or irreversible deployment. Continue independent work while waiting.
- Preserve Next.js 15, React 19, Prisma/SQLite, Better Auth, workspace tenancy, principal-based authorization, `executeCommand`, 10^6 bigint atoms, double-entry stock through `postMovement`, exact QC conservation and existing operational identities/history. The SQL file is a reference only: do not apply it directly or replace Prisma with Drizzle.
- Use decimal strings and the actual `src/domain/quantity.ts` API; eliminate floating point quantity/cost arithmetic. Do not trust client actor IDs, eligibility, milestone state, AI output, schedules or recovery quantities.
- Extend existing services and shared components. Follow shell ownership, light theme, shared form/table controls and centered CRUD dialogs. Keep contextual drawers read-only. No operational mock data, invented fallback claims, silent authorization bypass or new parallel source of truth.
- Amend `contracts/openapi.yaml` together with API behavior changes. Every write must authenticate, authorize, validate, be idempotent where required, recheck mutable constraints in its committing transaction and leave auditable evidence.
- Preserve unrelated changes. Do not commit, push, merge, publish external artifacts or deploy without the user's explicit authorization.

## Execution sequence

Work through the exact phase deliverables and acceptance checks in the completion plan:

1. Establish migration/runtime/reconciliation baseline and record unresolved pilot decisions with owners.
2. Contain current reachable authorization, booking, quantity, passport and recovery defects before adding more UI or intelligence.
3. Add facility scope and platform notifications; then multi-item orders/jobs/releases and trusted workforce/rosters.
4. Make one server-side eligibility/readiness service authoritative for preview, booking, start, rescheduling and future recommendations. Enforce overlap/capacity atomically.
5. Complete execution, QC, evidence forms, customer-safe R0 projections and prove the R0 pilot journey.
6. Continue through R1 controlled changes/schedule publication/integrations/analytics/offline events; R2 finite capacity/Promise/history/costing/connectors; and R3 recovery/passport/vision/IoT/network.
7. Finish with the plan's full regression, concurrency, migration/restore, browser, privacy, performance and pilot evidence gates.

Keep the dependency graph from the plan. Facility scope precedes site ownership; multi-item jobs and verified workforce precede safe dispatch; dispatch precedes full execution truth; trustworthy event history precedes predictive promises; and the same safety gate must validate every AI/optimizer/recovery proposal.

## Verification and reporting

For each phase, run the exact checks in that phase and the repository's required typecheck. Add focused integration tests for changed domain rules, negative authorization/tenant cases, concurrency and rollback. At the release gates, run the full regression suite, reconciliation and actual authenticated browser journeys. Use isolated fixtures and close them. Never run migrations or seeded writes against production.

Report evidence by level: source inspection, typecheck, focused tests, full tests, local HTTP, browser, database readback/reconciliation, provider and pilot. Do not describe Vitest route/service tests as browser tests, or local checks as deployed/pilot proof. Report failures plainly and continue fixing them.

Do not make a completion claim while a planned phase or required verification remains open. At the end, summarize the user-visible behavior delivered, links to implementation/status evidence, exact checks and results, migration/runtime impact, remaining product-owner decisions, and any incomplete phases.

Start now by verifying the checkout and Phase 0 evidence baseline, then implement Phase 1. Continue sequentially through every phase in the plan.

---

The prompt does not itself execute code. Completion and verification are recorded in the plan/status artifacts during implementation.
