# ManuOS — Business Requirements Document (BRD)

| | |
|---|---|
| **Product** | ManuOS — Manufacturing Orchestration System |
| **Document** | Business Requirements Document |
| **Version** | 1.0 |
| **Related documents** | `PRD_MANUOS_PROTOTYPE.md` · `PROPOSAL_DECK_MANUOS.md` · `SOFTWARE_ARCHITECTURE_MANUOS.md` |
| **Context** | AI Builder Cup 2026 prototype + long-term product direction |
| **Category** | Manufacturing — Intelligent Operations & Industrial Efficiency |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Background & Current State](#2-business-background--current-state)
3. [Problem Statement](#3-problem-statement)
4. [Business Objectives](#4-business-objectives)
5. [Stakeholders](#5-stakeholders)
6. [Proposed Solution — Business View](#6-proposed-solution--business-view)
7. [Problem → Capability → Outcome Mapping](#7-problem--capability--outcome-mapping)
8. [Business Benefits](#8-business-benefits)
9. [Business Requirements (BR)](#9-business-requirements-br)
10. [Scope](#10-scope)
11. [Success Criteria & KPI Measurement](#11-success-criteria--kpi-measurement)
12. [Assumptions, Constraints & Dependencies](#12-assumptions-constraints--dependencies)
13. [Business Risks & Mitigations](#13-business-risks--mitigations)
14. [Cost–Benefit Illustration](#14-costbenefit-illustration)
15. [Future Roadmap — Business View](#15-future-roadmap--business-view)
16. [Approval](#16-approval)

---

## 1. Executive Summary

Small and mid-sized **custom / make-to-order (MTO) manufacturers** — metal fabrication, machining, electrical panels, custom components, project-based manufacturing — lose money and customers to a single structural weakness: **nobody can see what a disruption does to the whole factory until it is too late.**

Today these companies coordinate production through spreadsheets, WhatsApp messages, and manual follow-up. When a material arrives late, a machine breaks down, or an engineering revision lands, the response is reactive: meetings, guesswork, and expensive emergency expediting.

**ManuOS** is an AI-native Manufacturing Operations Platform that turns operational data into **insights, recommendations, and actions**:

- **Understand** — one connected model of orders, materials, machines, dependencies, quality, and skills shows what is *actually* happening (progress = units that passed QC, not cards moved).
- **Orchestrate** — when trouble hits, the system computes the ripple effect and drafts validated recovery options for supervisors to approve.
- **Learn** — the factory remembers every job: estimates vs. actuals, problematic materials, what worked — and recommends better plans for similar future jobs.
- **Network** — a **supply & demand ecosystem**: overloaded factories subcontract capacity to consenting partners, and every company on the platform can source materials/components from — or supply them to — other member factories. Today a producer, tomorrow a consumer: everyone is inside the supply chain loop.

This BRD defines the business problems ManuOS resolves, the benefits to the business, and the measurable success criteria — for the AI Builder Cup 2026 prototype and the product beyond it.

---

## 2. Business Background & Current State

### 2.1 The operating reality of custom manufacturing

Field interviews across **all 10 departments** of a real custom fabrication company (Marketing → Engineering Design → Engineering Process → PPIC → Warehouse → Purchasing → Production → Assembly → QC → Delivery) confirmed:

1. **Every order is unique.** Workflows change with customer specifications, materials, machine availability, and engineering revisions.
2. **The flow is a graph, not a pipeline.** Parallel branches (material procurement vs. production prep), fan-outs (one drawing → multiple operations → production + QC jobsheet pairs), and loop-backs (rework, returns → urgent engineering revision, subcontract results re-entering QC).
3. **Coordination is manual.** Status lives in spreadsheets and chat threads; delays surface days after the cause.
4. **Deadlines are promised before capacity is checked.** Sales commits, production absorbs.

### 2.2 Why current tools don't fix it

| Current option | Business limitation |
|---|---|
| Spreadsheets & WhatsApp | No dependency awareness; status is always stale; zero learning |
| Task boards (Trello, Jira) | Track work items, not production reality — no capacity, no quality, no materials |
| Classic ERP/MES (e.g., Odoo) | Transactional record-keeping; does not explain impact or propose recovery; still needs manual coordination |
| Enterprise APS (e.g., Siemens Opcenter) | Powerful but priced and implemented for enterprises — out of reach for SMEs |
| Frontline app platforms (e.g., Tulip) | Digitize the shop floor without the cross-department intelligence graph |

### 2.3 The business opportunity

An affordable, intelligence-first platform for the SME custom manufacturer segment — a large, underserved market (especially across JAPAC) — that increases on-time delivery, reduces emergency costs, and turns customer transparency into a competitive weapon.

---

## 3. Problem Statement

Ten business problems, numbered for traceability. Each is mapped to capabilities in §7.

| ID | Problem | Business impact today |
|---|---|---|
| **BP-01** | **Disruptions are discovered late.** A delayed material or broken machine silently blocks downstream tasks; the impact is found days later. | Idle lines, missed sub-dates, firefighting meetings |
| **BP-02** | **Recovery decisions are blind.** When disruption hits, managers choose between rerouting, overtime, partial shipment, or subcontracting with no quantified trade-offs. | Wrong choices; overtime and expedite spend that doesn't save the date |
| **BP-03** | **The factory never learns.** Estimates are re-made from scratch; chronic overruns (e.g., bending +18%) repeat for years. | Systematically underpriced/under-scheduled work; eroded margin |
| **BP-04** | **Assignment by availability, not competence.** Critical operations go to "whoever is free"; certifications and track record live in people's heads. | Rework, quality escapes, customer claims |
| **BP-05** | **Overload has no safe exit — and sourcing has no ecosystem.** When the factory is full, orders are refused or delivered late; subcontracting is ad-hoc and untrusted. Sourcing materials/components is equally ad-hoc: the same factory may be a buyer one month and a seller the next, with no connected network for either role. | Lost revenue; damaged reputation; missed sourcing opportunities |
| **BP-06** | **Promises precede capacity.** Sales commits delivery dates without a feasibility check. | Broken promises; penalty clauses; panic production |
| **BP-07** | **RFQ-to-production is slow and lossy.** Customer documents are manually translated into BOMs, routings, and QC checklists; ambiguities are guessed, not asked. | Long quoting lead time; wrong specs discovered mid-production |
| **BP-08** | **No traceability or customer visibility.** "When will my order be done?" gets a guess; quality evidence is scattered. | Customer anxiety, churn, weak professional image |
| **BP-09** | **Knowledge walks out the door.** When experienced planners/technicians leave, their operational knowledge leaves with them. | Capability dips; repeated mistakes |
| **BP-10** | **Profit erosion is invisible until closing.** An order can be on-time yet unprofitable (overtime, scrap, rework, subcontracting); nobody sees the drivers. | Margin leaks repeat in the next quote |
| **BP-11** | **Rigid software bends the factory to the tool.** Every manufacturer's flow differs (order types, departments, rework loops, subcontract returns); classic systems hardcode one pipeline, so custom shops customize expensively — or keep using spreadsheets. | Failed deployments; shelf-ware; spreadsheets keep winning |

---

## 4. Business Objectives

| ID | Objective | Addressed problems |
|---|---|---|
| **BO-01** | Increase on-time delivery through early risk detection and faster recovery decisions | BP-01, BP-02 |
| **BO-02** | Reduce emergency costs (overtime, expediting, air freight) by choosing recovery options with quantified trade-offs | BP-02 |
| **BO-03** | Continuously improve estimate accuracy using the factory's own execution history | BP-03, BP-10 |
| **BO-04** | Reduce rework and quality escapes through competence-based assignment | BP-04 |
| **BO-05** | Grow revenue by safely accepting more orders and by monetizing idle capability (supply & demand network + feasibility checking) | BP-05, BP-06 |
| **BO-06** | Shorten quote lead time and improve first-time-right specs | BP-07 |
| **BO-07** | Increase customer retention and price premium via transparency and traceability | BP-08 |
| **BO-08** | Retain operational knowledge inside the system, independent of staff turnover | BP-03, BP-09 |
| **BO-09** | Give owners a daily, trustworthy answer to "what needs my decision?" | BP-01, BP-02, BP-10 |
| **BO-10** | Make ManuOS adoptable by **any manufacturing company** without custom code — via AI-generated workflows per order type | BP-11 |

---

## 5. Stakeholders

| Stakeholder | Role in business | What they need from ManuOS |
|---|---|---|
| **Owner / Director** | P&L responsibility | At-a-glance risk, profit signals, decisions that need approval |
| **PPIC / Supervisor** | Planning & shop-floor control | Optimal sequences, ripple analysis, dispatch with rationale |
| **Technician** | Executes operations | Clear task queue with instructions and materials; fair, skill-based assignment |
| **Sales / Marketing** | Owns customer promises | Feasible dates before quoting; alternatives (partial, overtime, subcontract) |
| **Engineering** | Translates customer specs into production plans | AI-drafted BOM/routing/QC checklist to review, faster intake |
| **QC** | Guards quality | Quantity-true progress, defect history, evidence trail |
| **Customer** | Buys custom parts | Honest ETAs, progress proof, QC evidence, plan-change acknowledgment |
| **Partner factory** (network member) | Capacity provider/seeker **and** supplier/consumer of materials & components | Vetted, consent-based subcontract and sourcing flows; fluid roles (producer today, consumer tomorrow) inside the ecosystem |

---

## 6. Proposed Solution — Business View

**ManuOS** connects every production element in one **Manufacturing Graph** — orders, manufacturing orders, jobsheets, tasks, machines, materials, technicians, quality records, and history — and applies **hybrid intelligence**:

> **Deterministic engines** compute the facts (critical path, ripple effects, capacity, cost, skill fit).
> **Google Gemini** explains, recommends, and drafts (impact narratives, recovery options, RFQ extraction, Q&A).
> **Humans approve** every consequential change.

Workflows themselves are **AI-generated per order type** (deterministically validated, human-approved) — ManuOS adapts to any manufacturer, not the other way around.

Four experience layers, one for each persona — Owners see a **Factory Command Center**, supervisors a **Production Orchestrator** (graph, Gantt, Kanban, dispatch), technicians a simple **My Workstation**, customers an **Order Intelligence Portal**.

**Positioning:** *Manufacturing Intelligence, from Order to Delivery.* Not a project board — an operating system for the factory.

---

## 7. Problem → Capability → Outcome Mapping

The core of this BRD: every business problem is resolved by a named capability with a measurable business outcome.

| Problem | Resolving capability (feature) | How it resolves it | Business outcome |
|---|---|---|---|
| **BP-01** Disruptions found late | **F3 Production Dependency Intelligence** ⭐ | Live ripple analysis over the graph: affected orders/tasks, blocked vs. still-runnable work, new critical path, ETA deltas — explained in plain language | Disruption-to-decision time drops from days to minutes; fewer unnecessary full-line stops |
| **BP-02** Blind recovery | **F4 Self-Healing Production** ⭐ | AI-drafted, simulation-validated recovery options (split batch, extra shift, reroute, reassign, subcontract) with time/cost/capacity trade-offs; one-click approval updates plan + customer promise | Recovery chosen on numbers, not instinct; measurable reduction in overtime/expedite waste |
| **BP-03** Factory never learns | **F7 Factory Memory** ⭐ | Aggregates estimate-vs-actual, rework causes, best routing per part family; recommends adjustments for similar new jobs | Estimate accuracy improves every quarter; chronic overruns eliminated |
| **BP-04** Availability-based assignment | **F10 Skill-Aware Dispatch** ⭐ | Fit score from skills, certifications, workload, track record; visible rationale; flags systemic skill gaps | Lower rework & quality escapes; critical ops staffed by qualified people |
| **BP-05** Overload has no exit / no sourcing ecosystem | **F12 Factory Network** ⭐ | Consent-based partner matching for **capacity subcontracting** (capability/cert/capacity/rate) **and supply-demand sourcing** (materials, components, semi-finished parts); RFQ-style deals approved by both sides; every member can be supplier or consumer | Accept more orders; revenue growth without capex; faster, trusted sourcing; new revenue from idle capability |
| **BP-06** Promises precede capacity | **F2 Promise Engine** | Feasible-date computation from live load + material lead times; alternatives with cost deltas before quoting | Realistic commitments; fewer broken promises |
| **BP-07** Slow, lossy RFQ intake | **F5 AI Engineering Copilot** | Paste RFQ/drawing notes → structured requirements, flagged ambiguities, draft BOM/routing/QC; engineering reviews before release | Faster quotes; wrong-spec discoveries move from production to intake |
| **BP-08** No traceability/visibility | **F8 Manufacturing Passport** + Customer Portal | QR per unit → full lot/op/QC history; customer sees quantity-true progress, predicted completion, evidence, and approves plan changes | Higher retention; professional image differentiates vs. competitors |
| **BP-09** Knowledge walks out | **F7 Factory Memory** + F1 **AI Production Brain** | Knowledge lives in structured history + an assistant that answers from live data | Institutional memory retained through staff turnover |
| **BP-10** Invisible profit erosion | **F9 Profit Leakage Radar** *(future)* + F7 | Estimated vs. actual cost per order with variance drivers (foundation: F7's estimate/actual store) | Next quote is priced on evidence; margin leaks close over time |
| **BP-11** Software bends the factory | **F13 AI Dynamic Workflow Generation** | Order-type-driven workflows AI-drafted (DAG with departments, dependencies, fan-outs, loop-backs), deterministically validated, human-approved; the same workflows make Factory Network matching **step-aware** and member onboarding fast | Any manufacturer adopts without custom code; ecosystem grows quicker |

⭐ = Main showcased features of the prototype (F3, F4, F7, F10, F12).

---

## 8. Business Benefits

### 8.1 Quantitative benefit targets (illustrative, to be baselined per customer)

| KPI | Typical baseline (spreadsheet-run MTO shop) | Target with ManuOS | Driven by |
|---|---|---|---|
| On-time delivery rate | 60–75% | **≥ 90%** | F3 + F4 + F2 |
| Disruption-to-decision time | Hours–days (meetings) | **< 15 minutes** | F3 + F4 |
| Estimate accuracy (labor hours) | ±25–40% error | **±10%** within 12 months of use | F7 |
| Rework rate on critical ops | 5–10% | **< 3%** | F10 + F7 |
| Emergency expediting/overtime spend | Significant, untracked | **−30–50%** | F4 (validated trade-offs) |
| Quote lead time (RFQ → quote) | 3–7 days | **≤ 1 day** | F5 + F2 |
| Orders declined for capacity | Common | **Reduced** via network offload | F12 |
| Material/component sourcing lead time | Days of calls & haggling | **Hours** via network matching | F12 |
| Status-reporting admin time | Hours/week per manager | **Near zero** (live views) | F1 + Portal |

### 8.2 Qualitative benefits

- **Trust:** customers see honest, evidence-backed progress — a differentiator that wins deals on professionalism, not just price.
- **Calm operations:** fewer fire drills; supervisors spend time improving, not chasing.
- **Universality:** AI-generated workflows per order type mean any manufacturer — any process, any vertical — can run on ManuOS without custom code.
- **Institutional memory:** the factory becomes smarter every month (compounding asset).
- **Workforce respect:** technicians are assigned by competence and developed deliberately (future LMS loop).
- **Owner clarity:** one screen answers "what needs my decision today?"

### 8.3 Benefits by stakeholder

| Stakeholder | Top benefits |
|---|---|
| Owner / Director | Risk visibility; lower emergency costs; growth without capex; decision leverage |
| PPIC / Supervisor | Optimal sequences; instant ripple analysis; defensible decisions with rationale |
| Technician | Clear priorities & instructions; skill-recognized assignment; less blame for mismatched tasks |
| Sales | Confident commitments; alternatives to offer customers; faster quotes |
| Engineering | Faster intake; AI drafts with human review; fewer mid-production surprises |
| QC | Quantity-true progress; defect history feeding prevention |
| Customer | Honest ETAs; progress proof; acknowledgment of plan changes; traceability |

---

## 9. Business Requirements (BR)

Prioritized with MoSCoW. (Functional detail lives in the PRD; these are the business-level requirements the prototype and product must satisfy.)

### 9.1 Visibility & intelligence (Understand)

| ID | Requirement | Priority |
|---|---|---|
| BR-01 | Provide a single connected view of orders → MOs → jobsheets → tasks with dependencies, materials, machines, and skills | Must |
| BR-02 | Report **real progress** as completed **and QC-passed units**, not percent-of-cards-moved | Must |
| BR-03 | Detect and display order risk (ETA deviation, blockers) before deadlines are missed | Must |
| BR-04 | Explain any disruption's cause and business impact in plain language | Must |
| BR-05 | Answer natural-language questions about production state (assistant) | Should |

### 9.2 Orchestration & recovery (Act)

| ID | Requirement | Priority |
|---|---|---|
| BR-06 | Generate ≥ 2 validated recovery options per disruption with time/cost/capacity trade-offs | Must |
| BR-07 | Enforce human approval before any AI-proposed change is applied | Must |
| BR-08 | Apply approved recoveries atomically: plan, assignments, quantities, and customer-visible promise update together | Must |
| BR-09 | Keep an audit trail of every recovery decision (who, when, why, outcome) | Must |
| BR-10 | Check delivery-date feasibility before a promise is made, with alternatives and cost deltas | Should |

### 9.3 Learning & workforce (Learn)

| ID | Requirement | Priority |
|---|---|---|
| BR-11 | Store estimate-vs-actual, rework causes, and routing outcomes per part family/operation | Must |
| BR-12 | Surface data-backed recommendations when planning similar jobs | Must |
| BR-13 | Rank task assignment candidates by skill, certification, workload, and track record with visible rationale | Must |
| BR-14 | Flag systemic skill gaps (future: auto-generated training via RAG + AI LMS) | Should |

### 9.4 Growth & ecosystem (Network)

| ID | Requirement | Priority |
|---|---|---|
| BR-15 | Match **both** overload/subcontract needs **and** material/component sourcing needs to consenting partner factories (capacity: capability, certification, hours, rate; supply: part offered, lead time, rate) | Should (prototype: simulated, real matcher logic) |
| BR-16 | Never expose a factory's data without explicit consent | Must |
| BR-17 | Provide customers a portal with progress, predicted completion, evidence, and plan-change acknowledgment | Must |

### 9.5 Intake & traceability

| ID | Requirement | Priority |
|---|---|---|
| BR-18 | Convert pasted RFQ/drawing notes into structured requirements, draft BOM/routing/QC checklist, with ambiguities flagged for human review | Should |
| BR-19 | Provide per-unit digital passport (lots, operations, QC results, sign-offs) | Should |

### 9.6 Non-functional business requirements

| ID | Requirement | Priority |
|---|---|---|
| BR-20 | All AI-generated content clearly labeled; all computed numbers auditable | Must |
| BR-21 | System remains useful if AI narrative is unavailable (deterministic panels always render) | Must |
| BR-22 | All materials and UI in English (competition); localization-ready | Must |
| BR-23 | Deployable on Google Cloud Run using Gemini (competition compliance) | Must |
| BR-24 | Generate a production workflow (validated DAG) from an order-type description; require human approval before activation; use workflow step requirements in Factory Network matching | Should (prototype: generator + validation working; full engine = roadmap) |

---

## 10. Scope

### 10.1 In scope — prototype (AI Builder Cup)

- **Main features (showcased):** F3 Dependency Intelligence · F4 Self-Healing Production · F7 Factory Memory · F10 Skill-Aware Dispatch · F12 Factory Network — capacity subcontracting **and** supply-demand sourcing (simulated multi-tenant, real matching & consent logic)
- **Supporting features (demoable-lite):** F1 AI Production Brain · F2 Promise Engine · F5 AI Engineering Copilot · F8 Manufacturing Passport · **F13 AI Dynamic Workflow Generation** (order type → validated DAG → approval)
- Four persona views (Owner / Supervisor / Technician / Customer) with demo persona switcher
- Authored seed dataset + disruption injection for repeatable demos
- Deployment: Google Cloud Run, Gemini via Google Gen AI SDK

### 10.2 Out of scope — prototype

- Production multi-tenant authentication/SSO, persistent database, IoT/machine integrations, email/Odoo integrations, real-time multi-user sync
- Removed from product: Conversational Factory (voice/WhatsApp input)

### 10.3 Future roadmap (mentioned, not built — see §15)

- F6 Visual Quality Intelligence · F9 Profit Leakage Radar · RAG + AI-Based LMS Competency Engine

---

## 11. Success Criteria & KPI Measurement

### 11.1 Prototype success (competition window)

| Criterion | Measure |
|---|---|
| Complete hero scenario runs end-to-end | §13.2 of PRD executes without error on the deployed URL |
| AI is meaningful, not cosmetic | 7 distinct Gemini functions, all schema-constrained and grounded in computed facts |
| Judges can self-navigate | Persona switcher → every view understandable in < 60 seconds without guidance |
| Compliance | Gemini ✅ · Cloud Run ✅ · English ✅ · 3-min video ✅ · Proposal PDF ✅ |

### 11.2 Product success (post-competition pilots)

- Baseline the 8 KPIs in §8.1 at each pilot customer within the first month
- Re-measure at 3, 6, 12 months; target trajectory per §8.1
- Qualitative: NPS from owners/supervisors; customer portal engagement (acknowledgment latency)

---

## 12. Assumptions, Constraints & Dependencies

**Assumptions**
- A1: Target factories will digitize basic execution events (task start/finish, quantities, QC results) — ManuOS keeps this input lightweight
- A2: One pilot factory's process (10-department interview) is representative of the segment
- A3: Gemini API quality/latency remains suitable for explanation/ideation tasks (deterministic engines do not depend on it)

**Constraints**
- C1: Prototype must run on Google Cloud Run with Gemini/Gemma (competition)
- C2: Prototype timeline fits the competition window — scope frozen per PRD §6
- C3: No fabricated data in demos; all narratives grounded in computed facts

**Dependencies**
- D1: Google Cloud project with Gemini API access and Cloud Run quota
- D2: Seed dataset authored and validated before build phase P3
- D3: CPM engine ported from the existing ManuOS codebase (reference implementation)

---

## 13. Business Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Factories won't input data consistently | Medium | High | Keep input minimal (quantities + status); make value visible on day one with seeded intelligence; future roadmap reduces input friction |
| AI outputs distrusted | Medium | High | Hybrid design: numbers always deterministic & auditable; AI labeled; humans approve changes |
| Segment too narrow / too broad | Medium | Medium | Start with custom MTO job shops (sharpest pains); expand along process types after proof |
| Network features raise data-sharing fears | Medium | Medium | Consent-first architecture; private-by-default; both-side approval; visible consent states |
| Gemini cost/latency at scale | Low | Medium | Deterministic core does the heavy lifting; flash-tier models; caching; future Gemma self-host option |
| Change management on shop floor | Medium | Medium | Persona-tailored UX (technician view is deliberately simple); training loops in future LMS |

---

## 14. Cost–Benefit Illustration

For a mid-size custom fabricator (~120 staff, ~40 active orders/month), illustrative:

**Current annual leakage (typical, conservative):**
- Emergency overtime & expediting: ~2–4% of revenue
- Rework & quality escapes: ~2–5% of revenue
- Margin lost on under-estimated jobs: ~3–6% of revenue
- Orders declined for capacity: opportunity cost, growing

**With ManuOS (targets from §8.1):**
- Even a **one-third reduction** of the above leakage categories on a USD 5M-revenue shop ≈ **USD 100K–250K/year** recovered — versus a subscription priced per facility (operators free), i.e., an order-of-magnitude ROI case.

**Strategic upside (not in the base case):** ecosystem network effects (fill capacity **and** source/supply materials across members — the loop compounds with every company that joins), customer-retention premium, and compounding estimate accuracy — the factory gets *better* every month it runs on ManuOS.

---

## 15. Future Roadmap — Business View

| Phase | Capability | Business value |
|---|---|---|
| Next | **F6 Visual Quality Intelligence** | Faster visual QC documentation; earlier defect catch; inspector-verified AI |
| Next | **F9 Profit Leakage Radar** | Per-order profitability visibility; quotes that stop repeating mistakes (extends Factory Memory's estimate/actual store into cost) |
| Strategic | **RAG + AI-Based LMS — Competency Engine** | Skill gaps detected by dispatch (F10) automatically generate training & certification paths, grounded in the factory's own proven knowledge (F7 + SOPs); human-approved certifications flow back into the skill matrix — a self-improving workforce loop |
| Strategic | Factory Network scale-up | From simulated to a real multi-factory **supply chain ecosystem**: capacity subcontracting marketplace **and** supply-demand trading of materials/components (RFQ, PO, quality agreements, production monitoring). Companies join as producers, consumers, or both — the ecosystem value compounds with every member |
| Next | AI Dynamic Workflow engine scale-up | From prototype generation to the full config-driven engine — node/action component registry, state machines, versioning per Order Type (blueprint already exists in the platform docs) |

**Long-term direction:** ManuOS evolves from **System of Record → System of Intelligence → System of Action** — ultimately answering questions like *"What must change so we can take 30% more orders without new machines?"* with testable capacity scenarios, not AI hand-waving.

---

## 16. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Product Owner | | | |
| Business Sponsor | | | |
| Engineering Lead | | | |
