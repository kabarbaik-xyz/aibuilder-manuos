# ManuOS 3-Minute Demo Video Script & Cue Sheet

**Target Video Duration:** 2 minutes 50 seconds – 3 minutes 00 seconds  
**Language:** Professional English  
**Tone:** Authoritative, operational, concise, customer-focused  
**Video Resolution:** 1080p (1920x1080) at 60fps  

---

## Timed Cue Sheet

| Timestamp | Visual Focus & On-Screen Action | Voiceover / Narrator Script | Key Invariant Highlighted |
|---|---|---|---|
| **0:00 – 0:25** | **Command Center (S1):** Camera zooms in on the health score (92) and real progress badge (65.0%). Red disruption banner flashes on Order ORD-2026-088. | "Welcome to ManuOS—the manufacturing orchestration system engineered for high-mix, precision contract manufacturers. On our Command Center, progress is strictly factual: Order 088 shows 65% real progress—derived directly from 78 units verified by quality inspection out of 120 ordered. A supplier delay has just struck: terminal blocks are delayed 3 days." | Real Progress: `78 / 120 = 65.0%`. No fabricated progress. |
| **0:25 – 0:55** | **Orchestrator (S2):** Click into Orchestrator. CPM graph highlights the critical path in orange. 3 tasks turn red (blocked), while upstream machining tasks remain green. | "Opening the Production Orchestrator, our deterministic Critical Path Method engine recalculates schedule slack instantly. Three downstream wiring and final testing operations are blocked. But because ManuOS maps true topological dependencies, earlier CNC milling continues without idling the entire shop floor." | CPM slack recalculation; blocked vs runnable branches. |
| **0:55 – 1:35** | **Recovery Studio (S6):** Click 'Review recovery'. Side-by-side comparison of Split Delivery vs Overtime Shift. Click 'Approve split batch'. Toast confirms approval. | "To recover the schedule, we open the Recovery Studio. Our simulation engine presents viable options. Notice that an overtime shift is correctly marked Infeasible: extra labor cannot fabricate missing physical material. Instead, the engine recommends Split Delivery: shipping 40 verified units on time on Nov 25, followed by 80 units on Nov 28. With human-in-the-loop governance, we approve the split with a single click. Quantities are conserved: 40 plus 80 equals 120." | Quantity conservation (40 + 80 = 120); Overtime infeasibility rule; atomic HITL approval. |
| **1:35 – 2:05** | **Customer Portal (S4) & Unit Passport (F8):** Switch to Customer Portal. Partial delivery commitment is displayed. Click 'Inspect Unit Passport' on `SN-1042-078`. Download text record. | "Rather than hiding delays, ManuOS synchronizes directly with the Customer Portal. The customer sees the updated partial delivery schedule with complete confidence. For every unit, our digital product passport records raw material mill certs, CNC machining timestamps, dimensional rework adjustments, and ISO 9001 quality sign-off." | Transparent customer promise; full traceability & corrective rework history. |
| **2:05 – 2:35** | **Workstation (S3) & Factory Network (S5):** Switch to Workstation to show WABO certified dispatch. Then switch to Factory Network to show regional capacity and bilateral consent. | "On the shop floor, our skill-aware dispatch engine enforces hard certification gates—only technicians with verified WABO D1.1 structural welding credentials are assigned critical joints. When local capacity peaks, ManuOS queries our bilateral Factory Network—matching spare 5-axis hours while strictly respecting privacy consent." | WABO hard certification gate; privacy consent boundaries. |
| **2:35 – 2:55** | **Operational Brain (F1) & Closing:** Open Brain drawer. Type 'What is delaying order 088?'. Instant grounded answer with evidence chips. Show architecture slide. | "Finally, our Operational Brain provides read-only executive insights grounded in live graph facts—never guessing or mutating operational state. Built with Next.js 15, Tailwind v4, and Google Gemini on Cloud Run, ManuOS turns chaotic shop floors into self-healing manufacturing ecosystems. Thank you." | Read-only AI grounding; modern enterprise stack. |

---

## Production Recording Tips

1. **Mouse Movements:** Keep cursor movements smooth and deliberate. Pause for 0.5s before clicking interactive elements.
2. **Audio Levels:** Standardize vocal audio between -12dB and -6dB with subtle ambient low-end compression.
3. **Typography:** Verify self-hosted Plus Jakarta Sans renders crisply across all screens.
4. **Resolution:** Maintain 1440x900 or 1920x1080 viewport without browser address bar clutter (use full-screen mode).
