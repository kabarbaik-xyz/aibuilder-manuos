<!-- AGENTS & ANTIGRAVITY WORKSPACE RULES -->
<!-- References AGENTS.md for complete specification -->

# Workspace Rules & Invariants

All agents must adhere to [AGENTS.md](../../AGENTS.md):

1. **Integer Atom Quantities**: 1 unit = 1,000,000 atoms (`bigint`). Always use `@/domain/quantity`. Never use floating-point math.
2. **Double-Entry Ledger**: Stock moves through `postMovement()`. No direct balance modifications. Quantity conservation: `inspected = passed + rework + scrapped`.
3. **UI Contract**: Pure light theme (`--bg: #f5f7fb`, `--surface: #fff`, `--line: #e7ebf2`).
   - No `bg-neutral-900` or dark containers.
   - Root layout owns `AuthenticatedShell`. Never wrap individual pages in `<AppShell>`.
   - Sidebar 280px wide with typed SVG icons (`src/components/icons.tsx`).
   - CRUD Add/Edit uses **centered dialog modals** (`<Dialog type="modal">`), never full-height drawers.
4. **Testing & Reconciliation**:
   - `npm run typecheck` must pass with 0 errors.
   - `npm run test:integration` must remain 100% green.
   - `npm run db:reconcile` must verify ledger-balance equality.
5. **Discipline**: No unauthorized commits/pushes. No mocked or faked data in operational views.
