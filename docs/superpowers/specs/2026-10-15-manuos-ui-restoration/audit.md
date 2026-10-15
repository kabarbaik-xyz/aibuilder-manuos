# ManuOS UI restoration audit — 15 October 2026

**Status:** source inspection and four user-provided screenshots; planning deliverable only. No application edits, browser automation, accessibility certification or functional completion claim in this audit.

Implementation handoff: [UI restoration plan](../../plans/2026-10-15-manuos-ui-restoration.md). Binding visual rules: [visual contract](visual-contract.md). Coverage snapshot: [route/component inventory](route-audit.json).

## Visual authority

1. User's latest corrections: larger usable sidebar, semantically distinct icons, centered Add dialogs and consistency with the originally approved mock.
2. Original [HTML mock](../../../../ui-prototype/index.html), [mock CSS](../../../../ui-prototype/styles.css), [mock interaction examples](../../../../ui-prototype/app.js).
3. [Design system](../../../DESIGN.md) and [product context](../../../PRODUCT.md): Plus Jakarta Sans, light neutral surfaces, blue actions, balanced information density, one rail and one utility header.
4. Current functional prototype supplies real data/actions. Its newer dark panels, duplicated shells and accidental drawer defaults are defects, not a replacement visual reference.

The old mock uses a 228px rail and some contextual drawers. The user's new instruction overrides rail sizing and CRUD Add presentation. Keep the mock's visual language and useful compositions; do not reproduce its simulated business state or obsolete account/persona controls.

## Evidence supplied by the user

| Capture | Visible issue | Corroborating source |
| --- | --- | --- |
| [01 Order Hub](screenshots/01-order-hub-empty.png) | Gray/dark empty panel, white low-contrast title, oversized dead space; header says Command center while Order Hub is open | `resource-state.tsx`, `topbar.tsx` |
| [02 Order intake](screenshots/02-order-intake.png) | Black hairline form borders, unrelated preset content/date defaults, ad hoc composition and left-constrained form | `features/orders/components/order-form.tsx` |
| [03 Supply orders](screenshots/03-supply-nested-shell.png) | Two headers and nested content offset; inner footer says simulated data in a persisted workspace | Workspace layout plus page-level `AppShell` |
| [04 New customer](screenshots/04-customer-add-drawer.png) | CRUD Add appears as a full-height drawer; black inputs and nearly unreadable values; background heading is also low contrast | `resource-forms.tsx`, `Dialog` default, dark utility colors |

These captures establish the listed visible failures at the captured viewport. They do not establish every route's rendered state, mobile behavior or permission behavior. All routes must receive the execution review defined below.

## Verified root causes and impact

