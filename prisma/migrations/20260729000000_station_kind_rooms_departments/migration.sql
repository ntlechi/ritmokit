-- Split `stations` into dance rooms vs staff departments.
-- A room is bookable by a ClassSession; a department groups the team roster.

CREATE TYPE "StationKind" AS ENUM ('ROOM', 'DEPARTMENT');

ALTER TABLE "stations"
  ADD COLUMN IF NOT EXISTS "kind" "StationKind" NOT NULL DEFAULT 'ROOM';

-- Any station already used as a class room stays a ROOM.
UPDATE "stations" s
SET "kind" = 'ROOM'
WHERE EXISTS (
  SELECT 1 FROM "class_sessions" cs WHERE cs."room_id" = s."id"
);

-- Legacy QSR stations that never hosted a class are staff groupings, not rooms.
UPDATE "stations" s
SET "kind" = 'DEPARTMENT'
WHERE s."slug" IN (
  'entretiens', 'cuisine', 'services', 'comptoir', 'emballage',
  'gerants-jour', 'gerants-soir'
)
AND NOT EXISTS (
  SELECT 1 FROM "class_sessions" cs WHERE cs."room_id" = s."id"
);

CREATE INDEX IF NOT EXISTS "stations_location_id_kind_is_active_sort_order_idx"
  ON "stations" ("location_id", "kind", "is_active", "sort_order");
