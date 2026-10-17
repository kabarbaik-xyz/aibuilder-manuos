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
  log "using existing database at $DATABASE_FILE"
elif [ -n "$BACKUP_DIR" ] && [ -f "$BACKUP_DB" ]; then
  if cp "$BACKUP_DB" "$DATABASE_FILE" 2>/dev/null; then
    log "restored database from $BACKUP_DB ($(wc -c < "$DATABASE_FILE" 2>/dev/null || echo '?') bytes)"
  else
    log "WARNING: failed to restore database from $BACKUP_DB"
  fi
else
  log "WARNING: no database snapshot found; starting with an empty database"
fi

# --- Snapshotting ----------------------------------------------------------
snapshot() {
  [ -n "$BACKUP_DIR" ] || return 0
  [ -f "$DATABASE_FILE" ] || return 0
  if command -v sqlite3 >/dev/null 2>&1; then
    tmp="$DATA_DIR/.snapshot.db"
    rm -f "$tmp" 2>/dev/null || true
    if sqlite3 "$DATABASE_FILE" ".backup '$tmp'" >/dev/null 2>&1 && cp "$tmp" "$BACKUP_DB" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      log "snapshot written to $BACKUP_DB"
      return 0
    fi
    rm -f "$tmp" 2>/dev/null || true
    log "WARNING: sqlite online snapshot failed"
    return 1
  fi
  # Fallback when the sqlite CLI is unavailable: copy the db plus its WAL.
  if cp "$DATABASE_FILE" "$BACKUP_DB" 2>/dev/null; then
    cp "$DATABASE_FILE-wal" "$BACKUP_DB-wal" 2>/dev/null || true
    log "coarse snapshot written to $BACKUP_DB"
    return 0
  fi
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
