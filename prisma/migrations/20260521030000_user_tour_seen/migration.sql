-- CreateTable
CREATE TABLE "user_tour_seen" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tour_key" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tour_seen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_tour_seen_user_id_tour_key_key" ON "user_tour_seen"("user_id", "tour_key");
