# Workflow builder state and creation correction

Scope: fix stale canvas state and consolidate draft creation controls. Preserve server-side draft saving and published-version immutability. Inline implementation; no browser testing per user instruction.

- [x] Trace parent definition state and React Flow state initialization.
- [x] Reconcile added, edited and removed steps and dependencies into canvas state.
- [x] Preserve measured node dimensions, dragged session positions and domain requirements.
- [x] Open centered creation and dependency dialogs from the canvas workspace; remove duplicate bottom configuration and sidebar palette.
- [x] Select and focus newly created steps; increase default spacing to avoid overlapping rows.
- [x] Validate duplicate step keys and reject duplicate, self and cyclic dependency links with visible feedback.
- [x] Verify focused adapter/state regressions (2 files, 7 tests), TypeScript and diff whitespace.
- [ ] User visual/interaction review in browser (intentionally reserved for user).

Evidence: focused Vitest and `npm run typecheck` passed. No browser or live persistence claim. Canvas positions remain session-local, matching the existing draft API contract.
