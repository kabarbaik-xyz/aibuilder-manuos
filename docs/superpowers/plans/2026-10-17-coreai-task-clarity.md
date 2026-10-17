# CoreAI task clarity

Approved direction: task-oriented entry points, explicit inputs/outcomes, and separate unavailable capabilities. English UI and existing light-theme primitives remain authoritative.

- [x] Replace technical capability cards with a task directory driven by the authorized capability response.
- [x] Put tasks first; retain operational risk preview below.
- [x] Separate unavailable tools and disclose limitations on demand.
- [x] Add direct delivery-date and schedule routes using existing authenticated workflows.
- [x] Carry order context from detail to delivery evaluation.
- [x] Correct stale Recovery Apply guidance.
- [x] TypeScript and whitespace checks passed; browser review remains with the user.

Mechanical UI scan completed: shared stylesheet has pre-existing palette/radius advisories; added CoreAI rules use documented tokens and 13/16px type. Capability registry now points schedule and delivery-date tasks at their direct CoreAI routes, reports Recovery's transactional Apply accurately, and states TXT/CSV support alongside the remaining OCR/citation limits. Focused capability integration coverage passes (4/4); typecheck, production build, OpenAPI YAML parse, and diff check pass. Browser review remains with the user.

No API, domain calculation, persistence, permission, or ledger changes. Existing unrelated work is preserved. No commit, push, or deployment.

## Screenshot follow-up: assistant and schedule modal

- [x] Render long answers in readable paragraphs, support safe bold/list text, and separate sources into individually spaced links.
- [x] Shorten schedule dialog introduction, prioritize schedule preview, align optional delivery fields, and disclose assumptions on demand.
- [x] Preserve authenticated requests, evidence content, and explicit Apply behavior.
- [x] Whitespace validation and component design scan pass. Typecheck attempted: blocked by unrelated supply/repository.ts:195 missing SupplyReceiptLineDTO.demandAllocations; no errors reported in changed UI files. No tests or browser actions.

## Answer composition follow-up

- [x] Version assistant prompt/cache to request direct summary, short named sections and bullets rather than record catalogues.
- [x] Require natural status labels, bounded sample scope, no fabricated stock sufficiency or resource availability.
- [x] Align deterministic fallback wording and render safe text section headings.
- [x] Typecheck and diff-check pass. Provider response quality and rendered browser review remain unverified; no API shape changes.

## RFQ intake visual follow-up

- [x] Replace stacked input forms with Paste text / Upload file modes, preserving source state and extraction endpoints.
- [x] Add state-driven intake progress and a contextual next-steps guide; responsive single-column layout.
- [x] Focus file selection and extraction actions, lock source during review, and consolidate reset behavior.
- [x] Correct stale header claims and disclose technical provenance on demand.
- [x] Typecheck and diff-check pass. Mechanical scan reviewed against documented 12/13/14/16px scale; quote styling simplified. Browser and tests not run; no API changes.
