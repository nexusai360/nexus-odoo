// src/lib/reports/queries/dfe.ts
//
// Núcleo de agregação de DF-e de entrada (notas de fornecedores capturadas
// eletronicamente), framework-neutro. Recebe `prisma` + filtros, devolve
// agregação crua , sem `estado`/`freshness`/shaping (esses vivem no handler MCP).
// Fonte: fato_dfe (1 linha = 1 DF-e). Distinto de fato_nota_fiscal (docs próprios).
//
// Notas do dado real (O1): participante_id costuma vir nulo, então a agregação
// por fornecedor é por `cnpjFornecedor` (string). `vrNf` é frequentemente 0 nesta
// base , o valor confiável de compra vem do financeiro, não do DF-e.

import type { PrismaClient } from "@/generated/prisma/client";
import { janelaClampada } from "@/lib/corte-dados";

/**
 * Recorte de `dataEmissao` grampeado a data de inicio das analises.
 *
 * DF-e e nota fiscal de fornecedor: documento com data, ou seja, HISTORICO. O piso vale
 * sempre, inclusive quando o chamador nao manda periodo (antes, sem o par completo, o where
 * saia vazio e a consulta varria o cache inteiro). Periodo que comeca antes do corte e puxado
 * para ele; a borda de fim e exclusiva (o dia `ate` entra inteiro).
 */
function periodoWhere(filtros: { periodoDe?: string; periodoAte?: string }): {
  dataEmissao: { gte: Date; lt: Date };
} {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  return { dataEmissao: { gte: j.gte, lt: j.lt } };
}

export interface LinhaDfe {
  chave: string | null;
  numero: string | null;
  modelo: string | null;
  cnpjFornecedor: string | null;
  fornecedorNome: string | null;
  vrNf: number;
  dataEmissao: string | null;
  manifestacao: string | null;
}

const toLinha = (r: {
  chave: string | null;
  numero: string | null;
  modelo: string | null;
  cnpjFornecedor: string | null;
  fornecedorNome: string | null;
  vrNf: unknown;
  dataEmissao: Date | null;
  manifestacao: string | null;
}): LinhaDfe => ({
  chave: r.chave,
  numero: r.numero,
  modelo: r.modelo,
  cnpjFornecedor: r.cnpjFornecedor,
  fornecedorNome: r.fornecedorNome,
  vrNf: Number(r.vrNf),
  dataEmissao: r.dataEmissao ? r.dataEmissao.toISOString().slice(0, 10) : null,
  manifestacao: r.manifestacao,
});

const SELECT = {
  chave: true,
  numero: true,
  modelo: true,
  cnpjFornecedor: true,
  fornecedorNome: true,
  vrNf: true,
  dataEmissao: true,
  manifestacao: true,
} as const;

/** DF-e importados no período (lista + totais).
 * Alavanca 2b: paginação via take/skip no SQL. `totalNotas` é o count real do
 * recorte e `valorTotal` soma TODO o recorte (não só a página exibida), via
 * aggregate, para que os totais não mudem entre páginas. */
