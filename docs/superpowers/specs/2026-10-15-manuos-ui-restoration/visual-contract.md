# ManuOS UI restoration — binding visual and interaction contract

This contract implements the user's request to follow the approved mock and fix current anomalies. Read with the [audit](audit.md) and [execution plan](../../plans/2026-10-15-manuos-ui-restoration.md). Every existing route must converge on these shared rules; do not invent a different visual system per feature.

## 1. Authority and tokens

Preserve original `ui-prototype/` hierarchy, font, restrained panels, operational tables, metric strips and contextual recovery review. New modules absent from the mock inherit those primitives. The following sizing and CRUD modal decisions deliberately supersede the older 228px rail/drawer defaults.

| Token | Value / application |
| --- | --- |
| Font | Existing self-hosted Plus Jakarta Sans 400/500/600/700/800; no remote font request |
| Background | `--bg:#f5f7fb` |
| Surface / muted surface | `--surface:#fff`, `--surface-muted:#f8f9fc` |
| Body / supporting text | `--ink:#182438`, `--muted:#627086`; supporting functional text uses muted, not low-contrast subtle |
| Border | `--line:#e7ebf2` for panel dividers; controls use a verified stronger neutral border if line alone cannot identify the control |
| Primary | `--primary:#2459df`, hover `#1947bf`, soft `#edf2ff` |
| Success | `#14775d` on `#edf8f3` |
| Warning | `#985715` on `#fff7e9` |
| Danger | `#b43e43` on `#fff0f0` |
| Focus | 3px primary-blue visible focus ring with 3px offset, checked on white and soft surfaces |
| Corners | Controls 8px; panels/modals 14px |
| Spacing | 4/8/12/16/20/24/32/36px scale; no arbitrary different rhythm in each feature |
| Headings | Page 28px/1.25/700 desktop, 24px mobile; section 16px/700; field 13px/600 |
| Text | Fixed 12/13/14/16/18/20/24px scale; body/nav 14px; table/support 12–14px; no one-off sizes or weights |
| Controls | 40px height desktop; touch interaction target at least 44px on mobile; textarea min 120px |
| Panel | White, 1px line border, no heavy shadow; 24px inner padding desktop, 20px mobile |

Use the existing semantic CSS variables / Tailwind theme aliases. No dark neutral/slate backgrounds or near-white body text on light surfaces. White on the primary button is intentional. Verify 4.5:1 normal text, 3:1 large text and meaningful control boundaries; do not infer compliance from token names. Do not globally redefine Tailwind color utilities or map every `text-white` to ink.

## 2. Single layout and page rhythm

- Exactly one primary sidebar, one utility topbar, one `main#main`, one toast host and one copilot host per workspace document. Root provider/layout ownership must make nested page shells impossible in ordinary usage.
- Workspace route layout owns the shell. Feature pages render `PageHeader`, optional filters and page content. A page cannot render `AppShell`/`AuthenticatedShell`/`Topbar` or its own footer.
- Expanded rail: 280px at width >=1280px; 256px at 851–1279px. At <=850px, use off-canvas width `min(304px, calc(100vw - 32px))`. Do not preserve the older 210/228px rail for the larger menu.
- Topbar 70px desktop and 64px mobile, sticky at document top. Page padding 32px desktop, 24px tablet, 16px mobile. Content max width 1520px, centered in remaining workspace; forms max 1040px aligned to the page header; long detail/text sections may use narrower inner columns.
- One page title plus concise purpose text and one primary action. No thick black heading separator. Optional metadata/tabs follow with 24px spacing. Panel table headers and separators use line token.
- On desktop a two-column detail layout may use a flexible primary region plus 320px summary; collapse at <=1024px. Avoid a 3xl form floating inside multiple nested cards.
- Main document scrolls vertically. Tables/graphs get local horizontal scroll and `min-width:0` containers. Never hide page overflow to conceal clipped actions. A footer must not appear halfway inside an accidental nested workspace.
- Standard footer contains concise product identity or real context; do not show SQLite, internal commands, fake simulated date or repeated Active Session text.

## 3. Navigation and icon mapping

Rail structure: brand + workspace switch → independently scrollable nav body → optional concise environment indicator. Keep account/profile/settings/sign-out in top-right header. Brand/workspace switch remain reachable while navigation scrolls. Use `100dvh`, flex `min-height:0`, overscroll containment and native scrolling; conceal scrollbar chrome on rail only while preserving wheel/touch/keyboard scroll and visible focus. Do not force smooth scrolling on every document operation. Respect reduced motion.

Groups: Operations, Master data, and Account/Administration only for implemented authorized routes. Keep list groups collapsible when large; active group is expanded and user expansion state persists as UI preference, not authority. No nonfunctional future feature links. Operational users should not scroll through old demo menus to find real work; sandbox links belong in an explicit collapsed Demo section if retained.

Menu row: minimum 44px high, 12px horizontal padding, 12px icon gap, 14px/600 label, 20px outline icon. Selected row primary-soft/primary; hover surface-muted/ink. Never truncate primary module labels; permit two lines for exceptional long/localized labels while retaining icon alignment. Existing permission filters remain authoritative for visibility; server permissions still govern actions.

Use **one icon facade**. Extend the authored SVG registry and type its keys; do not mix random emoji, unrelated icon sets and silent fallback. `lucide-react` is already installed but is not required for this repair; if used for missing symbols, adapt them through this facade at the same 24px viewBox/1.7 stroke and list the exports explicitly. Unknown keys must fail typecheck or emit a development error, never render the order icon.

