# ManuOS Demo Fixture Specification (P0-04)

This specification defines the exact seeded entities, identifiers, numbers, and relationships required for the deterministic demo scenario.

---

## 1. Demo Clock & Calendar Invariants

- **Fixed Anchor Date:** `2026-11-24T09:00:00Z` (Tuesday)
- **Work Hours:** 8 hours per shift (07:00 – 15:30 with 30m break).
- **Working Days:** Monday through Saturday. Sunday non-working.

---

## 2. Factories (4 Entities)

| ID | Name | Capabilities | Consent Capacity | Consent Supply | Role Badge | Available Capacity / Lead Time |
|---|---|---|---|---|---|---|
| `factory-precision` | Precision Works (Tenant) | CNC milling, bending, assembly, QC | ON (`true`) | ON (`true`) | Buyer & Producer | Host Factory |
| `factory-nusantara` | Nusantara Metalcraft | Stamping, terminal blocks, electronics | ON (`true`) | ON (`true`) | Supplier & Capacity Buyer | Stocks TB-24 (42 units, 2-day lead -> ETA Nov 26) |
| `factory-batam` | Batam CNC Hub | High-precision 5-axis CNC milling | ON (`true`) | OFF (`false`) | Capacity Partner | 210 free machine hours, Rate Index 1.1x |
| `factory-silent` | Silent Shop | General fabrication | OFF (`false`) | OFF (`false`) | Private | Excluded from matching; profile details hidden |

---

## 3. Manufacturing Orders (6 Orders)

| Order ID | Customer | Part / Description | Qty | Completed Qty | QC-Passed Qty | Promised Date | Expected Date (Baseline) | Expected Date (Delayed) | Status |
|---|---|---|---|---|---|---|---|---|---|
| `#CO-2026-1042` | Meridian Energy | Custom control panels | 120 | 82 | 78 | Nov 25, 2026 | Nov 25, 2026 | Nov 28, 2026 | At risk (65% real progress) |
| `#CO-2026-1045` | Astra Components | Chassis brackets | 200 | 180 | 180 | Nov 29, 2026 | Nov 29, 2026 | Nov 30, 2026 | Watch (depends on TB-24 batch) |
| `#CO-2026-1040` | Northstar Electric | Terminal enclosures | 45 | 45 | 45 | Nov 24, 2026 | Nov 24, 2026 | Nov 24, 2026 | Ready for dispatch |
| `#CO-2026-1046` | Pacific Systems | Mounting plates | 80 | 24 | 24 | Dec 01, 2026 | Dec 01, 2026 | Dec 01, 2026 | On track |
| `#CO-2026-1047` | Vertex Industries | Precision housings | 60 | 12 | 12 | Dec 03, 2026 | Dec 03, 2026 | Dec 03, 2026 | On track |
| `#CO-2026-1048` | Harbor Engineering | Valve assemblies | 30 | 0 | 0 | Dec 05, 2026 | Dec 05, 2026 | Dec 05, 2026 | Planned |

---

## 4. Hero Order Structure (`#CO-2026-1042`)

- **MO-1: Machining (Chassis & Panels)**
  - Jobsheet 1 (Chassis, Bracket Family):
    - `T1`: Cut stock (CNC-mill, 4h, status: `COMPLETED`)
    - `T2`: Press bend (Press-brake, 6h, dependsOn: `[T1]`, status: `COMPLETED`)
    - `T3`: CNC finish machining (CNC-mill CNC-02, 8h, dependsOn: `[T2]`, assigned: Hendra Wijaya, status: `RUNNING`)
    - `T4`: Chassis QC inspection (QC station, 3h, dependsOn: `[T3]`, status: `COMPLETED`)
  - Jobsheet 2 (Panels):
    - `T5`: Drill panels (CNC-lathe CNC-01, 5h, status: `COMPLETED`)
    - `T6`: Deburr & finishing (Finishing, 3h, dependsOn: `[T5]`, status: `COMPLETED`)
    - `T7`: Panel QC inspection (QC station, 2h, dependsOn: `[T6]`, status: `COMPLETED`)
