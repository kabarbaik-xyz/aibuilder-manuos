# ManuOS UI reference

Open `index.html` directly, or serve the parent directory and open `/ui-prototype/`.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Preview: http://localhost:4173/ui-prototype/

## Screens

- `#command`: decisions, orders, capacity, memory and activity.
- `#orchestrator`: dependency graph, timeline, board, blockers and dispatch.
- `#workstation`: current task, output recording, pause, drawing and passport.
- `#customer`: verified progress, delivery plan, acknowledgment and evidence.
- `#network`: capacity/supply views, privacy, proposals, partner acceptance and receipt.

Recovery, feasibility, intake/workflow preview, assistant, passports and audit are detail panels.

## Try the design

1. Command center → Review recovery → Approve split batch.
2. Customer portal → Acknowledge plan. Verify that QC quantities did not change.
3. My workstation → Record output. Completed rises; QC-passed stays unchanged.
4. Orchestrator → Assign → Confirm assignment; inspect Graph/Timeline/Board.
5. Factory network → Supply & demand → Review proposal → Approve & simulate partner acceptance → Record material receipt.
6. Reset scenario; Simulate delay to replay.

All operational state is in-memory. Reload restores the scenario. No framework, build, API, external messages, production authentication, or live Gemini. Fonts and icons are local, so this works offline. Downloads are labeled plain-text samples, not compliance documents. The scan symbol is a visual scan simulation, not a standards-compliant QR code.

## Development handoff

Use `../DESIGN.md` for the design system and `../IMPLEMENTATION_PLAN_MANUOS_PROTOTYPE.md` for implementation stages. `styles.css` provides tokens and responsive component styling. `app.js` intentionally demonstrates presentation/state transitions; replace authored scenario values with the planned deterministic engines and server AI contracts.

Accessibility affordances include semantic tables/forms, native dialogs, focus outlines, skip link, status text, live feedback, and reduced motion. Automated/static checks do not establish full WCAG conformance.

## Assets

Plus Jakarta Sans static TTF weights400–800 are self-hosted from Google Fonts. Font project: https://github.com/tokotype/PlusJakartaSans. License: SIL Open Font License1.1, included in `assets/OFL.txt`. SVG icons, diagrams, and mark are authored for this UI reference.
