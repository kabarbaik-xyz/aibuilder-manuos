# ManuOS Foundation and Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation and commits require separate user authorization.

**Goal:** Deliver M0–M1: durable SQLite infrastructure, real identity/authorization, usable setup/master pages and shared typed UI.

**Architecture:** Next.js modular server application with Prisma/SQLite, Better Auth sessions, workspace membership/permission policy, short atomic commands and fetched client read models.

**Tech Stack:** Existing React/Next/Zod/Vitest plus pinned compatible Prisma SQLite adapter, Better Auth, TanStack Query and integration/browser test tooling.

## Global Constraints

All constraints in the master plan and design brief apply. Preserve unrelated dirty edits, use `rtk`, do not commit/push/deploy automatically, do not read/use real application DBs in tests, and never store passwords/session cookies/provider keys in artifacts.

## F01 — Runtime, database bootstrap and contract skeleton

**Files:** create `prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations/`, `prisma/seed.ts`, `src/server/db/client.ts`, `tests/fixtures/database.ts`, `tests/integration/database.test.ts`; modify `package.json`, `package-lock.json`, `tsconfig.json`, `Dockerfile`, `.env.example`, `.gitignore`, `contracts/openapi.yaml`.

**Interfaces:** produce `db` server-only Prisma client and `createTestDatabase(): Promise<{ db: PrismaClient; url: string; close(): Promise<void> }>` using a temporary SQLite file. Introduce initial access/shared infrastructure from DB section 3; leave later domain migrations to their tasks.

- [ ] Read current branch/status/runtime/container, existing API spec and package lock. Check primary docs/package engine requirements for the chosen pinned Prisma/auth/native driver and supported Node runtime; record exact versions in `docs/implementation-decisions.md` before installation. Keep one package manager.
- [ ] Add migration/seed/integration scripts from the master plan and explicit server-only database config. Ignore DB/WAL/SHM/private upload/backup files while preserving example env files.
- [ ] Set a supported TypeScript target/lib for the planned BigInt quantity code (at least ES2020), verifying server and browser bundle compatibility; quantities crossing HTTP remain decimal strings.
- [ ] Write the migration/restart and wrong-workspace-FK tests first. Migrate a new temporary DB; insert a workspace/master relation; reconnect and prove the row persists. Invalid cross-workspace relations must be rejected.
- [ ] Configure/check foreign-key enforcement, busy handling and appropriate journal mode on actual connections. Include checks/triggers/indexes in migration SQL rather than relying on ORM typings.
- [ ] Add seed-once shared permission/workspace bootstrap. Seed does not reset real data or write embedded passwords. Existing hero data is not imported into operational tables yet.
- [ ] Run `rtk npm run test:integration -- tests/integration/database.test.ts`, `rtk npm run typecheck`; expected: fresh migration, reconnect readback and FK tests pass. Record SQLite/runtime versions, migration result and actual DB identity sanitized from secrets.

## F02 — Real authentication, memberships and policies

**Files:** create `src/server/auth/auth.ts`, `src/server/auth/principal.ts`, `src/server/auth/policy.ts`, `src/server/auth/permissions.ts`, `src/server/auth/provisioning.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/api/me/route.ts`, `src/app/(auth)/login/page.tsx`, `scripts/bootstrap-admin.ts`, `tests/fixtures/access.ts`, `tests/integration/access.test.ts`; extend access migrations and `contracts/openapi.yaml`.

**Interfaces:** produce `Principal` from `api-rbac.md`, `requirePrincipal(request): Promise<Principal>`, `requirePermission(principal, code): void`, and `seedTestAccess(db, options): Promise<{ principal: Principal; userId: string; workspaceId: string; membershipId: string }>` for isolated tests. Authentication identity is provider-managed; business grants are application-owned.

