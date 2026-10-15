# Execution prompt — ManuOS demo-ready prototype

Copy the prompt below into a coding-agent session opened in this project. This file is an execution brief, not evidence that implementation or deployment has happened.

---

You are implementing ManuOS in `/Users/ardian/Research/manuos-sg`.

Turn the existing HTML design reference into a functional, demo-ready manufacturing prototype. Execute the work; do not stop after proposing another plan, scaffolding the application, or completing one phase. Continue through the in-scope implementation, meaningful verification, and demo handoff. Preserve the approved visual design while replacing its simulated business behavior with real deterministic logic and live server-side Gemini integration.

## Read before changing code

Read the project instructions, then these sources:

1. `IMPLEMENTATION_PLAN_MANUOS_PROTOTYPE.md` — P0–P9, 50 tasks, dependencies, conflict resolutions, acceptance and traceability.
2. `PRD_MANUOS_PROTOTYPE.md` — functional requirements, S1–S7, demo dataset/scenario and feature acceptance.
3. `BRD_MANUOS.md` — business requirements, scope and intended outcomes.
4. `SOFTWARE_ARCHITECTURE_MANUOS.md` — ADRs, domain, engine responsibilities, AI contracts, state machines and deployment.
5. `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` — product context and approved design system.
6. `ui-prototype/index.html`, `ui-prototype/styles.css`, `ui-prototype/app.js`, `ui-prototype/README.md` — actual screen composition, typography, component states and interaction reference.

Inspect the current filesystem, repository status and running services before scaffolding. The historical plan predates the HTML reference; do not mistake that reference for the production application or ignore it because the original plan describes an empty folder. Preserve unrelated changes and the entire `ui-prototype/` reference.

Run the reference locally and inspect its five screens and recovery panel. The latest Command Center font captures are `.impeccable/review/jakarta-1440.png` and `jakarta-390.png`, if available. Older captures may predate the font change; actual current CSS and DESIGN.md take precedence.

## Existing design decisions are settled

Use **Plus Jakarta Sans**, self-hosted from `ui-prototype/assets/`, and retain its OFL license. The user explicitly selected it. Keep that choice even if a design detector calls the font overused; the project's narrow font exception is intentional.

Retain the professional light theme, cool gray background, white surfaces, restrained blue actions, compact consistent icons, one sidebar and utility header, readable tables, clear status labels, balanced density and concise English UI. Essential information is visible; supporting evidence opens on demand. Keep the desktop/tablet/mobile adaptation.

Do not reopen visual direction, typography or density interviews. Do not redesign the approved shell, replace it with a generic dashboard, add decorative effects, or inflate the copy. Elaborate missing views using the same component language. Resolve layout regressions introduced by real data while preserving the design's hierarchy and purpose.

Port the presentation into maintainable React components and real routes. The original `app.js` is an illustrative monolithic renderer, not the application architecture. Do not embed it in Next.js, retain large HTML strings as the view layer, or copy its hardcoded outcome logic into business engines.

## Application architecture

Use the planned Next.js App Router, React, TypeScript, Tailwind/shadcn-style components, Zustand, Zod, Vitest, Google Gen AI SDK and standalone container targeting Cloud Run. Verify currently compatible supported versions and provider SDK/model contracts against official documentation before pinning dependencies. Choose one package manager and commit its lockfile only when committing is authorized.

One typed Manufacturing Graph owns the demo session. Graph, Gantt, Kanban, workstation, dashboard, network and customer portal are projections of that state. Pure TypeScript engines own scheduling, ripple, capacity, costs, dispatch, similarity, network matching and workflow validation. Server routes own Gemini access. Humans approve consequential proposals.

No production database, real authentication/SSO, IoT, Odoo/email integration, real-time multi-user synchronization, voice/WhatsApp, Visual QC, Profit Radar or RAG/LMS implementation. Seeded factories/personas/network are an explicitly labeled simulation. Future capabilities stay labeled Future.

## Implement the whole prototype scope

Fully working hero features:

