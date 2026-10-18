ALTER TABLE "form_instances" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "form_instances" ADD COLUMN "completion_point" TEXT NOT NULL DEFAULT 'BEFORE_ACTION';

UPDATE "form_instances"
SET "required" = COALESCE(
  (SELECT "form_bindings"."required"
   FROM "form_bindings"
   WHERE "form_bindings"."id" = "form_instances"."form_binding_id"),
  true
);
