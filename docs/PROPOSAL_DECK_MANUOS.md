# ManuOS · Proposal & Executive Pitch Deck

**Product:** ManuOS — Autonomous Manufacturing Orchestration System  
**Target Market:** High-Mix, Low-Volume Precision Contract Manufacturers (Aerospace, Medical, Industrial)  
**Author:** ManuOS Engineering Team  
**Date:** October 2026  

---

## Slide 1: Title & Executive Vision
### **ManuOS: The Self-Healing Operational Graph for Precision Manufacturing**
*Transforming High-Mix Shop Floor Chaos into Predictable, Transparent, and Automated Execution.*

- **Problem:** When a single critical component slips, traditional ERPs and spreadsheets leave production managers blind. The result: missed delivery dates, idled CNC machines, broken customer trust, and costly emergency freight.
- **Vision:** A real-time dependency graph powered by deterministic scheduling engines and grounded Google Gemini AI that detects disruptions, simulates self-healing recovery plans, and synchronizes customers—in minutes instead of days.

---

## Slide 2: The Core Industry Challenge
### **The High-Mix Manufacturing Dilemma**
1. **Disconnected Silos:** ERP schedules, shop floor whiteboards, and WhatsApp vendor chats exist in isolated silos.
2. **The "100% Complete" Illusion:** Traditional systems track progress by subjective labor hours, creating a false sense of security while zero finished units have actually passed Quality Control.
3. **Reactive Firefighting:** When disruptions occur, supervisors guess recovery plans without calculating true capacity, bottleneck machine queues, or labor certification constraints.
4. **Opaque Customer Communication:** Customers only learn of delays on the day of promised delivery, leading to liquidated damages and lost contracts.

---

## Slide 3: The ManuOS Breakthrough
### **A Dual-Core Architecture: Pure Deterministic Math + Grounded AI**

```
┌──────────────────────────────────────────────────────────────┐
│                    User Experience Layer                     │
│  Command Center (S1) · Orchestrator (S2) · Workstation (S3)   │
│       Customer Portal (S4) · Factory Network (S5)            │
└───────────────┬───────────────────────────────┬──────────────┘
                │                               │
                ▼                               ▼
┌──────────────────────────────┐┌──────────────────────────────┐
│ Deterministic Engine Core    ││ Server-Side Grounded AI      │
│ (Pure TypeScript)            ││ (Google Gemini 2.5 Flash)    │
├──────────────────────────────┤├──────────────────────────────┤
│ • Critical Path Method (CPM) ││ • Grounded Disruption Expl.  │
│ • Downstream Ripple Engine   ││ • Engineering RFQ Extraction │
│ • Capacity & Feasibility     ││ • Dynamic Workflow Synthesis │
│ • Skill-Aware Dispatch Engine││ • Read-Only Operational Brain│
│ • Factory Memory Similarity  ││ • Dispatch & Fit Rationale   │
└───────────────┬──────────────┘└───────────────┬──────────────┘
                │                               │
                ▼                               ▼
┌──────────────────────────────────────────────────────────────┐
│             Unified Manufacturing Graph State                │
│    Orders · MOs · Jobsheets · Tasks · Machines · Passports   │
└──────────────────────────────────────────────────────────────┘
```

- **Guaranteed Truth:** Numbers, dates, costs, and qualification gates are 100% computed by pure TypeScript algorithms. AI never hallucinates operational numbers.
- **Intelligent Insight:** Google Gemini translates complex graph topologies into concise executive explanations and extracts structured BOMs from unstructured customer RFQs.

---

## Slide 4: Five Pillars of Value (Hero Features)

### 1. Production Dependency Intelligence (F3)
- Models multi-tiered dependencies: Material Inbound → Machining → Assembly → Inspection.
- Instant ripple analysis calculates exact schedule slack and isolates runnable versus blocked branches.

### 2. Self-Healing Recovery Studio (F4)
- Deterministic simulation of candidate recovery plans: **Split Batch Delivery**, **Additional Shifts**, **Subcontracting**, and **Rerouting**.
- Hard constraint enforcement: Overtime is marked infeasible when physical material is missing.
- Strict quantity conservation: Delivering 40 units early and 80 units late conserves 120 total units.

