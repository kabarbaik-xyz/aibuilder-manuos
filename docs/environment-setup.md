# ManuOS Environment & Toolchain Setup (P0-05)

This document specifies the validated runtime versions, dependencies, provider SDK contracts, and deployment prerequisites.

---

## 1. Verified Local Toolchain

| Tool / Runtime | Verified Version | Notes |
|---|---|---|
| Node.js | `v20.19.2` (LTS) | Supported by Next.js and Google Cloud Run Node runtime. |
| Package Manager | `npm` (10.8.2) | Chosen package manager for universal Docker compatibility and lockfile reproducibility. |
| TypeScript | `^5.6.0` | Strict type checking enabled (`strict: true`). |
| Next.js | `^15.1.0` (App Router) | Standalone output mode enabled for Cloud Run containerization. |
| React | `^19.0.0` | React 19 Server & Client components. |

---

## 2. Core Dependencies & Versions

```json
{
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@prisma/client": "^6.4.1",
    "better-auth": "^1.7.8",
    "@tanstack/react-query": "^5.104.2",
    "zustand": "^5.0.2",
    "zod": "^3.24.1",
    "@google/genai": "^0.1.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5",
    "lucide-react": "^0.468.0",
    "qrcode": "^1.5.4"
  },
  "devDependencies": {
    "prisma": "^6.4.1",
    "tsx": "^4.23.15",
    "typescript": "^5.6.3",
    "@types/node": "^20.17.10",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@types/qrcode": "^1.5.5",
    "tailwindcss": "^3.4.16",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "vitest": "^2.1.8"
  }
}
```

### Database & Storage
- **Database Engine:** SQLite 3 with WAL mode (`PRAGMA journal_mode = WAL;`)
- **Foreign Key Enforcement:** Enabled on every connection (`PRAGMA foreign_keys = ON;`)
- **Lock Concurrency:** Busy timeout set to 5000ms (`PRAGMA busy_timeout = 5000;`)
- **Quantity Scale:** BigInt fixed-point atoms (`1 unit = 1,000,000 atoms`, exact 6 decimal scale)
- **Security:** In-memory / isolated temporary SQLite databases for all unit, integration, and E2E test runs.


---

## 3. Gemini AI Provider Contracts

- **Official SDK:** `@google/genai` (Google Gen AI SDK for Node.js).
- **Recommended Models:**
  - Fast Structured Inference: `gemini-2.5-flash` (or `gemini-1.5-flash` fallback).
  - Deep RFQ Extraction: `gemini-2.5-pro` (or `gemini-1.5-pro` fallback).
- **Execution Boundary:** Server API routes only (`src/app/api/ai/*`). The client bundle never imports `@google/genai` and never has access to `GEMINI_API_KEY`.
- **Structured JSON Config:**
  ```typescript
  import { GoogleGenAI } from '@google/genai';
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // responseMimeType: "application/json" with structured schema
  ```

---

## 4. Google Cloud Run Deployment Prerequisites

1. **GCP Project & Services:**
   - GCP Project ID (configured during deployment).
   - Artifact Registry repository: `manuos-repo`.
   - Cloud Run service: `manuos-web`.
   - Secret Manager Secret: `GEMINI_API_KEY`.
2. **Container Runtime:**
   - Multi-stage Dockerfile using `node:20-alpine`.
   - Standalone output (`output: 'standalone'` in `next.config.ts`).
   - Container port: `PORT=8080` (Cloud Run default).
   - Health check endpoint: `GET /api/health` returning `{ status: "ok" }`.
3. **Graceful Fallback Mode:**
   - If `GEMINI_API_KEY` is not set or Cloud Run secret is omitted during initial testing, the application runs in complete deterministic fallback mode.
   - All deterministic engines, graph views, and recovery simulations function with clear non-AI badges.
