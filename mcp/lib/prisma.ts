// mcp/lib/prisma.ts
// Client Prisma do MCP — lê MCP_DATABASE_URL (role nexus_mcp com GRANT mínimo).
// Fallback para DATABASE_URL até 4f-1 (provisionamento do role em produção).
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.MCP_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "MCP_DATABASE_URL ou DATABASE_URL deve estar definida. Configure MCP_DATABASE_URL antes de iniciar o servidor MCP.",
  );
}

const adapter = new PrismaPg({ connectionString: url });
export const prisma = new PrismaClient({ adapter });
