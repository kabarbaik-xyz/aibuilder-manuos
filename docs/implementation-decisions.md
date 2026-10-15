# ManuOS Implementation Decisions & Domain Contracts (P0-02)

**Document Reference:** P0-02  
**Date:** 2026-10-14  
**Status:** Approved & Frozen for Implementation

---

## 1. Domain Quantities & Real Progress Conservation

- **Hero Order (#CO-2026-1042):**
  - Ordered Quantity: `120 units`
  - Physically Completed Quantity: `82 units` (68.33% physical completion)
  - QC-Passed Quantity: `78 units`
  - Real Progress Metric: `qcPassedQty / orderedQty = 78 / 120 = 65.0%`.
  - Awaiting QC: `completedQty - qcPassedQty = 82 - 78 = 4 units`.
  - In Production (Remaining): `orderedQty - completedQty = 120 - 82 = 38 units`.
- **Split Batch Allocation Invariant:**
  - Tranche 1: `40 units` promised Nov 25 (reallocated from the 78 ready QC-passed units).
  - Tranche 2: `80 units` promised Nov 28 (consisting of remaining 38 ready QC-passed units + 42 units to be completed and inspected).
  - Conservation Law: `Tranche 1 (40) + Tranche 2 (80) = 120`. Approving the split batch never manufactures new units or fabricates QC records.

---

## 2. Fixed Demo Clock & Operational Calendar

- **Demo Clock:** `2026-11-24T09:00:00Z` (Tuesday, 24 November 2026).
- **Timezone:** UTC for deterministic calculations; displayed formatted in English (`Nov 24, 2026`).
- **Working Calendar:**
  - Standard Shift: 8 working hours/day (07:00–15:30).
  - Working Days: Monday through Saturday (Sunday non-working).
- **Hero Disruption & Ripple Schedule:**
  - Original Promised Date: `2026-11-25` (Wednesday).
  - External Disruption: Material `TB-24` (terminal blocks) delayed by +2 days, arriving `2026-11-27` (Friday).
  - Calculated Project Impact:
    - Assembly task `T12` (requires 6 hours) cannot start until `TB-24` is received on Friday Nov 27.
    - Inspection `T13` (4 hours) and Final Release `T14` (2 hours) push into Saturday Nov 28.
    - Expected Delivery Date: `2026-11-28` (+3 calendar days from Nov 25).
  - Second Affected Order: `#CO-2026-1045` (Chassis brackets, also consumes TB-24 component series, ETA pushed Nov 29 → Nov 30).

---

## 3. Disruption Classifications & Golden Task IDs

For Hero Order `#CO-2026-1042`:
- **Completed Tasks (7):** `T1` (Cut stock), `T2` (Press bend), `T4` (Chassis QC), `T5` (Drill panels), `T6` (Deburr), `T7` (Panel QC), `T8` (Prepare harness).
- **In-Progress / Still-Runnable Tasks (4):** `T3` (CNC finish machining on CNC-02), `T9` (Structural weld), `T10` (Fit enclosure), `T11` (Mount internals).
- **Blocked Tasks (3):** `T12` (Wire & terminate - blocked by TB-24), `T13` (Electrical inspection - blocked by T12), `T14` (Final release - blocked by T13).
- **Golden Invariant:** At least 2 orders affected (`#1042`, `#1045`), at least 3 tasks affected in hero order (`T12`, `T13`, `T14`), remaining runnable branches continue execution.

---

## 4. Recovery Option Feasibility & Mathematical Formulation

- **Option 1: Split Batch (Recommended & Feasible)**
  - Logic: Split delivery into Tranche 1 (40 ready units on Nov 25) and Tranche 2 (80 units on Nov 28).
  - Time Impact: Recovers customer relationship on Nov 25 for critical units.
  - Cost Impact: `+0.8%` (secondary freight packaging and split dispatch handling).
  - Feasibility: Feasible (`true`) because 78 units are already QC-passed and ready for dispatch.
- **Option 2: Additional Shift (Infeasible)**
  - Logic: Overtime night shift.
  - Cost Impact: `+4.2%` (overtime multiplier 1.5×).
  - Feasibility: Infeasible (`false`), Reason: *"Physical material shortage (TB-24 arrives Nov 27). Additional shift hours cannot assemble without components."*
- **Option 3: Outsource Assembly (Conditionally Feasible / Partner Review)**
  - Logic: Subcontract assembly to Batam CNC Hub or Nusantara Metalcraft.
  - Cost Impact: `+7.5%` (partner rate index 1.1× plus logistics).
  - Feasibility: Requires partner capability verification (Batam CNC Hub has CNC milling, but not certified electrical assembly) and bilateral consent.

---

## 5. Factory Network Matching & Consent Gates

- **Participating Factories (4):**
  1. `Precision Works` (Tenant): Producer & Buyer. Consent: Capacity=ON, Supply=ON.
  2. `Nusantara Metalcraft`: Supplier & Capacity Buyer. Consent: Capacity=ON, Supply=ON. Stocks TB-24 with lead time of 2 days (projected delivery `Nov 26`).
  3. `Batam CNC Hub`: CNC Capacity Provider (210 hours available, rate index 1.1). Consent: Capacity=ON, Supply=OFF.
  4. `Silent Shop`: Fictional member with Consent: Capacity=OFF, Supply=OFF. Profile is private; excluded from matching.
- **Supply Recovery Loop:**
  - Nusantara Metalcraft stocks matching spec TB-24. Lead time: 2 days → Projected arrival: `2026-11-26` (1 day earlier than external vendor's Nov 27).
  - Bilateral Flow: Proposal → Both factories accept → Status `ACCEPTED`.
  - Invariant: Material remains `ON_ORDER` until physical receipt is recorded. Recording receipt updates status to `IN_STOCK`, releases blocked tasks `T12`, `T13`, `T14`, and recalculates CPM schedule.

---

## 6. Factory Memory & Learning Policy

- **Historical Bracket Bending Runs (3):**
  - Run 1: Planned 10.0h, Actual 11.5h (`+15%`)
  - Run 2: Planned 10.0h, Actual 11.8h (`+18%`)
  - Run 3: Planned 10.0h, Actual 12.1h (`+21%`)
  - Statistical Mean Overrun: `(15 + 18 + 21) / 3 = 18.0%`.
- **Policy Recommendation:**
  - Routing Revision 2 finished on time with zero defects in seeded runs.
  - Recommendation: *"Use routing rev 2. Allow 15% planning padding."*
  - Rule: 15% is an explicit managerial planning buffer policy, distinct from the historical mean of 18%.

---

## 7. Skill-Aware Dispatch Algorithm & Scoring

- **Weighting Formula:**
  $$\text{Fit Score} = 0.35 \times \text{Skill} + 0.25 \times \text{Cert} + 0.20 \times \text{Workload} + 0.20 \times \text{TrackRecord}$$
- **Hard Gates:** Missing required certification (e.g. `WABO Structural Welding`) results in immediate disqualification (`eligible: false`, `score: 0`), regardless of availability.
- **Candidates for Structural Weld (`T9`):**
  1. `Budi Santoso`: Skill L4 (100), WABO Certified (100), Workload 24/40h (75), QC Pass 95% (95) → Score: $35 + 25 + 15 + 19 = 94$. Ranked #1 (Best Fit).
  2. `Rina Putri`: Skill L3 (80), WABO Certified (100), Workload 32/40h (55), QC Pass 91% (91) → Score: $28 + 25 + 11 + 18.2 = 82$. Ranked #2.
  3. `Adi Pratama`: Skill L3 (80), WABO Missing (0), Workload 10/40h (100), QC Pass 88% (88) → Hard excluded (`Not eligible: WABO certification missing`).

---

## 8. Dynamic Workflow Validation & Redraft Limits

- **Workflow Rules:**
  - Structure: Strictly acyclic Directed Acyclic Graph (DAG) for scheduling tasks.
  - Loopbacks/Rework: Captured via conditional state transitions and execution events, not cyclic schedule dependencies.
  - Validation checks: Single root/start, single end or valid join, all dependency IDs resolvable, no orphan nodes, required department/role coverage.
  - AI Redraft Limit: Maximum 2 generation attempts. If validation fails after 2 attempts, fallback to safe standard template with clear rejection diagnostics.

---

## 9. AI Service & Attribution Contracts

- **Attribution Badging:**
  - Every text block generated by Gemini carries the badge `AI` with purple styling.
  - Every numeric value calculated by pure TypeScript engines carries the tooltip/badge `Computed`.
  - When Gemini is disabled or unavailable, UI displays computed panels and fallback text labeled `Deterministic Fallback (Non-AI)`.
- **Server Boundaries:**
  - `GEMINI_API_KEY` is strictly accessed in server API routes (`/api/ai/*`).
  - Browser bundles never include `@google/genai` or API keys.
  - Response caching: 5-minute memory cache keyed by SHA-256 of function name and context payload.
