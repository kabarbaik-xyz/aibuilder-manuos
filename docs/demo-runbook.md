# ManuOS Prototype Demo Runbook

This runbook provides step-by-step presentation scripts for demonstrating ManuOS to leadership, customers, and engineering stakeholders.

---

## Environment & Quick Start

1. **Start Development Server:**
   ```bash
   npm run dev -- -p 3000
   ```
2. **Open in Browser:** `http://localhost:3000`
3. **Reset State:** Click **"Reset scenario"** in the sidebar footer to restore the initial simulation state, or reload the page.

---

## Core Invariants to Emphasize

1. **Real Progress Invariant:** Order progress is computed strictly from QC-passed units vs ordered units. We never fabricate 100% progress.
2. **Quantity Conservation:** Split batch delivery conserves total ordered quantity across partial shipments.
3. **Deterministic Math:** Delays, critical path slippage, cost impacts, and technician ranking scores are computed by pure TypeScript engines, not LLM guesses.
4. **Human In The Loop:** AI proposes solutions and explanations; state mutations require human approval.

---

## Scenario 1: Executive Dashboard & Disruption Detection

- **Target Persona:** VP Operations
- **Starting Screen:** `Dashboard` (Command Center)
- **Key Talking Points:**
  - "Notice the real-time factory health score and current output showing verified completion percentage."
  - "The red banner immediately surfaces a delivery disruption: terminal blocks TB-24 are delayed by the supplier, pushing projected delivery by +2 days."
- **Action:** Click **"Review impact in Production planning"** or navigate to `Production planning` in the sidebar.

---

## Scenario 2: Critical Path Ripple & Recovery Approval

- **Target Persona:** Production Manager & Scheduler
- **Screen:** `Production planning` (Orchestrator)
- **Key Talking Points:**
  - "The Critical Path Method (CPM) engine dynamically recalculates topological slack. Dependent tasks are blocked."
  - "Notice that earlier tasks remain green and runnable—the factory line does not need to halt entirely."
- **Action:** Click **"Review recovery"** (opens recovery workflow modal).
- **In Recovery Workflow:**
  - Review Option 1: **Split Batch Delivery** — partial shipment of verified units on original date, remainder on delayed date. Highlight that verified units are immediately deliverable.
  - Review Option 2: **Additional Shift (Overtime)** — correctly marked **Not Feasible** because overtime cannot assemble missing physical parts.
  - Click **"Approve split batch"**.
  - A toast notification confirms approval, the order status updates, and the immutable audit log records the decision.
- **Action:** Click **"Open customer portal"**.

---

## Scenario 3: Customer Transparency & Unit Digital Passport

- **Target Persona:** Global Customer / Procurement Lead
- **Screen:** `Customer portal`
- **Key Talking Points:**
  - "Rather than surprising the customer with an unannounced delay, the customer portal proactively displays the agreed recovery plan with partial delivery dates."
  - "Transparency builds trust: the customer can inspect verified mill test certificates and individual unit digital passports."
- **Action:** In the Customer Portal, click **"Inspect Unit Passport"** on a unit.
- **In Passport Modal:**
  - Highlight the end-to-end traceability timeline: incoming raw material inspection, CNC machining, corrective rework, and quality sign-off.
  - Click **"Download record"** to demonstrate offline audit compliance.
  - Point out that passports can also be viewed via direct URL: `/passports/{serial}`.

---

## Scenario 4: Skill-Aware Dispatch & Certification Gates

- **Target Persona:** Shop-floor Specialist / Dispatch Lead
- **Screen:** `Shop floor` (Workstation)
- **Key Talking Points:**
  - "On the shop floor, operators see their assigned machine queue, live drawing revisions, digital work instructions, and real-time piece counters."
  - "When assigning critical tasks, the dispatch engine enforces hard certification gates."
- **Action:** Open task assignment or inspect dispatch candidates.
  - Show that candidates lacking required certifications are strictly disqualified.
  - Highlight junior pairing recommendations to preserve institutional knowledge while safeguarding throughput.

---

## Scenario 5: Factory Network (Stub)

- **Target Persona:** Ecosystem Director & Supply Chain Manager
- **Screen:** `Factory network`
- **Note:** This screen is now an intentional stub. It explains that the older network marketplace simulation is not part of the current operational feature set, and directs users to **CoreAI** for supported scheduling and subcontract workflows.
- **Action:** Open **"Activity log"** in the sidebar to review the full tamper-evident audit trail of all actions, approvals, and decisions made during the session.

---

## Resetting for Next Demo Run

Click **"Reset scenario"** in the sidebar footer or execute:
```bash
# In browser console:
window.localStorage.clear();
window.location.reload();
```
All simulation states, order statuses, and disruption scenarios return to the initial baseline instantly.