- [ ] Generate/review the pinned Better Auth Prisma model requirements; implement email/password plus supported persisted sessions, explicit trusted origin/base URL, sign-out/revocation and disabled-account behavior. Public signup is disabled.
- [ ] Implement bootstrap and protected provisioning through supported server APIs. CLI prompts for password securely; access administrator role does not automatically grant every business approval.
- [ ] Write/run denial tests for anonymous request, disabled/expired session, inactive membership, missing permission, forged client role, wrong workspace and customer ownership. Test that revocation affects the next command.
- [ ] Add real login/account read model and initial role bundles. Add customer/technician membership links only once their tables migrate; never infer those links from a display name.
- [ ] Test the real auth HTTP boundary, not only a hand-constructed Principal. Expected: login creates a revocable session; logout invalidates it; direct unauthorized requests fail. Use redacted cookies in memory only.
- [ ] Run `rtk npm run test:integration -- tests/integration/access.test.ts` and `rtk npm run typecheck`; record API statuses and DB session readback.

## F03 — Shared command transactions and error contracts

**Files:** create `src/domain/commands.ts`, `src/domain/errors.ts`, `src/domain/quantity.ts`, `src/server/db/transaction.ts`, `src/server/http/errors.ts`, `src/server/http/route-handler.ts`, `tests/integration/commands.test.ts`, `src/domain/quantity.test.ts`; update API schemas.

**Interfaces:** produce `CommandInput<T>` and `Committed<T>` from API design, exact fixed-point helpers `parseQuantity(value: string, precision: number): bigint` and `formatQuantity(atoms: bigint): string`, and `executeCommand(principal, input, handler)` that runs a scoped versioned handler with the transaction client and records command/audit/revision atomically.

- [ ] Write tests for malformed/excess-precision/negative quantities, integer piece precision, JSON round-trip decimal strings and 64-bit boundaries. Check conversion arithmetic independently rather than mirroring the parser.
- [ ] Implement idempotency receipt lookup **after authorization**, canonical request hashing, same-key replay/different-hash conflict, expected-version checks, rollback and stable errors.
- [ ] Write an integration test that deliberately throws after an aggregate write; assert aggregate/audit/success receipt all roll back. A retry with the same key then succeeds once.
- [ ] Add a shared request adapter for Zod DTOs, request IDs, error mapping, body-size limits and mutation-origin checks. No generic raw table/graph write endpoint.
- [ ] Run `rtk npm test -- src/domain/quantity.test.ts` and `rtk npm run test:integration -- tests/integration/commands.test.ts`; expected: exact quantities, replay/conflict and rollback checks pass.

The intended quantity contract is concrete:

```ts
import { expect, it } from 'vitest';
import { parseQuantity, formatQuantity } from '@/domain/quantity';

it('preserves base-unit quantity precision without floating-point stock', () => {
  expect(parseQuantity('1.125', 3)).toBe(1125000n);
  expect(formatQuantity(1125000n)).toBe('1.125');
  expect(() => parseQuantity('1.5', 0)).toThrow();
  expect(() => parseQuantity('-1', 3)).toThrow();
});
```

## F04 — Authenticated shell, API/query adapter and shared states

**Files:** create `src/lib/api/client.ts`, `src/lib/api/query-keys.ts`, `src/components/providers.tsx`, `src/components/authenticated-shell.tsx`, `src/components/ui/data-table.tsx`, `src/components/ui/form-errors.tsx`, `src/components/ui/resource-state.tsx`, route-group layouts `src/app/(workspace)/layout.tsx`, `src/app/(customer)/layout.tsx`, `src/app/(account)/layout.tsx`, `src/app/(evidence)/layout.tsx`; modify current shell/sidebar/topbar/account/dialog files and root layout; create `tests/e2e/access-shell.spec.ts`.

**Interfaces:** one typed `apiRequest<T>()` error path; query keys scoped by workspace/resource/filter; server layouts establish access, client navigation projects grants; no client-only route hiding as security. Existing `AppShell` can render migrated feature children until route migration completes.

- [ ] Implement login redirect/return-to validation, real account/profile/logout and staff/customer shell boundaries using F02. Remove normal-mode privilege-changing persona selection.
- [ ] Integrate TanStack Query provider and shared pending/error/stale/empty/not-found states. Standardize mutation response invalidation; no operational optimistic stock writes.
- [ ] Preserve responsive navigation/account behavior and hidden native scrollbar preference. Fix sidebar/backdrop/focus/resize regressions inside this task; explicitly choose workspace resize without animating margin/width rather than suppressing a real layout-performance finding.
- [ ] Build the first real list/form surface with populated/empty/error/permission cases; inspect desktop/tablet/mobile together. No generic CRUD JSON form.
- [ ] Run `rtk npm run test:e2e -- tests/e2e/access-shell.spec.ts`, focused typecheck, and a bounded manual visual pass. Expected: direct unauthorized navigation blocked, session logout real, drawer and scroll usable on short mobile viewports.