- F3: material delay, machine outage and task overrun injection; affected orders/tasks, blocked versus runnable branches, recalculated critical path/slack/ETAs and grounded explanation.
- F4: generated recovery candidates, deterministic simulation, time/cost/capacity comparison, infeasibility reasons, explicit approval, atomic application and audit.
- F7: historical actual-versus-planned evidence, similarity, recommendations, and actual execution/QC/recovery outcome learning.
- F10: normalized weighted skill/certification/workload/track-record ranking, hard eligibility gates, comparison, assignment, workload update and skill gaps.
- F12: consent-gated capacity **and** supply matching, proposals, bilateral accept/decline simulation, capacity reservation, cross-factory handoff/QC, material ETA/receipt, and workflow-aware requirements.

Supporting features at the PRD's demoable-lite fidelity:

- F1: read-only live-state assistant, evidence references, safe deep links and deterministic fallback.
- F2: genuine feasible-date computation with capacity/material constraints, confidence and computed alternatives.
- F5: arbitrary pasted RFQ extraction, genuine ambiguity detection, editable engineering review, confirmation and draft-order creation with retained customer questions. Replace the mock's fixed sample extraction.
- F8: standards-compliant locally generated QR pointing to a working passport route, material/operation/QC/handoff/sign-off evidence, failed→reworked history and customer-safe projection. Replace the mock's decorative scan symbol.
- F13: AI-generated workflow config, deterministic DAG validation, bounded repair, preview, human activation, actual order instantiation and requirements feeding network matching. Replace the mock's fixed sequential preview.

Complete S1–S7: Owner Command Center, Supervisor Orchestrator, Technician Workstation, Customer Portal, Factory Network, Recovery Studio and Order Intake. Supporting forms/details can remain panels where appropriate; orders, passports and major screens need usable direct links. Make buttons perform their named actions, including validation, loading, empty, failure and success behavior. Do not ship placeholder clicks that only display a success toast.

## Domain rules and conflicts

Use P0 in the plan to finalize contracts and document decisions. In particular:

- Hero order120 units,82 completed,78 QC-passed means **65% real progress**. Completion is68.33%; these are separate metrics.
- Shipment40/80 reallocates existing units; approval does not manufacture or QC-pass new units. Track completed, QC-passed, allocated and shipped quantities separately and conserve them.
- Authored seed includes4 factories,6 orders, hero2 MOs/5 jobsheets/14 tasks,8 machines,10 materials,6 technicians, historical evidence, prior recoveries and4 passports.
- Use a fixed demo clock and explicit work calendar. Material/resource constraints must explain the expected schedule. Do not hardcode “+3 days” as an event handler result.
- Delay must affect at least2 orders and at least3 tasks, with exact expected IDs in golden fixtures. Distinguish affected, blocked and still-runnable.
- Target comparison values such as+0.8%,+4.2%,+7.5% must come from quantities/rates/simulation. Overtime cannot bypass missing material. Outsourcing requires a partner matching the actual process, certification/QC and material needs; a CNC-only partner is not automatically an assembly provider.
- Split Batch approval does not activate a subcontract edge. Use resettable branches to demonstrate approved subcontract and supply recovery honestly.
- Network supply improves absolute material availability only if its projected ETA is earlier. Acceptance changes projection/reservation; receipt changes stock readiness. Preserve agreed customer promises separately from predicted ETA.
- History15/18/21% overruns yields mean18%. Recommended padding15% is an explicit policy. Decision approval is not a fabricated successful actual outcome.
- Scheduling edges remain acyclic; rework/returns belong to validated conditional transitions or explicit new work instances. Do not implement a full durable production workflow engine.
- Maximum2 total workflow-generation attempts, with clear rejected-draft reasons after exhaustion. Document transport retry separately.
- Use a shared task-state model across graph, timeline, board, details and workstation. Customer visibility and partner consent apply before serialization, not only when rendering.

Never invent a missing reference asset. Locate and inspect the existing CPM/schema/workflow/Docker patterns mentioned in the documents; reuse only what actually exists. If unavailable, implement from the documented algorithms and record provenance.

## AI and API implementation

