# ManuOS Prototype Demo Runbook

This runbook provides step-by-step presentation scripts for demonstrating ManuOS to leadership, customers, and engineering stakeholders.

---

## Environment & Quick Start

1. **Start Development Server:**
   ```bash
   npm run dev -- -p 3000
   ```
2. **Open in Browser:** `http://localhost:3000`
3. **Reset State:** Click **"Reset to baseline"** in the sidebar footer or reload the page to restore initial golden fixtures.

---

## Core Invariants to Emphasize

1. **Real Progress Invariant:** Order `ORD-2026-088` shows **65.0% progress** computed strictly as `78 QC-passed / 120 ordered units`. We never fabricate 100% progress.
2. **Quantity Conservation:** Split batch delivery delivers **40 units on Nov 25** and **80 units on Nov 28**, strictly conserving `40 + 80 = 120` total units.
3. **Deterministic Math:** Delays, critical path slippage (+3 calendar days), cost impacts (+0.8%), and technician ranking scores are computed by pure TypeScript engines, not LLM guesses.
4. **Human In The Loop:** AI proposes solutions and explanations; state mutations require human approval.

---

## Scenario 1: Executive Command Center & Disruption Detection (S1)

- **Target Persona:** Alex Rahman (VP Operations)
- **Starting Screen:** `Command Center` (S1)
- **Key Talking Points:**
  - "Notice the real-time factory health score (92) and current output (78/120 units, 65.0% verified completion)."
  - "The red banner immediately surfaces a delivery disruption on Order ORD-2026-088: terminal block TB-400A is delayed by Apex Electronics, pushing projected delivery to Nov 28 (+3 days)."
- **Action:** Click **"Review impact in Orchestrator"** or navigate to `Orchestrator` in the sidebar.

---

## Scenario 2: Critical Path Ripple & Recovery Studio Approval (S2 & S6)

- **Target Persona:** Production Manager & Scheduler
- **Screen:** `Production Orchestrator` (S2)
- **Key Talking Points:**
  - "The Critical Path Method (CPM) engine dynamically recalculates topological slack. Three dependent wiring and testing tasks are blocked."
  - "Notice that earlier machining and prep tasks remain green and runnable—the factory line does not need to halt entirely."
- **Action:** Click **"Review recovery"** or **"Open Recovery Studio"**.
- **In Recovery Studio:**
  - Review Option 1: **Split Batch Delivery** (+0.8% cost impact, 40 units Nov 25 / 80 units Nov 28). Highlight that 78 units have already passed QC, making 40 units immediately deliverable.
  - Review Option 2: **Additional Shift (Overtime)**. Highlight that the engine marks this **Not Feasible** because overtime cannot assemble missing physical parts.
  - Click **"Approve split batch"**.
  - A toast notification confirms approval, the order status changes to `Split approved`, and the immutable audit log records the decision by Alex Rahman.
- **Action:** Click **"Open customer portal"**.

---

## Scenario 3: Customer Transparency & Unit Digital Passport (S4 & F8)

- **Target Persona:** Global Aerospace Customer / Procurement Lead
- **Screen:** `Customer Portal` (S4)
- **Key Talking Points:**
  - "Rather than surprising the customer with an unannounced delay, the customer portal proactively displays the agreed recovery plan: 40 units arriving Nov 25, 80 units arriving Nov 28."
  - "Transparency builds trust: the customer can inspect verified mill test certificates and individual unit digital passports."
- **Action:** In the Customer Portal, click **"Inspect Unit Passport"** on unit `SN-1042-078`.
- **In Passport Modal:**
  - Highlight the end-to-end traceability timeline: incoming raw material inspection (AL-89240), 5-axis CNC machining, corrective bend rework (corrected from 91.5° to 90.1°), and ISO 9001 sign-off by Siti Nurhaliza.
  - Click **"Download record (.txt)"** to demonstrate offline audit compliance.
  - Point out that passports can also be viewed via direct URL: `http://localhost:3000/passports/SN-1042-078`.

---

## Scenario 4: Skill-Aware Dispatch & WABO Certification Gate (S3)

- **Target Persona:** Hendra Wijaya (Shopfloor Specialist) / Dispatch Lead
- **Screen:** `My Workstation` (S3)
- **Key Talking Points:**
  - "On the shop floor, operators see their assigned machine queue, live drawing revisions, digital work instructions, and real-time piece counters."
  - "When assigning critical structural welding tasks, the dispatch engine enforces hard certification gates."
- **Action:** Open task assignment or inspect dispatch candidates.
  - Show that candidates lacking active **WABO D1.1 structural welding certifications** are strictly disqualified.
  - Highlight the junior pairing recommendation: pairing senior specialist Budi Santoso with apprentice Adi Pratama to preserve institutional knowledge while safeguarding throughput.

---

## Scenario 5: Factory Network Collaboration & Privacy Consent (S5)

- **Target Persona:** Ecosystem Director & Supply Chain Manager
- **Screen:** `Factory Network` (S5)
- **Key Talking Points:**
  - "When internal capacity or parts are constrained, ManuOS searches a trusted network of regional partner factories."
  - "Data privacy is strictly preserved: partner factories only appear if bilateral consent is explicitly granted in their profile (`consentShareCapacity` / `consentShareSupply`). Private IP and CAD models remain protected."
- **Action:** View matched supply for terminal blocks at Nusantara Metalcraft (42 units available, arrives Nov 26).
- **Action:** Open **"Activity Log"** in the sidebar to review the full tamper-evident audit trail of all actions, approvals, and deals made during the session.

---

## Resetting for Next Demo Run

Click **"Reset to baseline"** in the sidebar footer or execute:
```bash
# In browser console:
window.localStorage.clear();
window.location.reload();
```
All states, order statuses, and disruption scenarios return to the initial baseline instantly.