| Menu | Required semantic key / glyph |
| --- | --- |
| Order Hub | `order` / order document |
| Engineering Hub | `engineering` / document with cog |
| Workflow Studio | `graph` / connected process nodes |
| Supply orders | `supply` / supplier package or cart |
| Inbound receipts | `receipt` / package entering warehouse |
| Inventory | `inventory` / stacked boxes |
| Planning | `calendar` / schedule |
| My Work | `work` / work case |
| Customers | `customers` / people |
| Suppliers | `supplier` / delivery truck |
| Items & materials | `item` / single package |
| Units of measure | `ruler` / measurement |
| Locations | `location` / map pin |
| Departments | `department` / organization tree |
| Machines | `machine` / machine/cog |
| Technicians | `technician` / person with tool |
| Calendars | `calendar` / schedule |
| Skills & certifications | `certificate` / certification |
| Order types | `order-type` / labeled stack |
| QC checklists | `checklist` / checked clipboard |
| Users / roles | `users` / people; `shield` / permissions |
| Activity / memory | `clock` / history; `book` / knowledge |

Related concepts may share an icon (e.g. planning/calendars), but distinct navigation modules must not all fall back to documents/settings. Put `icon` on the route entry, not in a substring conditional.

Route registry owns title, group, breadcrumbs, icon and permission visibility. Use longest segment-aware path match; `/orders/new` is New order, `/orders/[id]` is order detail, and nested pages keep their parent active. Topbar uses pathname metadata, not legacy `currentScreen`. Show actual workspace name if available; otherwise `Workspace`. Label authenticated context Workspace, and Demo only in an explicit sandbox. Do not infer real operational authority from a UI persona.

## 4. Form, modal and drawer taxonomy

| Flow | Required presentation |
| --- | --- |
| Add/edit customer, supplier, UOM, item, location, department, calendar, machine, skill, order type, QC checklist | Centered form modal; an existing detail edit page may remain a page |
| Existing technician onboarding | Use the implemented flow and centered Add modal if a create flow exists; do not fabricate an unsupported endpoint |
| New order, full engineering review, full supply order, workflow authoring | Dedicated page with shared form primitives; preserve direct URL and browser back |
| Supply ETA update, receipt confirmation, resource assignment, stock correction/confirmation | Centered action modal; keep transactional consequences explicit |
| Recovery review, read-only AI evidence/history/passport/context detail | Explicit contextual drawer where original mock uses one; not a CRUD Add default |
| Search | Dedicated search dialog presentation, not a sizing/style surrogate for CRUD forms |

Form modal sizes: sm 480px; md 640px; lg 840px. Width is `min(size, calc(100vw - 32px))`, centered in the **viewport**, not in the workspace remainder. Max height `calc(100dvh - 32px)`; header/footer visible with scrollable body. On mobile maintain 16px gutter (12px at 320px), use one column, wrap footer actions and keep submit reachable above the virtual keyboard. Add forms never become right-edge drawers on mobile.

Native `dialog.showModal()` handles background inertness and focus containment. Use unique IDs, labeled heading/descriptions, Escape and close button, restore focus to opener, sensible initial focus, body-scroll lock restored on close/unmount and no duplicate overlay. Dirty dismissal prompts inside the same dialog surface; do not stack another unmanaged overlay. A pending save cannot be submitted twice; accidental close never implies canceling a committed request. Keep failure state open with answers intact. Closing/canceling and reopening must follow a deliberate reset/preserve policy; newly created entity appears only after actual commit/query refresh.

Labels use sentence case with programmatic input association. Required marker has a text explanation. Field/help/error IDs are linked with aria attributes; error summary links/focuses invalid fields. Fields: white background, ink value, muted placeholder, explicit neutral border, consistent focus, readable disabled state. Native select is acceptable when styled consistently; use fetched option labels and true IDs, never ask an operator to type a UUID when a scoped selector exists.

No sample customer/spec/delivery dates inserted into real forms automatically. Optional preset examples live behind an explicit sandbox/example action and cannot silently change identity, quantity or promised date. Blank committed date is distinct from requested date. UI changes preserve exact quantity formatting and existing DTO conversion; do not redesign financial or manufacturing rules during visual work.

## 5. Tables, states and feedback

White list panel with toolbar → table → pagination/count as actually supported. Header on surface-muted with 12px semibold sentence-case labels; rows min 52px, line separators, 14px body, muted secondary identity, tabular quantities and dates. Keep units visible. No decorative progress percentage unrelated to persisted quantities. On mobile use a deliberate priority-column/card composition or a local scrollable table with a hint; do not squeeze text to 10px.

At least one real link per record opens details with keyboard support. Do not nest a button inside a Link or rely on pointer-only row click. Action buttons have accessible names and preserve actual permissions. Empty first-use and no-filter-match states differ; default empty region 200–260px high, not a dark giant block. Icon optional and semantic; title ink, copy muted; one useful action. Errors are not empty lists and include Retry when possible. Loading skeleton dimensions match the final panel and respect reduced motion. Permission state uses plain language rather than capability-code jargon in the main message.

Use existing badges with semantic color/text, not raw uppercase DB strings. Pending state visible at the button; server error remains near the field or action. Success toast supplements the persisted updated row/detail. No fake success, fabricated data, invented totals or empty-state-as-error masking.

## 6. Completion contract

All routes in `route-audit.json` must be checked and newly added routes included. Browser review at 1440x900, 1024x768, 390x844 and narrow 320px. Test 200% zoom, long workspace/entity names, populated/empty/error pages and a tall open form. Preserve real form submission, version conflict and authorization behavior.

At least the four captured failures must have paired before/after screenshots, plus representative populated table, production task, mobile navigation and modal. Existing `test:e2e` is Vitest and must not be described as browser evidence. No acceptance based only on source cleanup, build success or screenshots at one viewport.
