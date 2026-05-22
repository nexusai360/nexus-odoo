-- CreateTable
CREATE TABLE "external_mcp_servers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "transport" TEXT NOT NULL DEFAULT 'http',
    "url" TEXT NOT NULL,
    "auth_header" TEXT,
    "auth_token" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_status" TEXT NOT NULL DEFAULT 'unknown',
    "last_check_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_mcp_servers_enabled_idx" ON "external_mcp_servers"("enabled");
