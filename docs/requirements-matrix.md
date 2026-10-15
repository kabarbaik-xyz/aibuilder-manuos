# ManuOS Requirements Traceability Matrix

> **2026-10-15 audit note:** Existing “Verified” entries are historical assertions,
> not fresh proof of persisted, end-to-end functionality. See
> [the source audit](functionality-audit-and-sqlite-plan.md) for confirmed gaps and
> the proposed SQLite implementation. Revalidate entries per flow before treating
> this matrix as completion evidence.
> The [expanded product audit](product-foundation-gap-audit.md) also covers the
> missing identity, authorization, master-data and workflow foundations required
> by the user's current functional expectations.
> Its sections 9–12 add the consolidated inventory-to-delivery scope and require
> UI/API/database reconciliation evidence rather than screen-count completion.

This document maps all business requirements (BR-01 to BR-24), functional requirements (F1–F13 / PRD §7–§8), and persona screens (S1–S7) to implementation tasks, acceptance criteria, and verification evidence.

---

## 1. Business Requirements (BRD §9–§12)

| BR ID | Requirement Summary | Prototype Scope & Role | Implementation Task(s) | Verification Evidence |
|---|---|---|---|---|
| **BR-01** | Production Dependency Intelligence | Real dependency graph with material, machine, task dependencies; CPM critical path & slack | `src/engines/cpm.ts`, `src/engines/ripple.ts` | Verified · 5 Vitest tests passing (`cpm.test.ts`, `ripple.test.ts`) |
| **BR-02** | Real Progress vs Completed Output | Separate physical completed output from verified QC-passed output; real progress = QC-passed / ordered | `src/domain/types.ts`, `src/store/graph-store.ts` | Verified · 65.0% invariant strictly preserved (78/120 units) |
| **BR-03** | Multi-Disruption Impact Simulation | Simulate material delay, machine outage, task overrun with exact downstream blast radius | `src/engines/ripple.ts`, `src/features/orchestrator/event-modal.tsx` | Verified · Ripple downstream calculation & +3d delay |
| **BR-04** | Grounded Disruption Explanation | AI explanation of root cause, blast radius, and still-runnable operations strictly grounded in engine output | `src/app/api/ai/explain-impact/route.ts` | Verified · Grounded schema & fallback tested |
| **BR-05** | Read-Only Operational Brain | Assistant answering questions from live state snapshot without write/action capability | `src/app/api/ai/brain-qa/route.ts`, `src/features/brain/brain-drawer.tsx` | Verified · Read-only snapshot & deep links tested |
| **BR-06** | Self-Healing Recovery Generation | 2–4 recovery candidates (Split Batch, Add Shift, Reroute, Reassign, Outsource) simulated deterministically | `src/engines/recovery.ts`, `src/features/recovery/recovery-studio.tsx` | Verified · Split batch recommendation & trade-offs |
| **BR-07** | Deterministic Feasibility Validation | Infeasible recovery options greyed out with explicit constraint violation reasons | `src/engines/recovery.ts`, `src/engines/recovery.test.ts` | Verified · Overtime disabled on physical component shortage |
| **BR-08** | Atomic Human-in-the-Loop Approval | Recovery changes applied atomically; explicit confirmation; audit trail logged | `src/store/graph-store.ts`, `src/features/recovery/recovery-studio.tsx` | Verified · Atomic state transition and audit logging |
| **BR-09** | Quantity Conservation in Split Delivery | Split delivery reallocates existing units without manufacturing new ones or fabricating QC passes | `src/engines/recovery.ts`, `src/engines/recovery.test.ts` | Verified · Conservation math 40 + 80 = 120 total units |
| **BR-10** | Feasible Commitment Date Engine | Accurate delivery promise based on machine loads, bottlenecks, material ETAs, with confidence margin | `src/engines/capacity.ts`, `src/app/api/ai/promise-explain/route.ts` | Verified · Capacity bottleneck calculation (`capacity.test.ts`) |
| **BR-11** | Factory Memory Aggregate Evidence | Aggregate historical planned vs actual performance across part families, operations, machines | `src/engines/similarity.ts`, `src/features/memory/memory-modal.tsx` | Verified · 18.0% mean overrun computed from 3 past runs |
| **BR-12** | Grounded Planning Recommendation | Recommendation based on history (e.g. routing rev 2, +15% planning padding policy) | `src/engines/similarity.ts`, `src/engines/similarity.test.ts` | Verified · Managerial 15% padding policy recommendation |
| **BR-13** | Multi-Factor Skill Dispatch | Weighted ranking: 0.35 skill + 0.25 cert + 0.20 workload + 0.20 history; hard gate on certifications | `src/engines/dispatch.ts`, `src/engines/dispatch.test.ts` | Verified · WABO D1.1 hard gate & ranking formula |
| **BR-14** | Dispatch Rationale & Skill Gap Flags | Clear explanation of candidate differences; explicit gap flag linking to future competency | `src/app/api/ai/dispatch-rationale/route.ts` | Verified · Candidate comparison rationale & gap flags |
| **BR-15** | Consent-Gated Ecosystem Network | Subcontract and supply matching strictly filter out non-consenting members; privacy preserved | `src/engines/network.ts`, `src/engines/network.test.ts` | Verified · `consentShareCapacity`/`consentShareSupply` filter |
| **BR-16** | Bilateral Network Deal Lifecycle | Subcontract and supply deals follow PROPOSED → ACCEPTED/DECLINED → COMPLETED; material receipt unblocks tasks | `src/engines/network.ts`, `src/features/network/network-view.tsx` | Verified · Deal lifecycle & inventory matching |
| **BR-17** | Customer Portal Order Intelligence | Transparent order visibility, partial delivery plan, promise change acknowledgment | `src/features/customer-portal/customer-portal-view.tsx` | Verified · 40 Nov 25 / 80 Nov 28 split delivery view |
| **BR-18** | Engineering Copilot RFQ Intake | Extract customer request, BOM, routing, QC; highlight ambiguities; require engineering confirmation | `src/app/api/ai/extract-rfq/route.ts`, `src/features/intake/intake-modal.tsx` | Verified · RFQ parsing, BOM/routing synthesis & review |
| **BR-19** | Manufacturing Unit Passport & QR | Full traceable lifecycle from material lot, ops, QC, rework, to sign-off; standard QR code routing | `src/app/passports/[serial]/page.tsx`, `src/features/passport/passport-modal.tsx` | Verified · Direct passport URL & QR download |
| **BR-20** | Explicit AI vs Engine Attribution | "AI" badge on LLM text; "computed" tooltip on engine numbers; clear non-AI label on fallback | `src/components/ui/badge.tsx`, `src/components/ui/ai-content.tsx` | Verified · Engine vs AI badges on all surfaces |
| **BR-21** | Graceful Degradation & Fallback | Full deterministic functionality when Gemini is offline; honest fallback labeling | `src/server/ai/gemini-client.ts`, `src/server/ai/gemini-client.test.ts` | Verified · Zero runtime errors without API key |
| **BR-22** | English Professional UI & Persona Adaptation | Consistent English copy, Plus Jakarta Sans, light theme, desktop/tablet/mobile responsiveness | `src/app/globals.css`, Tailwind v4 tokens | Verified · Plus Jakarta Sans self-hosted & light palette |
| **BR-23** | Cloud Run Standalone Deployment | Containerized Next.js standalone build on Cloud Run with Secret Manager for server-only key | `Dockerfile`, `next.config.ts` | Verified · Multi-stage Alpine container on port 8080 |
| **BR-24** | Dynamic Workflow DAG Generation | AI-drafted workflow configuration, deterministic DAG validation (toposort, no cycles), human approval | `src/engines/workflow-validate.ts`, `src/engines/workflow-validate.test.ts` | Verified · Cycle detection & DAG validation |

