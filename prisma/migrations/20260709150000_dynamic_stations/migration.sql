-- Migration : Postes & stations dynamiques par succursale (remplace enum Station)

-- 1. Table stations
CREATE TABLE "stations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_es" TEXT NOT NULL,
    "color_hex" TEXT NOT NULL DEFAULT '#3B82F6',
    "slug" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "tip_points" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stations_location_id_name_fr_key" ON "stations"("location_id", "name_fr");
CREATE UNIQUE INDEX "stations_location_id_slug_key" ON "stations"("location_id", "slug");
CREATE INDEX "stations_location_id_is_active_sort_order_idx" ON "stations"("location_id", "is_active", "sort_order");

ALTER TABLE "stations" ADD CONSTRAINT "stations_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Semer les 3 postes legacy par succursale (mappables depuis l'enum)
INSERT INTO "stations" ("location_id", "name_fr", "name_en", "name_es", "color_hex", "slug", "sort_order", "tip_points")
SELECT
    l."id",
    v."name_fr",
    v."name_en",
    v."name_es",
    v."color_hex",
    v."slug",
    v."sort_order",
    v."tip_points"
FROM "locations" l
CROSS JOIN (
    VALUES
        ('Cuisine', 'Kitchen', 'Cocina', '#EF4444', 'cuisine', 1, 0.8),
        ('Comptoir', 'Counter', 'Mostrador', '#3B82F6', 'comptoir', 2, 1.2),
        ('Emballage', 'Packaging', 'Empaque', '#10B981', 'emballage', 3, 1.0)
) AS v("name_fr", "name_en", "name_es", "color_hex", "slug", "sort_order", "tip_points");

-- 3. Ajouter station_id (nullable) sur toutes les tables concernées
ALTER TABLE "staffing_profiles" ADD COLUMN "station_id" UUID;
ALTER TABLE "location_members" ADD COLUMN "station_id" UUID;
ALTER TABLE "employee_station_skills" ADD COLUMN "station_id" UUID;
ALTER TABLE "shifts" ADD COLUMN "station_id" UUID;
ALTER TABLE "payroll_line_items" ADD COLUMN "station_id" UUID;
ALTER TABLE "payroll_line_items" ADD COLUMN "station_name_fr" TEXT;
ALTER TABLE "sops" ADD COLUMN "station_id" UUID;
ALTER TABLE "formation_modules" ADD COLUMN "station_id" UUID;
ALTER TABLE "documents" ADD COLUMN "station_id" UUID;
ALTER TABLE "chat_channels" ADD COLUMN "station_id" UUID;
ALTER TABLE "station_shout_outs" ADD COLUMN "station_id" UUID;
ALTER TABLE "pulse_responses" ADD COLUMN "station_id" UUID;

