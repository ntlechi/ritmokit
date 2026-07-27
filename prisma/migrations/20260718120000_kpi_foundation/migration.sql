-- KPI foundation: turnover, channel sales, SOS timing, food cost, order counts

CREATE TYPE "PosSalesChannel" AS ENUM ('IN_STORE', 'UEAT', 'DOORDASH', 'OTHER');

ALTER TABLE "locations" ADD COLUMN "food_cost_pct" DECIMAL(5, 2);

ALTER TABLE "pos_sales_hourly" ADD COLUMN "order_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "pos_channel_sales_daily" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "channel" "PosSalesChannel" NOT NULL,
    "net_sales" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_channel_sales_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_channel_sales_daily_location_date_channel_key"
    ON "pos_channel_sales_daily"("location_id", "date", "channel");

CREATE INDEX "pos_channel_sales_daily_location_date_idx"
    ON "pos_channel_sales_daily"("location_id", "date");

ALTER TABLE "pos_channel_sales_daily"
    ADD CONSTRAINT "pos_channel_sales_daily_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_departures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "departed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_departures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_departures_location_departed_idx"
    ON "staff_departures"("location_id", "departed_at");

ALTER TABLE "staff_departures"
    ADD CONSTRAINT "staff_departures_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_departures"
    ADD CONSTRAINT "staff_departures_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_ingestion_logs"
    ADD COLUMN "channel" "PosSalesChannel" NOT NULL DEFAULT 'IN_STORE',
    ADD COLUMN "paid_at" TIMESTAMP(3),
    ADD COLUMN "ready_at" TIMESTAMP(3);