## F05 — Customers, suppliers, items/UOM and locations

**Files:** create `src/server/modules/masters/contracts.ts`, `repository.ts`, `service.ts`, commercial/item migrations, resource-specific handlers under `src/app/api/customers/`, `suppliers/`, `items/`, `locations/`, `uoms/`; create `src/features/masters/api.ts`, `hooks.ts`, typed forms/list components and pages M01–M08 in the UI catalog; create `tests/integration/masters.test.ts`.

**Interfaces:** `createMaster(principal, resourceContract, input)` is an internal typed dispatch over a closed catalog, not a client-selected SQL table. Exposed services have resource names such as `createCustomer`, `archiveItem`, `listItemBalances` (the balance reader is added in O01). Every read/edit uses workspace + ID and version.

- [ ] Add customer/contact/supplier/item/UOM/conversion/location schemas, uniqueness and archival restrictions. Add membership customer FKs at this migration and explicitly preserve existing users with null customer scope.
- [ ] Create endpoint DTOs/examples and grant checks before UI. Test duplicate codes, wrong-workspace FK, inactive references, illegal precision/conversion, and archival of used records.
- [ ] Implement actual searchable/filterable lists, master details and bounded create/edit forms; error fields use the shared adapter. Use stable IDs in selectors, not names.
- [ ] Verify creating a new customer and item in the UI, refreshing, and reading the same DB records. Empty workspace remains usable; defaults are not silently fabricated.
- [ ] Run `rtk npm run test:integration -- tests/integration/masters.test.ts` and `rtk npm run typecheck`; expected: actual CRUD/archival policies and readback pass.

## F06 — Organization/resources, order types and QC catalogs

**Files:** extend `src/server/modules/masters/`; create resource calendars/skills/certification/order-type/checklist migrations, resource handlers and pages M09–M15; create `src/features/masters/components/resource-forms.tsx`, `tests/integration/resources.test.ts`.

**Interfaces:** validated resource IDs/calendar intervals/skill levels/cert expiry and immutable QC checklist revisions are consumed by W01/W02 and planning. `getResourceContext(principal, resourceIds, at)` returns authorized actual availability/requirements, not a fixed demo shift.

- [ ] Add editable department/calendar/exception, machine class/machine, technician membership/skill/cert, order type and checklist catalogs. Archive rather than delete references.
- [ ] Test overlapping/bad calendar intervals, expiry, wrong membership/resource ownership and item/operation reference mistakes. Order-type default cannot point to an unpublished process once W01 supplies versions.
- [ ] Build resource pages and forms, including no-qualified-resource and missing-calendar states. No fake skill/QA identity added by persona switching.
- [ ] Run `rtk npm run test:integration -- tests/integration/resources.test.ts` and typecheck; verify one resource edit changes returned availability rather than remaining a code constant.

## F07 — M0/M1 review and reusable factory fixture

**Files:** create `tests/fixtures/factory.ts`, `tests/e2e/master-setup.spec.ts`; update `docs/execution-status.md`, `docs/requirements-matrix.md`, `docs/environment-setup.md` and `.env.example` with actual setup facts.

**Interfaces:** `createFactoryFixture(options)` returns temporary DB/client, real access principals, IDs for two workspaces/customers/UOMs/items/locations/resources, an injectable clock and `close()`. Later domain tasks extend this fixture rather than reading seed globals or a real developer DB.

- [ ] Seed two isolated test workspaces and named baseline user roles using F02/F05/F06 services or explicit fixture-only setup. Actual operator/customer linkage is returned, not inferred from names.
- [ ] Walk bootstrap/login → create customer/item/resource/type → refresh/restart → verify DB/UI identity. Verify a denied role cannot repeat the same commands directly through HTTP.
- [ ] Run `rtk npm run test:e2e -- tests/e2e/master-setup.spec.ts`, focused integration checks and `rtk npm run typecheck`.
- [ ] Mark M0/M1 verified only with source, HTTP/DB and UI evidence; do not claim workflows/inventory/AI complete. Proceed to W01 with the current dirty checkout rechecked.
