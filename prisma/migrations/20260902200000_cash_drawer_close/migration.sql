-- End-of-night door drawer close (cash only). One row per location per business night.

CREATE TABLE "cash_drawer_closes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "closed_by_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "start_float_cad" DECIMAL(10,2) NOT NULL,
    "cash_door_cad" DECIMAL(10,2) NOT NULL,
    "cash_door_count" INTEGER NOT NULL,
    "interac_door_cad" DECIMAL(10,2) NOT NULL,
    "interac_door_count" INTEGER NOT NULL,
    "expected_cad" DECIMAL(10,2) NOT NULL,
    "counted_cad" DECIMAL(10,2) NOT NULL,
    "variance_cad" DECIMAL(10,2) NOT NULL,
    "deposit_cad" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_drawer_closes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cash_drawer_closes_location_id_business_date_key" ON "cash_drawer_closes"("location_id", "business_date");
CREATE INDEX "cash_drawer_closes_location_id_business_date_idx" ON "cash_drawer_closes"("location_id", "business_date");

ALTER TABLE "cash_drawer_closes" ADD CONSTRAINT "cash_drawer_closes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_drawer_closes" ADD CONSTRAINT "cash_drawer_closes_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
