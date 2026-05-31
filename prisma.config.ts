import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";

// Carrega .env.local em dev para que TODO comando prisma (generate, migrate
// deploy/dev) enxergue DATABASE_URL. Sem isso, `prisma migrate deploy` falhava
// com "datasource.url is required" e sessões caíam num workaround que marcava a
// migration como aplicada sem criar as tabelas (bug que deixou o B2 sem tabelas
// no banco). Em produção/CI o arquivo não existe e o dotenv é no-op (não
// sobrescreve env já definida), então DATABASE_URL real continua valendo.
loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
