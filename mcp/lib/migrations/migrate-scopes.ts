// mcp/lib/migrations/migrate-scopes.ts
// Migra dados de ApiKey.scopes (legado) → ApiKey.capabilities (F4 Onda 2).
//
// Uso:
//   npx tsx mcp/lib/migrations/migrate-scopes.ts
//
// Comportamento:
// 1. Lê todas as ApiKeys ativas.
// 2. Para cada uma, converte `scopes` em `capabilities`.
// 3. Marca a chave como `isSystemKey=true` para forçar reconfiguração
//    manual pelo super_admin antes de uso ativo.
// 4. Imprime contador de chaves migradas.

import { PrismaClient } from "@/generated/prisma/client";
import { parseScopes } from "./parse-scopes";

export { parseScopes } from "./parse-scopes";

export async function migrateAllScopes(prisma: PrismaClient): Promise<{ migrated: number }> {
  const keys = await prisma.apiKey.findMany({ where: { active: true } });
  let migrated = 0;
  for (const key of keys) {
    const oldScopes = (key.scopes as unknown as string[]) ?? [];
    const capabilities = parseScopes(oldScopes);
    await prisma.apiKey.update({
      where: { id: key.id },
      data: {
        capabilities: capabilities as unknown as never,
        isSystemKey: true,
        capabilitiesVersion: 1,
      },
    });
    migrated++;
  }
  return { migrated };
}

async function main(): Promise<void> {
  // Importar lazy para não bater no problema de import.meta do client gerado
  // quando o arquivo é importado em ambiente que não suporta ESM nativo (jest).
  // @ts-ignore — script CLI standalone; import resolve em runtime via tsx
  const { prisma } = await import("../../../src/lib/prisma.ts");
  try {
    const r = await migrateAllScopes(prisma);
    console.log(`✅ Migrated ${r.migrated} ApiKeys (scopes → capabilities, isSystemKey=true)`);
  } finally {
    await prisma.$disconnect();
  }
}

const isMain = (() => {
  try {
    return require.main === module;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().then(() => process.exit(0)).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
