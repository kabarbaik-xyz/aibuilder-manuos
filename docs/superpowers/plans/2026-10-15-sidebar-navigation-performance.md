# Sidebar navigation performance

## Primary goal

Make workspace navigation feel responsive after a sidebar click, while reducing measured route or data wait where the profile shows it is needed.

## Current evaluation

- **Confirmed in source:** `src/components/master-navigation.tsx:15` renders ordinary Next.js `<Link>` elements with the default prefetch behavior. The installed Next.js 15.5.27 `Link` implementation exits its hover-prefetch path in development (`node_modules/next/dist/client/app-dir/link.js:315-329`); the Next.js 15 docs also say Link prefetching is production-only.
- **Confirmed in source:** the workspace segment has no `loading.tsx`; `src/app/(workspace)/layout.tsx:4-10` keeps the authenticated shell mounted around route children. A segment loading UI can cover route/RSC waits and partial dynamic-route prefetching, but it does not make a non-Suspense React Query request finish sooner.
- **Confirmed in source:** many operational pages are client components and load data through `usePaginatedList` (`src/lib/api/use-paginated-list.ts:22-43`). The shared `QueryClient` uses a 30-second stale time (`src/components/providers.tsx:6-25`), so a revisit can be quick while the first visit still waits for its `/api/lists/...` request. `DataTable` currently replaces the table with a generic `LoadingState` (`src/components/ui/data-table.tsx:24-40`).
- **Candidate to measure:** `src/components/modal-manager.tsx:7-19` statically imports multiple demo-only modal features from the persistent authenticated shell (`src/components/authenticated-shell.tsx:57-80`). This may increase shared client JavaScript and hydration work; bundle output must establish whether it is material before changing it.
- **Not established yet:** no browser timing or production build profile is available in this evaluation, and no Next server process was running. We cannot yet attribute the reported delay to route chunks, RSC, API/database queries, or client rendering.

## Proposed approach

Measure cold and warm transitions in both development and production first. Add immediate, design-system-consistent route feedback where it applies. Then optimize only the largest measured contributor: route payload, React Query data, shared client JavaScript, or a slow list endpoint. Keep access scoping and fresh operational data authoritative.

## Work plan

### Phase 1 — Capture a navigation baseline

**How this serves the primary goal:** identifies which part of a sidebar transition consumes time, so implementation targets the actual delay.

**Implementation**

- Record the current branch and working-tree state; keep the unrelated active `ShipmentDetailView.tsx` change intact.
- Profile representative routes from different functions (Dashboard, Items, Planning, My Work, Shipments, and a detail route) in both `next dev` and an optimized `next build` + `next start` session.
- For each route, measure first visit, immediate revisit, and revisit after the 30-second query stale window. Record click-to-route-feedback, click-to-page-content, click-to-data, RSC/document request timing, JS chunks, and `/api/me` or `/api/lists/*` timing. Use medians and p95 across at least five navigations per case.
- Attribute each slow transition to route/RSC, JS download/evaluation, API/database, or render. Capture slow API paths and request counts before considering any cache or query changes.

**Documentation and code references**

