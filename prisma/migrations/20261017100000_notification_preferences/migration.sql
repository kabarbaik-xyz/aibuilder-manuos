ALTER TABLE "memberships" ADD COLUMN "notification_preferences_json" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "notification_inbox" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "notification_inbox" ADD COLUMN "delivery_status" TEXT NOT NULL DEFAULT 'DELIVERED';
ALTER TABLE "notification_inbox" ADD COLUMN "delivery_reason" TEXT;
