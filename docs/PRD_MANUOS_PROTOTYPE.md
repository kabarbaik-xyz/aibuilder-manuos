# ManuOS — Prototype Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | ManuOS — Manufacturing Orchestration System |
| **Document** | PRD for AI Builder Cup 2026 Prototype |
| **Version** | 1.0 |
| **Status** | Approved for build |
| **Build targets** | Google AI Studio (aistudio.google.com) and/or Antigravity |
| **Deployment target** | Google Cloud Run (competition requirement) |
| **AI requirement** | Google AI models only — Gemini / Gemma (competition requirement) |
| **Language** | All materials in English (competition requirement) |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Background & Problem Statement](#2-background--problem-statement)
3. [Vision, Positioning & Value Proposition](#3-vision-positioning--value-proposition)
4. [Target Users & Personas](#4-target-users--personas)
5. [Prototype Goals & Success Criteria](#5-prototype-goals--success-criteria)
6. [Scope](#6-scope)
7. [Feature Specifications — Main Features](#7-feature-specifications--main-features-showcased)
8. [Feature Specifications — Supporting Features](#8-feature-specifications--supporting-features)
9. [Future Roadmap (Mentioned, Not Built)](#9-future-roadmap-mentioned-not-built)
10. [System Architecture](#10-system-architecture)
11. [Data Model (Prototype)](#11-data-model-prototype)
12. [UX & Screen Specifications](#12-ux--screen-specifications)
13. [Demo Data & End-to-End Scenario](#13-demo-data--end-to-end-scenario)
14. [3-Minute Demo Video Script](#14-3-minute-demo-video-script)
15. [Competition Compliance & Judging Alignment](#15-competition-compliance--judging-alignment)
16. [Build Plan for Google AI Studio / Antigravity](#16-build-plan-for-google-ai-studio--antigravity)
17. [Risks & Mitigations](#17-risks--mitigations)
18. [Appendix](#18-appendix)

---

## 1. Executive Summary

ManuOS is an **AI-native Manufacturing Operations Platform** for make-to-order (MTO), custom manufacturing, and high-mix low-volume producers — metal fabrication, machining, electrical panels, custom components, and project-based manufacturing.

Today these factories run on spreadsheets, WhatsApp messages, and manual coordination. When a material shipment is late, a machine breaks down, or an engineering revision lands, nobody can quickly answer: *what does this affect, what should we do, and who should do it?*

ManuOS answers those questions. It is built on a **Manufacturing Graph** — a connected model of orders, processes, machines, materials, dependencies, quantities, quality, and people — and layers **Google Gemini AI** on top with a strict division of labor:

- **Deterministic engines** compute capacity, critical paths, ripple effects, cost, and schedules (auditable, no hallucination).
- **Gemini** understands documents, explains problems in plain language, proposes recovery options, and generates recommendations.
- **Humans approve** every consequential action.

### The five showcase capabilities of this prototype

1. **Production Dependency Intelligence** — see the domino effect before it happens
2. **Self-Healing Production** — AI-drafted recovery plans, compared and approved by supervisors
3. **Factory Memory** — the factory learns from every completed job
4. **Skill-Aware Dispatch** — assign the *right* technician, not just the available one
5. **Factory Network** — a **supply & demand ecosystem** between factories: capacity sharing *and* material/component trading, putting every company on the platform inside the supply chain loop — producer today, consumer tomorrow (simulated multi-tenant)

These are supported by five embedded capabilities — **AI Dynamic Workflow Generation** (order-type-driven workflows, so *any* manufacturing company can run on ManuOS), AI Production Brain, Promise Engine, AI Engineering Copilot, and Manufacturing Passport — and framed by a future roadmap (Visual Quality Intelligence, Profit Leakage Radar, and a RAG + AI-Based LMS Competency Engine).

---

## 2. Background & Problem Statement

### 2.1 Target segment

Small and mid-sized **custom / job-order manufacturers**. Their defining reality:

- Every order has a customer-specific specification; workflows change constantly
- Production flows through many departments (marketing → engineering → PPIC → warehouse → purchasing → production → assembly → QC → delivery) with parallel branches and loop-backs (rework, returns, subcontracting)
- Deadlines are promised by sales **before** capacity is checked
- Materials arrive late; machines break; drawings get revised mid-production

### 2.2 The core pains (validated via interviews across 10 departments of a real fabricator)

| Pain | Consequence today |
|---|---|
| A late material silently blocks downstream tasks | Discovered days later; expediting chaos |
| Machine breakdown with no impact analysis | Wrong recovery choices; margin loss |
| No estimate-vs-actual learning | Same mistakes repeated on similar jobs |
| Task assignment by "who is free" | Rework, quality escapes, junior techs on critical ops |
| Overloaded factory has no safe way to offload work | Late deliveries, refused orders |
| Customer asks "when will it be done?" | Answer is a guess |

### 2.3 Competitive landscape & lessons

| Competitor | What they have | Lesson for ManuOS |
|---|---|---|
| **Odoo Manufacturing** | MOs, BOM, shop floor, barcode, QC, AI forecasting | Kanban + barcode + QC is **not** a differentiator |
| **Siemens Opcenter** | APS, what-if simulation, capacity optimization | Prediction & simulation are not new — but they are **enterprise-priced and heavy** |
| **Tulip** | Frontline ops apps, AI agents, factory playback | AI agents at the shop floor are becoming table stakes |
| **Trello / Jira** | Task tracking | Solves "what is being worked on", not "what is actually happening in production" |

**The gap ManuOS fills:** deeply integrated, practical, and affordable manufacturing intelligence for companies that today use spreadsheets and WhatsApp. Not the first to have any single feature — the first to combine dependency intelligence, self-healing, factory memory, skill dispatch, and a supply-and-demand factory network in one connected system.

---

## 3. Vision, Positioning & Value Proposition

### 3.1 Vision statement

> **ManuOS — Manufacturing Orchestration System.**
> From customer orders to production intelligence. One connected system that understands, predicts, and orchestrates manufacturing operations.

### 3.2 Positioning

| Ordinary apps | ManuOS |
|---|---|
| What is being worked on? | What is *actually happening* in production? |
| Who is working on it? | Who is the *best-fit* person to work on it? |
| When is the deadline? | Is the deadline *realistic* given capacity? |
| Which task is late? | What *will be* late, before it happens? |
| What percent complete? | How many units are *truly done and QC-passed*? |
| What caused the problem? | What is the *impact* and how do we *recover*? |
| Customer sees a status | Customer sees visibility **and a delivery prediction** |

### 3.3 Category & tagline

- **Category:** AI-native Manufacturing Operations Platform
- **Tagline:** *Manufacturing Intelligence, from Order to Delivery.*

### 3.4 Value proposition (for the proposal deck)

Reduce unforeseen delays, improve capacity decisions, give customers real transparency, and stop margin leakage — by turning operational data into insights, recommendations, and actions.

---

## 4. Target Users & Personas

Four personas, four different experiences. **Do not force everyone into the same Kanban board.**

| Persona | Primary view | Questions answered |
|---|---|---|
| **Owner / Director** | **Factory Command Center** | Which orders are at risk, profitable, and need my decision today? |
| **PPIC / Supervisor** | **Production Orchestrator** | What is the optimal job sequence and assignment today — and what breaks if this material is late? |
| **Technician** | **My Workstation** | What should I work on, with which instructions and materials? |
| **Customer** | **Order Intelligence Portal** | When will my order be done, and what is the proof of progress? |

Prototype implements all four views behind a **demo persona switcher** (one click, no friction for judges).

---

## 5. Prototype Goals & Success Criteria

### 5.1 Goals

1. Demonstrate the five main features end-to-end in a believable custom-manufacturing scenario
2. Show **meaningful** Gen AI use (Gemini does real work: explanation, proposal generation, extraction, recommendation — never fake)
3. Ship a functional web app deployed on **Cloud Run**, using **Gemini** via the Google Gen AI SDK
4. Support a compelling 3-minute demo video

### 5.2 Success criteria

- [ ] A judge can switch persona and see 4 distinct purposeful views
- [ ] Inject a material delay → system shows ripple impact across the graph + Gemini plain-language explanation
- [ ] System offers ≥2 recovery options with cost/time trade-offs; approval updates the plan
- [ ] Factory Memory surfaces a data-backed recommendation from seeded history
- [ ] Dispatch board ranks technicians by skill-fit with visible rationale
- [ ] Factory Network screen shows a working supply & demand simulation between ≥3 factories (capacity subcontracting **and** material/component sourcing)
- [ ] AI generates a valid, deterministically-checked workflow DAG for a new order type — universality proof for any manufacturer
- [ ] Customer portal shows quantity-true progress and ETA prediction, not a percent guess
- [ ] 100% English UI; deployed URL on Cloud Run; Gemini API key via env var, no key in client bundle for server-side calls

---

## 6. Scope

### 6.1 In scope — Main features (showcased, "hero" moments)

| # | Feature | Fidelity target |
|---|---|---|
| F3 | Production Dependency Intelligence | Fully working on seeded graph + live disruption injection |
| F4 | Self-Healing Production | Working: options generated (Gemini) + simulated (deterministic) + approval flow |
| F7 | Factory Memory | Working on seeded history: estimate-vs-actual analytics + recommendation |
| F10 | Skill-Aware Dispatch | Working: skill matrix + weighted matching + rationale |
| F12 | Factory Network | Working simulation across ≥3 seeded factories: capacity subcontracting **and** supply-demand sourcing, with explicit consent model |

### 6.2 In scope — Supporting features (present, demoable-lite)

| # | Feature | Fidelity target |
|---|---|---|
| F1 | AI Production Brain | Chat panel answering production questions from live app state (Gemini with structured context) |
| F2 | Promise Engine | Feasible-date calculator for a new order given current load (deterministic) + Gemini narrative |
| F5 | AI Engineering Copilot | Paste RFQ/drawing notes → structured requirements + draft BOM/routing (Gemini structured output, human confirms) |
| F8 | Manufacturing Passport | Per-unit QR → process/QC timeline view (read-only proof for customers) |
| **13** | **AI Dynamic Workflow Generation** | Working: generate a workflow DAG for a new order type (structured output + topological validation + human approval); renders on the graph view. Universality + workflow-aware Factory Network |

### 6.3 Out of scope — mentioned as Future Roadmap (see §9)

- F6 Visual Quality Intelligence (camera-based AI QC)
- F9 Profit Leakage Radar (margin leak detection)
- RAG + AI-Based LMS Competency Engine (auto-generated training & certification from skill gaps)

### 6.4 Explicitly removed from the product

- ~~Conversational Factory~~ (voice/WhatsApp input) — cut by product decision; shop-floor input stays in the UI.

### 6.5 Out of scope for the prototype (engineering reality)

- Real multi-tenant auth/SSO (single demo tenant + persona switcher; Factory Network uses simulated tenants)
- Persistent production database (seeded dataset + client state or lightweight server state is acceptable; see §10)
- IoT/machine sensors, barcode hardware, integrations (Odoo, email) beyond mock hooks

---

## 7. Feature Specifications — Main Features (Showcased)

> Format per feature: Description → User stories → Functional requirements → AI division of labor → Acceptance criteria.

### 7.1 F3 — Production Dependency Intelligence

**Description.** The system continuously reasons over the Manufacturing Graph. When any disruption occurs (material delay, machine breakdown, task overrun, QC failure), it computes the **ripple effect**: every affected order, task, and deadline; which paths become blocked; which work can still proceed; and where the new critical path lies. Gemini then explains the situation in plain language — cause, blast radius, and options context.

**User stories**
- As a **Supervisor**, when a material is delayed, I want to see exactly which tasks/orders are affected and which can still run, so I don't stop the whole line unnecessarily.
- As an **Owner**, I want the system to tell me *before* the customer complains that an order is now at risk, and why.
- As a **Customer**, I want an honest updated ETA when something affecting my order changes.

**Functional requirements**
- FR-3.1 Disruption injection UI ("Simulate event"): material delay (X days), machine down (machine, duration), task overrun (task, +hours)
- FR-3.2 Ripple analyzer (deterministic): BFS/DFS across task/jobsheet/MO dependencies + material requirements → affected nodes list with paths
- FR-3.3 Re-run CPM after disruption → new critical path, new slack, ETA deltas per order
- FR-3.4 Impact panel: affected orders (count, severity), blocked vs still-runnable tasks, deadline deltas
- FR-3.5 Gemini explanation: 2–4 sentences, cause → impact → what to watch; grounded strictly in analyzer output (no invented facts)
- FR-3.6 Visual: affected nodes highlighted red/orange on the graph view; unaffected stay green

**AI division of labor**
- Deterministic: graph traversal, CPM, slack, ETA math
- Gemini: natural-language impact explanation, escalation suggestions (feeds F4)

**Acceptance criteria**
- Injecting "terminal blocks +2 days" on demo data highlights ≥3 affected tasks across ≥2 orders, blocks ≥1 assembly path, shows still-runnable tasks, updates ETAs, and Gemini's explanation matches the computed facts exactly.

### 7.2 F4 — Self-Healing Production

**Description.** Beyond alerting, ManuOS drafts **recovery plans**. For a given disruption, the system generates multiple options — split batch / partial delivery, add shift / overtime, reroute to alternate machine, reassign technician, subcontract to network partner (bridges to F12) — each with estimated time recovered, cost impact (±%), capacity impact, and risks. A supervisor compares options side-by-side and approves one; the plan, assignments, and projections update accordingly. All consequential changes require human approval.

**User stories**
- As a **Supervisor**, when a disruption hits, I want ranked recovery options with trade-offs so I can decide in minutes, not meetings.
- As an **Owner**, I want to approve the option that protects the customer date at the lowest cost.
- As a **Customer**, when a recovery changes my delivery, I want to see and acknowledge the new committed plan (partial shipment, revised date).

**Functional requirements**
- FR-4.1 Recovery panel appears from any impact analysis (F3) — "Generate recovery options"
- FR-4.2 Option schema: `{type, title, description, timeRecovered, costImpactPct, capacityImpact, risks[], feasibility}`; ≥2 and ≤4 options
- FR-4.3 Deterministic simulator validates each Gemini-proposed option against capacity data (feasibility check); rejected options shown greyed with reason
- FR-4.4 Side-by-side comparison UI with recommendation badge and rationale
- FR-4.5 Approve flow → applies changes to the plan (reassigned tasks, shifted dates, split quantities), logs an approval record (who/when/why), updates customer-visible ETA (if order affected) and marks promise status
- FR-4.6 Audit trail entry for every applied recovery (feeds F7 memory)

**AI division of labor**
- Gemini: invent candidate options from disruption context + constraints; write human-readable trade-off narrative
- Deterministic: validate feasibility, compute time/cost deltas via simulator; block impossible options
- Human: approval mandatory

**Acceptance criteria**
- Demo scenario produces exactly the plan's signature comparison: **Split Batch (+0.8% cost, partial 40 units first)**, **Additional Shift (+4.2%, recover 2 days)**, **Outsource Assembly (+7.5%, recover 3 days)** — and approving one visibly updates graph, dates, and customer portal.

### 7.3 F7 — Factory Memory

**Description.** Every completed job teaches the system. ManuOS stores per-operation history: planned vs actual durations, materials that were problematic, rework causes, which routing version worked. When a similar new job appears (matched by part type, material, operation type, machine class), Factory Memory surfaces data-backed recommendations: *"This bracket family ran 3 times; bending averaged +18% over estimate; routing revision 2 was on-time — recommend revision 2 and padding bending by 15%."*

**User stories**
- As a **PPIC planner**, when planning a similar job, I want historical evidence so my estimates stop repeating old mistakes.
- As an **Owner**, I want the factory's operational knowledge to survive employee turnover.

**Functional requirements**
- FR-7.1 History store: per operation type / part family / material / machine class aggregates (count, mean actual vs planned ratio, rework rate, top defect causes)
- FR-7.2 Similarity matcher (deterministic): tags/attributes overlap scoring between a planned task and history
- FR-7.3 Memory card on task/MO detail: matches found, key stats, recommended adjustment (deterministic math)
- FR-7.4 Gemini narrative: turn stats into a recommendation sentence + "why" with numbers
- FR-7.5 Recovery outcomes (F4 approvals) and QC results also written to memory (learning loop)

**Acceptance criteria**
- Demo data seeds ≥3 historical runs of the "bracket bending" family with +15–20% overruns; planning view surfaces the recommendation with numbers; Gemini restates it accurately.

### 7.4 F10 — Skill-Aware Dispatch

**Description.** Assignments consider **competence, not availability alone**. Each technician has a skill profile (skills with levels, certifications, machine affinities) and a track record (on-time %, QC pass rate on similar ops). For each open task, the system computes a fit score across skill match, certification requirement, current workload, and historical success — then ranks candidates with a visible rationale. If the best-fit person is busy, it proposes alternatives including pairing a junior with a senior (mentoring).

**User stories**
- As a **Supervisor**, I want the system to tell me the best technician for this welding op and why — including certification gaps.
- As an **Owner**, I want critical operations to stop failing because "whoever was free" did them.

**Functional requirements**
- FR-10.1 Technician model: skills `{name, level 1–5}`, certifications `{name, validUntil}`, machine affinities, workload (assigned hours this week), track record `{onTimePct, qcPassPct}` (seeded)
- FR-10.2 Task requirements: required skill + min level, required certification, machine class
- FR-10.3 Fit scoring (deterministic, weighted): `0.35·skill + 0.25·certification + 0.2·workload availability + 0.2·track record`
- FR-10.4 Dispatch board: open tasks × ranked candidates, rationale chips ("Certified welder L4", "QC pass 97% on CNC-mill", "Busy until Thu — pair with junior option")
- FR-10.5 Gemini explanation on demand: why candidate A over B, in one paragraph, grounded in scores
- FR-10.6 One-click assign → updates workload and graph; assignment logged
- FR-10.7 Skill-gap indicator: if no qualified candidate exists → flags gap and links to Future Roadmap (LMS teaser, see §9.3)

**Acceptance criteria**
- Demo task "Certified structural weld, WABO cert required": system ranks 3 technicians, excludes the uncertified one with reason, recommends senior (95% QC) over junior; rationale visible.

### 7.5 F12 — Factory Network: Supply & Demand Ecosystem (simulated)

**Description.** Every company on the ManuOS platform is inside **one supply chain loop**. With **explicit consent**, factories can (1) **share capacity** — subcontracting jobsheets to partners when overloaded or recovering — and (2) **trade supply & demand** — sourcing materials, components, semi-finished and standard parts from member factories, or publishing their own supply offers to monetize idle capability. Roles are fluid: a factory that produces for others today may buy from them next month; members act as **producers and consumers in the same ecosystem**. The prototype simulates ≥3 partner factories (plus the demo tenant) with capability profiles *and* supply offers / sourcing needs. Matching is deterministic (consent → capability/part match → availability/lead time → rate); deals are RFQ-style and approved by both sides. No factory's data is exposed without opt-in (consent-first design).

**User stories**
- As an **Owner** with an overloaded week, I want the system to propose vetted partner factories for a specific jobsheet, with cost/time estimates.
- As an **Owner / Purchasing** facing a material shortage or an unreliable external supplier, I want the system to find **member factories that produce or stock what I need** — with lead time and rate — so my production graph keeps moving.
- As an **Owner** with idle capability or sellable components, I want to publish supply offers and receive inbound demand from the ecosystem.
- As a **Partner factory**, I want to accept/decline inbound capacity or supply requests and keep my other data private.

**Functional requirements**
- FR-12.1 Factory profiles (seeded): id, name, capabilities[], machineClasses[], certifications[], availableHours/week, rate index, **supply offers** (parts/components suppliable, lead time), **sourcing needs**, role badge (Producer/Consumer/Both), **consent flags** (shareCapacity, shareSupply: on/off)
- FR-12.2 Network matchers (deterministic): **capacity matcher** (required process/cert vs partner profile × availability) and **supply matcher** (required part/material vs supply offers × lead time × rate) — both consent-gated
- FR-12.3 Deal object: `{dealType: SUBCONTRACT|SUPPLY, fromFactoryId, toFactoryId, target (jobsheet | material requirement), estFinish|leadTimeDays, costImpact, consentBasis, status}`; approve/decline both sides
- FR-12.4 Network map view: factories as nodes with role badges; two link types (capacity / supply), active & proposed, animated
- FR-12.5 Gemini: deal-fit narrative + risk notes (e.g., "Partner B has CNC-mill class and QC cert; 210 h free" / "Nusantara Metalcraft stocks your terminal-block spec; 3-day lead; no public track record on this part")
- FR-12.6 "Outsource Assembly" recovery option in F4 originates from the capacity matcher; **material-delay recovery can originate from the supply matcher** ("source from network") — features interlock
- FR-12.7 Supply deals update the buyer's material ETA and unblock affected tasks (feeds back into F3 ripple/CPM recalculation)
- FR-12.8 **Workflow-aware network matching**: capacity/supply matching considers the buyer's workflow step requirements (process, certification, QC needs) generated by F13 — partners are matched to *steps*, not just factories
- FR-12.9 **Ecosystem onboarding**: a new member's workflows can be AI-generated from their order types (F13) — optionally seeded from proven ecosystem templates (Factory Memory) — so joining the network is fast, growing the loop for everyone

**Acceptance criteria**
- Demo shows ≥3 partner factories; a consent-off factory is excluded with visible reason; approving a **subcontract** updates the plan and the graph shows cross-factory handoff edges; approving a **supply deal** (terminal blocks from a member factory) updates the material ETA, unblocks the assembly task, and re-runs ripple/CPM with a recovered ETA — and the map shows one member acting as **supplier in one deal and capacity consumer in another**, proving the ecosystem loop.

---

## 8. Feature Specifications — Supporting Features

Present in the prototype at "demoable-lite" fidelity. They make the platform feel whole; they are not the hero moments.

### 8.1 F1 — AI Production Brain

**Description.** A global assistant panel ("Ask ManuOS") that answers natural-language questions about the **live production state** — available in Owner and Supervisor views. The Brain never mutates state; it summarizes, explains, and links to the right screen.

**Functional requirements**
- FR-1.1 Assistant panel (right-side drawer) with text input + 3 seeded question chips: *"Which orders are at risk this week?"*, *"If I accept a 200-unit order, can we finish by the 25th?"*, *"What is machine CNC-02's health?"*
- FR-1.2 Context builder (deterministic): serialize a capped live snapshot — orders (status, ETA deviation, risk), open blockers, machine loads/health, material statuses, technician workload summary — as structured JSON
- FR-1.3 Gemini Q&A over the snapshot; answers must cite only snapshot facts; each answer renders with an "AI" badge and evidence chips (the order/machine ids it referenced)
- FR-1.4 Every answer includes a deep link to the most relevant screen (e.g., a risk answer → Factory Command Center)
- FR-1.5 Read-only guardrail: no action buttons in answers; the Brain cannot modify the store
- FR-1.6 Fallback: if Gemini is unavailable, the deterministic snapshot itself renders as a "State summary" panel

**AI division of labor**
- Deterministic: snapshot serialization, risk list, capacity summary — pre-computed and injected into the prompt
- Gemini: question understanding + grounded narrative + screen recommendation

**Acceptance criteria**
- A seeded chip question returns an answer whose every claim maps to visible app state (spot-checkable); the deep link opens the correct screen; with AI disabled, the state summary still renders.

### 8.2 F2 — Promise Engine

**Description.** A "Can we promise this?" check that runs **before** a date is committed. Given a prospective order, it computes the earliest feasible completion from real capacity and material lead times, and presents a commitment card with honest confidence and alternatives.

**Functional requirements**
- FR-2.1 Modal in Owner/Sales context with inputs `{part family, qty, required date}` + optional material selection
- FR-2.2 Deterministic feasible-date computation (capacity engine): current load per machine class → earliest free slots → CPM chain estimate for the family's routing + material lead times → earliest feasible date + confidence (high/medium/low from slack margin)
- FR-2.3 Comparison vs. requested date with a day-delta badge (green if feasible, red if not)
- FR-2.4 Gemini narrative: explain the drivers (bottleneck machine class, material ETA) and offer alternatives — partial delivery, overtime shift, subcontract via F12 — each with cost deltas from the deterministic cost engine
- FR-2.5 Output **commitment card**: `Feasible: Nov 27 (high confidence) · Requested: Nov 25 · Alternatives: partial 60 units by Nov 25 (+0.9%) · overtime (+4.2%) · subcontract (+7.5%)`
- FR-2.6 Read-only: the card may be saved as a note on a draft order; no state mutation

**AI division of labor**
- Deterministic: feasible date, confidence, bottleneck identification, alternative cost deltas
- Gemini: driver explanation and alternatives narrative (grounded in computed numbers)

**Acceptance criteria**
- A 200-unit request against the seeded overloaded week returns a feasible date **later** than requested, correctly names the bottleneck machine class, and shows ≥2 alternatives whose cost deltas match the cost engine.

### 8.3 F5 — AI Engineering Copilot

**Description.** The intake flow that turns a pasted RFQ or drawing notes into a structured, reviewable production draft — with ambiguities flagged as questions rather than guessed.

**Functional requirements**
- FR-5.1 Intake screen (S7) with a large textarea for RFQ/drawing text (file upload = optional stretch, not required)
- FR-5.2 Gemini structured extraction (JSON schema): customer, part name, qty, material, key dimensions/tolerances, required finish, **detected ambiguities[]**, draftBOM[] (item, qty, unit), draftRouting[] (operation, machineClass, estHours), qcChecklist[] (check, method)
- FR-5.3 Ambiguity list rendered as highlighted question cards ("Tolerance not specified — ask customer") — never auto-filled
- FR-5.4 Engineering review step: editable draft fields in a side-by-side diff — human corrections visible before anything is created (human-in-the-loop made visible)
- FR-5.5 On confirm: create Order (DRAFT) + jobsheet drafts on the graph; unresolved ambiguities become customer-question items on the order
- FR-5.6 Workflow step: pick an existing order type **or generate one** (F13) on the same flow

**AI division of labor**
- Gemini (pro model): extraction + ambiguity detection from raw text, schema-constrained
- Deterministic: schema validation, field type checks · Humans: corrections + confirmation

**Acceptance criteria**
- Pasting the seeded sample RFQ returns a draft with ≥6 BOM/routing fields correct, flags ≥2 genuine ambiguities, and nothing is created until the reviewer confirms.

### 8.4 F8 — Manufacturing Passport

**Description.** A per-unit digital passport: a QR identity that opens the full history of a produced unit — materials, operations, people, QC, sign-offs — as traceability proof for the factory and (reduced) for customers.

**Functional requirements**
- FR-8.1 QR code generated in-app per finished unit serial (pure client-side rendering, no external service)
- FR-8.2 Passport view: serial, order, material lots used, operation steps (operator, machine, timestamp), QC results per check (pass/fail + defects), handoff history, final sign-off block
- FR-8.3 Vertical timeline layout with status-colored steps; rework steps visibly marked
- FR-8.4 Customer-portal variant: reduced field set (progress evidence + QC docs + sign-off only), respecting permission
- FR-8.5 Seed includes ≥4 passports, one containing a failed-then-reworked QC step visible in the timeline
- FR-8.6 Entry points: order detail (unit list), Workstation (after recording a completed op), and the QR scan simulation

**AI division of labor**
- Deterministic: passport assembly from store data; no AI required (optional: Gemini one-paragraph unit summary at top, labeled AI)

**Acceptance criteria**
- Opening the seeded reworked-unit passport shows the full chain including the failed QC step and its rework loop — proof of traceability.

### 8.5 F13 — AI Dynamic Workflow Generation

**Order-type-driven universality.** Every manufacturer defines order types (e.g., Regular, Final Part, or custom types they invent); ManuOS generates the production workflow for that type — the DAG of departments and nodes, dependencies, fan-outs (one drawing → multiple operations → production + QC jobsheet pairs), and loop-backs (rework, returns → urgent engineering revision, subcontract results re-entering QC).

**Functional requirements**
- FR-13.1 Order-type setup screen: name + free-text description (e.g., *"hydraulic cylinder overhaul"*), optionally seeded from an existing template
- FR-13.2 Gemini structured output drafts the workflow config — nodes `[{id, type, dept, requires{skill, cert, machineClass}}]`, edges `[{from, to, condition?}]`, transitionRules[], warnings[] — from the order-type description + company profile + proven templates
- FR-13.3 Deterministic validation (`workflow-validate.ts`): topological sort (no cycles), no orphan nodes, required-role coverage (every required department reachable); invalid → rejection reasons returned, up to 2 AI redrafts
- FR-13.4 Preview: the valid draft DAG renders live on the Manufacturing Graph view **before** publication
- FR-13.5 Human approval gate: template becomes `WorkflowTemplate(active)`; new orders of this type instantiate it (selectable in intake S7)
- FR-13.6 Workflow-aware network matching (with F12): generated step `requires` feed the capacity/supply matchers (FR-12.8) and ecosystem onboarding (FR-12.9)

**AI division of labor**
- Gemini: draft DAG config + warnings from the order-type description · Deterministic: validation, instantiation, matching integration · Human: approval before activation

**Acceptance criteria**
- A new order-type description yields a valid DAG in ≤2 AI attempts; a deliberately broken draft (e.g., a cycle) is caught with a clear reason; approving the template makes it selectable in the intake flow.

---

## 9. Future Roadmap (Mentioned, Not Built)

Must be **explicitly mentioned** in the deck and in-app "Roadmap" teaser. These demonstrate scalability beyond the prototype (judging sub-criterion).

### 9.1 F6 — Visual Quality Intelligence

Technicians photograph parts with a smartphone; Gemini vision checks visually-assessable characteristics (missing components, wrong positions, label mismatches, defined surface defects). Precise dimensions and internal quality still require proper gauges/tests. QC documentation and visual inspection live in one workflow, with AI results verified by the inspector.

### 9.2 F9 — Profit Leakage Radar

Compares estimated vs actual cost per order — labor, material, machine hours, scrap, rework, outsourcing — and explains the largest variance drivers, feeding better quotes for the next similar job. (Builds on the same estimate-vs-actual store as Factory Memory.)

### 9.3 RAG + AI-Based LMS — The Competency Engine (extension of F10)

The flywheel that closes Skill-Aware Dispatch's biggest gap:

```
   Skill-Aware Dispatch (F10)  ──►  Skill Matrix
          │ gap analysis              (kept current)
          ▼                               ▲
   Required vs available skills      Certification
          │                               ▲ (human-approved)
          ▼                               │
   RAG over Factory Memory (F7) ──► AI-Based LMS:
   (SOPs, proven work instructions,   auto-generated training
    historical jobsheets, QC records) modules + assessments
```

- **Gap detection:** dispatch data reveals recurring competency bottlenecks ("welding ops slip because only one certified tech exists")
- **RAG layer:** retrieves the company's own proven knowledge (Factory Memory: SOPs, best-performing work instructions, QC learnings) as grounding
- **AI-Based LMS:** generates personalized training modules and certification paths from the gaps; certification results are recorded by human assessors and flow back into the skill matrix — making every future dispatch decision smarter
- Gen AI role: content generation grounded by RAG over the company's operational knowledge — a meaningful, non-superficial AI application

---

## 10. System Architecture

### 10.1 High-level

```
┌────────────────────────────────────────────────────────────────────┐
│  Next.js (App Router) — built in Google AI Studio / Antigravity    │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │
│  │ Persona Views │  │ Manufacturing │  │ Deterministic Engines   │ │
│  │ Command Center│  │ Graph State   │  │ · CPM (critical path)   │ │
│  │ Orchestrator  │  │ (Zustand store│  │ · Ripple analyzer (BFS) │ │
│  │ Workstation   │  │  + seed data) │  │ · Capacity simulator    │ │
│  │ Customer Port.│  │               │  │ · Skill-fit scorer      │ │
│  │ Network Map   │  │               │  │ · Cost estimator        │ │
│  └──────────────┘  └───────────────┘  │ · Similarity matcher    │ │
│         │                   │         └───────────┬─────────────┘ │
│         └───────── API routes (server-only) ──────┤               │
│                                    ┌──────────────▼─────────────┐ │
│                                    │  Gemini (Google Gen AI SDK)│ │
│                                    │  · explain impact (F3)     │ │
│                                    │  · propose recovery (F4)   │ │
│                                    │  · recommendations (F7)    │ │
│                                    │  · dispatch rationale(F10) │ │
│                                    │  · RFQ extraction (F5)     │ │
│                                    │  · partner fit (F12)       │ │
│                                    │  · brain Q&A (F1)          │ │
│                                    │  · workflow gen (F13)     │ │
│                                    └──────────────┬─────────────┘ │
└───────────────────────────────────────────────────┼───────────────┘
                                        Human approval gates
                                        on every mutation from AI
                                                    │
                                    ┌───────────────▼───────────────┐
                                    │  Google Cloud Run (container) │
                                    │  Env: GEMINI_API_KEY (secret) │
                                    └───────────────────────────────┘
```

### 10.2 The AI pattern (critical for judging — 40% weight)

**Hybrid intelligence, auditable by design:**

1. **Deterministic engines own the math.** Graph traversal, CPM, capacity, cost, scoring — all TypeScript functions with unit-testable outputs. AI never invents numbers.
2. **Gemini owns language, explanation, and ideation.** Every Gemini call receives *structured machine context* (JSON produced by the engines) and returns *structured JSON* (schema-constrained) plus human-readable narrative. Narrative must cite only provided facts.
3. **Humans own the decisions.** Recovery plans, copilot drafts, dispatch suggestions, subcontract & supply deals — all require explicit approval before mutating state.

This pattern is also the scaling story: deterministic cores stay cheap and reliable as usage grows; Gemini is invoked where language intelligence adds value.

### 10.3 Gemini integration spec

- SDK: `@google/genai` (Google Gen AI SDK), server-side only, key from `process.env.GEMINI_API_KEY` (Cloud Run secret)
- Default model: `gemini-2.5-flash` (fast, cheap, good structured output); `gemini-2.5-pro` optional for copilot extraction quality; note Gemma as on-GCP option for future self-hosting
- All generative endpoints use **responseMimeType: "application/json"** with a response schema per use case (impact explanation, recovery options, memory recommendation, dispatch rationale, RFQ extraction, partner fit)
- Every prompt includes a "grounding contract": *only use the provided context; if data is missing, say so — do not fabricate*
- Graceful degradation: if the API is unavailable, deterministic outputs still render (numbers, panels) with a "AI narrative unavailable" badge — the app never breaks without LLM

### 10.4 Deployment (Cloud Run)

- Build the Next.js app standalone (`output: 'standalone'`), containerize (the existing ManuOS Dockerfile pattern already produces exactly this), push to Artifact Registry, deploy to Cloud Run
- `GEMINI_API_KEY` as a Cloud Run secret; never bundled client-side
- Alternative path if building in AI Studio: use its deploy flow to Cloud Run; Antigravity exports a standard repo → Cloud Build → Cloud Run
- Health endpoint `/api/health` for Cloud Run readiness

### 10.5 Data & state strategy for the prototype

- **Seed-on-load**: a rich, authored dataset (see §13) loaded into a Zustand store (client) — deterministic engines run in-browser, instant demos
- Gemini calls route through Next.js API routes (keeps the key server-side)
- Optional: persist approvals/recoveries to an in-memory server store so a judge's changes survive navigation within a session (not across cold starts — acceptable and honest for a prototype)

---

## 11. Data Model (Prototype)

Simplified from the production ManuOS schema (22 models) to what the demo needs, **plus new entities for skills, recovery, and network**.

```
Factory        { id, name, capabilities[], machineClasses[], certifications[],
                 supplyOffers[], sourcingNeeds[], roleBadge,
                 availableHoursPerWeek, rateIndex,
                 consentShareCapacity, consentShareSupply }
Order          { id, number, customerName, qty, dueDate, status,
                 plannedQty, completedQty, qcPassedQty, promisedDate, riskLevel,
                 orderType, workflowTemplateId }
ManufacturingOrder { id, orderId, name }
Jobsheet       { id, moId, name, partFamily, status }
Task           { id, jobsheetId, name, operationType, machineClass, machineId?,
                 requiredSkill{ name, minLevel }, requiredCert?,
                 plannedHours, actualHours?, status,
                 dependsOn: taskId[], plannedQty, completedQty, qcPassedQty,
                 earliestStart/Finish, latestStart/Finish, totalSlack, isCritical }
Machine        { id, factoryId, code, machineClass, capacityHoursPerDay, status,
                 cumulativeRuntimeHours }
Material       { id, partNumber, name, supplier, status: IN_STOCK|ORDERED|DELAYED,
                 etaDate, requiredByTaskIds[] }
Technician     { id, factoryId, name, skills[{ name, level }],
                 certifications[{ name, validUntil }], machineAffinities[],
                 assignedHoursThisWeek, onTimePct, qcPassPct }
QCRecord       { id, taskId, unitSerial, checked, passed, defects[] }
HistoryEntry   { id, partFamily, operationType, material, machineClass,
                 plannedHours, actualHours, reworkCount, topDefectCause,
                 routingVersion, onTime }
RecoveryPlan   { id, orderId, triggerEvent, options[{
                   type: SPLIT_BATCH|ADD_SHIFT|REROUTE|REASSIGN|SUBCONTRACT,
                   title, description, timeRecoveredDays, costImpactPct,
                   capacityImpact, risks[], feasible, infeasibleReason? }],
                 chosen?, approvedBy?, approvedAt?, outcomeNote? }
NetworkDeal    { id, fromFactoryId, toFactoryId,
                 dealType: SUBCONTRACT|SUPPLY, target,
                 estFinish|leadTimeDays, costImpact,
                 status: PROPOSED|ACCEPTED|DECLINED }
Passport       { unitSerial, orderId, materialLots[], steps[{ op, tech, machine,
                 at, qc? }], finalSignOff }
KnowledgeEntry (future RAG) — represented in prototype by HistoryEntry
WorkflowTemplate { id, orderType, nodes[{id,type,dept,requires}],
                 edges[{from,to,condition}], generatedBy: AI|USER,
                 validated, approvedBy? }
```

**Key computed values (deterministic engines):** critical path & slack (CPM — port from ManuOS `src/lib/critical-path`), ripple sets, feasible dates, fit scores, cost deltas, similarity scores.

---

## 12. UX & Screen Specifications

### 12.1 Design system

- Tailwind + shadcn/ui-style components (what AI Studio scaffolds natively); light professional theme; status colors: green (healthy) / amber (watch) / red (at-risk/blocked) / blue (info)
- Every AI-generated text block carries a subtle **"AI" chip** and every engine number a **"computed" tooltip** — transparency as a design principle
- All UI copy in **English**

### 12.2 Navigation

Top bar: persona switcher (Owner / Supervisor / Technician / Customer) + global "Ask ManuOS" assistant + "Simulate event" disruption menu (demo control). Left rail changes per persona.

### 12.3 Screen specs

**S1 — Factory Command Center (Owner)**
- KPI row: orders at risk (red/amber), on-time %, units completed vs QC-passed (the "real progress" metric), open blockers, active recoveries
- Order risk cards: order, promised vs predicted date, deviation days, open blockers, "AI Insight" line (Gemini, grounded)
- Recovery hub: pending approvals with option comparison (see S6)
- Roadmap teaser strip (Visual QC · Profit Radar · LMS) — clearly labeled "Future"

**S2 — Production Orchestrator (Supervisor)**
- Tabs: **Graph** ( Manufacturing Graph DAG: Order → MO → Jobsheet → Task nodes; critical path bold red; disruption highlights; cross-factory edges for capacity subcontracts & supply deals) · **Gantt** (timeline with slack visualization, drag to reschedule) · **Kanban** (7 columns incl. IN_TRANSIT; critical-path badges 🔥; slack chips)
- Dispatch board (F10): open tasks × ranked technician candidates with rationale chips; skill-gap flags
- Disruption injector: material delay / machine down / task overrun dialogs

**S3 — My Workstation (Technician)**
- "My tasks today" queue with instructions, materials needed, machine, est. hours; clock in/out (visual)
- Skill profile: my skills/levels, certifications with expiry, suggested training (labeled Future/LMS teaser)
- QR/passport step: scan-to-record a completed op with photo placeholder (no real camera needed for demo)

**S4 — Order Intelligence Portal (Customer)**
- Order list (only own orders) → detail: quantity-true progress (done & QC-passed units), predicted completion with confidence, Gantt-lite of their order, milestones, QC evidence docs, comments/approvals
- Promise-change acknowledgment: if a recovery altered the plan, customer sees options chosen (e.g., partial shipment) and acknowledges

**S5 — Factory Network (Owner)**
- Map of ≥3 factories with role badges (Producer/Consumer/Both); consent indicators; two link types: capacity subcontracts & supply deals
- Tabs: **Capacity** (subcontract when overloaded/recovering) · **Supply & Demand** (source materials/components from members — or publish your own supply offers for idle capability)
- Partner cards: capability match %, free hours, rate index, certifications, supply offers with lead times
- Proposal flow: pick jobsheet **or sourcing need** → matched partners → propose → partner-side accept/decline simulation

**S6 — Recovery Studio (modal/full-screen from S1/S2)**
- The hero screen: disruption summary (left), Gemini impact narrative, option cards side-by-side — **Split Batch / Additional Shift / Outsource Assembly** style — each with time recovered, cost ±%, capacity impact, risks, feasibility badge; Approve → applies and confirms what changed

**S7 — New Order Intake (Sales/Owner)**
- Paste RFQ → copilot extraction (F5) → engineering review diff → create order; Promise Engine commitment card (F2) on the same flow
- Workflow step: pick an existing order type **or generate a new one** (F13) — the AI-drafted DAG is previewed on the graph and approved before the order enters planning

### 12.4 Accessibility & UX quality (10% judging)

- Keyboard-navigable primary flows; visible focus states; color + icon + text for statuses (never color alone); min 4.5:1 contrast; responsive down to tablet

---

## 13. Demo Data & End-to-End Scenario

### 13.1 Seed dataset (authored, deterministic)

- **4 factories**: "Demo Precision Works" (the tenant — capacity seeker *and* material buyer), "Nusantara Metalcraft" (consent ON — supplies terminal blocks & standard parts), "Batam CNC Hub" (consent ON — CNC capacity provider), "Silent Shop" (consent OFF — demonstrates consent-first)
- **6 orders** across statuses; hero order **#CO-2026-1042 — Custom Control Panel, 120 units**, in production, promised Nov 25, currently 68% real progress (82 done, 78 QC-passed)
- Its graph: 2 MOs → 5 jobsheets → 14 tasks with dependencies incl. parallel machining + assembly + QC; critical path through CNC machining → assembly → final QC
- **8 machines** across classes (CNC-mill, CNC-lathe, weld, assembly bench, QC station) with capacity hours and runtime
- **10 materials**; hero: *terminal blocks — external supplier delay +2 days* (network alternative: Nusantara Metalcraft produces them, 3-day lead), required by assembly task
- **6 technicians** with skills/certs — exactly one uncertified-but-free welder (drives F10 story), one senior certified welder busy until Thursday, one CNC junior with 88% QC
- **History**: 3× "bracket bending" runs (+15%, +18%, +21% over estimate; routing rev 2 on-time), 2× "panel assembly" runs, misc
- 2 prior recovery plans (approved) and their outcomes
- Passports for 4 finished units incl. one with rework history

### 13.2 The end-to-end demo scenario (authored, repeatable)

1. Owner opens Command Center → healthy overview, one amber order
2. Supervisor injects **"Terminal blocks delayed +2 days"**
3. F3: graph lights up — 3 tasks blocked, critical path shifts, order #1042 ETA +3 days; Gemini explains: cause, blast radius, still-runnable work
4. F4: Recovery Studio → three feasible options (Split Batch +0.8% / Additional Shift +4.2% recover 2d / Outsource Assembly +7.5% recover 3d — the last sourced from F12 matcher) → approve **Split Batch** → plan, quantities, and customer ETA update; approval logged
5. F7: opening the next planned jobsheet shows Factory Memory card: bending +18% historical overrun, recommend routing rev 2 with 15% padding
6. F10: dispatch the critical weld op → senior ranked first with rationale; uncertified tech excluded with reason; junior-pairing alternative offered
7. F12: Network map — the subcontract link from step 4, plus the flip side: sourcing the delayed terminal blocks from Nusantara Metalcraft (a member factory that produces them); approving the **supply deal** updates the material ETA and unblocks the assembly task
8. Customer portal: #1042 shows partial-shipment plan, quantity-true progress, honest ETA — acknowledged
9. (30s) F13 generates a workflow for a new order type on the fly + F1 Brain Q&A + F2/F5 quick hits, and the Future Roadmap strip (Visual QC · Profit Radar · RAG+LMS)

---

## 14. 3-Minute Demo Video Script

| Time | Beat | On screen | Narration (EN) |
|---|---|---|---|
| 0:00–0:15 | Hook | B-roll: spreadsheet chaos → ManuOS logo | "Custom factories lose days reacting to disruptions they saw too late. ManuOS is the operating system that sees them first." |
| 0:15–0:35 | Setup | S1 Command Center | "One graph connects orders, materials, machines, skills — and progress means units that passed QC, not cards moved." |
| 0:35–1:05 | F3 Impact | S2 Graph + inject delay; red ripple; Gemini explanation | "A supplier slips two days. Instantly: what's blocked, what still runs, the new critical path — explained in plain language, grounded in computed facts." |
| 1:05–1:50 | F4 Recovery | S6 Recovery Studio; approve Split Batch; dates update | "ManuOS drafts recovery options with real trade-offs — validated by deterministic simulation. A supervisor approves; the plan, quantities, and the customer promise update together." |
| 1:50–2:10 | F7 Memory | Memory card on jobsheet | "The factory remembers: this bending op historically runs 18% over — so it recommends the routing that worked, with padding." |
| 2:10–2:30 | F10 Dispatch | Dispatch board ranking | "Assignments follow skill, certification, and track record — with reasons, not guesses." |
| 2:30–2:45 | F12 Network | S5 map: subcontract + supply links | "When we're overloaded, partners absorb the work; when materials run short, partners supply them. Every factory on the platform is inside the supply chain loop — an ecosystem, not a marketplace." |
| 2:45–3:00 | Close | Customer portal → logo → "Built with Gemini on Google Cloud" | "From order to delivery: understood, predicted, orchestrated. ManuOS — Manufacturing Intelligence. Future roadmap: visual QC, profit radar, and AI-generated training that closes skill gaps." |

---

## 15. Competition Compliance & Judging Alignment

### 15.1 Compliance checklist (AI Builder Cup 2026)

- [x] Theme: **Manufacturing: Intelligent Operations & Industrial Efficiency** — "transform operational data into meaningful insights, recommendations, or actions" (= Understand/Orchestrate/Learn/Network)
- [x] Google AI models: **Gemini** (2.5-flash / 2.5-pro) via Google Gen AI SDK; Gemma noted as future self-host option
- [x] Deployed on **Google Cloud Run** (standalone Next.js container)
- [x] Working prototype (not a mockup): deterministic engines + live Gemini calls + approval flows
- [x] Proposal: this deck → exported to **PDF**
- [x] Documentation: public **3-minute video** (script §14)
- [x] Category stated: Manufacturing
- [x] All materials **in English**

### 15.2 Judging criteria mapping (weights)

| Criterion | Weight | How ManuOS wins it |
|---|---|---|
| Technical Merit & Gen AI | 40% | Gen AI is structural, not cosmetic: 8 distinct Gemini functions (impact explanation, recovery ideation, memory narrative, dispatch rationale, partner fit, RFQ extraction, brain Q&A, workflow generation), schema-constrained outputs, grounded in deterministic engines; human approval gates; scalability story (cheap deterministic core + Gemini where language adds value; AI-generated workflows per order type make the platform adaptable to any manufacturing company) |
| Problem Alignment & Impact | 25% | Real pains from 10-department interviews at a custom fabricator; every hero feature maps to a named pain; customer-facing impact visible |
| Innovation & Creativity | 25% | The five-feature combination (dependency intelligence + self-healing + memory + skill dispatch + consented supply & demand network) has no single-product equivalent at SME price; consent-first network design; "real progress = QC-passed units" reframe |
| UX & Solution Design | 10% | Four persona-specific views; transparency design (AI chip vs computed badge); accessible, English, demo-persona switcher for judges |

---

## 16. Build Plan for Google AI Studio / Antigravity

### 16.1 Strategy

Build fresh in **Google AI Studio** (React/Next.js app it scaffolds) — the ManuOS repo is the *reference implementation*: port the CPM algorithm and reuse schema/UI patterns from it rather than rebuilding from scratch. **Antigravity** is the alternative/parallel environment when multi-file agentic control is needed (it is also our IDE for refinements + Cloud Run deploy).

### 16.2 Phased plan (each phase = one iteration session)

| Phase | Deliverable | Exit test |
|---|---|---|
| **P0 — Scaffold** | App shell, persona switcher, routing, design tokens, empty views | Switch personas, nav works |
| **P1 — Graph & Data** | Types + seed dataset (§13.1) in a Zustand store; Graph view renders the full DAG with statuses | 14-task graph renders, critical path bolded |
| **P2 — Engines** | CPM (port from ManuOS), ripple analyzer, capacity/feasible-date, skill-fit scorer, cost deltas, similarity matcher — pure TS + unit sanity checks | Inject delay → correct blocked set + ETA deltas without any AI |
| **P3 — Hero flows** | Impact panel + Recovery Studio + approve/apply; dispatch board; memory cards; network matcher + map | Full §13.2 scenario works with AI narrative slots empty |
| **P4 — Gemini layer** | API routes + `@google/genai`; 7 schema-constrained functions; graceful degradation; AI/computed badges | All narratives render from live state; kill the key → app still works |
| **P5 — Supporting** | Brain panel, Promise modal, Copilot intake, Passport view, customer portal, **workflow generator (F13)**, roadmap strip | §6.2 fidelities met |
| **P6 — Deploy & polish** | Standalone build → container → Cloud Run; secret env; health check; accessibility pass; demo rehearsal | Public URL; §5.2 checklist all green |

### 16.3 Master build prompt (paste into AI Studio to start P0–P1)

> Build a Next.js App Router + Tailwind + shadcn-style web app called **ManuOS — Manufacturing Intelligence**. It is a demo prototype for custom make-to-order factories, with four persona views switched from a top bar: Owner (Factory Command Center), Supervisor (Production Orchestrator), Technician (My Workstation), Customer (Order Intelligence Portal), plus a Factory Network view. Create TypeScript types for: Factory, Order, ManufacturingOrder, Jobsheet, Task (with dependsOn[], planned/completed/qcPassed qty, CPM fields), Machine, Material, Technician (skills with levels, certifications, workload, track record), QCRecord, HistoryEntry, RecoveryPlan, NetworkDeal (dealType: SUBCONTRACT or SUPPLY; fromFactoryId, toFactoryId, target, estFinish or leadTimeDays, costImpact, status), Passport, WorkflowTemplate (orderType, nodes, edges, generatedBy, validated, approvedBy). Seed one authored demo dataset: hero order #CO-2026-1042 "Custom Control Panel" 120 units with 2 MOs, 5 jobsheets, 14 dependency-linked tasks, 8 machines, 10 materials (one delayed), 6 technicians, 3 similar part-family history entries, and 3 partner factories with consent flags, supply offers, and sourcing needs. Store state in Zustand. Render the Supervisor's Graph tab as a left-to-right DAG (Order → MO → Jobsheet → Task) with node status colors and a bold red critical path. All UI in English, professional light theme, accessible contrast, and a top-bar "Simulate event" menu (disabled placeholder for now).

Subsequent iterations: feed the engine specs (§7 FR lists) one phase at a time; keep prompts scoped per phase; paste §10.3 verbatim when adding the Gemini layer so the model grounding contract is preserved.

### 16.4 Feature prompt pack (paste one block per AI Studio iteration)

Each block compresses that feature's FR list into a build prompt. After the phase scaffold exists, paste the relevant block as the iteration prompt.

**F3 — Production Dependency Intelligence**
> Add a "Simulate event" menu to the top bar with three dialogs: material delay (material, +days), machine down (machine, duration), task overrun (task, +hours). Implement a ripple analyzer over the task/material dependency graph: from the event source compute the blocked set (downstream dependents), the still-runnable set, and per-order ETA deltas by re-running CPM. Show an Impact panel: affected orders with severity, blocked vs runnable tasks, ETA-delta badges; highlight affected nodes red/orange on the Graph tab. Add API route `/api/ai/explain-impact` that takes the computed ripple facts and returns `{summary, cause, blastRadius[], watchItems[]}` — schema-constrained, grounded only in provided facts — rendered with an "AI" badge.

**F4 — Self-Healing Production**
> Add a Recovery Studio modal opened from the Impact panel ("Generate recovery options"). Route `/api/ai/recovery-options` returns 2–4 candidates `{type: SPLIT_BATCH|ADD_SHIFT|REROUTE|REASSIGN|SUBCONTRACT, title, description, timeRecoveredDays, costImpactPct, capacityImpact, risks[]}`. Validate each candidate deterministically against machine capacity and partner availability (infeasible options greyed with reason). Show options side-by-side with a recommendation badge; Approve applies the chosen option to the store (shift dates, split quantities, reassign), writes an approval record {who, when, option, why}, updates the customer-visible ETA, and logs a memory entry.

**F7 — Factory Memory**
> Add HistoryEntry aggregates (per part family × operation × machine class: count, mean actual/planned ratio, rework rate, top defect). Implement a similarity matcher scoring a planned task against history by tag overlap. Render a Memory card on jobsheet/task detail: matches found, key stats, and a deterministic recommended adjustment (e.g., pad estimate +15%, use routing rev 2). Route `/api/ai/memory-recommend` turns the stats into a one-sentence recommendation with the numbers — grounded only in provided stats.

**F10 — Skill-Aware Dispatch**
> Add a Dispatch board tab to the Supervisor view: open tasks × ranked technicians. Fit score = 0.35 skill match + 0.25 certification + 0.20 workload availability + 0.20 track record; hard-exclude uncertified candidates with a visible reason. Render rationale chips per candidate ("Certified welder L4", "QC pass 97%", "Busy until Thu — pair-junior option"). Route `/api/ai/dispatch-rationale` explains candidate A vs B in one paragraph. One-click Assign updates workload and the graph and logs the assignment. If no candidate qualifies, show a skill-gap flag linking to the roadmap teaser.

**F12 — Factory Network (supply & demand ecosystem)**
> Build a Network view: map of ≥4 factories with role badges (Producer/Consumer/Both) and consent indicators; two link types (capacity subcontract, supply deal). Implement two deterministic matchers — capacity (consent → capability/cert → availability → rate) and supply (consent → part vs supplyOffers → lead time → rate) — both considering workflow step requirements. Deal object `{dealType, from, to, target, estFinish|leadTimeDays, costImpact, status}`; both-side accept/decline simulation. Supply deals update the material ETA and unblock dependent tasks, re-running ripple/CPM. Route `/api/ai/partner-fit` narrates the best match with risk notes.

**F1 — AI Production Brain**
> Add a right-drawer assistant "Ask ManuOS" in Owner/Supervisor views with 3 seeded question chips. Build a deterministic context builder serializing a capped live snapshot (orders + ETA deviations, blockers, machine loads, materials, technician workload). Route `/api/ai/brain-qa` answers from that snapshot only, returning `{answer, evidenceRefs[], linkToScreen}`; render with an "AI" badge, evidence chips, and a deep link. No action buttons — read-only. If AI is down, render the raw snapshot as a "State summary".

**F2 — Promise Engine**
> Add a "Can we promise this?" modal (Owner view): inputs part family, qty, required date, optional material. Compute the earliest feasible date deterministically (machine-class load → earliest slots → CPM chain for the family routing + material lead time) with confidence from slack margin; compare to the requested date with a day-delta badge. Route `/api/ai` narrates drivers (bottleneck machine class, material ETA) and alternatives (partial delivery, overtime +%, subcontract +%) with cost deltas from the cost engine. Render a commitment card; read-only.

**F5 — AI Engineering Copilot**
> On the intake screen (S7), add a large textarea "Paste RFQ / drawing notes". Route `/api/ai/extract-rfq` (pro model, schema-constrained) returns `{customer, partName, qty, material, tolerances[], ambiguities[], draftBOM[], draftRouting[], qcChecklist[]}`. Render ambiguities as highlighted question cards (never auto-filled). Show an Engineering review step with editable draft fields; only on Confirm create the Order (DRAFT) + jobsheet drafts, converting unresolved ambiguities into customer-question items.

**F8 — Manufacturing Passport**
> Generate a QR code per finished unit serial (client-side). Passport view (vertical timeline): serial, order, material lots, operation steps (operator, machine, timestamp), QC results per check, handoff history, final sign-off; mark rework steps visibly. Customer-portal variant shows a reduced field set. Seed ≥4 passports including one unit with a failed-then-reworked QC step. Entry points: order detail unit list, Workstation after completing an op, and a QR scan simulation.

**F13 — AI Dynamic Workflow Generation**
> Add an order-type setup screen: name + description (+ optional seed template). Route `/api/ai/generate-workflow` (schema-constrained) drafts `{nodes[{id,type,dept,requires}], edges[{from,to,condition?}], transitionRules[], warnings[]}`. Validate deterministically: topological sort (no cycles), no orphan nodes, required-role coverage; on failure return reasons and allow up to 2 AI redrafts. Preview the valid DAG rendered on the Graph view; a human-approval gate publishes `WorkflowTemplate(active)`, selectable in the intake flow. Feed node `requires` into network matching (workflow-aware).

### 16.5 Assets reusable from the ManuOS repository

| Asset | Location | Reuse |
|---|---|---|
| CPM algorithm (forward/backward pass, slack, buffers) | `src/lib/critical-path/index.ts` | Port as-is (pure TS, tested) |
| Schema patterns (Order→MO→Jobsheet→Task, Handoff, Machine lifecycle) | `prisma/schema.prisma` | Simplify to §11 |
| Machine lifecycle & maintenance-threshold logic | `src/lib/machine-lifecycle/` | Concept + formulas |
| UI components | `src/components/ui/*` (shadcn) | Reference; AI Studio scaffolds equivalents |
| Workflow blueprint (DAG, fan-out, loop-backs, state machines) | `docs/DYNAMIC_WORKFLOW_BLUEPRINT.md` | Design grounding for graph semantics |

---

## 17. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Gemini hallucinated facts/numbers | Judges penalize; trust destroyed | Numbers only from deterministic engines; schema-constrained outputs; grounding contract in every prompt; "AI" vs "computed" badges |
| Gemini latency during live demo | Demo drag | 2.5-flash; pre-warm hero calls in demo data mode; deterministic panels always render first |
| Brand availability: "ManuOS" trademark not yet verified | Branding/legal before commercialization | Trademark search scheduled before commercial launch; name aligns with the existing ManuOS codebase and product line |
| Scope creep (12-feature trap) | Prototype never finishes | §6 scope frozen; future features appear only as labeled roadmap strips |
| Cloud Run cold starts / key leakage | Broken demo / disqualification | Min instances = 1 for demo window; key only in Cloud Run secret env, server-side calls only |
| Judge skepticism of "simulated" network | Credibility | Frame F12 honestly as consent-first *simulation* with real matcher logic; the matching/consent code is real |

---

## 18. Appendix

### 18.1 Glossary

**ManuOS** **Manu**facturing **O**rchestration **S**ystem — the platform's official name expansion · **MTO** make-to-order · **MO** Manufacturing Order · **CPM** Critical Path Method (ES/EF/LS/LF, total/free slack) · **Ripple effect** downstream impact set of a disruption · **Real progress** completed *and* QC-passed units ÷ ordered units · **Recovery plan** AI-drafted, human-approved set of corrective actions · **Consent-first** no factory data shared without explicit opt-in · **Factory Memory** aggregate estimate-vs-actual knowledge per part family/operation

### 18.2 Feature ID map (for deck & video)

Main: F3 Dependency Intelligence · F4 Self-Healing Production · F7 Factory Memory · F10 Skill-Aware Dispatch · F12 Factory Network. Supporting: F1 AI Production Brain · F2 Promise Engine · F5 AI Engineering Copilot · F8 Manufacturing Passport · F13 AI Dynamic Workflow Generation. Future: F6 Visual Quality Intelligence · F9 Profit Leakage Radar · RAG+AI-LMS Competency Engine. Removed: Conversational Factory.

### 18.3 Reference documents

- Product vision & feature ideation (this PRD's source): ManuOS product plan
- Existing system: ManuOS repository (README, `docs/`)
- Workflow semantics: `docs/DYNAMIC_WORKFLOW_BLUEPRINT.md`
- Competition: AI Builder Cup 2026 — Challenges & Requirements (aibuildercup.com/themes.html)
