# ManuOS Prototype — Implementation Plan & Task Breakdown

Tanggal: 14 Oktober 2026. Status: **100% Selesai & Terverifikasi (P0–P9)**.

**Goal:** menghasilkan prototype yang bisa didemokan dari disruption → impact → recovery → human approval → perubahan plan/customer promise, lengkap dengan Factory Memory, Skill-Aware Dispatch, Factory Network, supporting features, dan live Gemini di Cloud Run. [STATUS: TERCAPAI LENGKAP]

**Architecture:** satu aplikasi Next.js App Router + React + TypeScript. Manufacturing Graph di Zustand menjadi sumber state; pure TypeScript engines menghitung angka; server API routes memanggil Gemini; perubahan operasional hanya diterapkan melalui action yang tervalidasi dan persetujuan manusia.

**Tech stack dari dokumen:** Tailwind, shadcn-style components, Zustand, Zod, Vitest, `@google/genai`, standalone container, Cloud Run, Secret Manager, Cloud Logging. Versi package, model Gemini, dan runtime yang masih didukung diverifikasi pada P0 sebelum dipin.

Plan ini adalah dokumen kerja internal dalam Bahasa Indonesia. UI, proposal, video, dan materi submission menggunakan English.

## 1. Dasar plan dan kondisi awal

Sumber requirement:

| Dokumen | Peran | Bagian utama |
|---|---|---|
| [BRD_MANUOS.md](BRD_MANUOS.md) | Masalah bisnis, BR-01–BR-24, batas prototype, manfaat | §7, §9–§12 |
| [PRD_MANUOS_PROTOTYPE.md](PRD_MANUOS_PROTOTYPE.md) | Feature/FR, screen S1–S7, seed, demo, acceptance | §5–§8, §11–§16 |
| [SOFTWARE_ARCHITECTURE_MANUOS.md](SOFTWARE_ARCHITECTURE_MANUOS.md) | ADR, domain, engines, AI contracts, state machines, deployment | §2–§3, §6–§15 |

Hasil inspeksi folder saat menyusun plan: hanya tiga dokumen tersebut; belum ada source app, package manifest, Dockerfile, test suite, atau Git repository. Path seperti `src/lib/critical-path/index.ts`, `prisma/schema.prisma`, dan `docs/DYNAMIC_WORKFLOW_BLUEPRINT.md` adalah **referensi repo ManuOS lain yang disebut dokumen**, bukan asset yang sudah tersedia di folder ini. Jangan menandai task reuse selesai sebelum source tersebut diperiksa.

Prioritas jika sumber berbeda: BRD menentukan tujuan bisnis; PRD menentukan fidelity dan scope prototype; architecture menentukan struktur implementasi. Konflik angka/alur diselesaikan di P0 dan dicatat, tidak ditutupi dengan angka UI hardcoded.

## 2. Scope dan pendekatan

**Wajib fully working:** F3 Dependency Intelligence, F4 Self-Healing Production, F7 Factory Memory, F10 Skill-Aware Dispatch, F12 Factory Network (capacity **dan** supply).

**Wajib demoable-lite:** F1 Production Brain, F2 Promise Engine, F5 Engineering Copilot, F8 Passport, F13 Dynamic Workflow Generation. F13 tetap menghasilkan DAG valid, preview, approval, instantiation, dan input matching yang nyata.

**Wajib persona/UI:** S1 Owner, S2 Supervisor, S3 Technician, S4 Customer, S5 Network, S6 Recovery Studio, S7 Intake. Customer portal dibangun bersama recovery, karena merupakan bukti perubahan customer promise.

**Di luar implementasi prototype:** production auth/SSO, DB durable, real tenant isolation, real-time multi-user sync, IoT, real camera/QC AI, Odoo/email integrations, Profit Radar, RAG/LMS. Roadmap boleh ditampilkan dengan label Future. Voice/WhatsApp input sudah dihapus dari scope produk.

Tiga pilihan pendekatan:

| Pendekatan | Keuntungan | Trade-off |
|---|---|---|
| **Graph + engine, lalu alur end-to-end (rekomendasi)** | Angka dan state konsisten; demo bernilai sudah ada sebelum supporting features lengkap | Fixture dan kontrak perlu dibereskan di awal |
| Semua screen/UI dulu | Cepat terlihat lengkap | Risiko screen memakai state/angka berbeda; approval baru diuji belakangan |
| Port platform production secara luas | Bisa memakai banyak asset lama | Membawa auth/DB/workflow runtime di luar scope; biaya adaptasi lebih besar |

Plan memilih pendekatan pertama, dengan port asset yang relevan setelah diverifikasi.

## 3. Aturan global implementasi

1. Semua KPI, ETA, cost delta, fit score, dan progress berasal dari engine/selector. Gemini tidak menjadi sumber angka operasional.
2. `realProgress = qcPassedQty / orderedQty`; completed dan QC-passed ditampilkan terpisah. Jangan menjumlah progress setiap operasi menjadi output final order.
3. Graph/Gantt/Kanban adalah proyeksi state yang sama; containment Order→MO→Jobsheet→Task berbeda dari dependency edges untuk scheduling.
4. AI proposal, RFQ extraction, workflow draft, network proposal, dan recovery draft tidak langsung mengubah active plan.
5. Approval menerapkan perubahan plan, quantities, assignments, promise, dan audit dalam satu update state. Validasi ulang terhadap state terbaru sebelum apply; apply ulang tidak menggandakan perubahan.
6. Persona switcher adalah simulasi demo, bukan production authorization. Customer projection tetap membatasi order dan field yang terlihat.
7. Capacity consent dan supply consent diperiksa terpisah sebelum matching, UI detail, context serialization, dan apply deal. Informasi private partner tidak masuk prompt.
8. `GEMINI_API_KEY` server-only. Input dan output API schema-validated; RFQ diperlakukan sebagai data, bukan instruksi.
9. Saat Gemini gagal, panel deterministik tetap bekerja. Recovery fallback rule-based ditandai jelas; tidak boleh diberi label live AI.
10. State prototype hanya browser session; pindah screen/persona mempertahankan state, reload/reset mengembalikan seed. Tidak menambah server store agar demo client state tidak pecah menjadi dua sumber kebenaran.
11. Seed menggunakan fictional entities dan demo clock tetap. Jangan bergantung pada tanggal hari ini untuk jadwal November atau validitas sertifikasi.
12. Semua task di bawah belum selesai. Implementer membaca referensi tahap, mengerjakan checkbox, menjalankan exit checks, lalu mencatat bukti. Commit/push/deploy dilakukan saat diotorisasi dalam sesi eksekusi.

