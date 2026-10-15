# ManuOS UI restoration — implementation evidence

Date: 2026-10-15. Branch: `fix/manuos-ui-consistency`. No commit, push or deployment performed.

## Environment and isolation

The user's existing development server on localhost:3000 was preserved. Browser verification used localhost:3001 with a separate SQLite test fixture created through existing fixture helpers and real domain services. The fixture contains an approved/released order, two routing stages, resources, opening stock, a supply order, receipt and stock count. Customer creation below affected only that fixture. Session tokens and fixture database location remain in a private temporary config and are not included here.

The checkout already contained unrelated Prisma/execution/quality implementation changes. Those changes were preserved; this UI work does not claim authorship of them. Display-only workspaceName was exposed through the existing authenticated principal; authorization remains server-owned.

## Implemented UI changes

- UI01: semantic native controls, FormField, PageHeader, Panel, ButtonLink and resource states; light token migration at component sources; removed legacy global `.flex` collision.
- UI02: 18 nested workspace shells removed. Desktop rail 280px, tablet 256px, mobile off-canvas. Distinct typed semantic icons, permission-filtered grouped navigation, actual workspace identity and route-derived breadcrumbs. Scrollable nav, mobile inert/focus/scroll handling.
- UI03–04: centered native CRUD dialogs with heading/description associations, focus restoration, pending and dirty-dismiss guards; consistent tables and real links; loading/empty/error states.
- UI05: 11 focused master modal components. Customer/supplier create and detail use persisted contact fields. Master presentation adapters reconcile actual enum/tracking/resource shapes, PATCH methods and exact UOM ratios.
- UI06: order intake uses padded sections and actual reference data; removed preset sample requested/promised dates. Engineering/workflow surfaces use the shared light controls. New workflow has a padded form and concise page header.
- UI07: supply/inventory/planning/shop floor migrated to one shell and light surfaces. Supply creation has padded supplier/delivery and line sections. Planning uses a full-width header, divided metric strip, real schedule table and explicit unscheduled state. BigInt quantity JSON hydration/serialization fixed in operational client adapters; quantity arithmetic and server contracts were preserved.
- UI08: authenticated root selects an authorized landing; account fallback added. Original demo is explicit at /demo. Normal global assistant reports unavailable integration instead of fictional operational answers. Legacy passport prominently identifies itself as sample preview.

## Verification actually performed

1. `npx tsc --noEmit`: passed after final source edits.
2. `npx vitest run src/lib/master-navigation.test.ts src/features/masters/compatibility.test.ts src/lib/api/quantities.test.ts`: 3 files, 10 tests passed.
3. `MANUOS_DIST_DIR=.next-ui-build npm run build`: production compilation, type validation and 84 static page generation passed. Later narrow UI corrections were typechecked; production build was not rerun after those small corrections.
4. Real Chromium through local CDP: all 46 page routes visited at 1440×900 with isolated owner session. No JavaScript page errors. Authenticated routes had one main and one topbar; login deliberately shell-free. Full route report: `artifacts/ui-restoration/route-review.json`. Its movement-overflow observation was superseded by the final checks below.
5. Supply creation, workflow creation, planning, stock movements and customers rendered at 1440, 1024, 390 and 320 widths. Screenshots exist for all 20 combinations. The first narrow movement check exposed unwrapped actions; corrected, then rechecked at 320 and 1440 with no document overflow. Wide tables scroll within their panel.
6. Customer create modal measured 640px wide, horizontally centered at x400 in 1440px viewport. Browser-created customer remained visible after full reload. Cancel → Discard → reopen returned an empty code field.
7. Mobile navigation at 390×700: sidebar opened at x0, workspace became inert, body locked, nav scroll reached below-fold items, Escape closed and made sidebar inert.
8. Simulated customer service 500 showed the actual error message; restoring service and reloading recovered the persisted customer list.

## Local visual artifacts

Ignored, available in this checkout:

- `artifacts/ui-restoration/before/`: baseline broken pages and original mock.
- `artifacts/ui-restoration/routes/`: 46 route screenshots.
- `artifacts/ui-restoration/1440-_supply-orders_new.png`
- `artifacts/ui-restoration/1440-_workflows_new.png`
- `artifacts/ui-restoration/1440-_planning.png`
- `artifacts/ui-restoration/390-_supply-orders_new.png`
- `artifacts/ui-restoration/320-_inventory_movements.png`
- `artifacts/ui-restoration/390-customers-error.png`

Original user screenshots remain in the specification screenshots folder. These are local browser proofs, not production deployment evidence. The fixture's dates and quantities are test data.

## Scope and remaining product limitations

Route render coverage is complete; exhaustive create/edit/archive and every role/error combination across all resources is not claimed. Real browser mutation coverage here is customer create, persistence and discard. Other domain command paths retain existing services and targeted adapter tests.

Machine creation cannot invent a machine-class UUID: the existing API has no class catalog endpoint, so the form uses actual known classes and explains missing setup. Unsupported shelf-life, financial terms and hourly costing are not represented as successfully persisted values. Dynamic form builder, React Flow authoring, connected production AI and verified digital passports remain separate roadmap work. The UI repair does not implement those backend capabilities.

Impeccable layout-transition finding: removed workspace margin animation; mobile navigation uses transform. No rule/file/value suppressions added. No remaining width/height/padding/margin transitions found in globals.css.
