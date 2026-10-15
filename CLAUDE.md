# ManuOS — Agent Instructions & Guidance Harness

Please strictly follow the rules, architecture, UI contracts, and invariants defined in [AGENTS.md](./AGENTS.md):

- **Architecture**: Next.js 15, TypeScript, SQLite WAL mode with Prisma.
- **Quantities**: Exact integer atom arithmetic (`1 unit = 1,000,000 atoms`). Never float.
- **UI Contract**: Pure Light Theme (`--bg: #f5f7fb`, `--surface: #fff`, `--line: #e7ebf2`).
  - No `bg-neutral-900` or dark containers.
  - No duplicate `<AppShell>` in workspace pages (root layout owns shell).
  - Sidebar is 280px wide with typed SVG icons from `src/components/icons.tsx`.
  - CRUD Add/Edit forms use **centered dialog modals**, never right-side drawers.
- **Ledger Invariants**: Double-entry ledger with `postMovement()`. Conserve mass (`passed + rework + scrap === inspected`).
- **Verifications**: Always verify with `npm run typecheck` and `npm run test:integration`.