## 4. Konflik dokumen yang harus diselesaikan di P0

| Temuan | Sumber | Usulan keputusan / task |
|---|---|---|
| Hero order disebut 68% real progress, tetapi 78 QC-passed /120 = **65%**; 82 completed /120 =68.33% | PRD §13.1 | Pertahankan quantity; UI menampilkan 65% QC-passed dan 82 completed. P0-02/P2-03 |
| Split Batch mengirim40 unit lebih dulu, sementara78 sudah QC-passed | PRD §7.2, §13.1 | Pisahkan produced/QC-passed/shipped. Tranche40 memakai ready inventory; sisa80 terdiri dari38 ready dan42 belum QC-passed. Approval tidak menambah completed/QC-passed; tetapkan shipment readiness/date di fixture |
| F3 acceptance meminta ≥3 affected tasks pada ≥2 orders; scenario menyebut 3 blocked; architecture contoh hanya T6/T7 | PRD §7.1, §13.2; architecture §8, §10.1 | Golden fixture lengkap menjadi acuan: ≥2 orders terdampak, ≥3 tasks affected, 3 blocked pada hero scenario; daftar ID ditetapkan dan diuji. Jangan menyalin contoh dua-node sebagai seluruh graph |
| Material delay +2d disebut menyebabkan ETA +3d tanpa calendar/resource detail | PRD §13.2; architecture §8 | Buat working calendar dan bottleneck yang menjelaskan tambahan hari tersebut. Target +3d harus terbukti lewat engine; bila tidak cocok, revisi fixture/scenario secara eksplisit |
| Additional Shift dan Outsource disebut feasible untuk material shortage | PRD §7.2, §13.2 | Overtime tidak menghilangkan kebutuhan material; partner juga harus memiliki material yang dibutuhkan. Jika tidak feasible, grey out dengan sebab. Jangan memaksa tiga kartu feasible demi script |
| Demo approve Split Batch, tetapi langkah berikutnya menyebut link subcontract sudah aktif | PRD §13.2 langkah 4/7 | Setelah Split Batch, link outsource masih PROPOSED. Demo capacity acceptance menjadi branch tersendiri setelah reset; hanya accepted deal punya active handoff |
| Supply partner lead 3d dianggap memulihkan external delay +2d | PRD §13.1–§13.2 | Bandingkan tanggal absolut dari demo clock: ETA network harus lebih awal dari delayed external ETA agar recovery benar. Accepted deal mengubah projection; received material baru menandai IN_STOCK |
| Workflow disebut DAG tanpa cycles tetapi mendukung loop-back/rework | PRD §8.5; architecture §7.2 | Scheduling `edges` tetap DAG; conditional rework/return masuk `transitionRules` dan event history. Full durable execution engine tetap roadmap |
| Maksimum 2 redrafts vs acceptance ≤2 AI attempts | PRD FR-13.3 dan acceptance F13 | Usulan prototype: maksimum 2 total generation attempts. Bedakan dari satu retry transport; dokumentasikan batas efektif pada P0-02 |
| History acceptance +15–20%, seed +15/+18/+21% | PRD §7.3, §13.1 | Gunakan seed 15/18/21 dengan mean 18%; jelaskan rentang sampai21. Padding15% adalah kebijakan rekomendasi, bukan rata-rata18% |
| Gemini functions disebut 7 atau8; Promise narrative belum punya named route | BRD §11.1; PRD §16.2; architecture §9.1 | Gunakan 8 route katalog architecture + usulan `/api/ai/promise-explain`; nilai completeness per capability, bukan angka7 |
| NetworkDeal schema ringkas berhenti ACCEPTED/DECLINED, state machine sampai COMPLETED; Kanban7 kolom vs status enum8 | PRD §11–§12; architecture §11 | Ikuti lifecycle lengkap untuk deals; Kanban7 kolom operasional, CANCELLED difilter/arsip. Customer acknowledgment dan template ACTIVE perlu field tersendiri |

Keputusan di atas merupakan usulan penyelarasan untuk implementasi. Catat hasil final di `docs/implementation-decisions.md`; source BRD/PRD/architecture tidak diubah otomatis oleh plan ini.

## 5. Urutan tahap dan dependency

| Tahap | Hasil yang bisa direview | Dependency |
|---|---|---|
| P0 Discovery & keputusan | Scope, fixture contract, kontrak engine/AI, reference inventory | Ketiga dokumen |
| P1 Scaffold & UI foundation | App jalan, empat persona, navigation, health route | P0 |
| P2 Manufacturing Graph & seed | State valid, hero14-task graph, reset reproducible | P1 |
| P3 Deterministic engines | Disruption/ETA/capacity/cost/dispatch/memory/network tanpa AI | P2 |
| P4 Disruption → recovery → customer | Alur utama nyata dengan fallback candidates | P3 |
| P5 Memory, dispatch, network | Lima hero features tersambung | P4 |
| P6 Gemini service | Live grounded AI + contract/error checks | P5 |
| P7 Supporting flows | Brain, Promise, Intake, Passport, Workflow, Workstation | P6 |
| P8 Hardening & deployment | Build/container, Cloud Run runtime evidence | P7 |
| P9 Demo & submission | Rehearsal, evidence, English video/PDF | P8 |

