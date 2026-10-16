-- Preserve a migration-time report so pre-existing invalid or overlapping bookings
-- can be reviewed without preventing the guard migration from being applied.
CREATE TABLE "resource_booking_guard_migration_report" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "booking_id" TEXT NOT NULL,
    "conflicting_booking_id" TEXT,
    "issue" TEXT NOT NULL,
    "captured_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "resource_booking_guard_migration_report" (
    "booking_id", "conflicting_booking_id", "issue"
)
SELECT "id", NULL, 'INVALID_INTERVAL'
FROM "resource_bookings"
WHERE "start_at" >= "end_at";

INSERT INTO "resource_booking_guard_migration_report" (
    "booking_id", "conflicting_booking_id", "issue"
)
SELECT a."id", b."id", 'OVERLAPPING_CONFIRMED_BOOKINGS'
FROM "resource_bookings" a
JOIN "resource_bookings" b
  ON a."workspace_id" = b."workspace_id"
 AND a."resource_type" = b."resource_type"
 AND a."resource_id" = b."resource_id"
 AND a."id" < b."id"
 AND a."start_at" < b."end_at"
 AND a."end_at" > b."start_at"
WHERE a."status" = 'CONFIRMED'
  AND b."status" = 'CONFIRMED';

CREATE TRIGGER "resource_bookings_validate_interval_insert"
BEFORE INSERT ON "resource_bookings"
WHEN NEW."start_at" >= NEW."end_at"
BEGIN
    SELECT RAISE(ABORT, 'RESOURCE_BOOKING_INVALID_INTERVAL');
END;

CREATE TRIGGER "resource_bookings_validate_interval_update"
BEFORE UPDATE OF "start_at", "end_at" ON "resource_bookings"
WHEN NEW."start_at" >= NEW."end_at"
BEGIN
    SELECT RAISE(ABORT, 'RESOURCE_BOOKING_INVALID_INTERVAL');
END;

CREATE TRIGGER "resource_bookings_prevent_overlap_insert"
BEFORE INSERT ON "resource_bookings"
WHEN NEW."status" = 'CONFIRMED'
 AND EXISTS (
    SELECT 1
    FROM "resource_bookings" existing
    WHERE existing."workspace_id" = NEW."workspace_id"
      AND existing."resource_type" = NEW."resource_type"
      AND existing."resource_id" = NEW."resource_id"
      AND existing."status" = 'CONFIRMED'
      AND existing."start_at" < NEW."end_at"
      AND existing."end_at" > NEW."start_at"
 )
BEGIN
    SELECT RAISE(ABORT, 'RESOURCE_BOOKING_OVERLAP');
END;

CREATE TRIGGER "resource_bookings_prevent_overlap_update"
BEFORE UPDATE OF "workspace_id", "resource_type", "resource_id", "start_at", "end_at", "status"
ON "resource_bookings"
WHEN NEW."status" = 'CONFIRMED'
 AND EXISTS (
    SELECT 1
    FROM "resource_bookings" existing
    WHERE existing."id" != NEW."id"
      AND existing."workspace_id" = NEW."workspace_id"
      AND existing."resource_type" = NEW."resource_type"
      AND existing."resource_id" = NEW."resource_id"
      AND existing."status" = 'CONFIRMED'
      AND existing."start_at" < NEW."end_at"
      AND existing."end_at" > NEW."start_at"
 )
BEGIN
    SELECT RAISE(ABORT, 'RESOURCE_BOOKING_OVERLAP');
END;