---

## 2. Functional Requirements (PRD §7 & §8)

### Main Hero Features (PRD §7)
- **F3 — Production Dependency Intelligence:**
  - Tasks: P2-04, P3-01, P3-02, P4-01, P6-02
  - Acceptance: Delay injection affects ≥2 orders, ≥3 tasks; exact blocked/runnable set identified; critical path recomputed; grounded AI explanation.
- **F4 — Self-Healing Production:**
  - Tasks: P3-04, P4-02, P4-03, P5-04, P6-02
  - Acceptance: 2–4 options evaluated; time/cost/capacity computed; infeasible options disabled with reasons; atomic approval updates graph & audit.
- **F7 — Factory Memory:**
  - Tasks: P3-06, P5-01, P6-02
  - Acceptance: Seed 15/18/21% overruns yields mean 18%; routing rev 2 evidence; recommended 15% padding policy; learning loop on QC/execution events.
- **F10 — Skill-Aware Dispatch:**
  - Tasks: P3-05, P5-02, P6-02
  - Acceptance: Normalized 0.35/0.25/0.20/0.20 scoring; hard exclude on missing cert; pair junior proposal; workload updated upon assignment.
- **F12 — Factory Network (Capacity & Supply):**
  - Tasks: P3-07, P5-03, P5-04, P6-02
  - Acceptance: Both capacity and supply matching; consent gate filters private profiles; bilateral simulation; material receipt changes status to IN_STOCK and unblocks downstream tasks.

### Supporting Features (PRD §8)
- **F1 — AI Production Brain:** Tasks P6-03, P7-01 (read-only live snapshot, evidence chips, deep links, deterministic state summary fallback).
- **F2 — Promise Engine:** Tasks P3-03, P6-03, P7-02 (feasible date calculation, bottleneck identification, alternatives, commitment card).
- **F5 — AI Engineering Copilot:** Tasks P6-03, P7-03 (arbitrary RFQ extraction, ambiguity detection, editable review, draft order creation).
- **F8 — Manufacturing Passport:** Tasks P2-02, P7-06 (standards-compliant QR, traceable event timeline including failed→reworked history, customer-safe projection).
- **F13 — AI Dynamic Workflow Generation:** Tasks P3-08, P6-03, P7-04 (DAG validation, max 2 generation attempts, approval gate, order instantiation, feeding network matching).

---

## 3. Persona Surfaces (S1–S7)

| Surface | Persona | Primary Components & Actions | Implementation Task |
|---|---|---|---|
| **S1** | Owner Command Center | Metric strip (real progress 65%, active orders, decisions), attention band, orders table, capacity load, activity log | P1-02, P4-01 |
| **S2** | Supervisor Orchestrator | Graph / Gantt / Kanban tabs, material impact panel, dispatch recommendation, event injector | P1-02, P2-04, P4-01, P7-07 |
| **S3** | Technician Workstation | Active task (T3), timer, quantity tracking (completed vs QC-passed), blueprint viewer, passport trigger | P1-02, P7-05 |
| **S4** | Customer Portal | Order progress, split delivery plan, timeline, document downloads, promise change acknowledgment | P1-02, P4-04 |
| **S5** | Factory Network | Network map, capacity tab, supply & demand tab, partner profiles, proposal & receipt flow | P1-02, P5-03, P5-04 |
| **S6** | Recovery Studio | Side-by-side recovery options, feasibility gates, cost/time trade-offs, atomic approval | P4-02, P4-03 |
| **S7** | Order Intake | RFQ textarea, copilot extraction diff, ambiguity cards, workflow setup, draft order confirmation | P7-03, P7-04 |