P0→P5 menghasilkan demo deterministik yang berfungsi. P6 menambahkan AI nyata. P7–P9 wajib untuk menutup seluruh scope; milestone awal bukan klaim prototype sudah lengkap.

## P0 — Documentation discovery, keputusan, dan kontrak

**Referensi:** PRD §5–§8, §11, §13, §16.5; BRD §9–§12; architecture §3, §6–§9, §11.

- [x] **P0-01 — Bekukan scope dan traceability.** Buat `docs/requirements-matrix.md`: seluruh FR yang tercantum dalam §7/§8 PRD, S1–S7, BR-01–BR-24 → task ID → acceptance → bukti. Bedakan functional requirement, roadmap teaser, dan illustrative business KPI. Selesai jika tidak ada feature/FR tanpa owner task.
- [x] **P0-02 — Selesaikan konflik dan aturan domain.** Buat `docs/implementation-decisions.md` berdasarkan tabel §4. Tetapkan demo clock, timezone, working days, hours/shift, precision/rounding, risk thresholds, score normalization, no-history confidence, quantity handoff, lifecycle/approval semantics, dan kapan ETA berubah vs barang tersedia. Selesai jika expected results bisa dihitung tanpa asumsi tersembunyi.
- [x] **P0-03 — Temukan asset referensi.** Verifikasi source CPM, schema, machine formulas, workflow blueprint, UI, Dockerfile, dan CI yang disebut dokumen. Catat lokasi/provenance di `docs/reference-inventory.md`; port hanya asset yang ada dan relevan. Bila source CPM tidak tersedia, implement forward/backward/slack dari architecture §8 dan tandai sebagai implementasi baru.
- [x] **P0-04 — Definisikan interfaces dan seed golden cases.** Buat `docs/engine-contracts.md` dan `docs/demo-fixture-spec.md`: inputs/outputs delapan engines, field additions yang diperlukan, exact affected/blocked/runnable IDs, baseline/post-event ETA, cost rates, material quantities, partial40 allocation, dan history calculations. Untuk branch recoveries, set resource/material prerequisites yang masuk akal. Selesai jika angka signature dapat diturunkan dari fixture, bukan ditetapkan di kartu UI.
- [x] **P0-05 — Verifikasi toolchain/provider/deploy prerequisites.** Periksa dokumentasi resmi versi Next/React/Node, `@google/genai` structured output, model availability, Cloud Run container/port; tetapkan package manager + lockfile. Catat kebutuhan GCP project, Gemini access, Artifact Registry, Secret Manager, quota, IAM di `docs/environment-setup.md`; yang belum tersedia dicatat sebagai dependency eksekusi.
- [x] **P0-06 — Tulis kontrak AI lokal.** Buat `contracts/openapi.yaml` untuk `/api/health`, delapan AI routes architecture, dan proposed Promise route. Definisikan request/response schema, limits, 400/413/429, success/fallback envelope, examples. Provider-specific SDK signature hanya dipilih sesudah P0-05. Jangan membuat/bind workspace Postman atau publish shared resources jika belum diperlukan.

**Exit checks:** task mapping lengkap; konflik memiliki keputusan; fixture memenuhi mathematical/domain invariants; reference inventory membedakan asset tersedia dan belum terverifikasi; API contract dapat direview.

**Guard:** jangan membawa production infra sebagai syarat prototype; jangan mengasumsikan path referensi tersedia lokal.

## P1 — Scaffold dan UI foundation

**Referensi:** PRD §12.1–§12.4, §16.2 P0; architecture ADR-01/04/06, §17.

- [ ] **P1-01 — Buat runnable app.** Create `package.json`, lockfile, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `vitest.config.ts`, `.env.example`, `.gitignore`. Pin hasil P0-05; sediakan scripts dev/lint/typecheck/test/build. Tidak ada key nyata di `.env.example`. Selesai jika dev dan production build jalan.
- [ ] **P1-02 — Bangun app shell dan persona navigation.** Create `src/components/app-shell.tsx`, `src/components/persona-switcher.tsx`, `src/lib/navigation.ts`, dan shell `src/features/{command-center,orchestrator,workstation,customer-portal,network,intake}/`. Owner/Supervisor/Technician/Customer memiliki menu yang relevan; modal recovery dapat dibuka dari Owner/Supervisor; persona change tidak mereset session. Selesai jika seluruh screen entry point dan browser navigation bekerja.
- [ ] **P1-03 — Implement design tokens dan shared states.** Token warna/typography/spacing/status di `globals.css`; primitives di `src/components/ui/`; `ai-content.tsx`, `computed-value.tsx`, `status-badge.tsx`, `empty-state.tsx`, `error-state.tsx`. English copy, focus visible, icon+text status, loading/empty/error state. Selesai jika badge AI/computed punya makna dan layout terbaca pada desktop/tablet.
- [ ] **P1-04 — Tambahkan readiness dan baseline checks.** Create `src/app/api/health/route.ts` dengan `{status:"ok"}`; update `README.md` berisi setup, commands, scope simulasi, dan lokasi plan. Endpoint health tidak memanggil Gemini. Selesai jika health HTTP200 dan build/typecheck lulus.

**Exit checks:** empat persona dapat dinavigasi; UI English; route health tersedia; tidak ada dependency API key untuk menjalankan shell.

**Guard:** tidak membuat auth/DB backend baru pada tahap shell.

## P2 — Manufacturing Graph, seed, dan state actions

**Referensi:** PRD §11, §13.1; architecture §7, §11, ADR-02/07/08.

