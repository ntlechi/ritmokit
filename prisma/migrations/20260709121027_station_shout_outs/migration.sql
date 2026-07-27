-- CreateTable
CREATE TABLE "station_shout_outs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "station" "Station" NOT NULL,
    "value_key" VARCHAR(64) NOT NULL,
    "message" VARCHAR(140) NOT NULL,
    "chat_message_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "station_shout_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "station_shout_outs_location_id_created_at_idx" ON "station_shout_outs"("location_id", "created_at");

-- CreateIndex
CREATE INDEX "station_shout_outs_location_id_value_key_created_at_idx" ON "station_shout_outs"("location_id", "value_key", "created_at");

-- CreateIndex
CREATE INDEX "station_shout_outs_receiver_id_created_at_idx" ON "station_shout_outs"("receiver_id", "created_at");

-- CreateIndex
CREATE INDEX "station_shout_outs_sender_id_created_at_idx" ON "station_shout_outs"("sender_id", "created_at");

-- AddForeignKey
ALTER TABLE "station_shout_outs" ADD CONSTRAINT "station_shout_outs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_shout_outs" ADD CONSTRAINT "station_shout_outs_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "station_shout_outs" ADD CONSTRAINT "station_shout_outs_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
