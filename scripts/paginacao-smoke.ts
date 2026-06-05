// scripts/paginacao-smoke.ts
// Smoke E2E read-only da paginacao (alavanca 2b) contra o banco real.
// Confirma, com dado de verdade, que LIMIT/OFFSET no SQL + orderBy estavel
// produz paginas SEM overlap e que o count bate.
// Uso: tsx --env-file=.env.local scripts/paginacao-smoke.ts
import { prisma } from "../src/worker/prisma";
import { montarPaginacaoMeta } from "../mcp/lib/paginacao";

async function paginaParceiros(offset: number, limit: number) {
  const where = { ativo: true };
  const [linhas, total] = await Promise.all([
    prisma.fatoParceiro.findMany({
      where,
      select: { odooId: true, nome: true },
      orderBy: [{ dataCriacao: "desc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoParceiro.count({ where }),
  ]);
  return { linhas, total };
}

async function main(): Promise<void> {
  let ok = true;
  const limit = 10;

  const p1 = await paginaParceiros(0, limit);
  const meta1 = montarPaginacaoMeta(p1.total, 0, limit, p1.linhas.length);
  console.log(`Pagina 1: ${meta1.mostrando} | temMais=${meta1.temMais} | proximoOffset=${meta1.proximoOffset}`);

  if (meta1.proximoOffset === null) {
    console.log("(poucos dados para paginar; nada a comparar)");
  } else {
    const p2 = await paginaParceiros(meta1.proximoOffset, limit);
    const meta2 = montarPaginacaoMeta(p2.total, meta1.proximoOffset, limit, p2.linhas.length);
    console.log(`Pagina 2: ${meta2.mostrando} | temMais=${meta2.temMais} | proximoOffset=${meta2.proximoOffset}`);

    const ids1 = new Set(p1.linhas.map((l) => l.odooId));
    const overlap = p2.linhas.filter((l) => ids1.has(l.odooId));
    if (overlap.length > 0) {
      ok = false;
      console.error(`FALHA: ${overlap.length} item(ns) repetido(s) entre pagina 1 e 2:`, overlap.map((l) => l.odooId));
    } else {
      console.log("OK: paginas 1 e 2 sem overlap (ordenacao estavel funciona).");
    }

    if (p1.total !== p2.total) {
      ok = false;
      console.error(`FALHA: total divergente entre paginas (${p1.total} vs ${p2.total}).`);
    } else {
      console.log(`OK: total consistente = ${p1.total}.`);
    }
  }

  // Sanidade do teto/defaults da engrenagem.
  const metaUltima = montarPaginacaoMeta(15, 10, 10, 5);
  console.log(`Sanidade meta ultima pagina: ${metaUltima.mostrando} | temMais=${metaUltima.temMais} (esperado false)`);
  if (metaUltima.temMais !== false) ok = false;

  await prisma.$disconnect();
  console.log(ok ? "\nSMOKE OK" : "\nSMOKE FALHOU");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[smoke] FALHA:", err);
  process.exit(1);
});