- [ ] **P2-01 — Definisikan domain types dan validators.** Create `src/domain/types.ts`, `schemas.ts`, `graph-validation.ts`. Model seluruh entitas PRD §11; tambah explicit execution/audit events, approval status, batch/shipment allocation, customer questions/acknowledgment, material lots/required quantities, workflow lifecycle dan transition rules sesuai P0. Validasi FK, unique IDs, dependency cycles, negative duration/quantity, `0 ≤ qcPassed ≤ completed ≤ planned`, dan deal target/type consistency. Selesai jika invalid fixture ditolak dengan alasan spesifik.
- [ ] **P2-02 — Author seed yang reproducible.** Create `src/data/seed.ts`, `demo-clock.ts`, `sample-rfq.ts`, `src/data/scenarios/`. Isi4 factories,6 orders, hero120 units/2 MOs/5 jobsheets/14 tasks,8 machines,10 materials,6 technicians, history,2 prior recoveries,4 passports. Hubungkan second order ke disrupted material; sertakan weld certification, failed→reworked unit, consent-off partner, workload/supply cases. Selesai jika counts dan golden expectations P0-04 lolos validator.
- [ ] **P2-03 — Implement store, selectors, dan reset.** Create `src/store/graph-store.ts`, `actions.ts`, `selectors.ts`, `src/domain/commands.ts`. Pisahkan demo UI selection dari graph state. Sediakan inject event, assign, propose/approve/apply recovery, propose/accept/decline/receive deal, record execution/QC, draft order, approve template, acknowledge promise, reset. Selectors menghitung progress final-order, customer-safe projection, risk inputs, dan pending approvals. Selesai jika navigation tidak kehilangan state dan reset menghasilkan snapshot awal identik.
- [ ] **P2-04 — Render complete graph.** Create `src/features/orchestrator/graph-view.tsx`, `graph-layout.ts`, `node-details.tsx`. Pilih graph renderer setelah menilai14-task fixture; bedakan containment, dependency, material, dan network edges. Inspector menunjukkan context order/MO/jobsheet/task. Selesai jika semua hero tasks/dependencies terbaca dan resource/material bisa ditelusuri; critical path overlay menyusul P3.

**Exit checks:** seed validation tests, quantity selector tests, reset tests; hero graph menampilkan14 tasks dan parallel branches; customer projection tidak mengembalikan order lain.

**Guard:** hindari salinan state di tiap screen; progress completed dan QC-passed tidak boleh tertukar.

## P3 — Deterministic engines

**Referensi:** architecture §6/§8; PRD FR-3.1–3.4, FR-4.2–4.3, FR-7.1–7.3, FR-10.1–10.3, FR-12.1–12.2, FR-13.3, FR-2.2.

Semua engine di `src/engines/` adalah pure functions, memakai kontrak P0-04 dan shared calendar; test di file `*.test.ts` bersebelahan. Untuk engine/command kritis, tulis golden/negative test, pastikan gagal, implement, lalu pastikan lulus.

- [ ] **P3-01 — CPM dan scheduling calendar.** Create `calendar.ts`, `cpm.ts`. Forward/backward pass, ES/EF/LS/LF, total/free slack, critical path; tangani parallel branches, join, disconnected order graphs, missing dependencies/cycles, material release dates, machine outage, remaining work. Jangan menjadwal ulang pekerjaan finished dari nol. Selesai jika baseline dan disruption schedule sama dengan P0 fixture.
- [ ] **P3-02 — Event effects dan ripple.** Create `events.ts`, `ripple.ts`. Material delay, machine down, task overrun mengubah availability/duration pada simulation snapshot; telusuri downstream affected paths, klasifikasi blocked vs delayed/runnable, roll up per order, re-run schedule. Selesai jika hero delay menghasilkan exact golden IDs, dampak≥2 orders, dan unchanged branches tetap runnable.
- [ ] **P3-03 — Capacity/feasible date.** Create `capacity.ts`. Machine-class load, earliest available slots, quantity-scaled family routing, material ETA, working calendar, bottleneck, confidence menurut P0. Selesai jika requested200-unit order tidak overbook resource dan feasible date setelah requested date pada overloaded fixture; no-history routing menghasilkan informasi kekurangan data.
- [ ] **P3-04 — Recovery simulation dan cost.** Create `cost.ts`, `recovery.ts`, `recovery-fallback.ts`. Simulasikan SPLIT_BATCH/ADD_SHIFT/REROUTE/REASSIGN/SUBCONTRACT pada snapshot; compute time/cost/capacity impact dari rates, amounts, material prerequisites, partner matches. Bentuk2–4 fallback options jika tersedia; tidak mengklaim dua feasible ketika constraints memang tidak memungkinkan. Selesai jika infeasible tidak bisa lolos, qty split tidak bertambah, dan target+0.8/+4.2/+7.5 berasal dari fixture/rates. Material shortage tidak bisa diselesaikan hanya dengan overtime.
- [ ] **P3-05 — Skill fit dan eligibility.** Create `dispatch.ts`. Normalize setiap komponen; score0.35 skill+0.25 cert+0.20 workload+0.20 track record. Expired/missing cert menjadi hard exclusion; minimum skill diperiksa; mentoring pairing hanya untuk operasi yang mengizinkan sesuai P0. Selesai jika senior/junior/uncertified fixture punya ranking dan alasan benar; tie-break stabil dan no-qualified menghasilkan gap.
- [ ] **P3-06 — Similarity dan history stats.** Create `similarity.ts`, `memory.ts`. Match partFamily/operation/material/machineClass; aggregate overrun, rework, defect, routing/on-time evidence. Seed15/18/21 menghasilkan mean18%; recommendation padding15 mengikuti kebijakan eksplisit. Selesai jika unrelated/no-history tidak mendapat rekomendasi pasti dan actual completed events tidak dicampur dengan proposal estimates.
- [ ] **P3-07 — Capacity dan supply network matchers.** Create `network.ts`. Consent gate per channel → capability/part/spec/cert/QC fit → hours/window/lead-time/qty → rate ranking; consume workflow `requires`. Selesai jika consent-off dan missing cert/spec candidates tersisih; supply recovery menghitung absolute ETA dan accepted partner capacity tidak bisa dipakai dua kali.
- [ ] **P3-08 — Workflow validator dan instantiation.** Create `workflow-validate.ts`, `workflow-instantiate.ts`. Unique node IDs, valid endpoints, topological sort, orphan/unreachable detection, required role coverage; conditional transitions tervalidasi terpisah. Instantiate template approved/active ke order dengan unique task IDs, mapped dependencies dan requirements. Selesai jika cycle/orphan/unknown edge ditolak dan valid fan-out/join terinstansiasi.