-- 4. Backfill depuis l'enum Station → stations.slug
UPDATE "staffing_profiles" sp
SET "station_id" = s."id"
FROM "stations" s
WHERE s."location_id" = sp."location_id"
  AND (
    (sp."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (sp."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (sp."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "location_members" lm
SET "station_id" = s."id"
FROM "stations" s
WHERE s."location_id" = lm."location_id"
  AND (
    (lm."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (lm."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (lm."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "employee_station_skills" ess
SET "station_id" = s."id"
FROM "stations" s
WHERE s."location_id" = ess."location_id"
  AND (
    (ess."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (ess."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (ess."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "shifts" sh
SET "station_id" = s."id"
FROM "stations" s
WHERE s."location_id" = sh."location_id"
  AND (
    (sh."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (sh."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (sh."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "payroll_line_items" pli
SET
    "station_id" = s."id",
    "station_name_fr" = s."name_fr"
FROM "pay_periods" pp, "stations" s
WHERE pp."id" = pli."pay_period_id"
  AND s."location_id" = pp."location_id"
  AND (
    (pli."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (pli."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (pli."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "sops" sop
SET "station_id" = s."id"
FROM "stations" s
WHERE sop."station" IS NOT NULL
  AND sop."location_id" IS NOT NULL
  AND s."location_id" = sop."location_id"
  AND (
    (sop."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (sop."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (sop."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "formation_modules" fm
SET "station_id" = s."id"
FROM "stations" s
WHERE fm."station" IS NOT NULL
  AND fm."location_id" IS NOT NULL
  AND s."location_id" = fm."location_id"
  AND (
    (fm."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (fm."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (fm."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "documents" d
SET "station_id" = s."id"
FROM "stations" s, "sops" sop
WHERE sop."id" = d."sop_id"
  AND d."station" IS NOT NULL
  AND sop."location_id" IS NOT NULL
  AND s."location_id" = sop."location_id"
  AND (
    (d."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (d."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (d."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "chat_channels" cc
SET "station_id" = s."id"
FROM "stations" s
WHERE cc."station" IS NOT NULL
  AND s."location_id" = cc."location_id"
  AND (
    (cc."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (cc."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (cc."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "station_shout_outs" so
SET "station_id" = s."id"
FROM "stations" s
WHERE s."location_id" = so."location_id"
  AND (
    (so."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (so."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (so."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

UPDATE "pulse_responses" pr
SET "station_id" = s."id"
FROM "stations" s
WHERE s."location_id" = pr."location_id"
  AND (
    (pr."station" = 'CUISINE' AND s."slug" = 'cuisine') OR
    (pr."station" = 'COMPTOIR' AND s."slug" = 'comptoir') OR
    (pr."station" = 'EMBALLAGE' AND s."slug" = 'emballage')
  );

-- Migrer tip_points depuis tip_pool_configs vers stations (une fois par succursale)
UPDATE "stations" s
SET "tip_points" = tpc."cuisine_points"
FROM "tip_pool_configs" tpc
WHERE tpc."location_id" = s."location_id" AND s."slug" = 'cuisine';

UPDATE "stations" s
SET "tip_points" = tpc."comptoir_points"
FROM "tip_pool_configs" tpc
WHERE tpc."location_id" = s."location_id" AND s."slug" = 'comptoir';

UPDATE "stations" s
SET "tip_points" = tpc."emballage_points"
FROM "tip_pool_configs" tpc
WHERE tpc."location_id" = s."location_id" AND s."slug" = 'emballage';

-- 5. Supprimer trigger legacy (dépend de location_members.station enum)
DROP TRIGGER IF EXISTS on_member_station_changed ON "location_members";

-- Supprimer anciennes colonnes enum + index
DROP INDEX IF EXISTS "shifts_station_starts_at_idx";
DROP INDEX IF EXISTS "sops_organization_id_station_idx";
DROP INDEX IF EXISTS "sops_location_id_station_idx";
DROP INDEX IF EXISTS "formation_modules_organization_id_station_is_active_idx";
DROP INDEX IF EXISTS "formation_modules_location_id_station_is_active_idx";
DROP INDEX IF EXISTS "pulse_responses_location_id_station_year_week_number_idx";
DROP INDEX IF EXISTS "employee_station_skills_location_id_user_id_station_key";
DROP INDEX IF EXISTS "employee_station_skills_location_id_station_level_idx";
DROP INDEX IF EXISTS "staffing_profiles_location_id_station_key";

ALTER TABLE "staffing_profiles" DROP COLUMN "station";
ALTER TABLE "location_members" DROP COLUMN "station";
ALTER TABLE "employee_profiles" DROP COLUMN "station";
ALTER TABLE "employee_station_skills" DROP COLUMN "station";
ALTER TABLE "shifts" DROP COLUMN "station";
ALTER TABLE "payroll_line_items" DROP COLUMN "station";
ALTER TABLE "sops" DROP COLUMN "station";
ALTER TABLE "formation_modules" DROP COLUMN "station";
ALTER TABLE "documents" DROP COLUMN "station";
ALTER TABLE "chat_channels" DROP COLUMN "station";
ALTER TABLE "station_shout_outs" DROP COLUMN "station";
ALTER TABLE "pulse_responses" DROP COLUMN "station";

ALTER TABLE "tip_pool_configs" DROP COLUMN "cuisine_points";
ALTER TABLE "tip_pool_configs" DROP COLUMN "comptoir_points";
ALTER TABLE "tip_pool_configs" DROP COLUMN "emballage_points";

-- 6. NOT NULL + FK + nouveaux index
ALTER TABLE "staffing_profiles" ALTER COLUMN "station_id" SET NOT NULL;
ALTER TABLE "location_members" ALTER COLUMN "station_id" SET NOT NULL;
ALTER TABLE "employee_station_skills" ALTER COLUMN "station_id" SET NOT NULL;
ALTER TABLE "shifts" ALTER COLUMN "station_id" SET NOT NULL;
ALTER TABLE "payroll_line_items" ALTER COLUMN "station_id" SET NOT NULL;
ALTER TABLE "payroll_line_items" ALTER COLUMN "station_name_fr" SET NOT NULL;
ALTER TABLE "station_shout_outs" ALTER COLUMN "station_id" SET NOT NULL;
ALTER TABLE "pulse_responses" ALTER COLUMN "station_id" SET NOT NULL;

ALTER TABLE "staffing_profiles" ADD CONSTRAINT "staffing_profiles_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "location_members" ADD CONSTRAINT "location_members_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_station_skills" ADD CONSTRAINT "employee_station_skills_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_line_items" ADD CONSTRAINT "payroll_line_items_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sops" ADD CONSTRAINT "sops_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "formation_modules" ADD CONSTRAINT "formation_modules_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "station_shout_outs" ADD CONSTRAINT "station_shout_outs_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pulse_responses" ADD CONSTRAINT "pulse_responses_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "staffing_profiles_location_id_station_id_key" ON "staffing_profiles"("location_id", "station_id");
CREATE UNIQUE INDEX "employee_station_skills_location_id_user_id_station_id_key" ON "employee_station_skills"("location_id", "user_id", "station_id");
CREATE INDEX "employee_station_skills_location_id_station_id_level_idx" ON "employee_station_skills"("location_id", "station_id", "level");
CREATE INDEX "shifts_station_id_starts_at_idx" ON "shifts"("station_id", "starts_at");
CREATE INDEX "sops_organization_id_station_id_idx" ON "sops"("organization_id", "station_id");
CREATE INDEX "sops_location_id_station_id_idx" ON "sops"("location_id", "station_id");
CREATE INDEX "formation_modules_organization_id_station_id_is_active_idx" ON "formation_modules"("organization_id", "station_id", "is_active");
CREATE INDEX "formation_modules_location_id_station_id_is_active_idx" ON "formation_modules"("location_id", "station_id", "is_active");
CREATE INDEX "pulse_responses_location_id_station_id_year_week_number_idx" ON "pulse_responses"("location_id", "station_id", "year", "week_number");

DROP TYPE "Station";

-- 7. Recréer trigger auto-inscription canaux (station_id)
CREATE OR REPLACE FUNCTION public.handle_member_station_change() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_channel_id uuid;
  old_channel_id uuid;
  v_user_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.station_id IS NOT DISTINCT FROM NEW.station_id THEN
    RETURN NEW;
  END IF;

  SELECT role::text INTO v_user_role FROM public.users WHERE id = NEW.user_id;

  IF v_user_role = 'EMPLOYEE' THEN
    DELETE FROM public.chat_channel_members ccm
     USING public.chat_channels cc
     WHERE ccm.channel_id = cc.id
       AND ccm.user_id = NEW.user_id
       AND cc.location_id = NEW.location_id
       AND cc.type = 'STATION'
       AND cc.is_archived = false;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT id INTO old_channel_id
      FROM public.chat_channels
     WHERE location_id = OLD.location_id
       AND type = 'STATION'
       AND station_id = OLD.station_id
       AND is_archived = false
     LIMIT 1;

    IF old_channel_id IS NOT NULL THEN
      DELETE FROM public.chat_channel_members
       WHERE channel_id = old_channel_id
         AND user_id = OLD.user_id;
    END IF;
  END IF;

  SELECT id INTO target_channel_id
    FROM public.chat_channels
   WHERE location_id = NEW.location_id
     AND type = 'STATION'
     AND station_id = NEW.station_id
     AND is_archived = false
   LIMIT 1;

  IF target_channel_id IS NOT NULL THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id, can_post, joined_at)
    VALUES (target_channel_id, NEW.user_id, true, now())
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_member_station_changed
  AFTER INSERT OR UPDATE OF station_id ON public.location_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_member_station_change();
