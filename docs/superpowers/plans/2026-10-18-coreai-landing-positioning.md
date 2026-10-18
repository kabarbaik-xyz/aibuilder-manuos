# CoreAI-led landing page implementation plan

Status: implemented; focused static and local browser verification complete. No commit or deployment.

## Objective

Make CoreAI the reason to choose ManuOS: connected manufacturing records become useful answers, earlier risk visibility, and reviewable next actions. Preserve the existing visual identity and logo placement. Scope is landing content, section order, illustrative previews, and metadata; no new domain features, API changes, commits, or deployment.

## Positioning decision

Recommended: practical operational intelligence across the order lifecycle. Lead with what users can understand and decide through CoreAI, then explain the connected operational foundation.

Alternatives considered: recovery-only positioning is concrete but hides assistant/intake/authoring capabilities; an autonomous-factory positioning is attention-grabbing but contradicts approval gates and current capability limits.

Proposed hero:
- Headline: “Run your factory with CoreAI by your side.”
- Supporting copy: “Ask questions about your operations, see delivery risks, and review practical recovery options—all connected to your manufacturing records.”
- Assurance: “Grounded in your records. Reviewed by your team.”
- Primary CTA: “Explore CoreAI demo” → /demo.
- Secondary CTA: “Sign in” → /login.
- Preview label: “Illustrative CoreAI preview”.

Use CoreAI as the umbrella for grounded AI assistance and deterministic operational decision tools. Avoid describing every calculation as language-model inference. Explain this once in plain language: “CoreAI combines AI assistance with planning checks. Your team reviews and approves changes.”

## Evidence and claim boundaries

Source of truth: src/server/modules/intelligence/capabilities.ts; inspect the corresponding service and UI before finalizing each feature statement. Registry readiness is implementation evidence, not a successful live provider test.

- AII-01: grounded operational questions with cited authorized records. Natural-language answers depend on provider configuration; deterministic summaries exist as fallback.
- AII-02: risk inbox and exception drilldown. Say “spot delivery risks”; avoid predictive accuracy or guaranteed prevention.
- AII-03: RFQ extraction from text/TXT/CSV with draft handoff. Provider-dependent; do not imply PDF/image OCR.
- AII-04 / SCH-08: delivery-date evaluation and finite-capacity proposals for an existing released job. Avoid promises of global optimization or guaranteed customer dates.
- AII-06: schedule reviews, alternative machines, overtime proposals, and subcontract tracking with approval constraints. Cost coverage is limited; no margin claims, general routing optimizer, or split shipments.
- BLD-01: AI workflow/form drafts for human review; provider-dependent.
- AII-05 / CST-03: measured historical evidence and cost variance, not automatic learning, margin optimization, or inferred planning buffers.
- SCH-09 and AII-07: full what-if scenario workflow and visual QC are not available product claims.

## Proposed page narrative

1. Hero: CoreAI value and a clearly illustrative operational question → evidence → suggested next action preview.
2. CoreAI in daily work: ask about records, identify risks, review recovery, and prepare drafts. Focus on outcomes and show where each connects to operations.
3. Interactive CoreAI example: supported machine reassignment or overtime review. Show issue, relevant evidence, proposal, and supervisor review. No financial savings, unsupported split work, signed audit claims, or fabricated live status.
4. Connected manufacturing flow: orders → engineering → planning → execution/QC → delivery/passport as CoreAI context.
5. Role outcomes: executive prioritization, planner review, technician work context, and customer progress visibility. Do not imply the internal assistant is customer-accessible.
6. Trust and control: source-linked answers, permission-aware access, reviewable drafts, validated operational commands, and traceable records. Replace absolute performance metrics with implemented controls.
7. Final CTA: “See CoreAI in action” with demo and workspace entry.

## Tasks