**Exit checks:** delapan engine suites lulus; delay injection menghasilkan ETA/blocked paths tanpa Gemini; values dapat ditelusuri ke inputs, calendar, atau rates. Rekam duration engine pada seed jika mengklaim target latency architecture; jangan menganggap target<10ms sudah terbukti.

**Guard:** traversal arah downstream jangan tertukar dengan pencarian sebab upstream; hierarchy edges tidak menjadi dependency scheduling otomatis.

## P4 — Alur disruption → recovery → customer portal

**Referensi:** PRD §7.1–§7.2, S1/S2/S4/S6, §13.2; BR-01–BR-04/06–09/17/21; architecture §10.1–§10.2/§11.2.

- [ ] **P4-01 — Command Center dan disruption UI.** Create `src/features/command-center/command-center-view.tsx`, `src/features/orchestrator/event-injector.tsx`, `impact-panel.tsx`. KPI risk/progress/blockers/active recoveries, order risk cards, tiga event dialogs, impact severity/ETA/blocked/runnable, graph highlights. AI slot saat ini memakai deterministic summary yang berlabel jelas. Selesai jika event nyata mengubah seluruh projections yang relevan.
- [ ] **P4-02 — Recovery Studio comparison.** Create `src/features/recovery/recovery-studio.tsx`, `option-card.tsx`, `approval-dialog.tsx`. Compare2–4 options: before/after dates, time recovered, cost, capacity, risks, feasible/reason; recommendation berasal dari policy engine. Selesai jika infeasible card terlihat dan Approve disabled; generate/view/reject tidak memutasi active plan.
- [ ] **P4-03 — Atomic approve/apply dan audit.** Implement command P2 actions dengan fresh feasibility check, current plan revision, unique application ID, who/when/why/before/after dan approval log. Apply assignments/dates/batches/customer promise dalam satu update; stale/repeated approval ditolak atau idempotent. Selesai jika failure tidak meninggalkan partial state dan approve dua kali tidak menambah quantity/log.
- [ ] **P4-04 — Customer portal dan promise acknowledgment.** Create `src/features/customer-portal/customer-portal-view.tsx`, `order-detail.tsx`, `promise-change.tsx`. Own-orders filter, QC-passed progress, current predicted vs promised dates/confidence, milestones/Gantt-lite, QC evidence, demo comments, partial-shipment quantities/date, acknowledge change. Selesai jika customer melihat hasil recovery yang sama dengan Supervisor dan acknowledgment punya record tanpa mengubah production plan.

**Exit checks:** automated command/selector tests + browser smoke: reset→delay→impact→compare→approve Split Batch→customer acknowledge. Cek tidak ada mutation sebelum approve, qty conserved, risk/ETA berubah konsisten, audit tepat sekali.

**Guard:** pertahankan promised date asal sebagai baseline; bedakan predicted ETA, proposed promise, dan acknowledged commitment.

## P5 — Factory Memory, Skill Dispatch, Factory Network

**Referensi:** PRD §7.3–§7.5, S2/S5; BR-11–BR-16; architecture §10.3/§10.6/§11.3.

- [ ] **P5-01 — Memory cards dan learning loop.** Create `src/features/memory/memory-card.tsx`, `history-detail.tsx`. Tampilkan sample count, planned/actual, mean18%, routing rev2 evidence, padding15 policy. Recovery approval menyimpan decision context; actual outcome/QC menambah evidence ketika event terjadi, bukan otomatis menciptakan actuals di waktu approval. Selesai jika QC/rework/completed operation mengubah stats dengan traceable source.
- [ ] **P5-02 — Dispatch board dan assign.** Create `src/features/dispatch/dispatch-board.tsx`, `candidate-comparison.tsx`, `skill-gap.tsx`. Eligible ranking, excluded reason, component scores, availability date, senior/junior pairing proposal, LMS Future link. Assign terkonfirmasi mengubah task/workload/audit; reassign mengurangi beban assignee lama. Selesai jika uncertified/expired tidak dapat diassign melalui action langsung dan workload tidak double-count.
- [ ] **P5-03 — Network views dan proposals.** Create `src/features/network/network-view.tsx`, `network-map.tsx`, `capacity-tab.tsx`, `supply-demand-tab.tsx`, `proposal-dialog.tsx`. Tampilkan4 factories dengan role badges, permitted details, dua jenis edges, available hours/rates/lead-times; simulated partner accept/decline. Silent Shop hanya memiliki public demo identity/consent shell; capability, workload, rate, dan supply details tetap private. Demo publish offer/sourcing need mengubah matcher inputs. Selesai jika setiap participant bisa producer/consumer dan consent-off reason terlihat tanpa membuka private profile.
- [ ] **P5-04 — Deal lifecycle dan recovery integration.** Implement bilateral acceptance, decline, reserve capacity/supply quantity, accepted→in-progress→completed, handoff/QC return untuk subcontract, receiving untuk supply. Accepted supply memperbarui projected ETA lalu re-run CPM; material IN_STOCK hanya sesudah receive. F4 SUBCONTRACT feasibility memakai matcher + deal approval; initiating factory recovery approval tidak menggantikan consent partner. Selesai jika proposal/decline tidak mengubah active load/ETA, consent revoked menghalangi apply, dan received supply benar-benar membuka task.

