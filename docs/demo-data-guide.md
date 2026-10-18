# Operational demo dataset

## Run

The baseline seed only installs permissions and roles. The rich demo seed adds persisted operational records through the existing domain services.

```sh
npm run db:seed
npm run db:backup
npm run db:seed:demo
npm run db:reconcile
```

Requires the configured local SQLite database and an existing workspace marked `isDemo=true` (default `DEMO`, Precision Works). Production mode is rejected. No database reset or deletion is performed. By default, existing passwords are preserved while seed-managed account roles, departments, job titles, technician links, facility scope and landing pages are synchronized.

Optional environment variables:

- `DEMO_SEED_WORKSPACE`: existing demo workspace code; defaults to `DEMO`.
- `DEMO_SEED_ANCHOR`: ISO date for the first run; defaults to today's UTC date. Once orders exist, their recorded anchor is reused.
- `DEMO_SEED_PASSWORD`: at least 12 characters. Used for newly created accounts; otherwise a random password is generated.
- `DEMO_SEED_RESET_PASSWORD=true`: explicitly resets passwords and revokes sessions for seed-managed accounts only. Pair with `DEMO_SEED_PASSWORD` to set a known local demo password. A protected temporary credentials file (mode `0600`) records the affected demo account emails and password; its path is printed, never the password. Do not use this option for non-demo workspaces.

A lock prevents concurrent seed processes against the same configured database URL. Stable `demo-v1` command receipts allow retry after interruption and prevent duplicate ledger movements, reservations, QC dispositions or shipments. Repeating the seed preserves later demo interactions; it does not restore the original scenarios. Use a backup restore when a clean replay is required. Do not change the version prefix to reset a populated demo.

## Dataset

| Records added | Count |
| --- | ---: |
| Customer orders | 72 |
| Customers / suppliers | 12 / 6 |
| Items | 19 |
| Locations / departments | 6 / 12 |
| Machines / technicians | 12 / 6 |
| Published batch workflows / order types | 6 / 6 |
| Supply orders / receipts | 24 / 12 |
| QC inspections, including reinspections | 39 |
| Shipments | 18 |
| Form templates | 9 |
| Role-specific demo logins | 15 |

Families: mounting brackets, hydraulic valves, control panels, motor housings, process flanges and equipment frames. Each family has a simplified single-operation batch route, engineering BOM, lot-tracked raw blanks and lot-tracked finished output. This seed does not fabricate historical production duration or machine telemetry. Operational events are timestamped when their commands execute; due dates and resource bookings are planned relative to the anchor.

Stock also includes fractional kilogram balances, a low-stock copper item and an item with no opening stock. Machines include maintenance examples. Technician skills and certificates include an expired certificate for reviewing resource eligibility. It is deliberately not a requirement on the runnable batch routes. The published `DM-ORDER-LIFECYCLE` workflow is attached to the first draft order and routes Sales → Engineering → PPIC → Production → QC → Delivery to active, department-scoped demo accounts. Three published, version-pinned forms are bound to order types, production operations and the final QC checklist; their optional evidence does not block the existing operational scenarios.

## Demo cases

Six orders exist per case, one per product family. Exact order numbers and IDs are in `prisma/data/demo-seed-report.json` (generated locally).

| Case | What to demonstrate |
| --- | --- |
| Draft | RFQ captured, engineering not configured |
| Engineering | BOM draft and open customer clarification |
| Shortage | Released order, unmet alloy demand, overdue approved supplier order |
| Reserved | Stock reserved, task assigned/booked, material not yet issued |
| Running | Issued material and active operator session |
| Paused | Paused work with tool replacement reason |
| Waiting QC | Finished output held in quarantine, draft inspection |
| Rework | Four units held for rework; three families remain open and three have passed reinspection |
| Scrap | Three units scrapped; remaining units released to finished goods |
| Allocated | QC-passed stock reserved for dispatch |
| In transit | Half the order dispatched; remaining finished goods still available |
| Delivered | Full dispatch and proof of delivery confirmed |

Supply cases: six draft, six overdue approved, six partly received and six fully received. Six additional form-builder examples retain draft, review and published states with conditional review notes.

Demo logins cover planner, buyer, warehouse, quality, sales, engineer, six assigned operators and three customer-scoped portal users. Each internal account has an explicit department, job title and role-appropriate starting page; operators are linked to technician profiles. Account names are `<role>.demo@manuos.test` (operators `operator1`–`operator6`, customers `customer1`–`customer3`); custom workspace codes replace `demo`. Existing admin logins continue working. The seed actor is `seed.demo@manuos.test`.

## Verification from the initial local run

- Repeating the completed seed left record counts identical across 17 relevant tables.
- All 33 finalized inspections conserved `inspected = passed + rework + scrap`.
- Ledger reconciliation: 194 movements, 113 buckets, zero mismatches.
- SQLite foreign key check: zero errors.
- A pre-seed database backup was created and its integrity check passed.
- Local password login and authorized dashboard/portal reads returned HTTP 200 for planner and customer demo accounts.
- Typecheck and the documented npm seed command completed successfully.

Counts describe this seed version; later demo actions can change operational states. The UI demo at `/demo` is a separate fictional fixture; use authenticated workspace routes such as `/dashboard`, `/orders`, `/planning`, `/quality/inspections` and `/delivery/shipments` for this persisted dataset.
