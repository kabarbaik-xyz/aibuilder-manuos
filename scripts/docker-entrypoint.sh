#!/bin/sh
# ManuOS Cloud Run container entrypoint.
#
# Cloud Run's container filesystem is ephemeral (tmpfs), so the seeded SQLite
# database and application storage live on a Cloud Storage bucket mounted at
# $MANUOS_BACKUP_DIR. SQLite (with WAL) must not run directly on a FUSE mount,
# so on boot we restore the working database onto local disk, keep periodic
# online snapshots back to the mount, and flush a final snapshot on shutdown.
set -u

log() { echo "[entrypoint] $*"; }

DATA_DIR="${MANUOS_DATA_DIR:-/app/data}"
DATABASE_FILE="$DATA_DIR/manuos.db"
BACKUP_DIR="${MANUOS_BACKUP_DIR:-}"
BACKUP_DB="$BACKUP_DIR/manuos.db"
BACKUP_INTERVAL="${MANUOS_BACKUP_INTERVAL_SECONDS:-60}"

# Size of the database this instance booted with (restored or pre-existing).
# Tracked in memory so the snapshot guard keeps working even while GCSFuse
# transiently hides the baseline file on the mount.
restored_bytes=0

mkdir -p "$DATA_DIR" 2>/dev/null || true

# --- Durable application storage -------------------------------------------
# Document uploads honour STORAGE_ROOT directly. Builder proposals write to
# <cwd>/storage/proposals (fixed path), so expose the same durable tree there.
STORAGE_DIR="${MANUOS_STORAGE_DIR:-${BACKUP_DIR}/storage}"
if [ -n "$BACKUP_DIR" ] && mkdir -p "$STORAGE_DIR" 2>/dev/null; then
  rm -rf /app/storage 2>/dev/null || true
  ln -s "$STORAGE_DIR" /app/storage 2>/dev/null || log "WARNING: could not link /app/storage"
else
  log "WARNING: durable storage unavailable at '${STORAGE_DIR}'; using ephemeral storage"
fi

# --- Restore the working database ------------------------------------------
if [ -f "$DATABASE_FILE" ]; then
  restored_bytes=$(wc -c < "$DATABASE_FILE" 2>/dev/null || echo 0)
  log "using existing database at $DATABASE_FILE"
elif [ -n "$BACKUP_DIR" ] && [ -f "$BACKUP_DB" ]; then
  # GCSFuse reads can transiently fail during a rollout; retry before giving up
  # so an instance never boots against an empty database while a baseline exists.
  attempt=0
  while [ "$attempt" -lt 5 ]; do
    attempt=$((attempt + 1))
    if cp "$BACKUP_DB" "$DATABASE_FILE" 2>/dev/null && [ -s "$DATABASE_FILE" ]; then
      break
    fi
    rm -f "$DATABASE_FILE" 2>/dev/null || true
    log "WARNING: restore attempt $attempt failed; retrying"
    sleep 2
  done
  if [ -s "$DATABASE_FILE" ]; then
    restored_bytes=$(wc -c < "$DATABASE_FILE" 2>/dev/null || echo 0)
    log "restored database from $BACKUP_DB ($restored_bytes bytes)"
  else
    log "WARNING: failed to restore database from $BACKUP_DB"
  fi
else
  log "WARNING: no database snapshot found; starting with an empty database"
fi

# --- Apply migrations ------------------------------------------------------
# Bring a restored baseline (or a fresh database) up to the schema baked into
# this image so the container never runs against a drifted schema. The Prisma
# CLI and prisma/migrations are copied into the runner image for this purpose.
if [ -f /app/node_modules/prisma/build/index.js ] && [ -d /app/prisma/migrations ]; then
  log "applying database migrations"
  if node /app/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma; then
    restored_bytes=$(wc -c < "$DATABASE_FILE" 2>/dev/null || echo "$restored_bytes")
    log "database migrations applied"
  else
    log "WARNING: prisma migrate deploy failed; continuing with the restored schema"
  fi
else
  log "WARNING: prisma CLI or migrations missing; skipping migrate deploy"
fi