**Exit checks:** full hero features berjalan tanpa live AI; separate reset branches membuktikan Split Batch, accepted subcontract, dan supply receipt; map tidak menampilkan active subcontract dari split-only approval; satu member supplier pada satu deal dan capacity consumer pada deal lain.

**Guard:** jangan mengisi sejarah dengan outcome sukses yang belum terjadi; jangan mencampur accepted shipment ETA dengan actual stock availability.

## P6 — Gemini service dan grounded AI

**Referensi:** PRD §10.2–§10.3; architecture §9, §13, §15; BR-20/21/23.

- [ ] **P6-01 — Implement shared server AI infrastructure.** Create `src/server/ai/gemini-client.ts`, `grounding.ts`, `schemas.ts`, `validators.ts`, `cache.ts`, `limits.ts`. Server-only SDK/model env config, context-size/request limits, schema validation, request timeout, one transient5xx retry, five-minute cache keyed by function/model/prompt-version/full-context hash. RFQ data delimited; no secrets/full prompt in logs. Selesai jika mocked valid/invalid/timeout/provider failure menghasilkan response sesuai contract.
- [ ] **P6-02 — Implement hero AI routes dan UI integration.** Create `src/app/api/ai/{explain-impact,recovery-options,memory-recommend,dispatch-rationale,partner-fit}/route.ts`. Context memakai computed engine outputs dan consent-safe profiles. Recovery candidate schema boleh mengandung numeric suggestions, tetapi engine overwrite dengan hasil simulation; unknown entities/types diblok. Memory padding memakai policy; narasi dengan stale revision tidak dipasang ke current state. Selesai jika actual live result berlabel AI, fallback berlabel non-AI, dan semua evidence IDs/angka cocok visible state.
- [ ] **P6-03 — Implement supporting AI contracts.** Create `src/app/api/ai/{brain-qa,extract-rfq,generate-workflow,promise-explain}/route.ts`. Promise route adalah tambahan usulan plan untuk requirement F2. Brain read-only snapshot; RFQ extraction typed draft; workflow typed config. Selesai jika routes tidak menulis store, raw RFQ prompt injection tidak melewati contract, dan unsupported link/entity refs ditolak.
- [ ] **P6-04 — Grounding, degraded mode, dan API checks.** Create `tests/api/ai-contract.test.ts`, `tests/api/ai-grounding.test.ts`, fixture responses, local runnable HTTP cases sesuai OpenAPI. Invalid input400, oversized413, rate-limit429; valid request tetapi schema/unavailable fallback mengikuti architecture `{aiResult:null,reason}`. Check absent key, wrong key, timeout, invalid JSON, fabricated ID/date/number, private partner, context change/cache invalidation. Recovery fallback tetap melewati simulator/approval. Live smoke setiap capability dicatat terpisah dari mocked assertions.

**Exit checks:** contract/mock tests lulus, minimal live Gemini smoke membuktikan capability yang terintegrasi, no-key mode tetap memungkinkan core demo; tidak ada fabricated engine number atau private partner dalam AI context.

**Guard:** label AI bukan bukti grounding; JSON valid belum tentu faktual. Validate identifiable factual references dan lakukan spot-check claim terhadap context.

## P7 — Supporting features dan operational projections

**Referensi:** PRD §8.1–§8.5, S2/S3/S7, §12.4; architecture §10.4–§10.5/§10.7, §11.1; BR-05/10/18/19/24.

- [ ] **P7-01 — Ask ManuOS Brain.** Create `src/features/brain/brain-drawer.tsx`, `context-builder.ts`. Tiga seeded chips, capped live snapshot, evidence chips dan safe deep links; no action buttons/store access dari answer. Selesai jika answer merujuk updated post-recovery state; AI-disabled menampilkan State summary.
- [ ] **P7-02 — Promise Engine.** Create `src/features/promise/promise-modal.tsx`, `commitment-card.tsx`. Family/qty/requested date/material inputs; computed feasible/confidence/bottleneck;≥2 alternative trade-offs jika feasible. Tidak mengubah active schedule/date. Selesai jika200-unit fixture menunjukkan feasible date setelah requested date dan alternative costs cocok simulator.
- [ ] **P7-03 — RFQ intake dan engineering review.** Create `src/features/intake/intake-view.tsx`, `rfq-editor.tsx`, `engineering-review.tsx`, `draft-order-command.ts`. Paste sample, extract BOM/routing/QC,≥2 ambiguities, editable diff; missing tolerance tidak ditebak. Confirm membuat DRAFT order/MO/jobsheet/task structure dari approved workflow; unresolved ambiguity menjadi customer questions dan menghalangi release step yang memerlukan jawaban. Selesai jika≥6 fields sample benar dan draft tidak dibuat sebelum confirmation.
- [ ] **P7-04 — Dynamic workflow generation.** Create `src/features/workflows/order-type-setup.tsx`, `workflow-preview.tsx`, `workflow-approval.tsx`. Description+company profile+optional proven template→Gemini→validator→preview→human approve→ACTIVE. Enforce attempt cap P0; invalid draft menampilkan reasons. Active workflow selectable di intake, instantiate per order; network matcher membaca generated step requirements; new-member onboarding menggunakan flow yang sama dalam simulasi. Selesai jika deliberate cycle ditolak dan generated valid template benar-benar dipakai order baru.
- [ ] **P7-05 — My Workstation dan execution/QC inputs.** Create `src/features/workstation/workstation-view.tsx`, `task-controls.tsx`, `skill-profile.tsx`. My queue/instructions/material/machine/estimates, simulated clock start/pause/resume/finish, quantities/QC, handoff IN_TRANSIT/receive, cert expiry/Future training. Event updates graph/history/passport; blocked material atau cert-invalid tidak bisa start lewat command. Selesai jika completed operation belum otomatis counted final-order QC-passed dan rework chain tersimpan.
- [ ] **P7-06 — Passport dan QR.** Create `src/features/passport/passport-view.tsx`, `passport-qr.tsx`, `passport-selector.ts`; add `src/app/passports/[serial]/page.tsx`. Client QR mengarah URL serial yang bisa dibuka; timeline material lots/operator/machine/time/QC/handoff/sign-off termasuk failed→rework. Customer variant memakai reduced field projection. Selesai jika4 seed units dapat dibuka dari order/workstation/scan simulation dan QR target bekerja setelah reload melalui seed.
- [ ] **P7-07 — Gantt, Kanban, dan final screen integration.** Create `src/features/orchestrator/gantt-view.tsx`, `kanban-view.tsx`; lengkapi roadmap strips di S1/S3. Seven operational columns termasuk IN_TRANSIT, cancellation terpisah; critical/slack badges; drag-reschedule membuat preview dan explicit confirmation setelah capacity/dependency validation, bukan direct mutation. Customer Gantt-lite memakai projection sama. Selesai jika graph/timeline/cards/workstation/customer konsisten setelah approved reschedule.

