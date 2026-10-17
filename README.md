# ManuOS

ManuOS is a manufacturing operations workspace for make-to-order production. It connects customer orders, engineering, materials, production planning, shop-floor execution, quality inspections, and delivery in one application, with CoreAI assistance for supported workflows.

This repository contains the Next.js application, server-side domain services, SQLite database schema and migrations, automated tests, and product documentation. Some product-revision capabilities remain partial; see the [implementation status](docs/product-rev-implementation-status.md) for detailed scope and evidence.

## Features

| Area | Capabilities |
| --- | --- |
| Command Center | Factory snapshot, order progress charts, exception severity overview, operational alerts, and links to source records. |
| Order Hub | Order intake, customer and item details, specifications, commitments, engineering handoff, and order history. |
| Engineering | BOMs, versioned workflow definitions, routing canvas, operation/inspection/approval steps, dependencies, and review/publish lifecycle. |
| Planning | Schedule list, Gantt and calendar views, dependency sequencing, critical-path information, resource assignment checks, and schedule proposals. |
| Shop Floor | Task workstation, start/pause/resume controls, work intervals, output recording, issue reporting, evidence uploads, and barcode/QR lookup. |
| Material Inventory | On-hand, reserved, and available balances by item, lot, and location; transfers, WIP issues, returns, and physical counts. |
| Procurement | Supply orders, supplier and delivery information, material purchase lines, and receipt workflows. |
| Quality | Inspection records, checklists, disposition, rework/scrap quantities, and non-conformance reporting. |
| Forms | Versioned form templates for order specifications, task evidence, and quality inspections. |
| Delivery and Traceability | Shipment records, serialized outputs, passport evidence, and supported customer-facing tracking and publication flows. |
| Master Data | Items, customers, suppliers, departments, resources, skills, certifications, and working calendars with weekly shifts and exceptions. |
| Access Administration | Workspace memberships, role-based permissions, and administrator-provisioned access through Better Auth. |
| CoreAI | Read-only operational assistant, risk inbox, RFQ text review and order-draft handoff, builder proposals, and supported promise/recovery explanations. |

**Capability boundaries:** AI suggestions require review and applicable permissions. Operational state changes run through server-side domain commands. A dependency sequence estimate is distinct from a capacity-validated schedule or customer delivery promise. AI availability depends on provider configuration and supported evidence; missing evidence is not a confirmed result.

## Live Demo

A hosted prototype runs on Google Cloud Run (`us-central1`), sized to stay inside the free tier (scales to zero, single instance):

**https://manuos-web-111572702355.us-central1.run.app**

Open the URL and sign in at `/login`. The workspace starts with the full seeded demo dataset — customer orders, engineering BOMs and routings, schedules, shop-floor tasks, inventory lots and ledger movements, inspections, and shipments.

### Demo credentials

Public self-registration is disabled. Every demo account below uses the password **`ManuOS4all!@#`**.

| Account | Email | Roles |
| --- | --- | --- |
| **Operations lead — start here** | `seed.demo@manuos.test` | OWNER, ACCESS_ADMIN, ENGINEER, PLANNER, WAREHOUSE, QC, SALES, BUYER |
| Planner | `planner.demo@manuos.test` | PLANNER |
| Engineer | `engineer.demo@manuos.test` | ENGINEER |
| Buyer | `buyer.demo@manuos.test` | BUYER |
| Warehouse | `warehouse.demo@manuos.test` | WAREHOUSE |
| Quality inspector | `qc.demo@manuos.test` | QC |
| Sales | `sales.demo@manuos.test` | SALES |
| Technicians | `operator1.demo@manuos.test` … `operator6.demo@manuos.test` | TECHNICIAN |
| Customers | `customer1.demo@manuos.test` … `customer3.demo@manuos.test` | CUSTOMER |

Each account only sees what its role permits, so signing in as different users is the fastest way to see the permission model in action.

### Suggested walkthrough

1. **Command Center** — factory snapshot, order progress, and exception overview for the demo plant.
2. **Order Hub** — open a demo customer order and follow its specification, commitments, and engineering handoff.
3. **Engineering** — review a BOM and the versioned routing workflow (operation, inspection, and approval steps).
4. **Planning** — inspect the schedule via the Gantt and calendar views, including dependency sequencing.
5. **Shop Floor** — sign in as `operator1.demo@manuos.test` to open a task, start/pause work, and record output.
6. **Quality** — sign in as `qc.demo@manuos.test` to review inspections, dispositions, rework/scrap, and non-conformance reports.
7. **Inventory** — check on-hand, reserved, and available balances by item, lot, and location; the double-entry ledger reconciles.
8. **Delivery & Traceability** — inspect shipments and serialized product passports.

### Notes for reviewers

- The hosted demo restores its SQLite database from Cloud Storage on cold start and snapshots it back periodically, so the data you create persists across restarts. Treat it as a **shared** environment and avoid entering real customer or personal data.
- The service scales to zero when idle; the **first request may take a few seconds** to cold-start. Subsequent requests are fast.
- `/api/health` returns a JSON readiness probe that also confirms the database is live and enforcing foreign keys.