- [x] 1. Establish a copy-to-evidence checklist before editing. Map all retained claims to capability/service/UI evidence; explicitly record provider dependencies and unsupported claims. Review current landing-flow, personas, integrity, CTA, footer, and metadata alongside the hero/AI sections.
- [x] 2. Rewrite landing-hero.tsx with the proposed headline, supporting copy, CTA, and assurance. Keep its preview illustrative and ensure any preview action only changes local demo state. Do not imply a real schedule was approved.
- [x] 3. Rework landing-ai.tsx around the four supported CoreAI use cases and one supported recovery illustration. Replace existing material/QC recovery promises unless an end-to-end capability is verified. Replace marginImpact with source/evidence or approval context; remove fictitious quantified outcomes. Keep previews visibly labeled as illustrative.
- [x] 4. Update landing-page.tsx order so CoreAI appears immediately after hero. Prefer one consolidated CoreAI section containing use cases and preview; avoid duplicating the same diagram or CTA. Update landing-nav.tsx and existing anchor labels to “CoreAI”, “How it works”, and “Workspaces”; preserve working anchor IDs or update every reference together.
- [x] 5. Rewrite landing-flow.tsx and landing-personas.tsx around implemented workflows. Preserve customer scope boundaries. Remove unverified SLA tracking, margin oversight, one-click blanket approvals, and guaranteed automation claims.
- [x] 6. Rewrite landing-integrity.tsx as the foundation that makes CoreAI useful and controlled. Replace “live” static ribbon, zero-leakage guarantees, 100%/0 metrics, signed/tamper-evident language, and simplified misleading stock equations with concrete controls. Review landing-footer.tsx for matching claims.
- [x] 7. Align landing-cta.tsx and metadata in src/app/page.tsx and src/app/(marketing)/welcome/page.tsx with the same CoreAI positioning. Do not claim a separate AI demo exists: the existing /demo is the destination, and its actual available interaction must match the CTA.
- [x] 8. Adjust landing.css only where the revised content/order needs it; preserve existing palette, typography, logos, and responsive shell. No unrelated redesign.
- [x] 9. Perform one final content audit, npm run typecheck, and git diff --check. Inspect desktop and mobile in one visual pass: hero fits, CoreAI appears early, text does not overflow, anchors work, tabs remain keyboard accessible, CTA destinations match labels, and examples cannot be confused with live operations. Run existing relevant landing tests if present; do not create tests that merely mirror copy strings. Record runtime/provider checks separately from static checks.

## Acceptance criteria

- Within the first two sections, a visitor can explain why CoreAI is useful and name at least three supported use cases.
- CoreAI remains the primary narrative through the final CTA; operational modules explain its connected context.
- Every feature claim maps to current code and respects availability/provider prerequisites.
- No fabricated operational metrics, unsupported optimization, margin claims, autonomous execution, or visual QC claims remain.
- Illustrations are visibly examples; real workspace state is never implied by local animation.
- Current logo improvements, operational routes, authorization, and business commands are unchanged.
- Typecheck and diff checks pass; browser verification limits are explicitly documented.

## Implementation verification — 2026-10-18

- Claim review used the capability registry and existing domain evidence; it does not establish live AI provider readiness.
- Updated hero, CoreAI use cases/examples, page order, desktop/mobile navigation, operational flow, role descriptions, integrity section, CTA, footer, and public-route metadata.
- Local Chrome /welcome rendered the revised content. Desktop hero and mobile 390 × 844 hero/CoreAI section were inspected. CoreAI anchor navigation, hero preview toggle, and overtime example selection worked. Temporary viewport override was reset.
- Existing scenario selectors now use native toggle buttons in labeled groups, avoiding incomplete ARIA tab keyboard semantics.
- Typecheck and diff validation passed. No copy-mirroring tests added; no backend or ledger behavior changed. Integration suite, DB reconciliation, live provider calls, and authenticated destination workflows were not rerun for this content-only change. Demo CTAs retain the existing /demo destination; no new AI demo route is claimed.

## CoreAI section refinement — 2026-10-18

- [x] Replace stacked benefit/process/showcase layers with one two-column composition: benefit list and interactive CoreAI conversation preview.
- [x] Use a left-aligned two-line heading, simplify the preview, and reduce technical explanations to an availability disclosure.
- [x] Preserve supported recovery examples and explicit illustrative labeling; retain approval context and workspace links.
- [x] Replace process cards with a compact connected-records → suggestions → human-decision strip.
- [x] Inspect desktop and 390 × 844 mobile layout, including preview; verify overtime selector updates content. Reset viewport override.
- [x] Typecheck and diff checks passed for the refinement. No business logic or provider requests changed.

## Login alignment — 2026-10-18

- [x] Align login with the light landing identity and practical CoreAI value: record-grounded answers, delivery-risk review, and reviewable schedule/recovery proposals.
- [x] Replace technical workflow diagram with three concise benefits and a human-review assurance; remove duplicate back links and the form-card container.
- [x] Show logo/header and form directly on mobile, with the longer product story reserved for desktop.
- [x] Keep authentication request, validation, errors, return-target handling, loading state, and password controls intact.
- [x] Typecheck/diff validation passed. Inspected desktop and 390 × 844 mobile in local Chrome; verified password visibility toggle. Did not submit credentials or rerun authenticated login/session tests because authentication logic was unchanged.