### 3. Factory Memory & Continuous Learning (F7)
- Aggregates historical actual-versus-planned variances across part families.
- Automatically calculates historical overrun patterns (e.g., +18.0% variance across past runs) and recommends standardized planning buffer policies (e.g., +15% padding on routing rev 2).

### 4. Skill-Aware Dispatch & Hard Certification Gates (F10)
- Multi-factor ranking: 35% skill proficiency, 25% certification, 20% machine queue load, 20% historical QC track record.
- Hard gates: Enforces safety and compliance standards (e.g., mandatory WABO D1.1 structural welding certifications).
- Mentorship matching: Automatically recommends pairing junior apprentices with certified seniors.

### 5. Factory Network & Cross-Facility Capacity (F12)
- Decentralized regional ecosystem matching spare CNC machine hours and component inventory.
- Strict privacy boundaries: Only partners with explicit bilateral data consent are visible. Proprietary CAD models remain secure.

---

## Slide 5: The Unit Digital Product Passport (DPP)
### **End-to-End Cryptographic Traceability**
- **Material Pedigree:** Direct linkage to Raw Material Mill Test Reports (MTR) and heat lots (e.g., 6061-T6 Aluminum Lot AL-89240).
- **Process History:** Timestamped machine runs, cycle times, and operator IDs.
- **Rework & Inspection Log:** Explicit record of out-of-tolerance deviations and certified corrective adjustments (e.g., bend angle 91.5° corrected to 90.1°).
- **ISO 9001 Sign-Off:** Digital signature and verifiable hash for direct customer audit access via QR code.

---

## Slide 6: Proven Prototype Metrics & Technology Stack

| Metric / Dimension | Specification / Verified Achievement |
|---|---|
| **Frontend Stack** | Next.js 15.1.0 App Router, React 19, Tailwind CSS v4.3.3 |
| **Typography** | Self-hosted Plus Jakarta Sans (OFL Licensed) |
| **State Architecture** | Zustand 5.0 (Single source of operational truth) |
| **Validation & Schema** | Zod 3.24 (Bidirectional schema contracts) |
| **AI Provider** | `@google/genai` (2.29.1) via server-only routes with in-memory caching |
| **Deployment Target** | Multi-stage Dockerfile (Node 20 Alpine) on Google Cloud Run |
| **Engine Test Suite** | 16 automated Vitest tests (100% passing) |
| **Real Progress Metric** | 65.0% verified completion (78 QC-passed / 120 ordered) |

---

## Slide 7: Business ROI & Commercial Impact
*(Projected for a mid-sized precision machining facility with $25M annual turnover)*

1. **45% Reduction in Unplanned Line Stoppages:** Early ripple detection prevents starvation of downstream workstations.
2. **92% On-Time Delivery (OTD):** Dynamic recovery studio recovers committed customer deadlines without excessive expediting fees.
3. **$180,000 Annual Savings in Expedited Freight:** Partial delivery coordination eliminates emergency air courier shipments.
4. **35% Faster RFQ Intake:** AI Engineering Copilot turns unstructured emails and PDF RFQs into structured routings and BOMs in seconds.

---

## Slide 8: Enterprise Roadmap
- **Phase 1 (Completed):** Interactive high-fidelity prototype, deterministic scheduling engines, live Gemini routes, and standalone Cloud Run container.
- **Phase 2 (Q1 2027):** PostgreSQL + pgvector durable persistence, Odoo ERP connector via bidirectional webhooks, and multi-tenant organization management.
- **Phase 3 (Q2 2027):** IoT edge gateway integration with machine controllers (MTConnect/OPC-UA) for automated piece counting and spindle monitoring.
- **Phase 4 (Q3 2027):** Cross-enterprise blockchain-anchored Unit Digital Passports for aerospace and defense compliance.

---

## Conclusion
ManuOS bridges the critical gap between high-level ERP planning and physical shop floor realities. By pairing pure deterministic engineering engines with grounded generative intelligence, ManuOS empowers manufacturers to deliver on every promise.
