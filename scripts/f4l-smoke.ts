// scripts/f4l-smoke.ts
// Smoke test das tools da Onda L1a (preços e serviços): exercita as query
// functions contra o cache populado e imprime amostras.
// Uso: tsx --env-file=.env.local scripts/f4l-smoke.ts
import { prisma } from "../src/worker/prisma";
import { queryPrecoProduto, queryPrecoTabela } from "../src/lib/reports/queries/precos";
import { queryServicoBuscar, queryServicoListar } from "../src/lib/reports/queries/servicos";

async function main(): Promise<void> {
  const pp = await queryPrecoProduto(prisma, { limit: 3 });
  console.log(`preco_produto -> ${pp.total} regras de produto; amostra:`);
  console.log("  " + JSON.stringify(pp.linhas[0] ?? null));

  const tabela = await prisma.fatoPreco.findFirst({
    where: { tabelaId: { not: null } },
    select: { tabelaId: true },
  });
  if (tabela?.tabelaId != null) {
    const pt = await queryPrecoTabela(prisma, { tabelaId: tabela.tabelaId });
    console.log(`preco_tabela(${tabela.tabelaId}) -> "${pt.tabelaNome}", ${pt.total} regras`);
  }

  const sb = await queryServicoBuscar(prisma, { termo: "program", limit: 3, offset: 0 });
  console.log(`servico_buscar("program") -> ${sb.total} resultados:`);
  for (const l of sb.linhas) console.log(`  ${l.codigoFormatado ?? l.codigo}: ${l.descricao}`);

  const sl = await queryServicoListar(prisma, { limit: 2, offset: 0 });
  console.log(`servico_listar -> ${sl.total} serviços no catálogo`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[smoke] FALHA:", err);
  process.exit(1);
});
