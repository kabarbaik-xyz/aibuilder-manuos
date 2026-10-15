# Database pagination for workspace lists

- [x] Inventory list tables and current API/client contracts.
- [x] Add authorized list read models with database COUNT and skip/take in one transaction, stable ID ordering and bounded page sizes.
- [x] Add shared pagination controls and query hook; reset to first page on filter/per-page changes, scope cache by membership, preserve mutation invalidation.
- [x] Connect master tables, orders, engineering, supply orders, receipts, inventory balances/movements/counts, QC, shipments and access lists.
- [x] Connect workflow/form lists, customer-scoped portal and production schedule; schedule totals remain full-graph engine results.
- [x] Keep stock-position metrics explicitly scoped to the displayed page.
- [x] Document the paginated read API in contracts/openapi.yaml.
- [x] Local HTTP: 27 workspace list resources returned bounded pages, correct metadata, disjoint order pages, last-page clamping, filtered search count and invalid-page rejection.
- [x] Customer portal: scoped total 6, HTTP 200; customer inventory request HTTP 403, unauthenticated order request HTTP 401.
- [x] Actual Chrome: Next changed rows, per-page 25 reset to page 1 and rendered 25 records; mobile had no horizontal overflow and no runtime exceptions.
- [x] Typecheck and diff whitespace check passed.

The new read endpoint separates bounded table reads from existing collection APIs used by form selectors. No table pagination is implemented with client-side slicing. Detail forms and their editable line items retain their complete document scope; dashboard preview tables retain their deliberately bounded summary scope.
