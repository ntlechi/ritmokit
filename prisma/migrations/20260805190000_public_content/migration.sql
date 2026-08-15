-- CreateTable
CREATE TABLE "studio_announcements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_public_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "short_label" TEXT,
    "description" TEXT,
    "scale" TEXT NOT NULL DEFAULT 'local',
    "status" TEXT NOT NULL DEFAULT 'active',
    "booking_open" BOOLEAN NOT NULL DEFAULT true,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "venue" TEXT,
    "ticket_url" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_public_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studio_announcements_location_id_is_active_published_at_idx" ON "studio_announcements"("location_id", "is_active", "published_at");

CREATE INDEX "studio_public_events_location_id_is_active_starts_on_idx" ON "studio_public_events"("location_id", "is_active", "starts_on");

-- AddForeignKey
ALTER TABLE "studio_announcements" ADD CONSTRAINT "studio_announcements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "studio_public_events" ADD CONSTRAINT "studio_public_events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