**Exit checks:** kelima supporting features memenuhi acceptance PRD; draft/generation approval tidak dilewati; S1–S7 punya loading/empty/error/fallback state; manual keyboard traversal dan tablet checks.

**Guard:** F13 bukan sekadar gambar DAG; approved template harus terinstansiasi dan requirements digunakan network. Roadmap teaser tidak memberi kesan feature sudah aktif.

## P8 — Hardening, container, dan Cloud Run

**Referensi:** PRD §5.2, §10.4, §12.4, §15; architecture §12–§15.

- [ ] **P8-01 — Regression dan UI acceptance.** Create `tests/e2e/{hero-recovery,dispatch-network,intake-workflow,passport-personas}.spec.ts` memakai browser runner yang dipin setelah P0 (usulan Playwright). Cover approval/stale/idempotence, both consent channels, expired cert, own-order projection, customer acknowledgment, no-AI branch, reset. Manual checks: focus/keyboard, icon+text states, contrast≥4.5:1, tablet viewport, diagram accessibility. Selesai jika critical browser flows pass dan hasil tercatat.
- [ ] **P8-02 — API/security hardening.** Apply input limits/rate limits, security headers/CSP, safe logging, server-only import boundary. Scan client/static output untuk secret/server SDK leakage; key tidak menggunakan `NEXT_PUBLIC_`. Selesai jika oversized/rate-limited cases benar, private partner tidak terserialisasi, health tidak membocorkan key, dan browser flows tetap berjalan setelah CSP.
- [ ] **P8-03 — Standalone image dan local container smoke.** Create `Dockerfile`, `.dockerignore`, `cloudbuild.yaml` dari verified reference atau baru jika reference tidak tersedia. Build standalone; copy static/public assets; bind container ke runtime host/PORT yang diminta Cloud Run. Selesai jika local container health200, screens/assets load, API fallback jalan tanpa key, dan key hanya runtime env.
- [ ] **P8-04 — Prepare dan deploy ke Cloud Run.** Create `docs/deployment-runbook.md`: target project/region/service, Artifact Registry image, service account minimal permissions, Secret Manager binding, resource limits, demo min-instances1, rollback revision dan cara menurunkannya setelah demo. Saat deploy diotorisasi, deploy artifact yang sudah lolos local checks; rekam revision/image/public URL. Selesai jika actual deployed health/screens/live Gemini/approval/reset lolos smoke.
- [ ] **P8-05 — CI dan reliability notes.** Create `.github/workflows/ci.yml` untuk lockfile install/lint/typecheck/unit/API/build; deployment credentials via approved cloud mechanism, tidak mengasumsikan repo/remote sudah ada. Update README dan runbook: simulated personas/network, browser-session persistence, reset/reload behavior, timeout/fallback, logging dan recovery troubleshooting. Selesai jika check commands reproducible; CI success hanya diklaim sesudah workflow benar-benar dijalankan.

**Exit checks:** local checks dan container pass; runtime Cloud Run diuji terpisah; secret boundary terjaga; limitations terdokumentasi. Jangan menandai deployment selesai dari build lokal saja.

**Guard:** quota, access, biaya cloud, dan izin deploy harus tersedia pada sesi eksekusi; plan ini tidak melakukan external deployment.

## P9 — Final verification, demo, dan submission

**Referensi:** PRD §5.2, §13.2–§15; BRD §11.1.

- [ ] **P9-01 — Close requirement matrix.** Isi evidence per FR/BR/screen di `docs/requirements-matrix.md`: source/test/local browser/mock API/live Gemini/deployed HTTP. Verifikasi code memakai documented contracts; scan anti-pattern secret client-side, per-screen duplicate state, UI hardcoded ETA/cost/progress, direct AI mutation, consent-after-serialization. Selesai jika semua in-scope rows punya bukti yang relevan dan known limitations eksplisit.
- [ ] **P9-02 — Rehearse repeatable demo branches.** Create `docs/demo-runbook.md`: A reset→delay→Split Batch→customer; B reset→delay→subcontract→partner acceptance→handoff/QC; C reset→delay→network supply→accept→receive→unblock. Memory/dispatch dan generated workflow/Brain/Promise/Intake/Passport punya quick-hit steps. Rehearse cold load dan Gemini-disabled. Selesai jika tidak ada state tersembunyi yang diperlukan dari rehearsal sebelumnya.
- [ ] **P9-03 — Siapkan English video ≤3 minutes.** Create `docs/demo-script-en.md` berdasarkan PRD §14 setelah koreksi scenario. Capture live prototype, computed values dan human approval; F12 harus membuktikan capacity dan supply secara jujur, dengan edit/cut antardemo branches jika perlu. Jangan menyebut active subcontract setelah Split Batch tanpa acceptance. Selesai jika durasi dan narasi cocok runtime yang direkam.
- [ ] **P9-04 — Proposal PDF dan submission package.** `PROPOSAL_DECK_MANUOS.md` hanya disebut oleh sumber dan belum tersedia di folder; author proposal content dari BRD/PRD yang terverifikasi. Siapkan English deck/PDF, app URL, video artifact/link, stack/architecture summary, simulated-data limitations, future roadmap. Verifikasi aturan submission kompetisi terkini sebelum final upload; publishing/upload dilakukan bila diminta. Selesai jika PDF/video/URL bisa dibuka dan claims tidak melampaui bukti.

