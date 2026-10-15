# ManuOS UI Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Delegation requires user authorization. Track the checkboxes and evidence per route. This is a UI repair handoff, not permission to replace functioning features with a new static demo.

**Goal:** Restore every implemented ManuOS surface to the approved light mock, fixing sidebar usability, icon identity, duplicate layouts, CRUD modal presentation and inconsistent controls/states while preserving persisted business behavior.

**Architecture:** One route-owned authenticated shell; one typed route/icon registry; a small shared set of page/panel/form/table/state/dialog components; feature pages consume their existing hooks and commands. Legacy mock styling is a design reference and a bounded sandbox, not global authority over Tailwind utilities or operational data.

**Tech Stack:** Existing Next.js/React/TypeScript/Tailwind v4, local Plus Jakarta Sans, authored SVG icon facade, native HTML dialog, TanStack Query, current SQLite-backed services. Actual browser inspection is mandatory for completion. Existing `test:e2e` runs Vitest and does not render a browser.

## Read first and apply this precedence

1. [Audit with source evidence and user screenshots](../specs/2026-10-15-manuos-ui-restoration/audit.md).
2. [Binding visual and interaction contract](../specs/2026-10-15-manuos-ui-restoration/visual-contract.md).
3. [Route/component checklist snapshot](../specs/2026-10-15-manuos-ui-restoration/route-audit.json).
4. Original [mock HTML](../../../ui-prototype/index.html), [mock CSS](../../../ui-prototype/styles.css), [mock interactions](../../../ui-prototype/app.js), [design system](../../DESIGN.md).
5. Existing implemented pages/services for data behavior; [functional master plan](2026-10-15-manuos-functional-prototype.md) for domain boundaries.

The user explicitly requires a larger sidebar and centered CRUD Add modals. Those instructions override the original mock's narrow rail and blanket detail-panel choice. Preserve its typography, colors, restrained surfaces and information hierarchy. Do not reopen visual direction or ask the user to specify CSS values.

## Global constraints and ownership

- Scope is implemented UI across all current route groups plus existing overlay/demo components. Refresh inventory at execution entry; the current snapshot has 44 pages and 55 components, not a permanent maximum.
- Functional implementation is actively changing this checkout. Wait for its current safe checkpoint and identify the correct baseline before editing shared UI. Do not have two workers edit shell/styles/forms simultaneously.
- At execution time use a separate branch, `fix/manuos-ui-consistency`, from the completed checkpoint containing the feature work being repaired. Preserve unrelated dirty changes; never silently stash/reset/clean or discard in-flight functional work. This planning task creates no branch and changes no application source.
- Prefix shell commands with `rtk`. No automatic git add/commit/push/merge/deployment. No new AI/image-generation step is required: the approved mock already exists.
- Do not change Prisma models, stock/quality/order rules, auth/session authority or engine math to simplify rendering. Preserve command bodies, expected revisions, idempotency and error handling. Any discovered API/domain defect is a separately evidenced issue, not a reason to fake UI success.
- No hardcoded factory metrics, sample orders, sample requested/promised dates or fictional AI results in normal mode. Seeded browser fixtures must be isolated from the developer's real DB and labelled as fixtures.
- No broad color overrides, `!important` sweep, hidden overflowing controls, CSS suppression to bypass findings or deletion of feature fields to make the screenshot look cleaner.
- Complete shared components first, then migrate all consumers, then review. Do not submit only four patched screenshots while leaving sibling routes broken.

## Work packages and deliverables

| Task | Deliverable | Primary acceptance |
| --- | --- | --- |
| UI00 | Current inventory, baseline captures and branch checkpoint | Reproducible before-state, no lost work |
| UI01 | Semantic layout/form primitives and CSS isolation | White readable fields/panels; no utility collision |
| UI02 | Single shell, larger rail, typed distinct icons, correct route context | No duplicate UI chrome; usable navigation |
| UI03 | Modal/search/drawer taxonomy and shared overlay lifecycle | Add opens centered, keyboard/focus/scroll work |
| UI04 | Consistent tables, states, action links and feedback | Empty/populated/error states follow the same system |
| UI05 | All master data pages and create/edit flows migrated | Readable actual CRUD through centered modal |
| UI06 | Orders, engineering and workflow pages migrated | Coherent intake/review/publish/release surfaces |
| UI07 | Supply, inventory, planning and My Work migrated | Functional operations with no nested/dark layouts |
| UI08 | Login/account/evidence/AI/demo boundary aligned | Supporting surfaces match; demo data stays explicit |
| UI09 | Browser comparison, route sign-off and handoff evidence | Every implemented route reviewed; real behavior preserved |