export async function queryDfeImportadosPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit?: number; offset?: number },
): Promise<{ linhas: LinhaDfe[]; totalNotas: number; valorTotal: number }> {
  const where = { ...periodoWhere(filtros) };
  const [rows, totalNotas, agg] = await Promise.all([
    prisma.fatoDfe.findMany({
      where,
      select: SELECT,
      // Ordenação estável + desempate por odooId: garante que "os próximos"
      // não repitam nem pulem item entre páginas (alavanca 2b).
      orderBy: [{ dataEmissao: "desc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoDfe.count({ where }),
    prisma.fatoDfe.aggregate({ where, _sum: { vrNf: true } }),
  ]);
  return {
    linhas: rows.map(toLinha),
    totalNotas,
    valorTotal: Number(agg._sum.vrNf ?? 0),
  };
}

/** DF-e agregados por fornecedor (cnpj_cpf).
 * Alavanca 2b , EXCEÇÃO de paginação em memória: a agregação por fornecedor
 * acontece em memória (participante_id costuma vir nulo, agrupa pelos dígitos
 * do CNPJ), então não há take/skip no SQL. Ordenamos o conjunto de forma
 * estável (quantidade desc, valor desc, depois a chave do documento como
 * desempate) e fatiamos [offset, offset+limit). `totalFornecedoresDistintos`
 * é o tamanho do conjunto (todos os grupos), independente da página. */
export async function queryDfePorFornecedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; documento?: string; limit?: number; offset?: number },
): Promise<{
  linhas: { cnpjFornecedor: string | null; fornecedorNome: string | null; quantidade: number; valorTotal: number }[];
  totalAgregado: { quantidade: number; valorTotal: number };
  totalFornecedoresDistintos: number;
}> {
  const alvoDoc = (filtros.documento ?? "").replace(/\D/g, "");
  const rows = await prisma.fatoDfe.findMany({
    where: { ...periodoWhere(filtros) },
    select: { cnpjFornecedor: true, fornecedorNome: true, vrNf: true },
  });

  const map = new Map<string, { cnpjFornecedor: string | null; fornecedorNome: string | null; quantidade: number; valorTotal: number }>();
  let totalQtd = 0;
  let totalValor = 0;
  for (const r of rows) {
    const digits = (r.cnpjFornecedor ?? "").replace(/\D/g, "");
    if (alvoDoc && !digits.includes(alvoDoc)) continue;
    // Agrega pelos DÍGITOS do CNPJ (imune a variação de máscara: "18.282.961/0001-00"
    // e "18282961000100" são o mesmo fornecedor). Exibe o valor formatado da 1ª ocorrência.
    const key = digits || "(sem cnpj)";
    const v = Number(r.vrNf);
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += v;
      if (!existing.fornecedorNome && r.fornecedorNome) existing.fornecedorNome = r.fornecedorNome;
    } else {
      map.set(key, {
        cnpjFornecedor: r.cnpjFornecedor,
        fornecedorNome: r.fornecedorNome,
        quantidade: 1,
        valorTotal: v,
      });
    }
    totalQtd += 1;
    totalValor += v;
  }

  // Ordenação estável: quantidade desc, valor desc, e a chave (dígitos do CNPJ)
  // como desempate final, para que "os próximos" não repitam nem pulem grupo.
  const ordenados = [...map.entries()]
    .sort(
      (a, b) =>
        b[1].quantidade - a[1].quantidade ||
        b[1].valorTotal - a[1].valorTotal ||
        a[0].localeCompare(b[0]),
    )
    .map(([, v]) => v);
  const offset = filtros.offset ?? 0;
  const limit = filtros.limit ?? 30;
  const linhas = ordenados.slice(offset, offset + limit);

  return {
    linhas,
    totalAgregado: { quantidade: totalQtd, valorTotal: totalValor },
    totalFornecedoresDistintos: map.size,
  };
}

/** DF-e pendentes de manifestação (manifestacao vazio/null).
 * Alavanca 2b: paginação via take/skip no SQL; `totalPendentes` é o count real
 * do recorte e `valorTotal` soma TODO o recorte (aggregate), estável entre
 * páginas. */
export async function queryDfePendentesManifestacao(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit?: number; offset?: number },
): Promise<{ linhas: LinhaDfe[]; totalPendentes: number; valorTotal: number }> {
  const where = {
    ...periodoWhere(filtros),
    OR: [{ manifestacao: null }, { manifestacao: "" }],
  };
  const [rows, totalPendentes, agg] = await Promise.all([
    prisma.fatoDfe.findMany({
      where,
      select: SELECT,
      // Ordenação estável + desempate por odooId (alavanca 2b).
      orderBy: [{ dataEmissao: "desc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoDfe.count({ where }),
    prisma.fatoDfe.aggregate({ where, _sum: { vrNf: true } }),
  ]);
  return {
    linhas: rows.map(toLinha),
    totalPendentes,
    valorTotal: Number(agg._sum.vrNf ?? 0),
  };
}
