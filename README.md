# ManuOS

ManuOS is a **make-to-order manufacturing operations workspace**. It connects customer orders, engineering, materials, scheduling, shop-floor execution, quality inspections, and delivery. Access is scoped by workspace and permissions. CoreAI explains operational evidence and drafts proposals for human review.

This documentation reflects the repository source as of **18 October 2026**. Source implementation, automated specifications, browser verification, live AI calls, and deployed behavior are separate evidence levels; implementation here does not establish that a hosted instance is running the same revision.

## Demo and presentation

- [Demo video](public/videos/manuos-demo.mp4) — watch or download the recorded walkthrough; served at `/videos/manuos-demo.mp4`.
- [Product presentation](public/presentation.html) — open `/presentation.html` on the running ManuOS site for the interactive presentation.
- Public application demo: open `/demo` on the same site.

These routes use your current ManuOS origin, whether local or deployed. Presentation links to `/demo` and `/login` stay on that origin; no localhost URL is hardcoded. The file links above point to repository assets when reading this README on GitHub.

## Documentation

| Document | What it covers | Intended readers |
| --- | --- | --- |
| **[Operating Guide](docs/operating-guide.md)** | Setup, people and access, workflow/form authoring, order-to-delivery procedures, scheduling, AI, and troubleshooting. | Administrators, Sales, Engineering, PPIC, technicians, QC, Warehouse, and owners. |
| **[Detailed Feature Catalog](docs/feature-catalog.md)** | Implemented features, entry points, cross-module behavior, and current limitations. | Users, product reviewers, implementation teams, and developers. |
| [API Contract](contracts/openapi.yaml) | Maintained HTTP contracts for development and integration. | Developers and integrators. |

## Implemented capabilities

- **People & Access:** login accounts, workspace memberships, departments, roles, permission previews, customer/technician/facility links, and role-aware landing pages.
- **Order Hub:** order drafts and item lines, RFQ intake, requested/promised dates, lifecycle selection, production routing, and order history.
- **Workflow Studio:** separate order-lifecycle and production-routing definitions, version review/publication, React Flow maps, dependencies, bounded branching, assignment policies, and published form pins.
- **Form Builder:** dynamic order, task, and QC forms with validation, required fields, conditional visibility, previews, versioning, and historical evidence.
- **Planning:** list/Gantt/calendar views, qualified resource assignment, published availability and bookings, and finite-capacity proposals for released jobs.
- **Workforce:** calendars, rosters, technician qualifications, shift swaps, overtime policies, and permission/supervisor checks.
- **Production & Quality:** workstation controls, work sessions, output, issues, evidence forms, inspection, rework, scrap, and non-conformance records.
- **Inventory & Procurement:** item/location/lot balances, reservations, transfers, WIP issues/returns, physical counts, supply orders, and receipts.
- **Delivery & Traceability:** QC-passed stock allocation, dispatch, delivery confirmation, order evidence, serialized passports, and a scoped customer portal.
- **CoreAI:** operational assistance, risk views, text RFQ extraction, measured-history comparisons, delivery-date evaluation, recovery review, and provider-backed builder proposals.

An order follows its selected lifecycle definition. **Sales → Engineering → PPIC → Production → QC → Delivery** is a demo configuration, not a hardcoded sequence for every order. See the [Feature Catalog](docs/feature-catalog.md) for the distinctions and limits.

## Run locally

### Requirements

- Node.js 20.19+ on a compatible release; the Dockerfile uses Node.js 20.
- npm and writable storage for SQLite and uploaded documents.
- A Gemini API key for provider-backed AI features.

### Install and configure

```bash
npm ci
cp .env.example .env
```

Replace `BETTER_AUTH_SECRET` with a unique secret of at least 32 characters. For example:

```bash
openssl rand -hex 32
```

Load the environment before running standalone database scripts:

```bash
set -a
source .env
set +a

mkdir -p prisma/data
npx prisma generate
npm run db:migrate
npm run db:seed
```

`DATABASE_URL=file:./data/dev.db` resolves relative to the Prisma schema directory, placing the database at `prisma/data/dev.db`.

