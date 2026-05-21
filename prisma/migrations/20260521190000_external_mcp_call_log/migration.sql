-- CreateTable
CREATE TABLE "external_mcp_call_log" (
    "id" UUID NOT NULL,
    "server_id" UUID,
    "server_name" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "args_preview" JSONB,
    "user_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_mcp_call_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_mcp_call_log_criado_em_idx" ON "external_mcp_call_log"("criado_em");

-- CreateIndex
CREATE INDEX "external_mcp_call_log_server_id_idx" ON "external_mcp_call_log"("server_id");

-- AddForeignKey
ALTER TABLE "external_mcp_call_log" ADD CONSTRAINT "external_mcp_call_log_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "external_mcp_servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
