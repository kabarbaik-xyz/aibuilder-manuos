# Workspace Production Brain connection

- [x] Replace the production Ask ManuOS placeholder with a read-only question panel calling the existing authenticated endpoint.
- [x] Render server answers, evidence, loading, retry and explicit record-summary fallback without demo facts.
- [x] Validate question input (1–2000 trimmed characters); build operational context on the server.
- [x] Scope context categories by permission and customer; include permissions and complete context facts in cache hashes.
- [x] Preserve decimal quantities using bigint formatting and disclose bounded snapshot results.
- [x] Connect the provider abort signal and clean up its timeout.
- [x] Typecheck passed; existing Production Brain integration suite passed (5 tests).
- [x] Actual local Chrome: open drawer, submit starter question, receive AI answer; mobile has no horizontal overflow and no runtime exceptions. Screenshot: `/tmp/manuos-production-brain.png`.

## Contract

`POST /api/ai/brain-qa` accepts `{ question: string }`. Caller-supplied operational snapshots are not used. Authentication and existing production read permissions are required. Returns `{ data, explanation }`, with explanation status `SUCCESS` or `FALLBACK`. Fallback data is calculated from authorized records, not fabricated AI text. Operational categories may be empty because permission restricts them. Context caps remain 20 orders, 30 balance rows, 10 machines and 10 technicians; counts describe that sample only. This assistant cannot execute domain commands.

## Conversation UI refinement

- [x] Compact workspace context strip with explicit read-only status.
- [x] Right-aligned user message and assistant identity with separate answer attribution.
- [x] Integrated two-row composer with Send action and a short source reminder.
- [x] Scoped responsive styles, existing icon facade and semantic light-theme tokens.

## Provider deadline correction

- [x] Reproduced local fallback at the former 10 second deadline.
- [x] Independent configured Gemini request succeeded in approximately 15 seconds.
- [x] Increased bounded provider window to 30 seconds and retained timeout/schema reasons in Production Brain.
- [x] Used the configured model name in provenance and cache identity.
- [x] UI differentiates timeout, verification failure and unavailable provider. Typecheck passed.
- [x] A full-snapshot inventory request still exceeded 30 seconds; narrowed inventory-only prompts and bounded answers to 120 words / 1024 output tokens.
- [x] Actual local inventory endpoint returned SUCCESS in 2420ms using the configured gemini-3.5-flash-lite model, with four verified evidence references.