Define/update local contracts before endpoints. Follow the architecture's eight AI routes plus the plan's proposed `/api/ai/promise-explain`, and `/api/health`. Use server-only `@google/genai`, structured outputs, input/output Zod schemas, grounded context, request limits, timeout, bounded retry and context-sensitive cache.

Engine results are authoritative. Gemini explains, extracts and proposes; it cannot write operational state or override engine numbers. Validate factual IDs/references and numeric claims against supplied context. Cap snapshot size, exclude non-consenting factory details, treat RFQ input as untrusted data, and reject invalid schema.

Keep keys out of client code/bundles/repository. Use `.env.example` with placeholders and cloud Secret Manager at deployment. Do not print secrets or ask the user to paste credentials into chat.

When AI is unavailable, render computed panels and simulation-validated rule-based recovery drafts with clear non-AI labels. RFQ/workflow generation must show an honest unavailable/retry state rather than return canned drafts as live AI. Mocked tests and live Gemini evidence are separate. A fallback-only application does not satisfy the live-AI demo criterion.

## Execute in stages without repeatedly asking permission

Follow P0→P9 and the existing task IDs. Finish each stage's exit checks before moving on. Maintain `docs/execution-status.md` with current task, completed checks, actual failures/blockers and next action; update the plan's checkboxes only when their deliverables and checks are complete.

Use reasonable documented decisions for reversible implementation choices. Ask only for a material product conflict or necessary unavailable external configuration; ask early while continuing independent work. Do not stop between routine stages for approval, reopen settled design questions or write a replacement plan instead of implementing.

Preserve the reference files and unrelated edits. Do not commit, push, publish artifacts or submit competition materials unless explicitly authorized in the execution session. Prepare container/deployment assets regardless. If the user has authorized deployment and target GCP project/region/service/access are confirmed, deploy and verify Cloud Run. Otherwise report exactly what is missing; do not claim a public demo URL exists.

## Verification and definition of done

Use meaningful golden/negative tests for engines, quantity conservation, approval atomicity/idempotence, stale proposals, certification/consent gates and workflow validation. Run typecheck, lint, relevant tests and production build. Test the actual app in a browser at desktop, tablet and mobile; use a bounded visual comparison against the HTML reference, fix real regressions together, then stop polishing.

Demonstrate these real state transitions:

1. Reset→inject material delay→affected/runnable paths and recalculated ETA→recovery comparison→approve Split Batch→updated plan/audit→customer acknowledgment.
2. Memory evidence18%→review routing rev2/padding15%; eligible technician ranking→confirmed assignment/workload update.
3. Separate capacity proposal→partner acceptance→reserved capacity→cross-factory handoff/QC.
4. Supply match→bilateral acceptance→projected ETA→material receipt→unblocked task/schedule recalculation.
5. Workstation records output→completed rises without increasing QC-passed→QC result updates verified output/history/passport.
6. RFQ→editable draft/ambiguities→generated validated/approved workflow→confirmed draft order→instantiated tasks and workflow-aware partner matching.
7. Live Gemini answer/narrative grounded in changed state; disabled/failed Gemini leaves deterministic functionality usable.
8. Reset and cold load reproduce the scenario without hidden state from earlier runs.

Keep `docs/requirements-matrix.md` linking in-scope FR/BR/screens to task and evidence. Describe any simplified scheduling/network semantics honestly. Business improvement targets are not measured prototype achievements.

Deliver runnable source, setup/run instructions, tests, `.env.example`, lockfile, deployment/rollback runbook, English demo script and repeatable scenario runbook. Prepare proposal content from the existing documents; actual video recording/export/submission requires the necessary tools and explicit publishing authorization. Do not misrepresent authored materials as submitted.

Final report: what is implemented; local URL/run command; tests/build/browser results; live Gemini proof; Cloud Run URL/revision and deployed checks if actually deployed; remaining external blockers; and the shortest steps to run the demo. Distinguish local, mocked, live-provider and deployed evidence. Do not mark the objective complete while a mandatory demo feature, live Gemini validation or requested deployment remains unfinished.

Start now: inspect current state and reference UI, resolve P0 contracts, then implement the first runnable application slice and continue until the authorized scope is complete.