Create your own administrator if needed:

```bash
npm run auth:bootstrap -- --email owner@example.test --workspace DEMO
```

The script prompts for a password. Public self-registration is disabled. Use the demo seeder below for test accounts and manufacturing scenarios.

### Start development

```bash
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login). The post-login destination follows the active membership, permissions, role priority, and allowed preferred landing page. Different roles do not necessarily land on Dashboard.

Development writes to `.next-dev`; production builds write to `.next`, unless `MANUOS_DIST_DIR` overrides the location.

## Local demo accounts and scenarios

```bash
npm run db:seed:demo
```

The seeder uses the configured database and an existing demo workspace; it rejects `NODE_ENV=production`. It does not reset the database. Back up a populated database before deliberately modifying demo data.

**Default password for newly created demo accounts: `Password123!`**. Every account in the table below uses this password. `DEMO_SEED_PASSWORD` overrides this default **at seed time only** — the running application never reads it, because passwords are stored as hashes in the database. Changing the variable later does not change any existing account's password. Existing passwords remain unchanged unless an explicit demo-password reset is requested.

| Account | Email in the default `DEMO` workspace | Purpose |
| --- | --- | --- |
| Superadmin | `superadmin.demo@manuos.test` | Cross-functional administration and operations; preferred landing page is Dashboard. |
| Operations lead / seed actor | `seed.demo@manuos.test` | Cross-functional account used by the demo seeder. |
| Sales | `sales.demo@manuos.test` | Customer orders and requirements. |
| Engineer | `engineer.demo@manuos.test` | Engineering and authoring as permitted. |
| PPIC / planner | `planner.demo@manuos.test` | Scheduling and assignment. |
| Buyer | `buyer.demo@manuos.test` | Procurement and supply orders. |
| Warehouse | `warehouse.demo@manuos.test` | Inventory, receipts, and shipping as permitted. |
| QC | `qc.demo@manuos.test` | Quality inspections. |
| Operators | `operator1.demo@manuos.test` through `operator6.demo@manuos.test` | Accounts linked to technician profiles. |
| Customers | `customer1.demo@manuos.test` through `customer3.demo@manuos.test` | Customer-scoped order portal. |

The demo Superadmin combines administrative and operational roles; it is not a single role code named `SUPERADMIN`. For a custom workspace code, account addresses use that code in lowercase instead of `demo`.

The seed includes draft, engineering, shortage, reserved, running, paused, waiting-QC, rework, scrap, allocated, in-transit, and delivered scenarios. One order exercises the cross-department lifecycle. The report is written to `prisma/data/demo-seed-report.json`. The script prints the path to a restricted-permission local credentials file for newly created accounts.

To **deliberately reset seed-managed demo account passwords**:

```bash
DEMO_SEED_PASSWORD='Password123!' DEMO_SEED_RESET_PASSWORD=true npm run db:seed:demo
```

This revokes the affected demo account sessions. A normal seed rerun preserves subsequent interactions; it does not restore every scenario to its original state. See the [Demo Data Guide](docs/demo-data-guide.md).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite database URL; example: `file:./data/dev.db`. |
| `BETTER_AUTH_SECRET` | Server authentication secret. |
| `BETTER_AUTH_URL` | Authentication origin; local development uses `http://localhost:3000`. |
| `GEMINI_API_KEY` | Server-only AI provider credential. |
| `GEMINI_FLASH_MODEL` | Model override. `.env.example` sets `gemini-2.5-flash`; the shared client falls back to `gemini-flash-lite-latest` when unset. |
| `GEMINI_PRO_MODEL` | Additional model setting in the example environment; not every AI path uses it. |
| `NEXT_PUBLIC_MANUOS_ORDER_LIFECYCLE_ENABLED` | Enables lifecycle selection/adoption on order drafts; the example sets `true`. |
| `MANUOS_DIST_DIR` | Overrides the Next.js output directory. |
| `DEMO_SEED_WORKSPACE`, `DEMO_SEED_ANCHOR` | Demo workspace code and scenario date anchor. |
| `DEMO_SEED_PASSWORD`, `DEMO_SEED_RESET_PASSWORD` | Seed-script-only inputs (not read at runtime): password for new demo accounts and explicit reset of existing seed-managed accounts. |

