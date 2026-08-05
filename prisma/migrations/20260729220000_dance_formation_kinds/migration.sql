-- Remap Mirok/QSR formation kinds → dance-studio teaching kinds.

CREATE TYPE "FormationModuleKind_new" AS ENUM (
  'CLASS_PLAN',
  'MOVES',
  'CHOREOGRAPHY',
  'STUDIO_GUIDE',
  'SAFETY',
  'ONBOARDING'
);

ALTER TABLE "formation_modules"
  ALTER COLUMN "kind" TYPE "FormationModuleKind_new"
  USING (
    CASE "kind"::text
      WHEN 'RECIPE' THEN 'CLASS_PLAN'
      WHEN 'SOP' THEN 'STUDIO_GUIDE'
      WHEN 'SAFETY' THEN 'SAFETY'
      WHEN 'ONBOARDING' THEN 'ONBOARDING'
      ELSE 'STUDIO_GUIDE'
    END
  )::"FormationModuleKind_new";

DROP TYPE "FormationModuleKind";
ALTER TYPE "FormationModuleKind_new" RENAME TO "FormationModuleKind";
