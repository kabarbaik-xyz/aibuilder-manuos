# ManuOS 3-Minute Demo Video Script & Cue Sheet

**Target Video Duration:** 2 minutes 50 seconds – 3 minutes 00 seconds  
**Language:** Professional English  
**Tone:** Authoritative, operational, concise, customer-focused  
**Video Resolution:** 1080p (1920x1080) at 60fps  

---

## Timed Cue Sheet

| Timestamp | Visual Focus & On-Screen Action | Voiceover / Narrator Script | Key Invariant Highlighted |
|---|---|---|---|
| **0:00 – 0:25** | **Dashboard (S1):** Camera zooms in on the health score and real progress badge. Red disruption banner flashes on the affected order. | "Welcome to ManuOS—the manufacturing orchestration system engineered for high-mix, precision contract manufacturers. On our Dashboard, progress is strictly factual: the order shows real progress derived directly from QC-passed units out of ordered units. A supplier delay has just struck: terminal blocks TB-24 are delayed 2 days." | Real Progress: verified units / ordered units. No fabricated progress. |
| **0:25 – 0:55** | **Production Planning (S2):** Click into Production Planning. CPM graph highlights the critical path in orange. Dependent tasks turn red (blocked), while upstream tasks remain green. | "Opening Production Planning, our deterministic Critical Path Method engine recalculates schedule slack instantly. Downstream operations are blocked. But because ManuOS maps true topological dependencies, earlier machining continues without idling the entire shop floor." | CPM slack recalculation; blocked vs runnable branches. |
| **0:55 – 1:35** | **Recovery Workflow (S6):** Click 'Review recovery'. Side-by-side comparison of Split Delivery vs Overtime Shift. Click 'Approve split batch'. Toast confirms approval. | "To recover the schedule, we open the Recovery workflow. Our simulation engine presents viable options. Notice that an overtime shift is correctly marked Infeasible: extra labor cannot fabricate missing physical material. Instead, the engine recommends Split Delivery: shipping verified units on time, followed by the remainder on the delayed date. With human-in-the-loop governance, we approve the split with a single click. Quantities are conserved." | Quantity conservation; Overtime infeasibility rule; atomic HITL approval. |
| **1:35 – 2:05** | **Customer Portal (S4) & Unit Passport (F8):** Switch to Customer Portal. Partial delivery commitment is displayed. Click 'Inspect Unit Passport'. Download text record. | "Rather than hiding delays, ManuOS synchronizes directly with the Customer Portal. The customer sees the updated partial delivery schedule with complete confidence. For every unit, our digital product passport records raw material mill certs, CNC machining timestamps, dimensional rework adjustments, and quality sign-off." | Transparent customer promise; full traceability & corrective rework history. |
| **2:05 – 2:35** | **Shop Floor (S3) & CoreAI (F1):** Switch to Shop Floor to show skill-aware dispatch with certification gates. Then switch to CoreAI to show grounded AI insights. | "On the shop floor, our skill-aware dispatch engine enforces hard certification gates—only technicians with verified credentials are assigned critical operations. When local capacity peaks, CoreAI provides grounded executive insights from live graph facts—never guessing or mutating operational state." | Skill-aware dispatch with certification gates; read-only AI grounding. |
| **2:35 – 2:55** | **Operational Brain (F1) & Closing:** Open Brain drawer. Type 'What is delaying this order?'. Instant grounded answer with evidence chips. Show architecture slide. | "Finally, our Operational Brain provides read-only executive insights grounded in live graph facts—never guessing or mutating operational state. Built with Next.js 15, Tailwind v4, and Google Gemini on Cloud Run, ManuOS turns chaotic shop floors into self-healing manufacturing ecosystems. Thank you." | Read-only AI grounding; modern enterprise stack. |

---

## Production Recording Tips

1. **Mouse Movements:** Keep cursor movements smooth and deliberate. Pause for 0.5s before clicking interactive elements.
2. **Audio Levels:** Standardize vocal audio between -12dB and -6dB with subtle ambient low-end compression.
3. **Typography:** Verify self-hosted Plus Jakarta Sans renders crisply across all screens.
4. **Resolution:** Maintain 1440x900 or 1920x1080 viewport without browser address bar clutter (use full-screen mode).