## AI Usage (CoreAI)

ManuOS uses **Google Gemini** (AI Studio Developer API, free tier) for **server-side grounded assistance only**. Every AI call reads a strictly scoped view of workspace state (evidence indexed, permissions enforced), and outputs are validated against that scope. Hallucinated IDs are rejected and the service falls back to grounded, record-derived answers when needed.

- **Operational assistant (Production Brain) — `/api/ai/brain-qa`**
  - Answers "what/where/why" questions about orders, inventory, planning, and tasks using *only* authorized evidence.
  - Click the assistant (copilot drawer) to ask natural-language questions; suggestions include "What is the status of active orders?", "Summarize inventory balances", and "Give me a production overview".
  - Grounded by `ProductionBrainService` + `buildAuthorizedContext`; context can be scoped to a specific order/task/item.

- **RFQ extraction — `/api/ai/extract-rfq`**
  - Parses RFQ text into a draft customer, part, quantity, material, tolerances, ambiguities, BOM, routing, and QC checklist for review/handoff to order intake.

- **Builder proposals — `/api/ai/builder-proposals`**
  - Generates proposal drafts from requirements (cost/material/routing) to help speed review before publishing a proposal.

- **Workflow generation — `/api/ai/generate-workflow`**
  - Proposes an initial versioned workflow (nodes/edges/transition rules/warnings) from an order-type description; the proposal must be reviewed and published before use.

- **Impact explanation — `/api/ai/explain-impact`**
  - Explains disruption impact (orders, blocked/runnable tasks, blast radius, watch items) using the provided operational snapshot.

- **Dispatch rationale — `/api/ai/dispatch-rationale`**
  - Produces a grounded rationale for a proposed dispatch (skill match, certifications, queue depth) based on the supplied task and ranked candidates.

- **Factory memory recommendations — `/api/ai/memory-recommend`**
  - Surfaces operational lessons/recommendations grounded in the provided query and stats.

- **Partner fit — `/api/ai/partner-fit`**
  - Assesses partner fit against requirements (department, machine class, quantity, distance, rate, quality) with a short narrative and risk notes.

**AI configuration (cheap/free-friendly):**
- Cheapest viable model is `gemini-flash-lite-latest` (non-thinking), avoiding thinking-token truncation and minimizing cost. Live demo defaults to it.
- No client-authoritative AI; every AI call is server-side with permission checks and schema validation.

## Technology Stack

- **Application:** Next.js 15 App Router, React 19, TypeScript in strict mode.
- **UI:** Tailwind CSS 4, shared light-theme components, and React Flow for workflow editing.
- **Data:** SQLite and Prisma ORM 6; TanStack Query for client-side server state.
- **Authentication:** Better Auth with workspace-scoped authorization.
- **AI:** Google Gen AI SDK, called from the server.
- **Testing:** Vitest, including domain, integration, and API/flow-oriented tests.

## Requirements

- Node.js **20.19 or later** within a compatible supported release; the Dockerfile uses Node.js 20.
- npm and a writable local filesystem for SQLite and document storage.
- A Gemini API key only if you want to use provider-backed AI features.

## Run Locally

### 1. Install dependencies

From the repository root:

```bash
npm ci
cp .env.example .env
```

Edit `.env` before continuing. Replace `BETTER_AUTH_SECRET` with a unique secret of at least 32 characters. One way to generate a value is:

```bash
openssl rand -hex 32
```

The default database URL is `file:./data/dev.db`, resolved relative to `prisma/schema.prisma`, so the database lives at `prisma/data/dev.db`.

### 2. Initialize the database and administrator

Load the environment into the current shell so standalone TypeScript scripts receive the same configuration as the application:

```bash
set -a
source .env
set +a

mkdir -p prisma/data
npx prisma generate
npm run db:migrate
npm run db:seed
npm run auth:bootstrap -- --email owner@example.test --workspace DEMO
```

The bootstrap command prompts for a password and provisions an administrator with operational roles in the selected workspace. Use your own email address. Public self-registration is disabled.

### 3. Start the development server

```bash
npm run dev
```

Open **http://localhost:3000/login** and sign in with the account you created.

The development server writes to `.next-dev`; production builds write to `.next`, keeping their generated manifests separate.

### Optional: populate demonstration scenarios

With the environment loaded, run:

```bash
npm run db:seed:demo
```

This writes demo manufacturing records to the configured database. Use a local development database. Demo seeding is disabled when `NODE_ENV=production`.

New demo account credentials are written to a local temporary file with restricted permissions; its path is printed by the script. Existing logins remain unchanged. The scenario report is written to `prisma/data/demo-seed-report.json`. Optional settings include `DEMO_SEED_PASSWORD`, `DEMO_SEED_WORKSPACE`, and `DEMO_SEED_ANCHOR`; see the [demo data guide](docs/demo-data-guide.md).

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma SQLite connection URL. Default example: `file:./data/dev.db`. |
| `BETTER_AUTH_SECRET` | Server-side authentication secret. Replace the example value. |
| `BETTER_AUTH_URL` | Application origin used by authentication. Use `http://localhost:3000` for default development. |
| `GEMINI_API_KEY` | Server-only Gemini credential. Replace the placeholder to enable provider-backed AI. |
| `GEMINI_FLASH_MODEL` | Optional fast-model override; configured default is `gemini-flash-lite-latest`. |
| `MANUOS_DIST_DIR` | Optional override for Next.js generated output location. |

