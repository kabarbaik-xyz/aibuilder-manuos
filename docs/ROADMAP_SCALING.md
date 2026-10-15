# ManuOS · Technical Roadmap & Scaling Blueprint (P-10)

This document outlines the transition path from the validated demo-ready prototype to an enterprise-grade, multi-tenant manufacturing cloud platform.

---

## 1. Architecture Evolution

```
[ Prototype Phase: Current ]
Next.js App Router ────► Zustand (Browser Session) ────► Pure TS Engines
                     └──► Next.js Server Routes  ────► Gemini 2.5 Flash

[ Enterprise Production: Next Target ]
Web & Mobile UI     ────► Next.js Frontend (SSR/Edge)
                     └──► NestJS / Go Microservices
                            ├── Graph Event Sourcing (Kafka / RabbitMQ)
                            ├── Engine Compute Worker (Rust / Node.js)
                            ├── PostgreSQL + TimescaleDB (Shop Floor IoT)
                            ├── Supabase / pgvector (Factory Memory RAG)
                            └── Google Cloud Run / GKE Cluster
```

---

## 2. Phase Breakdown

### Phase 10: Enterprise Foundation & Durable State (Q1 2027)
1. **Durable Graph Store:**
   - Migrate browser-session Zustand state to PostgreSQL with Prisma ORM.
   - Maintain Zustand on the client for optimistic UI updates with React Query / SWR cache invalidation.
   - Implement event sourcing for manufacturing audit logs (every state change is an immutable event).
2. **Multi-Tenant Authentication & RBAC:**
   - Implement enterprise SSO (SAML 2.0 / Okta / Google Workspace).
   - Fine-grained role-based access control:
     - `Owner / Executive`: Full factory view, financial impact, recovery approval.
     - `Production Manager`: Schedule editing, machine queue management, dispatch overrides.
     - `Technician / Operator`: Workstation view, work order clock-in/out, scrap logging.
     - `Customer`: Restricted view scoped strictly to their purchased orders.
3. **Database Schema & Tenancy Isolation:**
   - Row-Level Security (RLS) on PostgreSQL ensuring strict isolation between independent contract manufacturers.

---

### Phase 11: Real-Time Machine Connectivity & IoT Edge (Q2 2027)
1. **Shop Floor Edge Gateway:**
   - Deploy lightweight edge daemon (Go/Rust on Raspberry Pi / industrial IPC) connected via MTConnect, OPC-UA, or Modbus.
   - Real-time spindle status, feed rates, cycle times, and automated piece counters.
2. **Automated Progress Verification:**
   - Replace manual piece counter entry with hardware sensor triggers.
   - Trigger CMM automated inspection log imports to update QC-passed quantities directly into Unit Passports.

---

### Phase 12: External ERP & Supply Chain Connectors (Q3 2027)
1. **Bidirectional ERP Connectors:**
   - Out-of-the-box connectors for Odoo ERP, SAP S/4HANA, and NetSuite.
   - Synchronize Sales Orders (SO) into Manufacturing Orders (MO) and push completed inventory back into warehouse stock.
2. **Supplier Logistics Webhooks:**
   - Integrate with major freight carriers (FedEx, DHL, regional couriers) and supplier EDI 856 (Advance Ship Notice) for live ETA updates, automatically triggering the Ripple Engine upon shipment delays.

---

### Phase 13: Decentralized Factory Network & DPP Blockchain Anchor (Q4 2027)
1. **Decentralized Network Protocol:**
   - Secure peer-to-peer capacity and supply sharing between certified supplier nodes.
   - Zero-Knowledge Proofs (ZKP) for verifying partner capacity and ISO certifications without exposing raw client order books.
2. **Cryptographic DPP Verification:**
   - Anchor Unit Digital Product Passport SHA-256 hashes onto an immutable decentralized ledger for aerospace (AS9100) and defense compliance.
