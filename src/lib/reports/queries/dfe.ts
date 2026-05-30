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

function periodoWhere(filtros: { periodoDe?: string; periodoAte?: string }) {
  return filtros.periodoDe && filtros.periodoAte
    ? {
        dataEmissao: {
          gte: new Date(`${filtros.periodoDe}T00:00:00`),
          lte: new Date(`${filtros.periodoAte}T23:59:59`),
        },
      }
    : {};
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

/** DF-e importados no período (lista + totais). */
export async function queryDfeImportadosPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limite?: number },
): Promise<{ linhas: LinhaDfe[]; totalNotas: number; valorTotal: number }> {
  const rows = await prisma.fatoDfe.findMany({
    where: { ...periodoWhere(filtros) },
    select: SELECT,
    orderBy: { dataEmissao: "desc" },
  });
  const linhas = rows.map(toLinha);
  const valorTotal = linhas.reduce((s, l) => s + l.vrNf, 0);
  return {
    linhas: linhas.slice(0, filtros.limite ?? 200),
    totalNotas: linhas.length,
    valorTotal,
  };
}

/** DF-e agregados por fornecedor (cnpj_cpf). */
export async function queryDfePorFornecedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; documento?: string; limite?: number },
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

  const linhas = [...map.values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.valorTotal - a.valorTotal)
    .slice(0, filtros.limite ?? 30);

  return {
    linhas,
    totalAgregado: { quantidade: totalQtd, valorTotal: totalValor },
    totalFornecedoresDistintos: map.size,
  };
}

/** DF-e pendentes de manifestação (manifestacao vazio/null). */
export async function queryDfePendentesManifestacao(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limite?: number },
): Promise<{ linhas: LinhaDfe[]; totalPendentes: number; valorTotal: number }> {
  const rows = await prisma.fatoDfe.findMany({
    where: {
      ...periodoWhere(filtros),
      OR: [{ manifestacao: null }, { manifestacao: "" }],
    },
    select: SELECT,
    orderBy: { dataEmissao: "desc" },
  });
  const linhas = rows.map(toLinha);
  const valorTotal = linhas.reduce((s, l) => s + l.vrNf, 0);
  return {
    linhas: linhas.slice(0, filtros.limite ?? 200),
    totalPendentes: linhas.length,
    valorTotal,
  };
}
