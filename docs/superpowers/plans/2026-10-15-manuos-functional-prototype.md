# ManuOS Functional Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagent-driven development is an option only when the user authorizes delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a SQLite-backed manufacturing prototype with real access/master/workflow/inventory/production/QC/delivery behavior and all six intelligence capabilities, preserving the approved UI.

**Architecture:** Modular Next.js monolith with authenticated typed API handlers, permission/ownership policies, server-owned command services, Prisma/SQLite transactions and pure deterministic engines. Zustand is UI state; fetched projections use a shared query layer. AI reads authorized persisted/computed context and proposes/explains; human commands own consequential writes.

**Tech Stack:** Existing Next.js/React/TypeScript, Zod, Vitest, self-hosted Plus Jakarta Sans and Google Gen AI SDK; proposed Prisma SQLite adapter, Better Auth/Prisma integration, TanStack Query, and Playwright for meaningful end-to-end flows. Verify/pin package and runtime compatibility together at F01.

## Global Constraints

- User selected operational functionality **and all six intelligence capabilities**, delivered in stages, with **SQLite**.
- R0 = M0–M4 operational milestone; R1 = M5–M6 intelligence/hardening. The target is R0+R1, not R0-only.
- Preserve English product copy, Plus Jakarta Sans, light blue/neutral visual identity, balanced density and responsive desktop/tablet/mobile behavior.
- Preserve unrelated staged/unstaged changes. Do not commit, push, deploy or publish without a separate user request.
- Prefix shell commands with `rtk` per `/Users/ardian/.codex/RTK.md`. No unapproved worker spawning.
- Normal runtime uses real users, scoped records and server commands. Demo reset/persona tools are isolated from ordinary application authority.
- No stock/quality/output/shipment fabrication; no mutation success before DB commit. Store quantity atoms as integers and expose decimal strings.
- Immutable released workflow/engineering versions; independent customer/workspace isolation; unknown IDs never fall back to a hero fixture.
- Keep provider-mocked, actual local HTTP/DB/browser and live-provider evidence distinct. Do not invent “100% complete” from file creation.
- Full Cost Intelligence P2, enterprise SSO, IoT, advanced WMS and full Factory Network marketplace are outside this release. Capture evidence needed for future depth without implementing speculative systems.

## Design package and execution order

| Document | Purpose |
| --- | --- |
| [Design brief](../specs/2026-10-15-manuos-functional-prototype/design.md) | Confirmed decisions, architecture, module boundaries and release scope |
| [Database](../specs/2026-10-15-manuos-functional-prototype/database.md) | Tables/relations, versioning, quantities, constraints, SQLite/migrations |
| [UI and pages](../specs/2026-10-15-manuos-functional-prototype/ui-pages.md) | Canonical route catalog, permissions, layouts and responsive states |
| [API and RBAC](../specs/2026-10-15-manuos-functional-prototype/api-rbac.md) | Principal, role bundles, action contracts, errors/concurrency and six AI contracts |
| [Acceptance](../specs/2026-10-15-manuos-functional-prototype/acceptance.md) | Operational fixture, failure gates and six intelligence proofs |

Execute the following subsystem plans in order. They are bounded implementation contracts, not an instruction to scaffold every screen before any workflow works.

1. [Foundation and master data](2026-10-15-manuos-01-foundation.md): F01–F07, M0–M1.
2. [Engineering, orders and workflow](2026-10-15-manuos-02-workflow-orders.md): W01–W06, M2.
3. [Inventory through customer evidence](2026-10-15-manuos-03-operations.md): O01–O09, M3–M4.
4. [Intelligence and verification](2026-10-15-manuos-04-intelligence.md): I01–I08, M5–M6.

**Queued follow-up, after all four plans finish:** [Dynamic forms and AI-assisted workflow builder](2026-10-15-manuos-05-dynamic-forms.md), DF01–DF06 and WB01–WB03. Adds versioned order/task/QC forms, React Flow drag-and-drop workflow editing, and AI draft generation for both builders with mandatory preview and human validation before publication. It does not expand or interrupt the current execution. Existing form/guard JSON is not proof of a complete dynamic form engine.

## Milestone review gates

| Gate | Reviewable product result | What must not be claimed yet |
| --- | --- | --- |
| M0 | Login + scoped API + persisted bootstrap with denial/rollback proof | Generic orders/inventory/workflows are not implemented by schema alone |
| M1 | Editable valid masters, account/resource setup and responsive shell | Seeded master arrays are not management features |
| M2 | Reviewed/published process and actual released new order with generated work | Graph preview is not a workflow runtime |
| M3 | Receipt/reservation/issue/consumption/count stock ledger reconciles | Supplier approval/ETA is not physical receipt |
| M4 | New order produced, inspected/reworked, shipped and customer-visible after restart | R0 is not completion of all six intelligence capabilities |
| M5 | Six intelligence behaviors work against the same actual records | Provider mocks/canned examples are not live-AI proof |
| M6 | Complete R0+R1 repeatable validation, backup/restore and bounded responsive review | Local readiness is not deployment proof |

