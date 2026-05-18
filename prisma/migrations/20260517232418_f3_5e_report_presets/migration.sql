-- CreateTable
CREATE TABLE "report_presets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "report_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "search_params" TEXT NOT NULL,
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_presets_user_id_report_id_idx" ON "report_presets"("user_id", "report_id");

-- AddForeignKey
ALTER TABLE "report_presets" ADD CONSTRAINT "report_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