- **MO-2: Assembly & Final QC**
  - Jobsheet 3 (Sub-Assembly):
    - `T8`: Prepare harness (Assembly bench, 4h, status: `COMPLETED`)
    - `T9`: Structural weld (Weld station, 6h, dependsOn: `[T8]`, requires: `WABO_CERT`, status: `READY`)
  - Jobsheet 4 (Main Assembly):
    - `T10`: Fit enclosure (Assembly bench, 6h, dependsOn: `[T4, T7, T9]`, status: `RUNNING`)
    - `T11`: Mount internals (Assembly bench, 6h, dependsOn: `[T10]`, status: `RUNNING`)
    - `T12`: Wire & terminate (Assembly bench, 6h, dependsOn: `[T11]`, requiresMaterial: `TB-24`, status: `BLOCKED` when delayed)
  - Jobsheet 5 (Final Inspection & Release):
    - `T13`: Electrical QC inspection (QC station, 4h, dependsOn: `[T12]`, status: `BLOCKED` when delayed)
    - `T14`: Final sign-off & release (Packaging/Shipping, 2h, dependsOn: `[T13]`, status: `BLOCKED` when delayed)

---

## 5. Technicians (6 Entities)

| ID | Name | Role / Level | Certifications | Active Workload (Hours) | QC Pass % | Notes |
|---|---|---|---|---|---|---|
| `tech-budi` | Budi Santoso | Welder · L4 | `WABO Structural Welding` (valid Dec 2027) | 24 / 40 h | 95% | Best fit for T9 structural weld |
| `tech-rina` | Rina Putri | Welder · L3 | `WABO Structural Welding` (valid Jun 2027) | 32 / 40 h | 91% | Eligible runner-up for T9 |
| `tech-adi` | Adi Pratama | Welder · L3 | None (Expired / Missing WABO) | 10 / 40 h | 88% | Available but excluded by hard cert gate |
| `tech-hendra` | Hendra Wijaya | CNC Specialist · L4 | `5-Axis CNC Mill Certified` | 36 / 40 h | 97% | Currently clocked into T3 on CNC-02 |
| `tech-marco` | Marco Rossi | Assembly Lead · L4 | `IPC-A-610 Electrical Assembly` | 28 / 40 h | 96% | Cell lead for assembly |
| `tech-siti` | Siti Nurhaliza | QC Inspector · L4 | `ISO 9001 Quality Lead` | 20 / 40 h | 99% | Inspector for electrical and final sign-off |

---

## 6. Materials (10 Entities)

1. `TB-24`: Terminal blocks, 24-pole (Hero material). Required by `T12`. Delayed +2 days from original supplier (ETA Nov 27). Nusantara Metalcraft has 42 units stock with 2-day lead (ETA Nov 26).
2. `AL-6061-T6`: Aluminum plate, 320x160mm. Lot `AL-89240`. In stock.
3. `ENCL-01`: Sheet steel enclosures. In stock.
4. `HARN-01`: Pre-cut internal wiring harness. In stock.
5. `WIRE-16`: 16 AWG copper hookup wire spool. In stock.
6. `RELAY-12V`: 12V DC industrial control relays. In stock.
7. `FUSE-10A`: 10A fast-acting DIN rail fuses. In stock.
8. `BOLT-M4`: M4x12mm stainless steel machine screws. In stock.
9. `PANEL-AL`: Front faceplates. In stock.
10. `DIN-RAIL`: 35mm slotted DIN mounting rail. In stock.

---

## 7. Factory Memory Seeds (History Runs)

- Part Family: `bracket`, Operation: `Press bend`, Machine: `PRESS-01`
  - Run 1: Planned 10.0h, Actual 11.5h (`+15%` overrun), rework: 1
  - Run 2: Planned 10.0h, Actual 11.8h (`+18%` overrun), rework: 2
  - Run 3: Planned 10.0h, Actual 12.1h (`+21%` overrun), rework: 1
  - Mean Overrun: `+18.0%`
  - Recommendation: Use routing rev 2; apply managerial planning allowance `+15%`.
- Routing Rev 2: 2 completed runs, 0 reworks, 100% on-time.

---

## 8. Unit Passports (4 Seeded Units)

1. `SN-1042-078`: Order #1042 hero passport. Contains Lot `AL-89240`, T1 Cut (Nov 18), T2 Bend (Nov 19), T3 Finish Machining (Nov 19), QC Bend angle out of tolerance -> Rework corrected and reinspected (Nov 20), Final QC passed (Nov 21), Release sign-off (Nov 22).
2. `SN-1042-079`: Order #1042 unit, passed QC Nov 22.
3. `SN-1040-045`: Order #1040 unit, completed and passed Nov 24.
4. `SN-1045-180`: Order #1045 unit, completed and passed Nov 23.