Record review feedback and next task without automatic git staging/committing. A meaningful independently testable slice may become a commit later when the user asks.

## Shared file responsibilities

- `contracts/openapi.yaml`: maintained application API source; extend before integrating each UI surface.
- `prisma/schema.prisma` and migrations: persistent model/constraints, not a serialized Zustand blob.
- `src/server/auth/`: identity/policy; module services always recheck permissions/ownership.
- `src/server/db/` and `src/domain/commands.ts`: short atomic commands, idempotency/revision, quantity conversion and error conventions.
- `src/server/modules/`: module contracts/repositories/services; avoid a replacement monolithic global action file.
- `src/lib/api/` and `src/features/*/`: one typed API/query path and module UI.
- `src/store/graph-store.ts`: gradually remove operational authority; unrelated UI edits preserved.
- `tests/fixtures/factory.ts`: all tests create configurable actual workspace/customer/type records, never depend on a real developer DB.
- `scripts/`: explicit bootstrap, reconciliation, backup/restore; no startup truncate or credentials in source.

## Planned command surface

The following scripts are created by F01/O04/I08 before being run. They are not current commands except existing `typecheck`, `test`, and `build`.

```text
rtk npm run db:migrate
rtk npm run db:seed
rtk npm run auth:bootstrap -- --email owner@example.test --workspace demo
rtk npm run db:reconcile
rtk npm run db:backup -- --destination /private/tmp/manuos-backup
rtk npm run db:restore -- --source /private/tmp/manuos-backup --destination /private/tmp/manuos-restore
rtk npm run test:integration -- tests/integration/access.test.ts
rtk npm run test:e2e -- tests/e2e/operational-loop.spec.ts
rtk npm run typecheck
rtk npm test
rtk npm run build
```

Bootstrap prompts securely for credentials; the command line must not contain a plaintext password. Test database URLs are temporary/isolate files; backup/restore commands never replace a live DB implicitly. Execute the concrete focused module paths shown in the task plans.

## Migration from the existing app

1. Add real infrastructure and authenticated route groups without overwriting unrelated mobile/copilot changes.
2. Introduce real records/actions one domain at a time; keep old demo UI under explicit sandbox mode until its equivalent is migrated.
3. Make new Order Hub/engineering/stock/work pages consume typed fetched records. Do not mix a DB order with hardcoded store order 1042 for downstream operations.
4. Migrate existing main views into authorized read models; share intake components, replace sample downloads/passports and remove client-authoritative actions.
5. Gate each intelligence action on matching input/data revision. Remove fake successful fallbacks and replace fabricated historical UI rows with actual queries.
6. At M6 normal application routes cannot import operational seed arrays, role-preview privilege changes or direct `useGraphStore.setState` business writes.

## Main risks and decisions already resolved

- SQLite uses one durable server/local file; existing Cloud Run docs/container do not settle durability. Multi-instance hosting is deferred.
- Existing Node 20 Dockerfile must pass compatibility/support review with the selected Prisma/auth/native adapter. Pin a tested supported runtime pair; do not hide an upgrade in an unrelated UI task.
- Better Auth account/session schema follows its pinned provider, while workspace RBAC remains application-owned. No Credentials/JWT/database-session assumptions from a different auth framework.
- Actual inventory and output models precede trustworthy ETA/recovery/memory; integrating AI before that only decorates the fixture.
- F12 marketplace is not silently dropped from history, but its complete bilateral scope is not claimed in this selected release; basic inbound supplier flow is real.
- New draft/publication/release states replace the old demo enum deliberately; document adapters/migration rather than accepting mixed hidden strings.

## Plan self-review and handoff

- [x] Scope covers DB, identity/RBAC, masters, UI/pages, workflows, inventory/supply, execution/QC/delivery, portal and all six intelligence capabilities.
- [x] Product priorities are distinguished from implementation milestones; P2 costing is bounded.
- [x] Paths, module interfaces, domain invariants and meaningful task acceptance are assigned in the subsystem plans.
- [x] Runtime/provider/deployment claims remain unverified; docs are the current deliverable.
- [ ] User review of the design package and release boundaries before application execution.
- [ ] Execute F01–I08 using the listed dependency order and evidence gates.

This planning turn does not install packages, alter application schemas, run migrations or deploy. On implementation authorization, start F01 with a fresh working-tree/runtime check and use the current files rather than assuming the audit snapshot is unchanged.