- [Next.js 15 Link](https://nextjs.org/docs/15/app/api-reference/components/link) — default route prefetch behavior and production-only note.
- [Next.js 15 prefetching guide](https://nextjs.org/docs/15/app/guides/prefetching) — production prefetch behavior, intent, and resource trade-offs.
- [Next.js 15 useRouter](https://nextjs.org/docs/15/app/api-reference/functions/use-router) — supported manual route prefetch API and its limits.
- `src/components/master-navigation.tsx:15`, `src/lib/api/use-paginated-list.ts:22-43`, `src/components/providers.tsx:6-25`.

**Verification checklist**

- [ ] Baseline includes dev and production; do not use dev timings as a proxy for production.
- [ ] Cold and warm transitions are reported separately.
- [ ] Each slow case has a trace or network waterfall and a named dominant wait.
- [ ] Confirm whether the local production build can complete; record any pre-existing type/build blocker separately.

**Anti-pattern guards**

- Do not call `router.prefetch()` as a dev-mode fix; Next.js documents route prefetch as production-only.
- Do not prefetch every sidebar destination or every list query up front.
- Do not label a loading indicator as a speed improvement.

### Phase 2 — Give route and data transitions immediate feedback

**How this serves the primary goal:** makes a click visibly respond while a measured route or first-load query is still pending.

**Implementation**

- Add `src/app/(workspace)/loading.tsx` for the route segment only if the baseline shows a route/RSC/chunk gap. Keep the global shell owned by the existing workspace layout and render a restrained content-area skeleton that follows `docs/DESIGN.md` tokens and reduced-motion behavior.
- If list API wait dominates, improve the shared table loading state to preserve table geometry and show a small set of skeleton rows. Keep `role="status"` and accessible loading text; avoid a full-screen blocking overlay.
- Preserve page-specific query errors, empty states, and filters. Do not wrap pages in another shell or turn React Query into Suspense as a broad migration.

**Documentation and code references**

- [Next.js 15 loading.js convention](https://nextjs.org/docs/15/app/api-reference/file-conventions/loading) — segment Suspense fallback and partial prefetch boundary.
- `src/app/(workspace)/layout.tsx:4-10`, `src/components/ui/data-table.tsx:24-40`, `src/components/ui/resource-state.tsx:1-4`, `docs/DESIGN.md:1-20,66-76`.

**Verification checklist**

- [ ] Fallback appears promptly after an uncached navigation and disappears when content is ready.
- [ ] The authenticated shell remains interactive and is not duplicated by the loading UI.
- [ ] Table loading layout matches the resolved table width and does not shift page controls unexpectedly.
- [ ] Keyboard, screen-reader status, narrow viewport, and reduced-motion behavior are checked.

**Anti-pattern guards**

- Do not assume `loading.tsx` waits for or speeds up non-Suspense React Query requests.
- Do not add spinner-only UI that removes context or causes layout shift.

### Phase 3 — Optimize the measured navigation bottleneck

**How this serves the primary goal:** reduces the slowest actual wait rather than broadening the client workload.

**Implementation**

- If production route payload/RSC is dominant, first use Next.js default `<Link>` prefetch and the Phase 2 loading boundary. Add explicit intent-based `router.prefetch(href)` only for routes proven to benefit and only if the default does not cover them.
- If React Query API wait is dominant, extract reusable query options for the measured destination and warm the cache on link intent with the installed TanStack Query 5.104.2 `queryClient.query()` API. Use the exact same query key, membership scope, filters, and query function as the page. Warm only a small set of high-traffic destinations; do not prefetch every list or detail record.
- If shared JavaScript or hydration is dominant, use production build output to check `ModalManager`'s demo-only imports. Split only the features shown to materially inflate the shared shell, and preserve current modal behavior and accessible loading feedback.
- If a particular list endpoint is dominant, inspect its server list service and database query plan, then make a narrowly scoped server-side improvement. Keep database pagination, search filters, permissions, and current-data semantics intact.

**Documentation and code references**

- [Next.js 15 prefetching guide](https://nextjs.org/docs/15/app/guides/prefetching) and [useRouter API](https://nextjs.org/docs/15/app/api-reference/functions/use-router).
- [TanStack Query prefetching and router integration](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching) — cache warming through `queryClient.query()` and its freshness/error behavior; verified against installed 5.104.2 source.
- `src/components/modal-manager.tsx:7-19`, `src/components/authenticated-shell.tsx:57-80`, `src/lib/api/use-paginated-list.ts:22-43`.

**Verification checklist**

- [ ] The selected optimization targets the top measured wait from Phase 1.
- [ ] Any query prefetch uses the page's exact key, filters, principal/membership scope, and API request.
- [ ] Production route bundle and request counts show the intended reduction; no hidden fan-out is added.
- [ ] Restricted users cannot warm or view data outside their existing permission scope.
- [ ] Operational data remains fresh according to its existing invalidation and stale-time policy.

**Anti-pattern guards**

- Do not set `prefetch={true}` globally or start database reads merely because links render.
- Do not reuse cached data across memberships/workspaces or extend freshness for stock, orders, quality, or delivery without domain review.
- Do not optimize unrelated routes or endpoints without trace evidence.

### Phase 4 — Compare results and close the loop

**How this serves the primary goal:** proves that transitions feel faster in the intended runtime and catches regressions from prefetch or code splitting.

**Implementation**

- Repeat the same route matrix and network conditions from Phase 1 after the selected fixes.
- Compare p50/p95 click-to-feedback, click-to-route-content, and click-to-data separately for development and production; report cold and warm paths separately.
- Set a numeric performance target after the baseline is captured. At minimum, route feedback must be visible within 100 ms in the measured browser run, and no production p50/p95 path may regress. Any promised data-time improvement must be demonstrated on the specific API path changed.
- Run the repository typecheck and focused route/browser checks after implementation; run broader suites only if the touched behavior or existing project gate requires them.

**Documentation and code references**

- `package.json` scripts: `dev`, `build`, `start`, `typecheck`.
- Preserve `AGENTS.md` UI shell, permission, and data rules.

**Verification checklist**

- [ ] Same browser, data, route matrix, and network conditions are used before and after.
- [ ] Development-only delay is reported separately from production performance.
- [ ] No console/runtime exceptions, failed navigation requests, access leaks, or duplicate requests appear.
- [ ] Record exact build/typecheck/browser evidence and any unrelated baseline blocker.

**Anti-pattern guards**

- Do not claim production improvement from source inspection or dev-only runs.
- Do not change list pagination, API contracts, or business rules as a side effect of this performance fix.

## Scope

This plan covers workspace sidebar navigation and the page/data transition caused by those links. It does not authorize deployment, data migrations, broad caching policy changes, or unrelated page redesign.
