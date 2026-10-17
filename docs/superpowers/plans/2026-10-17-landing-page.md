# ManuOS Landing Page — Implementation Plan

> Prinsip: hanya klaim fitur yang **benar-benar ada di source** (route + module + test). Tidak ada stat fiktif, testimoni palsu, atau mock (AGENTS.md §6.4).

## 1. Kondisi Sekarang

- `/` ([page.tsx](../../../src/app/page.tsx)) hanya redirect: login → `/login`, sudah login → landing persona via `getLandingPage`.
- Belum ada halaman publik/marketing. `/demo` dan `/login` sudah ada.
- Aturan UI: light theme, token di `globals.css` (`--bg #f5f7fb`, `--primary #2459df`, dst), primitif di `src/components/ui/`, **tanpa** dark container.

## 2. Fitur yang Boleh Diklaim (evidence-based)

| Pilar | Bukti di repo |
|---|---|
| Order intake → release → MO/jobsheet/task DAG | `/orders`, `/orders/intake`, module `orders`, `workflow`; test order-release, workflow-independence |
| Workflow Studio (versioned, validated DAG, multi-type) | `/workflows`, `workflow-versions.test.ts` |
| Engineering hub (BOM revisions, change orders, substitutes) | `/engineering`, `/api/engineering/*` |
| Inventory double-entry ledger, lots, counts, receipts, transfers | `/inventory/*`, `ledger.ts`, `inventory-ledger.test.ts` |
| Supply orders / purchasing | `/supply-orders` |
| Planning & published schedules | `/planning`, `published-schedules.ts` |
| Shop floor execution (task, output, scrap, rework) | `/shop-floor/*`, module `execution` |
| Quality inspections + QC checklists | `/quality/inspections`, module `quality` |
| Delivery / shipments | `/delivery/shipments` |
| Customer portal + product passport | `/portal/orders`, `/passports/[serial]` |
| AI (risks, recovery proposals, promise, assistant) — human-approved | `/ai/*`, module `intelligence` |
| RBAC (permissions, roles), customer isolation, audit, idempotent commands | `/settings/roles|permissions|users`, `access.test.ts`, `commands.test.ts` |
| Integrations (API keys, webhooks), notifications | `/settings/integrations`, module `notifications` |

**Jangan diklaim** (belum ada/ditandai open di `product-rev-implementation-status.md`): live machine telemetry, recovery yang benar-benar apply schedule/reserve shipment, fractional recovery, offline queue shop floor, Factory Network produksi. Jika disebut, beri label "Roadmap" mengacu `ROADMAP_SCALING.md`.

## 3. Struktur Halaman

Route group baru `src/app/(marketing)/` dengan layout sendiri (tanpa `AuthenticatedShell`).

1. **Nav**: logo, anchor (Platform, Personas, Trust), CTA `Sign in` → `/login`, `View demo` → `/demo`.
2. **Hero**: "Make-to-order manufacturing, one operational state." + sub dari `PRODUCT.md` Product Purpose. Visual: screenshot nyata Command Center/Dashboard (capture dari app, bukan mockup).
3. **Alur end-to-end**: Order → Engineering → Release → Plan → Execute → QC → Deliver → Passport (8 langkah, tiap langkah link ke fitur nyata).
4. **Per persona** (Owner, Supervisor, Technician, Customer): 4 kartu sesuai `PRODUCT.md` Users; screenshot masing-masing view.
5. **Pilar integritas**: integer atoms/conservation, double-entry ledger, append-only audit, idempotent commands, RBAC + customer isolation. Angka (mis. jumlah test) dibaca saat build, bukan hardcode — atau dihilangkan.
6. **AI dengan human approval**: risks → recovery proposal → approve. Cantumkan batasan capability secara jujur.
7. **Roadmap/Limitations** singkat (dari `ROADMAP_SCALING.md`).
8. **CTA akhir + footer**.

## 4. Routing & Auth

- `/` : jika belum login → render landing; jika sudah login → tetap redirect persona (perilaku sekarang dipertahankan). Ubah catch di `page.tsx` agar render landing, bukan `redirect('/login')`.
- Cek `middleware`/proxy agar `/` publik dan tidak memicu redirect login.
- Landing tidak memanggil API ber-auth.

## 5. Teknis

- Server Component; komponen di `src/components/marketing/` (`Hero`, `FlowSteps`, `PersonaCards`, `IntegrityGrid`, `Footer`).
- Pakai `Button`/`ButtonLink`, token CSS yang ada; tambah class `.mk-*` di `globals.css` hanya bila perlu.
- Gambar: screenshot dari seeded demo (`docs/demo-runbook.md`) → `public/assets/landing/`, `next/image`, ukuran eksplisit.
- Ikon via `src/components/icons.tsx` (tambah ikon typed bila kurang).
- SEO: `metadata` (title, description, OG), satu `<h1>`, semantic sections, id unik per CTA.
- A11y: focus visible, kontras, `prefers-reduced-motion`, responsif desktop/tablet/mobile.
- Bahasa: English (sesuai PRODUCT.md), copy ringkas.

## 6. Langkah Eksekusi

- [ ] 1. Konfirmasi keputusan terbuka (§8).
- [ ] 2. Audit klaim: tiap bullet copy dipetakan ke route/test; buang yang open.
- [ ] 3. Seed demo & capture screenshot (dashboard, orders, planning, shop-floor, QC, portal, passport).
- [ ] 4. Buat `(marketing)` layout + komponen + copy.
- [ ] 5. Ubah `/` untuk render landing bagi anon; verifikasi middleware.
- [ ] 6. Styling pakai token; cek tanpa dark surface.
- [ ] 7. Verifikasi: `npm run typecheck`, `npm run build`, e2e kecil (`/` anon render landing; CTA → `/login`; logged-in → redirect persona), cek browser 3 breakpoint, Lighthouse (LCP/a11y).
- [ ] 8. Pastikan suite existing tetap hijau (`npm test`, e2e `access-shell`).
- [ ] 9. Update `docs/execution-status.md`.

## 7. Acceptance Criteria

- Anon buka `/` → landing; login redirect ke persona tetap jalan.
- Semua klaim traceable ke fitur existing; tidak ada angka/testimoni fiktif.
- Typecheck 0 error, build lulus, tidak ada regresi test.
- Lighthouse a11y ≥ 95, LCP < 2.5s.

## 8. Keputusan Terbuka

1. Landing di `/` (anon) atau route terpisah `/welcome` dengan `/` tetap redirect?
2. Target audiens: calon customer/pabrik (sales) atau demo internal/investor?
3. CTA utama: `Sign in`, `View demo`, atau form "Request access" (butuh backend nyata — jika ya, scope tambahan)?
4. Screenshot nyata dari demo DB boleh dipakai, atau perlu di-anonimkan?
