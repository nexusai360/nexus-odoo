// Seed idempotente do layout PADRÃO de demonstração do construtor (Onda 1).
// Tela "estoque-demo": 4 blocos de estoque (A-01..A-04) em grade 2x2.
// Rodar: set -a && . ./.env.local && set +a && node_modules/.bin/tsx scripts/seed-diretoria-relatorio.ts
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const TELA = "estoque-demo";
const BLOCOS = [
  { componenteId: "A-01", ordem: 0, larguraQuartos: 2, alturaU: 2 },
  { componenteId: "A-02", ordem: 1, larguraQuartos: 2, alturaU: 2 },
  { componenteId: "A-03", ordem: 2, larguraQuartos: 2, alturaU: 2 },
  { componenteId: "A-04", ordem: 3, larguraQuartos: 2, alturaU: 2 },
];

async function main() {
  // Idempotente: remove o padrão anterior desta tela (cascade apaga blocos) e recria.
  await prisma.diretoriaRelatorio.deleteMany({ where: { tela: TELA, isPadrao: true, donoUserId: null } });
  const rel = await prisma.diretoriaRelatorio.create({
    data: { tela: TELA, isPadrao: true, donoUserId: null, blocos: { create: BLOCOS } },
    include: { blocos: true },
  });
  console.log(`seed ok: relatorio ${rel.id} (tela=${TELA}) com ${rel.blocos.length} blocos`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