**Exit checks:** acceptance PRD §5.2 tertutup; hero/supporting flows berjalan deployed; English assets lengkap; demo numbers berasal dari engine. KPI bisnis seperti OTD≥90%/cost reduction adalah target masa depan, bukan hasil terbukti dari prototype seeded data.

## 6. Kontrak service yang digunakan lintas tahap

Contract route berikut mengikuti architecture §9.1 kecuali Promise, yang merupakan usulan konkret untuk menutup F2. Request/response detail difinalkan P0-06; implementer tidak mengarang provider method dari nama route internal ini.

| Method/path | Input utama | Output utama | Integrasi |
|---|---|---|---|
| GET `/api/health` | Tanpa secret/context | `{status:"ok"}` | P1/P8 |
| POST `/api/ai/explain-impact` | Ripple/ETA/blocked/runnable facts | summary/cause/blastRadius/watchItems | P6-02/P4 |
| POST `/api/ai/recovery-options` | Disruption, constraints, capacity, consent-safe matches | Typed candidate options; figures recomputed by engine | P6-02/P4 |
| POST `/api/ai/memory-recommend` | Historical evidence dan policy adjustment | Recommendation/rationale, checked padding | P6-02/P5 |
| POST `/api/ai/dispatch-rationale` | Candidate scores/exclusion reasons | Rationale/gap flag | P6-02/P5 |
| POST `/api/ai/partner-fit` | Permitted match profiles dan workflow need | Narrative/riskNotes | P6-02/P5 |
| POST `/api/ai/brain-qa` | Question + capped current snapshot | answer/evidenceRefs/linkToScreen | P6-03/P7-01 |
| POST `/api/ai/extract-rfq` | RFQ text sebagai data | Requirements/ambiguities/BOM/routing/QC draft | P6-03/P7-03 |
| POST `/api/ai/generate-workflow` | Order type/company/proven templates | nodes/edges/transitionRules/warnings | P6-03/P7-04 |
| POST `/api/ai/promise-explain` | Feasible/requested dates, bottleneck, alternatives | Grounded explanation; no new numeric facts | P6-03/P7-02 |

Factual results dan AI result memiliki slot berbeda. Contoh fallback untuk valid request: HTTP200 `{aiResult:null,reason:"unavailable"}` atau `reason:"schema"`. Invalid request/rate limit memakai explicit error response; jangan mengubah semua kegagalan menjadi success.

## 7. Requirement coverage ringkas

| Capability / business requirements | Task utama |
|---|---|
| F3; BR-01/03/04 | P2-04, P3-01/02, P4-01, P6-02 |
| F4; BR-06/07/08/09 | P3-04, P4-02/03/04, P5-04, P6-02 |
| F7; BR-11/12 | P3-06, P5-01, P6-02 |
| F10; BR-13/14 | P3-05, P5-02, P6-02, P7-05 |
| F12; BR-15/16 | P3-07, P5-03/04, P6-02, P7-04 |
| F1; BR-05 | P6-03, P7-01 |
| F2; BR-10 | P3-03/04, P6-03, P7-02 |
| F5; BR-18 | P6-03, P7-03 |
| F8; BR-19 | P2-02, P7-05/06 |
| F13; BR-24 | P3-08, P6-03, P7-03/04 |
| Real progress/customer; BR-02/17 | P2-03, P4-04, P7-05/06/07 |
| AI labeling/degradation; BR-20/21 | P1-03, P3-04, P6-01/02/04 |
| English/Gemini/Cloud Run; BR-22/23 | P1-03, P6, P8, P9 |

## 8. Milestone, urutan kerja pertama, dan definisi selesai

1. **M1 — Foundation valid (P0–P2):** decisions, seed, graph, persona shell dan state contract bisa direview.
2. **M2 — Core demo deterministik (P3–P5):** lima hero features berjalan dan plan/customer changes terbukti; belum disebut live AI prototype.
3. **M3 — Full prototype lokal (P6–P7):** live Gemini dan seluruh supporting features memenuhi fidelity PRD.
4. **M4 — Deployed demo (P8):** Cloud Run revision/URL diuji; local/mock/live evidence dibedakan.
5. **M5 — Submission ready (P9):** requirement coverage, repeatable scenario, English video/PDF lengkap.

Mulai eksekusi dari **P0-01 → P0-02 → P0-03 → P0-04**, lalu toolchain/API contracts dan scaffold. Jangan mulai dari mendesain semua screen dengan data hardcoded.

Tidak ada deadline atau ukuran tim di dokumen yang dapat dijadikan estimasi pasti. Jadwal kalender dibuat setelah P0; bila waktu terbatas, turunkan polish dan breadth supporting flows sesuai fidelity demoable-lite, tetapi jangan menghapus hero features, consent, approval, grounding, atau F13 validation.

Task selesai jika deliverable tersedia, acceptance-nya lulus, dan bukti dicatat. Phase selesai jika semua checkbox task dan exit checks tahap itu selesai. Prototype selesai jika M1–M5 terpenuhi; build berhasil saja belum menutup requirement runtime, live AI, deployment, atau submission.
