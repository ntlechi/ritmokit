-- Training catalog: thematic categories + explicit per-audience assignment.
-- Replaces the implicit "station_id = audience" rule with real assignment rows.

CREATE TYPE "FormationAudience" AS ENUM (
  'EVERYONE',
  'ROLE',
  'STATION',
  'USER'
);

CREATE TABLE "training_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "location_id" UUID,
  "name_fr" TEXT NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_es" TEXT NOT NULL,
  "color_hex" TEXT NOT NULL DEFAULT '#52525b',
  "icon" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "training_categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_categories_organization_id_is_active_sort_order_idx"
  ON "training_categories"("organization_id", "is_active", "sort_order");

CREATE INDEX "training_categories_location_id_is_active_sort_order_idx"
  ON "training_categories"("location_id", "is_active", "sort_order");

ALTER TABLE "training_categories"
  ADD CONSTRAINT "training_categories_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_categories"
  ADD CONSTRAINT "training_categories_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "formation_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "module_id" UUID NOT NULL,
  "audience" "FormationAudience" NOT NULL,
  "role" "Role",
  "station_id" UUID,
  "user_id" UUID,
  "due_at" TIMESTAMP(3),
  "assigned_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "formation_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "formation_assignments_module_id_idx" ON "formation_assignments"("module_id");
CREATE INDEX "formation_assignments_user_id_idx" ON "formation_assignments"("user_id");
CREATE INDEX "formation_assignments_station_id_idx" ON "formation_assignments"("station_id");

ALTER TABLE "formation_assignments"
  ADD CONSTRAINT "formation_assignments_module_id_fkey"
  FOREIGN KEY ("module_id") REFERENCES "formation_modules"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "formation_assignments"
  ADD CONSTRAINT "formation_assignments_station_id_fkey"
  FOREIGN KEY ("station_id") REFERENCES "stations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "formation_assignments"
  ADD CONSTRAINT "formation_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "formation_assignments"
  ADD CONSTRAINT "formation_assignments_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "formation_modules" ADD COLUMN "category_id" UUID;

CREATE INDEX "formation_modules_category_id_sort_order_idx"
  ON "formation_modules"("category_id", "sort_order");

ALTER TABLE "formation_modules"
  ADD CONSTRAINT "formation_modules_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "training_categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: preserve today's visibility exactly. A module scoped to a station
-- becomes a STATION assignment; "tronc commun" (station_id IS NULL) becomes
-- EVERYONE. assigned_by_id stays NULL — no human authored these.
INSERT INTO "formation_assignments" ("module_id", "audience", "station_id")
SELECT
  "id",
  CASE WHEN "station_id" IS NULL THEN 'EVERYONE'::"FormationAudience"
       ELSE 'STATION'::"FormationAudience" END,
  "station_id"
FROM "formation_modules";
