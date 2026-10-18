ALTER TABLE "order_lifecycle_stages"
ADD COLUMN "activation_condition_json" TEXT NOT NULL DEFAULT 'null';
