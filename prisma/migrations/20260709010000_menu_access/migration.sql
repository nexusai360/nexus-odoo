-- CreateTable
CREATE TABLE IF NOT EXISTS "menu_access" (
    "menu_key" TEXT NOT NULL,
    "access_level" "ChannelAccessLevel" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_access_pkey" PRIMARY KEY ("menu_key")
);
