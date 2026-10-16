# ManuOS Production Deployment & Durable Single-Writer Contract

> **Target Architecture**: SQLite with WAL mode on persistent volume mount.  
> **Authority**: AGENTS.md §1, BRD §9, PRD §§12/16, Database Architecture §10.  
> **Status**: Approved Operational Contract for R0 Pilot.

---

## 1. Single-Writer Invariant & Anti-Concurrency Policy

- **Prohibition of Multi-Instance Local Storage**: Running multi-instance container platforms (such as serverless Google Cloud Run or AWS Fargate with default ephemeral local root filesystems) is **strictly prohibited**. Setting `min_instances = 1` or `max_instances = 1` in ephemeral configurations does **not** make an ephemeral SQLite database durable across container restarts or autoscaling churn.
- **Single-Writer Topology**:
  - The ManuOS operational backend must execute as a single authoritative writer service.
  - All write mutations (`executeCommand`) and ledger movements (`postMovement`) commit exclusively through this single writer.
  - The SQLite database file must reside on an attached persistent block storage volume (e.g., persistent volume claim on Kubernetes, managed persistent disk on VM, or dedicated host mount at `/data/manuos.db`).

---

## 2. SQLite Connection Configuration & PRAGMA Contract

Every active database connection initialized via `src/server/db/client.ts` enforces the following mandatory PRAGMA runtime baseline:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

### Rationale:
- **`journal_mode = WAL`**: Enables concurrent reader connections without blocking the single writer, providing snapshot isolation for read queries and reports.
- **`busy_timeout = 5000`**: Enforces a 5-second wait on lock contention before returning `SQLITE_BUSY`, preventing transient concurrency spikes from failing operations.
- **`foreign_keys = ON`**: Authoritatively enforces composite keys and cascade constraints across workspaces, facilities, and orders.
- **`synchronous = NORMAL`**: Guarantees WAL checkpoint durability to disk with optimal P95 write latency.

---

## 3. Persistent Volume & Storage Layout

| Mount Path | Volume Type | Purpose | Backup Policy |
| :--- | :--- | :--- | :--- |
| `/data/manuos.db` | Persistent Block Volume | SQLite Primary Database & WAL (`manuos.db-wal`, `manuos.db-shm`) | Hourly snapshot via `VACUUM INTO` |
| `/data/documents/` | Persistent Block Volume / S3-compatible | Technical Drawings, Inspection Photos, Attached RFQs | Daily immutable archive with SHA-256 checksums |
| `/data/backups/` | Off-site Cold Storage | Rotated compressed backups with manifest manifests | 30-day retention with restore drills |

---

## 4. Backup & Disaster Recovery Protocol

### Automated Backup Procedure:
1. Backups must be performed online using SQLite's atomic online backup API or `VACUUM INTO`:
   ```bash
   sqlite3 /data/manuos.db "VACUUM INTO '/data/backups/manuos-backup-$(date +%s).db';"
   ```
2. Compute and store SHA-256 integrity checksum for the snapshot and all stored documents.
3. Push snapshot to encrypted, off-site secondary storage.

### Disaster Recovery & Cold Restart Verification:
- Verified by automated regression suite `tests/integration/backup-restore.test.ts`.
- In recovery drills, restoring from snapshot must pass:
  1. `PRAGMA integrity_check = ok`.
  2. `PRAGMA foreign_key_check = 0 discrepancies`.
  3. `npm run db:reconcile` (verifying double-entry balance parity across all workspaces).
