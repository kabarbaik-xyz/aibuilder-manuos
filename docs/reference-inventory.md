# ManuOS Reference Inventory & Asset Provenance (P0-03)

This inventory records the provenance of all assets, distinguishing what exists locally, what is ported from design references, and what is implemented from architectural specifications.

---

## 1. Verified Local Assets

| Asset / Path | Type | Status | Description & Provenance |
|---|---|---|---|
| `ui-prototype/index.html` | HTML | Verified | Reference DOM layout, semantics, dialog containers, accessibility landmarks. |
| `ui-prototype/styles.css` | CSS | Verified | Production CSS tokens, color palettes, responsive media queries (desktop/tablet/mobile), component classes. |
| `ui-prototype/app.js` | JS | Verified | Illustrative presentation logic, interactive dialog flows, SVG icons, and state transitions to port into React. |
| `ui-prototype/assets/plus-jakarta-sans-*.ttf` | Font | Verified | Self-hosted Plus Jakarta Sans (weights 400, 500, 600, 700, 800) under SIL Open Font License 1.1. |
| `ui-prototype/assets/OFL.txt` | License | Verified | SIL Open Font License 1.1 for Plus Jakarta Sans. |
| `ui-prototype/assets/favicon.svg` | SVG | Verified | Favicon asset for browser tabs. |
| `.impeccable/design.json` | JSON | Verified | Design tokens, typography hierarchy, component specifications. |
| `.impeccable/review/*.png` | PNG | Verified | Visual captures of Command Center, Orchestrator, Workstation, Customer Portal, Network, and Jakarta font reviews. |
| `docs/BRD_MANUOS.md` | Doc | Verified | Business requirements, 24 business capabilities, problem statements, ROI models. |
| `docs/PRD_MANUOS_PROTOTYPE.md` | Doc | Verified | Detailed functional specifications, F1–F13, screens S1–S7, seed dataset, 3-minute video script. |
| `docs/SOFTWARE_ARCHITECTURE_MANUOS.md` | Doc | Verified | Architecture Decision Records (ADR-01..09), C4 models, engine math, state machines, deployment plans. |
| `docs/DESIGN.md` | Doc | Verified | Approved visual design specification, color codes, elevation, layout rules. |
| `docs/PRODUCT.md` | Doc | Verified | Platform purpose, core users, brand commitments, product principles. |

---

## 2. External Referenced Assets (Provenance & Implementation Strategy)

The historical architecture documentation references some files from earlier ManuOS repositories that do not exist in this repository. These are implemented directly from first principles using the documented algorithms:

| Referenced Path in Architecture | Status in Repository | Implementation Strategy |
|---|---|---|
| `src/lib/critical-path/index.ts` | Not in local repo | Implement clean, pure TypeScript forward/backward CPM algorithm in `src/engines/cpm.ts` following documented formulas (ES, EF, LS, LF, total slack, free slack, critical path). |
| `prisma/schema.prisma` | Not in local repo | Implement comprehensive TypeScript types and Zod runtime schemas in `src/domain/types.ts` and `src/domain/schemas.ts`. Store runs in Zustand browser memory without server database overhead. |
| `src/lib/machine-lifecycle/` | Not in local repo | Implement load histogram and capacity reservation algorithms in `src/engines/capacity.ts`. |
| `docs/DYNAMIC_WORKFLOW_BLUEPRINT.md` | Not in local repo | Implement DAG topological sorting, orphan node detection, and role requirement validation in `src/engines/workflow-validate.ts` based on SAD §7.2 and PRD §8.5. |
| `Dockerfile` / `cloudbuild.yaml` | Not in local repo | Author standard Next.js standalone multi-stage Dockerfile targeting Google Cloud Run port 8080. |
