# ManuOS Agent Harness & Rule Guidance

This document defines the strict architectural, domain, UI, and operational rules for any AI agent or developer working in this repository. **All rules are mandatory and strictly enforced. Do not deviate, improvise ad-hoc patterns ("ngadi-ngadi"), or bypass established contracts.**

---

## 1. Core Architecture & Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (strict mode).
- **Styling**: Tailwind CSS v4 + Vanilla CSS tokens in `src/app/globals.css`.
- **Database**: SQLite with Prisma ORM, located at `prisma/data/dev.db`.
  - WAL mode enabled, `busy_timeout = 5000ms`, `foreign_keys = ON`.
  - Append-only event store and double-entry inventory ledger.
- **Server Architecture**:
  - Domain commands wrapped with `executeCommand(options)` in `src/server/db/transaction.ts`.
  - Transactional boundaries, idempotency keys, command logging, and audit trail.
  - Zero client-authoritative state or mock-only shortcuts. Every business state derives authoritatively from server-side domain commands.

---

## 2. Integer Quantity & Arithmetic Rules (CRITICAL)

- **Precision**: All quantities are stored and manipulated as **64-bit integer atoms**:
  $$\text{1 display unit} = 1{,}000{,}000\text{ atoms} \quad (10^6\text{ scale})$$
- **Primitive Type**: Always use `bigint` for internal quantity fields (e.g., `orderedAtoms`, `onHandAtoms`, `reservedAtoms`, `outputAtoms`).
- **Never use floating point numbers** for quantity or financial calculations.
- **Helpers**: Always use functions from `@/domain/quantity`:
  - `parseQuantity(input: string | number, decimals: number): bigint`
  - `formatQuantity(atoms: bigint, decimals?: number): string`
- **Conservation of Quantity Invariant**:
  - Production output, scrap, rework, and shipment movements must strictly conserve mass:
    $$\text{inspectedAtoms} = \text{passedAtoms} + \text{reworkAtoms} + \text{scrappedAtoms}$$
  - Reinspected rework units reclassify existing held stock; they never spawn new physical atoms.
  - Rejections must be explicit (`BadRequestError`), never silently clamped.

---

## 3. UI & Design System Contract (Strict Light Theme)

All UI surfaces must conform to `docs/DESIGN.md` and `docs/superpowers/specs/2026-10-15-manuos-ui-restoration/visual-contract.md`.

### 3.1 Shell & Layout Hierarchy
- **Single Shell Ownership**: Root layout `src/app/(workspace)/layout.tsx` owns the `AuthenticatedShell` (sidebar, topbar, toast, copilot host).
- **NEVER** wrap individual workspace pages in `<AppShell>` or `<AuthenticatedShell>`. Pages render only their page content:
  ```tsx
  export default function MyPage() {
    return (
      <div className="page-stack">
        <PageHeader title="..." description="..." actions={...} />
        {/* page content */}
      </div>
    );
  }
  ```
- **Sidebar**:
  - 280px wide on desktop ($\ge 1280$px), 256px on tablet.
  - Independently scrollable nav groups: Operations, Master Data, Admin.
  - Authored typed SVG icon facade (`src/components/icons.tsx`). Never use silent fallbacks to `order` or random emoji.

### 3.2 Dialogs: Modals vs. Drawers
- **CRUD Add / Edit**: MUST use **centered dialog modals** (`<Dialog type="modal">` or `centered` form dialogs).
  - Widths: `sm` (480px), `md` (640px), `lg` (840px).
  - Centered in the viewport, white surface, native `<dialog>` with focus trap and body-scroll lock.
  - **NEVER** default a CRUD Add/Edit form to a right-edge drawer.
- **Drawers (`type="drawer"`)**: Reserved **exclusively** for contextual inspection, AI copilot insights, or read-only traceability/passport evidence.

### 3.3 Color Palette & Tokens (Light Theme Only)
- Background: `--bg: #f5f7fb`
- Surface: `--surface: #ffffff`
- Surface Muted: `--surface-muted: #f8f9fc`
- Borders / Dividers: `--line: #e7ebf2` (CSS class `border-line` or `border-[var(--line)]`)
- Body text: `--ink: #182438`
- Muted text: `--muted: #627086`
- Primary action: `--primary: #2459df` (hover: `#1947bf`, soft: `#edf2ff`)
- **STRICTLY PROHIBITED**:
  - `bg-neutral-900`, dark slate containers, white text on dark cards, or dark-mode overrides inside the workspace.
  - Ad-hoc black hairline borders (`border-black`). Use semantic `border-line`.

### 3.4 Shared UI Primitives
Always compose views using existing primitives in `src/components/ui/`:
- Layout: `PageHeader`, `Panel`
- Form: `FormField`, `Input`, `Select`, `Textarea`, `Button`, `ButtonLink`
- Data & State: `DataTable`, `Badge`, `EmptyState`, `ErrorState`
- Feedback: `Toast`, `FormErrors`

---

## 4. Backend Domain & Ledger Rules

- **Double-Entry Inventory Ledger**:
  - All physical and held stock movements must go through `postMovement()` in `src/server/modules/inventory/ledger.ts`.
  - Supported `MovementType`: `OPENING_BALANCE`, `PURCHASE_RECEIPT`, `TRANSFER`, `ISSUE_TO_WIP`, `RETURN_FROM_WIP`, `PRODUCTION_CONSUME`, `PRODUCTION_OUTPUT`, `QC_DISPOSITION`, `SHIPMENT`, `ADJUSTMENT`.
  - Every movement specifies `itemId`, `sourceLocationId`, `destinationLocationId`, optional `lotId`, and strictly positive `atoms`.
  - Balance projections (`StockBalance`) update atomically within the same database transaction.
- **Overproduction Guard**:
  - Output recording must verify: $\text{cumulativeOutput} + \text{newOutput} \le \text{orderedQuantity}$. Overproduction must throw `BadRequestError`.
- **Authorization & Security**:
  - Validate permissions using `requirePermission(principal, '...')` or `requireAnyPermission(principal, [...])`.
  - Never trust client-supplied actor IDs, roles, or customer IDs. Always extract identity from the authenticated `Principal`.

---

## 5. Testing & Verification Standards

- **Integration Tests**:
  - Located in `tests/integration/`.
  - Always instantiate an isolated test environment via `const fixture = await createFactoryFixture();`.
  - Clean up database resources in `afterAll(async () => { await fixture.close(); });`.
- **Database Reconciliation**:
  - Double-entry ledger invariant must hold: running `npm run db:reconcile` must report zero discrepancies.
- **Type Checking**:
  - Run `npm run typecheck` (`tsc --noEmit`) before completing any task. Zero compiler warnings or errors allowed.
- **Regression Zero-Tolerance**:
  - All existing 15+ integration suites and E2E specs must remain 100% green.

---

## 6. Operational Discipline & Hygiene

1. **No Unsolicited Commits / Pushes**: Do not run `git commit`, `git push`, or merge branches unless explicitly requested by the user.
2. **Preserve Comments & Rationale**: Do not strip existing explanatory comments, types, or docstrings.
3. **Follow the Active Plan**: Refer to `docs/superpowers/plans/` and update progress checkmarks systematically.
4. **No Placeholders or Faked Data**: Do not render fake simulated stats or hardcoded mocks in operational routes. All data must connect to real endpoints and queries.
