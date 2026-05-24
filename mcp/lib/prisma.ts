// mcp/lib/prisma.ts
// Client Prisma do MCP , lê MCP_DATABASE_URL (role nexus_mcp com GRANT mínimo).
// MCP_DATABASE_URL é sempre obrigatória. O fallback para DATABASE_URL foi
// removido (MEN-5): em produção ele anularia a camada 4 do RBAC ao conectar
// com o role completo. Configure MCP_DATABASE_URL em .env.local e Portainer.
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.MCP_DATABASE_URL;
if (!url) {
  throw new Error(
    "MCP_DATABASE_URL não está definida. O servidor MCP exige o role Postgres " +
    "nexus_mcp (GRANT mínimo) , configure MCP_DATABASE_URL antes de iniciar. " +
    "Veja .env.example para instruções.",
  );
}

const adapter = new PrismaPg({ connectionString: url });
export const prisma = new PrismaClient({ adapter });