Execution: UI00 → UI01 → UI02 → UI03 → UI04 → UI05 → UI06 → UI07 → UI08 → UI09. Do not skip UI01–UI04 in favor of polishing a single page.

## UI00 — Establish baseline and safe execution state

**Files:** read `AGENTS.md`, `/Users/ardian/.codex/RTK.md`, current `package.json`, the three linked audit artifacts and actual route layouts. Create `docs/ui-restoration-evidence.md`; refresh `route-audit.json` without deleting unresolved rows. Save generated captures under an ignored local artifact directory, and list deliverable image paths in the evidence document.

- [ ] Record branch, status, running app URL/port, API target and DB identity without printing secrets. Identify the preceding worker's safe checkpoint; create the isolated repair branch from that baseline. A branch switch is not proof that unrelated uncommitted features are included.
- [ ] Open the original mock beside the current app at the same 1440x900 viewport and 100% zoom. Inspect original Command Center/table, intake fields, contextual detail and Workstation; compare hierarchy and spacing, not fixture amounts.
- [ ] Reproduce the four user captures: `/orders` empty, `/orders/new`, `/supply-orders`, Customers → Add. Record browser screenshots plus actual menu/header/modal count and computed field/text/background styles. Include a populated table to avoid accepting only empty-state styling.
- [ ] Enumerate all `src/app/**/page.tsx` and UI TSX sources after the functional run. Assign newly added QC/delivery/portal/intelligence/form pages the appropriate UI07/UI08 owner. Unimplemented roadmap pages are not created by this repair.
- [ ] Record existing scripts accurately. If no browser harness exists, use an available real browser for manual captures, or add a scoped Playwright browser script in UI09; never report Vitest route-handler tests as rendered e2e proof.

**Gate:** `docs/ui-restoration-evidence.md` contains environment, route coverage and before-capture paths; source inventory is refreshed; no runtime fix is claimed yet.

## UI01 — Semantic primitives, spacing and CSS cascade