| ID / priority | Finding and concrete evidence | Impact | Required correction |
| --- | --- | --- | --- |
| A01 / P0 | `src/app/(workspace)/layout.tsx` mounts `AuthenticatedShell`; **18** descendant pages also render `<AppShell>`, including supply orders, inventory, planning and shop-floor routes | Duplicate header/sidebar/main/footer, repeated shortcuts/copilot hosts, doubled content offsets | Shell owned by layout once; routes return page content only; preserve breadcrumbs through route metadata |
| A02 / P0 | Snapshot finds dark palette utilities in **26** frontend TSX files; shared `resource-state.tsx:26` uses `bg-neutral-900/30`, line 30 uses `text-white`; `data-table.tsx:37` uses `bg-neutral-900/40` | New features violate the approved light system; key labels/inputs become unreadable | Fix primitives and migrate consumers to semantic tokens; inspect dark slate variants in new production screens too |
| A03 / P1 | `master-navigation.tsx:54` requests `box`, `brain`, `route`; these keys do not exist in `icons.tsx`. `icons.tsx:146` silently renders `paths.order` for all unknown keys | Different operation menus look identical despite different requested names | Typed semantic icon registry; explicit mapping per item; no silent fallback |
| A04 / P1 | `master-navigation.tsx:73` explicitly renders settings for every master menu; navigation type lacks a required icon | Master resources cannot be recognized quickly | Distinct customer/supplier/item/UOM/location/resource icons in shared item configuration |
| A05 / P1 | CSS still has `--sidebar:228px`, 12px menu labels and `white-space:nowrap`; expanded product now has many longer navigation entries | Insufficient room and scanability compared with expanded scope | 280px desktop rail, 256px tablet rail, 14px labels; scrollable grouped navigation and persistent brand/workspace region |
| A06 / P0 | `Dialog` defaults to `type='drawer'` (`dialog.tsx:24`); all **11** exported master create components omit type | Every Add gets an unintended right-edge presentation | Explicit centered CRUD modal; preserve contextual drawers only for the named exceptions |
| A07 / P1 | `Dialog` reuses `search-dialog` for regular modals and fixed ID `dialog-title`; supply ETA/receipt and planning assignment use bespoke fixed overlays | Search-specific placement leaks into forms; inconsistent focus, Escape, stacking, naming and body scroll behavior | One accessible native-dialog implementation, separate modal/search/drawer styles, unique IDs and explicit dismissal policy |
| A08 / P1 | `globals.css:154` defines unlayered `.flex` with `align-items:center;gap:10px` while consumers also use Tailwind `flex`, `items-start`, `gap-*` | Cascade can override intended utility alignment/spacing even when JSX looks correct | Remove/rename this global collision with caller migration; do not patch by piling on `!important` |
| A09 / P1 | New JSX mixes bare `border`, `border-border`, `.card`, dark neutral and literal blue/slate styles; `@theme` has `line`, not `border` | Current-color black borders, undefined surface contracts and inconsistent panels | Canonical panel/field/table primitives with explicit token border/background/text; resolve undefined aliases at source |
| A10 / P1 | Topbar reads Zustand `SCREENS/currentScreen` independently of pathname, hardcodes Precision Works and Demo session | Active menu and breadcrumb disagree; real users appear to be in an always-simulated session | One route registry and actual workspace/session context; honest fallback if a name is unavailable |
| A11 / P1 | Two EmptyState implementations (`ui/empty-state.tsx`, `ui/resource-state.tsx`) and custom route-specific empties/errors | Multiple visual languages and oversized/low-contrast placeholders | One implementation with compatibility wrapper during migration; distinguish first-use/filter/error/permission states |
| A12 / P1 | `DataTable` uses pointer-only row clicks, dark styles and no consistent action column; many labels lack input `id/htmlFor` | Keyboard users cannot reliably open details or identify fields | Real detail links and accessible action buttons; associated labels/descriptions/errors |
| A13 / P1 | Order form starts with quantity 10, hardcoded November 2026 dates and Aerospace RFQ preset, and accepts UPLOAD as a source label without proving an upload flow | Real order creation starts with unrelated sample data and potentially misleading affordances | Blank/intentional defaults, explicit example action only in sandbox, correct pending/empty-reference states; no invented upload capability |
| A14 / P2 | `globals.css:338` animates margin-left during rail collapse | Existing layout-animation warning and unnecessary layout work | No animation of layout width/margin; transform/opacity for drawer, immediate desktop reflow with reduced-motion support |
| A15 / P1 | `package.json` maps `test:e2e` to `vitest run`; existing passing e2e-named files do not prove browser rendering | UI failures can survive all current reported checks | Actual browser comparison and focus/scroll checks required before UI acceptance; do not rename Vitest evidence as browser proof |

The icon shortcut in the earlier master-menu addition also contributed to A04. Restoring it is part of this work, regardless of which edit introduced it. No runtime source changes were made by this audit.

## Coverage and boundaries

The saved snapshot inventories **44 page files and 55 component files**. Route entries assign an owner work package, direct component imports, source flags and required review states. Counts can change while the functional implementation continues; refresh inventory at execution entry and add new routes/components to the same checklist. Do not call every source flag a confirmed rendered failure.

P0 fixes restore shell structure and legibility first. P1 work covers nav, modal semantics and page consistency across existing operational/master/auth/evidence screens. P2 motion and final rhythm fixes belong to the same repair, not a reason to postpone P0/P1 acceptance.

Preserve functioning data, validation, permission checks, optimistic revision handling, stock/production commands and AI source labels. This is not permission to replace API-backed UI with mock records, drop forms/fields, expose missing features, rebuild auth, change manufacturing rules or redesign the visual identity.

## Execution proof expected

Use the original mock for spacing/type/surface comparisons and the captured broken screens for reproduction. Compare reference and app at the same viewport and zoom; original fictional quantities are irrelevant to functional acceptance. No aggregate aesthetic score is assigned without a browser review.

Required browser states include empty and populated lists, valid/invalid/pending/error forms, disabled or forbidden actions, detail routes, long labels, modal overflow, nested overlays only when intentionally supported, and mobile navigation. A single screenshot of an empty page is insufficient. The [plan](../../plans/2026-10-15-manuos-ui-restoration.md) defines the bounded capture pass and completion evidence.