Never expose server secrets through `NEXT_PUBLIC_` variables or commit `.env`. The application can run without a valid Gemini key, but provider-backed AI features will be unavailable or show their supported fallback/error state.

## Production Build

Set `BETTER_AUTH_URL` to the actual serving origin before running the application. For a local production preview, use `http://localhost:8080`.

```bash
npx prisma generate
npm run build
npm start
```

`npm start` serves on **port 8080**. Initialize/migrate the target database separately using the setup commands above.

A multi-stage Dockerfile is included and runs the standalone Next.js server on port 8080. Persistent database/document storage, secrets, and migration execution require deployment configuration; building an image alone does not initialize a production environment. See the [deployment contract](docs/operations/deployment-contract.md) and [deployment runbook](docs/deployment-runbook.md).

## Folder Structure

```text
manuos-sg/
├── contracts/               # API contracts, including OpenAPI
├── docs/                    # Product, architecture, design, plans, and runbooks
│   ├── operations/          # Deployment and operating contracts
│   ├── product_rev/         # Product-revision source requirements
│   └── superpowers/         # Specifications and implementation plans
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Versioned database migrations
│   ├── seed.ts              # Permissions and role seeding
│   └── data/                # Local SQLite database and generated seed reports
├── public/                  # Public static assets
├── scripts/                 # Admin bootstrap, demo seed, reconciliation, backup/restore
├── src/
│   ├── app/                 # Next.js pages, layouts, and route handlers
│   │   ├── (account)/       # Account routes
│   │   ├── (auth)/          # Sign-in routes
│   │   ├── (customer)/      # Customer-facing routes
│   │   ├── (evidence)/      # Evidence/publication routes
│   │   ├── (workspace)/     # Authenticated operational pages and shared shell
│   │   └── api/             # Server HTTP endpoints
│   ├── components/          # Shared UI primitives and application shell
│   ├── data/                # Supporting application data
│   ├── domain/              # Domain types, validation, and quantity helpers
│   ├── engines/             # Deterministic calculation and scheduling engines
│   ├── features/            # Feature APIs, hooks, components, and tests
│   ├── lib/                 # Shared application utilities
│   ├── server/              # Authentication, database, AI, HTTP, and domain services
│   │   └── modules/         # Server-side business modules
│   └── store/               # Client-side state stores
├── storage/                 # Local document/file storage
├── tests/                   # Unit, integration, E2E-oriented tests and fixtures
├── ui-prototype/            # Separate UI prototype artifacts
├── .env.example             # Example environment configuration
├── Dockerfile               # Standalone production container build
└── package.json             # Dependencies and runnable scripts
```

## Useful Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server on port 3000. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build on port 8080. |
| `npm run typecheck` | Check TypeScript without emitting JavaScript. |
| `npm test` | Run the Vitest suite. |
| `npm test -- tests/integration` | Run tests under the integration directory. |
| `npm test -- tests/e2e` | Run tests under the E2E directory using Vitest. |
| `npm run db:migrate` | Apply committed Prisma migrations. |
| `npm run db:seed` | Seed permissions and default workspace roles. |
| `npm run db:seed:demo` | Populate local demo scenarios. |
| `npm run auth:bootstrap -- --email <email> --workspace <code>` | Provision an administrator; prompts for a password. |
| `npm run db:reconcile` | Check database inventory reconciliation. |

The `test:integration` and `test:e2e` scripts currently both invoke `vitest run` without directory filters. Their names do not imply browser automation; pass a path to target a directory. Load `.env` in your shell before standalone database scripts.

## Architecture and Contribution Notes

- Business commands use the transaction boundary in `src/server/db/transaction.ts`, including idempotency, audit, and command logging.
- Physical inventory movements use the double-entry ledger in `src/server/modules/inventory/ledger.ts`.
- Quantities use integer `bigint` atoms: **1 display unit = 1,000,000 atoms**. Use the helpers in `src/domain/quantity.ts` instead of floating-point quantity arithmetic.
- The authenticated workspace layout owns the shell; individual pages render page content only.
- Reuse shared UI components and semantic light-theme tokens. CRUD forms use centered modal dialogs.
- Run `npm run typecheck` and relevant tests before submitting changes. Use isolated database fixtures for integration tests.

See [AGENTS.md](AGENTS.md) for the full repository rules.

## Further Reading

- [Product requirements](docs/PRD_MANUOS_PROTOTYPE.md)
- [Software architecture](docs/SOFTWARE_ARCHITECTURE_MANUOS.md)
- [Design system](docs/DESIGN.md)
- [Product-revision implementation status](docs/product-rev-implementation-status.md)
- [Access administration](docs/access-administration.md)
- [Demo data guide](docs/demo-data-guide.md)
- [API contract](contracts/openapi.yaml)