# --- Snapshotting ----------------------------------------------------------
# A snapshot must never destroy the seeded baseline. Three guards protect it:
#   1. the backup mount must be reachable,
#   2. the candidate must pass a SQLite integrity check, and
#   3. it must not shrink a known-good baseline to a near-empty database. This
#      is exactly what happens when an instance boots without a successful
#      restore (empty db, a single 4096-byte header page) and then snapshots.
# Guard 3 compares against the largest baseline we know about: what this
# instance booted with (reliable even while GCSFuse hides the file) and, when
# visible, the size recorded on the mount.
snapshot_is_safe() {
  candidate="$1"
  [ -f "$candidate" ] || return 1
  if command -v sqlite3 >/dev/null 2>&1; then
    [ "$(sqlite3 "$candidate" 'PRAGMA integrity_check;' 2>/dev/null)" = "ok" ] || return 1
  fi
  new_size=$(wc -c < "$candidate" 2>/dev/null || echo 0)
  old_size="$restored_bytes"
  if [ -f "$BACKUP_DB" ]; then
    on_mount=$(wc -c < "$BACKUP_DB" 2>/dev/null || echo 0)
    [ "$on_mount" -gt "$old_size" ] && old_size="$on_mount"
  elif [ -n "$BACKUP_DIR" ] && [ -f "$BACKUP_DB.meta" ]; then
    # The database file may be hidden during a GCSFuse hiccup; the sidecar size
    # record still tells us a real baseline exists and how large it was.
    recorded=$(cat "$BACKUP_DB.meta" 2>/dev/null || echo 0)
    [ "$recorded" -gt "$old_size" ] && old_size="$recorded"
  fi
  if [ "$old_size" -gt 65536 ] && [ "$new_size" -lt $((old_size / 2)) ]; then
    log "WARNING: refusing snapshot: would shrink baseline from $old_size to $new_size bytes"
    return 1
  fi
  return 0
}

snapshot() {
  [ -n "$BACKUP_DIR" ] || return 0
  [ -f "$DATABASE_FILE" ] || return 0
  if [ ! -d "$BACKUP_DIR" ]; then
    log "WARNING: backup mount '$BACKUP_DIR' is not reachable; skipping snapshot"
    return 1
  fi
  tmp="$DATA_DIR/.snapshot.db"
  rm -f "$tmp" "$tmp-wal" 2>/dev/null || true

  if command -v sqlite3 >/dev/null 2>&1; then
    if ! sqlite3 "$DATABASE_FILE" ".backup '$tmp'" >/dev/null 2>&1; then
      log "WARNING: sqlite online snapshot failed"
      rm -f "$tmp" 2>/dev/null || true
      return 1
    fi
  else
    # Fallback when the sqlite CLI is unavailable: copy the db plus its WAL.
    if ! cp "$DATABASE_FILE" "$tmp" 2>/dev/null; then
      log "WARNING: snapshot copy failed"
      rm -f "$tmp" 2>/dev/null || true
      return 1
    fi
    cp "$DATABASE_FILE-wal" "$tmp-wal" 2>/dev/null || true
  fi

  if ! snapshot_is_safe "$tmp"; then
    rm -f "$tmp" "$tmp-wal" 2>/dev/null || true
    return 1
  fi

  if cp "$tmp" "$BACKUP_DB" 2>/dev/null; then
    if [ -f "$tmp-wal" ]; then cp "$tmp-wal" "$BACKUP_DB-wal" 2>/dev/null || true; fi
    written=$(wc -c < "$BACKUP_DB" 2>/dev/null || echo 0)
    # Record the acknowledged baseline size so the shrink guard survives a
    # later GCSFuse hiccup that hides the database file itself.
    echo "$written" > "$BACKUP_DB.meta" 2>/dev/null || true
    rm -f "$tmp" "$tmp-wal" 2>/dev/null || true
    log "snapshot written to $BACKUP_DB ($written bytes)"
    return 0
  fi
  rm -f "$tmp" "$tmp-wal" 2>/dev/null || true
  log "WARNING: snapshot to $BACKUP_DB failed"
  return 1
}

# Periodic snapshots keep judge-created state across instance recycling.
if [ -n "$BACKUP_DIR" ]; then
  ( while true; do sleep "$BACKUP_INTERVAL" 2>/dev/null || sleep 60; snapshot || true; done ) &
fi

# --- Run the standalone server ---------------------------------------------
node server.js &
SERVER_PID=$!

shutdown() {
  log "termination signal received; flushing final snapshot"
  snapshot || true
  kill -TERM "$SERVER_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# wait is interruptible by the trap; loop until the server actually exits.
while kill -0 "$SERVER_PID" 2>/dev/null; do
  wait "$SERVER_PID" 2>/dev/null || true
done

snapshot || true
exit 0
