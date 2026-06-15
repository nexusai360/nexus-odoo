/**
 * scripts/cobertura/spike-custo.ts , B1 do plan Cobertura Cliente (read-only).
 *
 * Mede a % dos produtos VENDIDOS (2026+, saida autorizada) que tem regra
 * vigente em tabela de CUSTO (tabela_nome ILIKE 'Custo%' , conjunto real
 * conferido: Custo /0,3; Custo /0,95; Custo Padrão; Custo Smart /0,95).
 * Corte da spec §7: >=70% -> CMV aproximado entra na B4 (com % de cobertura
 * na resposta); <70% -> CMV vira honestidade de fonte.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cobertura/spike-custo.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const r = await prisma.$queryRawUnsafe<
    { vendidos: bigint; com_custo: bigint }[]
  >(`
    WITH vendidos AS (
      SELECT DISTINCT i.produto_id
      FROM fato_nota_fiscal_item i
      WHERE i.situacao_nfe = 'autorizada' AND i.entrada_saida = '1'
        AND i.data_emissao >= '2026-01-01' AND i.produto_id IS NOT NULL
    ), com_custo AS (
      SELECT DISTINCT v.produto_id
      FROM vendidos v
      JOIN fato_preco fp ON fp.produto_id = v.produto_id
      WHERE fp.tabela_nome ILIKE 'Custo%'
        AND (fp.data_inicial IS NULL OR fp.data_inicial <= now())
        AND (fp.data_final IS NULL OR fp.data_final >= now())
    )
    SELECT (SELECT count(*) FROM vendidos)::bigint AS vendidos,
           (SELECT count(*) FROM com_custo)::bigint AS com_custo
  `);
  const vendidos = Number(r[0]?.vendidos ?? 0);
  const comCusto = Number(r[0]?.com_custo ?? 0);
  const pct = vendidos > 0 ? (comCusto / vendidos) * 100 : 0;
  console.log(`produtos vendidos 2026+: ${vendidos} | com custo vigente: ${comCusto} | cobertura: ${pct.toFixed(1)}%`);

  const top = await prisma.$queryRawUnsafe<
    { produto_nome: string; valor: string }[]
  >(`
    WITH vendidos AS (
      SELECT i.produto_id, max(i.produto_nome) AS produto_nome, sum(i.vr_produtos) AS valor
      FROM fato_nota_fiscal_item i
      WHERE i.situacao_nfe = 'autorizada' AND i.entrada_saida = '1'
        AND i.data_emissao >= '2026-01-01' AND i.produto_id IS NOT NULL
      GROUP BY i.produto_id
    )
    SELECT v.produto_nome, v.valor::text
    FROM vendidos v
    WHERE NOT EXISTS (
      SELECT 1 FROM fato_preco fp
      WHERE fp.produto_id = v.produto_id AND fp.tabela_nome ILIKE 'Custo%'
        AND (fp.data_inicial IS NULL OR fp.data_inicial <= now())
        AND (fp.data_final IS NULL OR fp.data_final >= now())
    )
    ORDER BY v.valor DESC LIMIT 10
  `);
  console.log("top 10 SEM custo (por valor vendido):");
  for (const t of top) console.log(`  ${t.produto_nome}: R$ ${Number(t.valor).toLocaleString("pt-BR")}`);
  console.log(`DECISAO (corte 70%): ${pct >= 70 ? "CMV APROXIMADO ENTRA na B4" : "CMV vira honestidade de fonte"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