Keep provider credentials server-side. Do not expose them through `NEXT_PUBLIC_` variables or commit `.env`.

## Current AI behavior

**Form Builder**, **production routing**, and **order lifecycle** share `/api/ai/builder-proposals`. Generation calls the configured provider using the saved draft and authorized workspace catalogs. The server validates schema, graph structure, form purpose, and supported department, role, member, and published-form references.

Users compare and acknowledge the proposal before applying it to a **draft**. Applying does not publish. Stale revisions and blocking findings prevent application. Missing provider configuration, timeout, or malformed responses produce explicit errors; builder generation does not substitute a canned template.

The operational assistant has a separate deterministic record-summary fallback. Scheduling, technician ranking, and several operational evaluations use deterministic engines rather than language-model assertions. PDF/image OCR, automated visual QC, alternate recovery routing, and optimized split-shipment recovery remain outside the connected flows documented here.

See [Using CoreAI](docs/operating-guide.md#12-using-coreai) and [CoreAI and Builder AI](docs/feature-catalog.md#13-coreai-and-builder-ai).

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check TypeScript. |
| `npm test -- tests/integration/builder-proposals-ai.test.ts` | Run a focused specification file. |
| `npm test -- tests/integration` | Run the integration directory. |
| `npm run db:migrate` | Apply committed migrations. |
| `npm run db:seed` | Initialize baseline workspace roles and permissions. |
| `npm run db:seed:demo` | Populate/synchronize demo scenarios. |
| `npm run db:reconcile` | Reconcile balance projections against the inventory ledger. |
| `npm run db:backup` | Create a database backup through the repository script. |
| `npm run db:restore -- <manifestPath> <targetDbPath>` | Restore a backup to the selected database path; read the runbook before overwriting a database. |

The `test:integration` and `test:e2e` scripts both invoke `vitest run` without default directory filters. Script/folder names alone do not establish browser automation. Keep specification, browser, live-provider, and deployment evidence distinct.

## Build and deployment

```bash
npx prisma generate
npm run build
npm start
```

`npm start` serves on **port 8080**. For a local production preview, set `BETTER_AUTH_URL=http://localhost:8080`. Migrations, secrets, and persistent database/document storage must be configured for the target environment.

Previously recorded demo address: [ManuOS on Cloud Run](https://manuos-web-111572702355.us-central1.run.app). Service status, deployed revision, credentials, and deployment persistence were not reverified for this documentation update. `/demo` is a separate UI demonstration; authenticated workspace routes use persisted operational data.

## Architecture

Next.js 15, React 19, TypeScript, Tailwind CSS 4, shared UI primitives, React Flow, Prisma 6, SQLite, Better Auth, TanStack Query, and the Google Gen AI SDK.

- Business mutations run through domain transactions, idempotency controls, and audit records.
- Physical inventory changes use a double-entry ledger.
- Internal quantities use `bigint` atoms: **1 display unit = 1,000,000 atoms**. Use the domain quantity helpers rather than floating-point arithmetic.
- Lifecycle definitions control cross-department ownership. Production routing defines the operations and dependencies scheduled by Planning.
- Attached workflow/form versions remain pinned for historical evidence.
- Menus and APIs enforce capabilities; role names and departments alone do not grant access.

Application source is in `src/`, schema/migrations in `prisma/`, operational scripts in `scripts/`, specifications in `tests/`, and API contracts in `contracts/`.

## Developer references

- [Repository rules](AGENTS.md)
- [Operating Guide](docs/operating-guide.md)
- [Detailed Feature Catalog](docs/feature-catalog.md)
- [Software architecture](docs/SOFTWARE_ARCHITECTURE_MANUOS.md)
- [Design system](docs/DESIGN.md)
- [Access administration](docs/access-administration.md)
- [Deployment contract](docs/operations/deployment-contract.md)
- [Deployment runbook](docs/deployment-runbook.md)
- [Dynamic forms integration](docs/dynamic-forms-integration.md)