**Modify:** `src/app/globals.css`, `src/components/ui/button.tsx`; existing UI primitives as needed for tokens. **Create:** `src/components/ui/page-header.tsx`, `panel.tsx`, `form-field.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `button-link.tsx`.

**Contracts:** primitives accept ordinary native input/select/textarea props, including ref, disabled, required, aria attributes, IDs and onChange. They must not own business fetching or mutation. `FormField` links one visible label/help/error to its control. `ButtonLink` renders a real Next Link styled as a button; ordinary `Button` remains a button and defaults to `type=button`.

Use this PageHeader implementation shape and contract, preserving component classes in globals:

```tsx
import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
```

Canonical CSS geometry for feature composition (merge with existing compatible selectors, do not append conflicting definitions indefinitely):

```css
.page-stack { display: grid; gap: 24px; min-width: 0; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.page-header-copy { min-width: 0; }
.page-header-copy p { margin-top: 8px; color: var(--muted); }
.page-header-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.form-section { padding: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.form-control { width: 100%; min-height: 40px; padding: 9px 12px; color: var(--ink); background: var(--surface); border: 1px solid #8491a3; border-radius: 8px; font: inherit; }
.form-control::placeholder { color: var(--muted); opacity: 1; }
.form-control:focus-visible { outline: 3px solid var(--primary); outline-offset: 3px; }
.form-control[aria-invalid="true"] { border-color: var(--danger); }
.form-control:disabled { color: var(--muted); background: var(--surface-muted); cursor: not-allowed; }
@media (max-width: 680px) {
  .page-header { flex-direction: column; gap: 16px; }
  .form-grid { grid-template-columns: minmax(0, 1fr); }
  .form-section { padding: 20px; }
  .form-control { min-height: 44px; }
}
```

- [ ] Inspect both `@theme` and `:root`; map shared values to existing semantic variables so utilities and authored CSS cannot drift. Keep current approved blue/neutral palette; verify actual contrast rather than inventing a dark alternative.
- [ ] Replace unlayered global `.flex { align-items:center;gap:10px }` with a named legacy helper and migrate every authored mock caller that depended on it. Tailwind `flex/items-*/gap-*` must regain ordinary meaning. Audit other collisions (`main`, `.panel`, `.small`, `.stack`, `.card`, `.full`) before changing them; scope legacy-only behavior rather than destabilizing production pages.
- [ ] Replace bare black `border` and undefined `border-border`/surface aliases at migrated component sources. Do not globally change all borders to transparent. White on primary buttons, blueprint strokes, QR and authored artwork are deliberate exceptions to the body-text palette rule.
- [ ] Standardize page/container padding to the contract. Remove duplicate page `p-6` when layout already supplies padding. Preserve balanced form layout; use section headings and a consistent form width rather than extra cards around cards.
- [ ] Ensure buttons preserve submit semantics, show pending label/aria-busy, and block repeated submit using the actual mutation state. Preserve exactly one actionable primary control per form footer.

**Gate:** one field/control and one list/detail composition render readable at desktop/mobile before page migration. A global `text-white` override, per-route stylesheet patch or deletion of field values fails this gate.

## UI02 — One shell, usable rail, valid icons and route context

**Modify:** `src/components/{app-shell,authenticated-shell,sidebar,master-navigation,topbar,icons,account-menu}.tsx`, `src/lib/{navigation,master-navigation}.ts`, `src/app/(workspace)/layout.tsx`, globals. **Create:** `src/lib/route-metadata.ts`, `src/components/workspace-navigation-context.tsx`. **Migrate:** every `nested-shell` entry in `route-audit.json`, currently 18 workspace pages; list all edited paths in evidence.

**Contracts:** preserve existing `getMasterNavigation`, `getWorkflowNavigation` permission behavior or provide explicit adapters. Add required typed `icon` to each menu entry. `resolveRouteMetadata(pathname)` returns `{title, breadcrumbs, activeHref, group}`; use segment-aware most-specific matching and explicit new/detail route entries. `WorkspaceNavigationProvider` supplies pathname metadata and available identity to topbar/sidebar once. It never grants permissions from display labels.

```ts
// In icons.tsx export keys from the concrete registry (no Record<string, ...>).
export type IconName = keyof typeof paths;
// IconProps.name, ButtonProps.icon/iconRight and navigation icon use IconName.
// Preserve every existing valid icon key while adding the contract's missing ones.

// In master-navigation.ts:
export interface MasterNavItem {
  title: string;
  href: string;
  icon: IconName;
  permissions: readonly string[];
}
```

Import `IconName` with a type-only import or move registry names to `src/lib/icon-names.ts` if needed to prevent a runtime component dependency from navigation metadata. Do not introduce a module cycle. Map every legacy `SCREENS.icon`, dynamic icon expression and existing Button caller to the same valid type; deliberately handle any persisted/external unknown string at its parsing boundary.

- [ ] Implement every semantic icon in the visual contract; replace both substring guessing and the generic settings glyph per master item. Remove `paths[name] || paths.order`. Typecheck must identify misspelled/unregistered static keys.
- [ ] Give layout ownership of one shell and providers. Remove nested shell wrappers from descendant pages, keeping their data hooks, metadata and children. Account/evidence/customer route groups need the correct single shell or deliberately shell-free view, not automatic workspace shell nesting.
- [ ] Build rail with fixed brand/workspace area and one nav scroll region (`flex:1;min-height:0;overflow-y:auto`). Set desktop/tablet/mobile widths and 14px menu labels exactly as the contract; retain keyboard focus and touch/wheel scrolling while hiding rail scrollbar chrome.
- [ ] Group actual operations and master items; active group expands. Keep profile/settings/sign-out in header. Move legacy demo controls/menus behind explicit sandbox context instead of appending them to every real navigation list. Brand click returns to the existing authorized landing and never silently opens a fictional dashboard.
- [ ] Derive breadcrumbs from pathname; `/supply-orders` must show Supply orders, not Command center. Use actual entity name in the page header if fetched; route metadata can use Order detail while loading. Keep group title, activeHref and page heading consistent.
- [ ] Use actual workspace name if provided by existing authorized identity/read models. If absent show Workspace; do not hardcode Precision Works. Show Demo only in explicit sandbox and remove redundant technical DB footer copy.
- [ ] Mobile menu button exposes aria-expanded/controls; backdrop/Escape/route selection close the drawer and restore focus appropriately. Dialog over an open nav drawer must not leave two competing focus/scroll locks.
- [ ] Resolve A14 layout-animation warning: desktop margin/width reflow is immediate; mobile drawer uses transform/opacity. Remove margin-left animation; respect reduced-motion without suppressing findings.

**Gate:** visit supply/inventory/planning/task detail routes and verify exactly one topbar, one `main#main`, one primary rail and one copilot host; icons differ meaningfully; sidebar scroll reaches last authorized item; no horizontal page overflow at 320px.

## UI03 — Centered CRUD dialogs and one overlay lifecycle

**Modify:** `src/components/ui/dialog.tsx`, globals; `src/features/masters/components/resource-forms.tsx`; supply ETA/receipt overlays; planning assignment overlay; inventory correction overlay; all existing `Dialog` call sites.

**Dialog extension contract:** keep controlled `isOpen/onClose/title/subtitle/children/footer`. `type` supports modal/drawer with default **modal**. Add `size:'sm'|'md'|'lg'`, optional `formId` for footer submit association and `pending`/dirty-dismiss behavior. Centered form class is `.modal-dialog`, not `.search-dialog`; search retains its dedicated component/style. Use React useId for heading/description IDs. Do not silently change old recovery drawers by changing a global default without migrating callers.

Example target composition for the existing customer mutation, preserving its actual DTO:

```tsx
<Dialog isOpen={isOpen} onClose={requestClose} type="modal" size="md"
  title="New customer" subtitle="Add a customer to this workspace"
  footer={<>
    <Button onClick={requestClose} disabled={createCustomer.isPending}>Cancel</Button>
    <Button type="submit" form={formId} variant="primary" disabled={createCustomer.isPending}>
      {createCustomer.isPending ? 'Creating…' : 'Create customer'}
    </Button>
  </>}>
  <form id={formId} onSubmit={handleSubmit} className="page-stack">
    <FormErrorSummary error={error} />
    <FormField id={codeId} label="Customer code" required error={error?.fieldErrors?.code}>
      <Input id={codeId} required value={formData.code}
        onChange={(event) => setFormData({ ...formData, code: event.target.value })} />
    </FormField>
  </form>
</Dialog>
```

The example shows one field; implementation must retain name, credit terms, currency, tax ID and all other existing fields, validation and mutation handling. `requestClose`, `formId` and `codeId` are local hooks/handlers to implement with unique IDs and dirty/pending policy, not unresolved exports to import.

- [ ] Implement native dialog open/close/focus restoration, unique labels, proper backdrop hit-test, Escape, scroll-lock restoration on unmount and 100dvh-safe scroll body. Header/footer stay visible without blocking body fields. Do not position form modals at `16vh` or on the right rail.
- [ ] Default widths 480/640/840px with viewport gutters/max height. Verify long modal at 320px and a mobile keyboard scenario; no body scroll leak and no unreachable footer.
- [ ] Explicitly mark existing recovery/history/assistant/context overlays `type=drawer` where the mock calls for it. Add create/edit actions are modal; full order/engineering/workflow editors remain pages.
- [ ] Split the 1,100+ line `resource-forms.tsx` into focused files under `src/features/masters/components/forms/`: `customer-form-modal.tsx`, `supplier-form-modal.tsx`, `uom-form-modal.tsx`, `item-form-modal.tsx`, `location-form-modal.tsx`, `department-form-modal.tsx`, `calendar-form-modal.tsx`, `machine-form-modal.tsx`, `skill-form-modal.tsx`, `order-type-form-modal.tsx`, `qc-checklist-form-modal.tsx`. Use a barrel and temporarily preserve old Drawer exports only as documented aliases until all importers migrate.
- [ ] Migrate custom supply ETA/receipt, planning assignment and inventory reversal dialogs to the same primitive. Remove duplicate fixed-backdrop markup after migration; retain confirmation consequences and command versions.
- [ ] Test in a real browser: open → type → invalid submit → fix → server failure → retry → success; Escape/backdrop/Cancel/close policies; tab stays inside; focus returns to opener. Do not close on failure or show success before committed state refresh.

**Gate:** all 11 actual master Add exports open centered; no master Add inherits a drawer. The screenshot-04 customer form is white/ink-readable with visible labels/value/focus at desktop and mobile.

## UI04 — Tables, feedback and resource states

**Modify:** `src/components/ui/{resource-state,empty-state,error-state,data-table,form-errors,badge,button}.tsx`; globals. **Create** `src/components/ui/table-toolbar.tsx` only if the migrated pages share the same toolbar composition.

**Contracts:** retain existing EmptyState props through adapters during migration, then converge on `{title, description, icon?, action?:ReactNode, kind:'first-use'|'no-results'}`. Resource-state can re-export canonical components. DataTable preserves `Column<T>` and adds explicit accessible row/detail link/action rendering without requiring mouse row clicks. Loading/error/permission states preserve real error meaning and retry callback.

- [ ] Remove the dark shared empty/table styles first; use surface, ink, muted and line. Empty first-use height 200–260px, concise description and one relevant action. Search-no-results offers clear-filter rather than creating a duplicate entity.
- [ ] Preserve header/page structure while data loads or errors. Do not replace the whole route with a spinner leaving no title/context. Avoid showing an empty-state frame before an initial pending query resolves.
- [ ] Canonical table: toolbar, 12px header/14px rows, 52px minimum row height, real links, units, secondary identity, line separators and local horizontal scrolling. Preserve meaningful columns; mobile must retain an obvious detail/action entry.
- [ ] Replace `<Link><Button/></Link>` with ButtonLink or a styled Link, and pointer-only row actions with real links. Add accessible labels to icon-only action buttons; destructive actions need an explicit verb and consequence.
- [ ] Associate labels and errors with control IDs; summary targets/focuses invalid fields and uses user-readable field labels. Do not expose internal permission codes as the main restricted-state copy.
- [ ] Use persisted status → label/semantic Badge mapping, preserving business statuses. Pending, disabled, required and conflict states remain readable without color alone.

**Gate:** first-use, populated, filtered-empty, pending, error and permission states all render coherently on at least one actual master list and one operation list. Data/command errors cannot be disguised as no records.

## UI05 — Migrate all master data pages

**Modify:** every page under `src/app/(workspace)/settings/`, `src/app/(workspace)/inventory/items/page.tsx`, `inventory/items/[id]/page.tsx`; the new master form files; existing hook imports only as required by file moves. Route owners are listed in `route-audit.json` under UI05.

| Family | Required page/form migration |
| --- | --- |
| Customers / suppliers | List search, populated identity/contacts/status, centered Add, existing detail edit, pending/error/conflict |
| Items / UOM | List filters, type/UOM/lot/serial flags, centered Add, existing item detail/conversions; retain precision and actual unit labels |
| Locations / departments | Readable list, type/status, centered Add and actual supported edit actions |
| Machines / technicians | Actual department/calendar references, status/skills/certification readouts; meaningful unavailable/empty-reference state |
| Calendars | Human-readable timezone/shifts summary; preserve stored JSON/DTO if that is the implemented contract and clearly label any advanced editor |
| Skills / order types / QC checklists | Consistent list/header/Add; revision/published states; no UUID-only controls where reference choices exist |

- [ ] Replace every dark input/near-white heading/table-cell utility with primitives and semantic styles; do not rely on changing parent text color because descendants override it.
- [ ] Replace title/action blocks with PageHeader, filters with shared controls, table with migrated DataTable, and create imports with explicit modal exports. Search/filters retain their current real server/client semantics; no decorative filtering UI.
- [ ] Use actual workspace/reference data for form defaults where available. Preserve legitimate zero values; do not introduce `Number(value) || fallback` behavior while refactoring. Any existing data-default bug gets a separate note and narrowly corrected behavior only with evidence.
- [ ] Long customer/supplier/item names must wrap or use a secondary accessible detail view. Do not clip action buttons or push tables beyond the page at 200% zoom.
- [ ] If a displayed module lacks a working create/edit API/flow (e.g. technician onboarding), record that as a functional gap and present honest supported actions. Do not invent a successful Add dialog merely to satisfy visual symmetry.
- [ ] Verify one real customer and item creation through UI and database-backed list/detail readback in an isolated fixture workspace; refresh to confirm persisted behavior. Cancel and validation failure must not create records.

**Gate:** every UI05 route and all 11 forms receive a row in evidence with desktop/mobile state and functional limitations. A customer screenshot alone does not close this task.

## UI06 — Orders, engineering and workflow consistency

**Modify:** `src/app/(workspace)/orders/{page,new/page,[id]/page}.tsx`, `engineering/page.tsx`, `engineering/orders/[orderId]/page.tsx`, `workflows/{page,new/page,[id]/versions/[versionId]/page}.tsx`; `src/features/orders/components/{order-form,order-detail}.tsx`; `src/features/engineering/components/review-editor.tsx`; `src/features/workflows/components/definition-editor.tsx`.

- [ ] Order Hub inherits the mock's calm header/toolbar/white table composition. Show actual order/customer/item/quantities/date/status/detail actions. Where actual data lacks QC/ETA evidence, display unavailable rather than importing the mock's 65% or dates.
- [ ] New order becomes a coherent page: PageHeader with back action; customer/order type/item/quantity section; delivery/request context; RFQ notes section; clear footer actions. Use 1040px form region, two columns desktop, one mobile. Remove black separator/border defaults and automatic unrelated RFQ/November dates. Examples require an explicit action in sandbox.
- [ ] Handle master-query loading/error and empty required catalogs individually; show a useful create-master link only when authorized. Do not render an apparently usable empty select when its request failed.
- [ ] Keep requested date and promised date visibly distinct. Keep actual DTO semantics and exact quantity conversion unchanged unless a separately verified correctness defect must be fixed. Do not auto-promise delivery from a visual preset.
- [ ] Order detail uses header + status/actions + overview/material/engineering/history grouping and actual counts; avoid stacks of heavy bordered boxes. Release/review prerequisites are explicit and denied actions have understandable reasons.
- [ ] Engineering review uses shared BOM rows, selectors, fields/errors and section hierarchy. Keep approved revision immutable, unresolved blocking questions visible and actual save/review/approve calls intact.
- [ ] Workflow Studio list/editor uses consistent panels, node/edge inspector fields and validation findings; preserve publication/fork state and all typed registry fields. React Flow/AI-generation remain in the queued builder plan unless the baseline already implements them; this repair must not fake their availability.
- [ ] Browser walk create draft → edit → engineering review → workflow version view → release/denial according to actual permissions; record what could be exercised. Confirm no state resets just because a component moved.

**Gate:** captures 01 and 02 have comparable after-states plus a populated order list and a persisted detail/review state. No visual fix may silently remove an engineering or workflow prerequisite.

## UI07 — Supply, stock, planning, execution and new operational screens

**Modify all UI07 inventory routes** in the JSON, especially `supply-orders/`, `inventory/{page,movements,counts,issues,returns,transfers,receipts}/`, `planning/`, `shop-floor/`. Modify `src/features/supply/components/{supply-order-form,supply-order-detail,supply-receipt-modal}.tsx`, all eight current `src/features/inventory/components/*.tsx`, `src/features/planning/components/PlanningScheduleView.tsx`, `src/features/execution/components/{ShopFloorTaskListView,ShopFloorWorkstationView}.tsx`. Include later-added QC/delivery pages at execution entry.

- [ ] Remove every residual nested AppShell first (UI02 ownership), then apply PageHeader/panel/control/state primitives. Supply orders must have one topbar/one content origin/one footer and correct breadcrumb.
- [ ] Supply list/detail/new share vocabulary and visual rhythm. Keep line quantities, receipt history, ETA-change reason and approval permissions. Receipt/ETA action uses UI03 modal with live pending/error handling.
- [ ] Inventory balances/movements use white operational tables, item/location/lot identities and consistent decimal+UOM formatting; distinguish on-hand, reserved and available. Keep correction provenance/reversal reason and actual posting permission. Never make quantity ambiguity disappear by hiding a column.
- [ ] Issue/return/transfer/count forms use labeled selectors, clear source/destination, reviewable quantities and an explicit post action. Existing dedicated routes remain pages; compact confirmations use centered modal. Do not turn an editable draft into a posted record on close.
- [ ] Planning uses the mock's metric strip and schedule/table hierarchy, removing dark glass panels, heavy colored shadows and decorative blur. Assignment must use readable actual eligible resource options where the endpoint supports them; do not fabricate availability or accept a resource UUID as the ordinary operator experience.
- [ ] My Work uses the original Workstation's clear task/context/output/actions hierarchy. Show actual assignment, timer basis, materials, instructions and blocking reasons; controls are touch-friendly. No pulsing claim of live telemetry without actual running session evidence.
- [ ] Preserve start/pause/resume/output/finish command gating; changing color or closing a modal cannot complete work. Dynamic form integration remains governed by the separate queued plan, but these controls must be compatible with the shared FormField/Dialog contracts.
- [ ] For baseline-added QC/shipping screens apply the same detail/table/modal primitives; distinguish produced, accepted, rework, allocated and shipped. Keep evidence/approval side effects explicit.
- [ ] Verify before/after that opening and cancelling actions never writes stock or changes workflow state; actual success displays the server result after commit/refetch. Exercise one real assigned-task action in an isolated fixture when the implemented stage supports it.

**Gate:** screenshot 03 is structurally fixed and each operational route passes single-shell/contrast/layout review. At least one populated stock table, schedule, task and transaction-confirmation state must be reviewed; empty screens alone are insufficient.

## UI08 — Supporting surfaces, account and legacy isolation

**Modify:** `src/app/(auth)/login/page.tsx`, `src/components/account-menu.tsx`, `src/app/(account)/layout.tsx`, `src/app/(customer)/layout.tsx`, `src/app/(evidence)/layout.tsx`, `src/app/passports/[serial]/page.tsx`; `src/components/{app-shell,modal-manager,floating-copilot,search-dialog}.tsx`; existing AI/history/evidence feature TSX files listed in the component inventory. Also review `src/app/page.tsx` landing and legacy `SCREENS` surfaces.

- [ ] Login matches the light system and actual login flow with clear pending/error/returnTo; no invented login credentials or persona authority. Account reflects actual user/session with readable settings and sign-out.
- [ ] Settle shell ownership for account/customer/passport routes based on actual route ancestry; a standalone evidence view must not accidentally include legacy demo simulation controls. Preserve authorized document/passport/customer access.
- [ ] Read-only AI/evidence/history views retain source labels, unavailable/error state, current scope and actual data. Contextual drawers remain deliberate; remove duplicate modal/copilot hosts caused by nested shells.
- [ ] Keep approved demo surfaces as a clearly marked sandbox or reference view. Real workspace navigation cannot silently fall back to a demo action; hide or label unavailable real functionality rather than masquerading as implemented.
- [ ] Search result links navigate through the same route registry and respect existing visibility; route context resets correctly after logout and workspace change. No stale admin menu after session changes.
- [ ] Default logged-in landing resolves to an actual authorized implemented route. Do not redirect a customer to staff-only Order Hub or force a blank unauthorized page; use the existing session policy and safe internal returnTo.
- [ ] Carry existing footer/copilot/mobile account fixes forward and verify the restoration does not regress them. Keep one account menu in the utility header at all widths.

**Gate:** login/account, one evidence view and one AI/unavailable drawer match the approved system. Current UI08 routes are accounted for, including root/legacy views; no fictional workspace/session labels remain on operational pages.

## UI09 — Actual browser acceptance and bounded final review

**Files:** update `docs/ui-restoration-evidence.md` and inventory statuses. Add `playwright.ui.config.ts`, `tests/browser/ui-restoration.spec.ts` and a dedicated `test:ui` script only if no real browser harness is available. Preserve existing `test:e2e` contract instead of silently reassigning it away from the functional worker's tests.

Browser tests use a separately configured local server and isolated seeded workspace/database; do not run stock/customer mutations against the developer's working DB. Reuse existing fixtures where suitable. Do not store passwords, cookies, provider keys or real customer data in snapshots/artifacts. A browser tool/manual inspection is acceptable evidence if clearly labelled and recorded with the same checks.

Example critical browser assertions to adapt to the actual fixture setup:

```ts
import { test, expect } from '@playwright/test';

test('supply uses one workspace shell', async ({ page }) => {
  await page.goto('/supply-orders');
  await expect(page.locator('main#main')).toHaveCount(1);
  await expect(page.locator('#topbar')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Supply orders', exact: true })).toBeVisible();
});

test('Add customer is a centered form modal', async ({ page }) => {
  await page.goto('/settings/customers');
  await page.getByRole('button', { name: 'New customer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New customer', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/modal-dialog/);
  await expect(dialog).not.toHaveClass(/detail-dialog/);
  await expect(dialog.getByLabel('Customer code', { exact: false })).toBeVisible();
  const rect = await dialog.boundingBox();
  const width = page.viewportSize()!.width;
  expect(rect).not.toBeNull();
  expect(Math.abs(rect!.x + rect!.width / 2 - width / 2)).toBeLessThan(4);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'New customer', exact: true })).toBeFocused();
});
```

Fixture authentication/setup belongs in Playwright setup/storage state generated from a local test account, not a hardcoded session token in this test. Assertions above are targeted at the contract's sentence-case labels. Extend with required-field error and actual API-backed create/refresh proof, not brittle snapshots of arbitrary implementation markup.

- [ ] Run focused existing tests for changed behavior, `rtk npm run typecheck`, and `rtk npm run build`. Run browser suite with the dedicated command only after it exists: `rtk npm run test:ui`. Record failures honestly; a unit suite is not a substitute for screenshots or gestures.
- [ ] Batch first browser pass at 1440x900, 1024x768, 390x844 and 320px; include normal/200% zoom and long workspace/entity labels. Cover the four user failures, populated master/order/stock tables, a tall Add modal, planning/task, auth and representative contextual evidence.
- [ ] Check keyboard Tab/Shift+Tab/Escape, modal focus restoration, nav touch/wheel scroll, table horizontal scroll and body scroll lock. If mobile keyboard or physical touch cannot be exercised, label those limits explicitly rather than claiming device proof.
- [ ] Fix findings in one coherent batch. Run one confirmation pass on affected views. Do not repeatedly rebuild/polish unrelated surfaces after passing evidence; unresolved failures remain open with exact reproduction.
- [ ] Update every route entry with checked viewport/states, evidence path and result. Missing route prerequisites are BLOCKED with a reason; do not mark them passed or omit them. Regenerate the inventory to catch routes added during repair.
- [ ] Provide before/after captures for the four user screenshots and list outstanding functional gaps separately from styling. Record commands and results, actual browser used and which interactions were exercised.

### Hard acceptance checklist

- [ ] **V01:** 280/256px desktop/tablet rail; 14px nav text; full primary labels; independent nav scroll; mobile off-canvas works.
- [ ] **V02:** Explicit valid semantic icon for every visible menu; no fallback document/settings repetition.
- [ ] **V03:** Exactly one topbar/sidebar/main/copilot host on every workspace route; correct breadcrumb and active item.
- [ ] **V04:** No unreadable near-white text/black inputs/dark glass panels in the approved light UI; values/placeholders/errors/disabled controls verified.
- [ ] **V05:** All existing master Add forms are centered modal with keyboard/focus/scroll behavior; contextual drawers are explicit exceptions.
- [ ] **V06:** One PageHeader/panel/form/table/state language across all existing routes; no thick current-color separators or undefined surface/border styles.
- [ ] **V07:** Real required master options/loading/errors; no auto-inserted demo dates/RFQs in normal intake.
- [ ] **V08:** Real create/update/confirmation behavior survives refresh; cancel/errors create no false success; existing version/permission checks retained.
- [ ] **V09:** Mobile/narrow/zoom/long-content layouts retain actions; no body overflow hidden to conceal bugs; reduced motion and scroll remain usable.
- [ ] **V10:** Complete per-route evidence and paired before/after captures; no Vitest-as-browser claim; no unresolved P0/P1 UI findings concealed as polish.

## Handoff prompt for the implementation agent

```text
Execute docs/superpowers/plans/2026-10-15-manuos-ui-restoration.md.
Read its audit, visual contract and route inventory before editing.
Use the original ui-prototype as visual authority, with the user's newer
280px sidebar and centered CRUD Add-modal decisions taking precedence.
Work on fix/manuos-ui-consistency from the verified functional checkpoint;
preserve unrelated dirty work and coordinate a safe checkpoint before edits.
Do UI00–UI09 in order. Fix shared primitives and shell ownership before
migrating pages. Keep existing DB/API/RBAC/commands; no static replacement.
Do not stop after four screenshot fixes: account for every existing route
and newly added functional screen in the inventory. Prove results in a real
browser, including populated/empty/error/mobile/modal states, and record
before/after evidence. test:e2e currently invokes Vitest, not a browser.
Do not commit, push, merge or deploy. Report task status, changed UI paths,
actual checks, screenshot locations and any concrete remaining blockers.
```

## Planning self-review

- [x] Each reported screenshot failure maps to a source cause and work package.
- [x] All current routes and component paths are inventoried; future additions have a reconciliation gate.
- [x] New user decisions override narrower rail/blanket drawer guidance without changing brand identity.
- [x] Auth/business data and transactional behavior remain required; UI evidence is distinct from API/unit proof.
- [x] Actual browser review is mandatory and bounded; existing e2e script limitations are explicit.
- [ ] Implementation agent completes UI00–UI09 and V01–V10 before calling the repair done.
