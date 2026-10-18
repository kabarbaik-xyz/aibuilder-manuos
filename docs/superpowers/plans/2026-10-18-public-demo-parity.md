# Public demo parity repair

User authorized urgent implementation. Scope: public /demo, isolated simulated records, current workspace UI conventions. No public operational API access or automatic sign-in.

Root cause: legacy five-screen demo, no CoreAI destination, and Ask AI routed to authenticated workspace API. Search/account controls also reused authenticated providers.

- [x] Add a state-derived dashboard, order/risk/inventory/resource views, and current navigation labels using shared UI primitives.
- [x] Add CoreAI task hub with supported demo actions and honest boundaries for full workspace tools.
- [x] Add demo-only read-only Ask AI with source navigation, session chat, reset, and state-derived answers; never call private APIs.
- [x] Replace legacy planning/workstation/portal surfaces with shared workspace primitives and session-derived evidence. Label simulation. Replace broken demo search/account entry points.
- [x] Test disruption/reset grounding, missing records, read-only behavior, import isolation, typecheck, and local browser flow.

Production services and authorization remain unchanged. Public demo answers are deterministic record summaries, clearly labeled; live AI provider use remains in the authenticated workspace.

## Verification and limits

- Local Chrome: dashboard → CoreAI → simulate delay → Ask AI → question → exact source record verified. Reopening the drawer preserves chat. 390 × 844 mobile layout inspected and viewport restored.
- Shared CoreAI task catalog extracted from the operational hub; public demos never mount the private assistant/intake/promise/passport API consumers. Demo topbar disables the session query and uses a visitor badge.
- Typecheck and diff checks pass. Eleven focused tests pass, including state-grounding and demo isolation.
- Full suite: 608 passed, 1 failed across 118 files. Existing order-drafts approval test expects an engineer to be forbidden, but the service permits approval. Server, fixture, and that test file are unchanged in this patch. A single-test invocation additionally revealed its dependence on earlier tests in the file; do not treat that filtered run as equivalent to full-file evidence.
- Local database reconciliation: 194 movements, 113 buckets, balanced, no discrepancies.
- Public Ask AI is explicitly deterministic, read-only, and sample-record grounded. Provider-backed drafts, production scheduling/approval, output and QC commands are explained through walkthroughs or authenticated workspace entry; they are not claimed as live public operations.
- Commit authorized after the final visual refinement; no push requested. Unrelated public/presentation.html and public/images assets were preserved.

## Final UI refinement

- [x] Add consistent sidebar group spacing and separators.
- [x] Keep the Ask AI composer fixed while only conversation content scrolls. Collapse sources and suggested questions, reduce repeated explanatory copy, and separate record summaries into readable lines.
- [x] Put dashboard metrics in one bordered white surface, tighten banner spacing, and derive warning status from both order and material exceptions.
- [x] Desktop browser inspection confirms the new dashboard and chat composition. Focused checks remain the completion gate; the previously recorded unrelated full-suite engineering-approval failure remains open.
