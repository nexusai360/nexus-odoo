import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { classificarCfop, extrairCfop } from "../../fiscal/regras";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../fiscal/grupo";

/**
 * Faturamento por MARCA do produto na base canonica da receita externa (Fase
 * 2.5): vrProdutos dos itens, ehReceita por CFOP, intragrupo eliminado, marca
 * via fato_produto. A versao anterior somava `vr_produtos` de TODO item de saida
 * (sem `situacao_nfe='autorizada'`, sem classificar receita por CFOP e sem
 * eliminar intragrupo), inflando o faturamento e contando remessas/transferencias
 * internas como venda. Reusa as MESMAS pecas do core (classificarCfop, whitelist
 * de grupo) agrupando pela dimensao produto->marca. Pericia: conversa ea8aa0a3.
 */
export interface MarcaLinha {
  marca: string | null;
  quantidadeItens: number;
  valorTotal: number;
}

export interface FaturamentoPorMarcaResultado {
  linhas: MarcaLinha[];
  totalGeral: number; // receita externa total
  totalItens: number; // itens de venda externa
  totalMarcas: number; // marcas reais distintas (sem contar "sem marca")
  totalIntragrupo: number; // vendas entre empresas do grupo, somadas a parte
}

export async function faturamentoPorMarcaCanon(
  prisma: PrismaClient,
  input: { periodoDe?: string; periodoAte?: string; empresaId?: number; limit: number },
): Promise<FaturamentoPorMarcaResultado> {
  const whereCommon = {
    entradaSaida: "1" as const,
    situacaoNfe: "autorizada" as const,
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };

  // (a) groupBy item por documentoId+cfopId+produtoId
  const grupos = await prisma.fatoNotaFiscalItem.groupBy({
    by: ["documentoId", "cfopId", "produtoId"],
    _sum: { vrProdutos: true },
    _count: true,
    where: whereCommon as Prisma.FatoNotaFiscalItemWhereInput,
  });

  // (b) ehReceita por cfopId (igual core)
  const cfopIds = [...new Set(grupos.map((g) => g.cfopId).filter((x): x is number => x !== null))];
  const nomeRows = cfopIds.length
    ? await prisma.fatoNotaFiscalItem.findMany({
        where: { cfopId: { in: cfopIds } },
        select: { cfopId: true, cfopNome: true },
        distinct: ["cfopId"],
      })
    : [];
  const ehReceitaPorCfop = new Map<number, boolean>();
  for (const r of nomeRows) {
    if (r.cfopId === null) continue;
    ehReceitaPorCfop.set(r.cfopId, classificarCfop(extrairCfop(r.cfopNome)).ehReceita);
  }

  // (c) marcacao intragrupo por documentoId (notas + whitelist de grupo)
  const notas = await prisma.fatoNotaFiscal.findMany({
    where: whereCommon as Prisma.FatoNotaFiscalWhereInput,
    select: { odooId: true, participanteId: true, participanteNome: true, empresaId: true, empresaNome: true },
  });
  const participantesGrupo = await carregarParticipantesGrupo(prisma);
  const intragrupoPorNota = new Map<number, boolean>();
  for (const n of notas) intragrupoPorNota.set(n.odooId, ehNotaIntragrupo(n, participantesGrupo));

  // (d) marca por produtoId
  const produtoIds = [...new Set(grupos.map((g) => g.produtoId).filter((x): x is number => x !== null))];
  const produtos = produtoIds.length
    ? await prisma.fatoProduto.findMany({
        where: { odooId: { in: produtoIds } },
        select: { odooId: true, marcaNome: true },
      })
    : [];
  const marcaPorProduto = new Map(produtos.map((p) => [p.odooId, p.marcaNome]));

  // (e) agrega receita externa por marca
  const porMarca = new Map<string, { valor: number; itens: number }>();
  let totalGeral = 0;
  let totalItens = 0;
  let totalIntragrupo = 0;
  for (const g of grupos) {
    const ehReceita = g.cfopId !== null ? ehReceitaPorCfop.get(g.cfopId) ?? false : false;
    if (!ehReceita) continue;
    const valor = Number(g._sum.vrProdutos ?? 0);
    const intragrupo = g.documentoId !== null ? intragrupoPorNota.get(g.documentoId) ?? false : false;
    if (intragrupo) {
      totalIntragrupo += valor;
      continue;
    }
    totalGeral += valor;
    totalItens += 1;
    const marcaRaw = g.produtoId !== null ? marcaPorProduto.get(g.produtoId) ?? null : null;
    const marca = marcaRaw && marcaRaw.trim().length > 0 ? marcaRaw.trim() : null;
    const key = marca ?? "(sem marca)";
    const acc = porMarca.get(key) ?? { valor: 0, itens: 0 };
    acc.valor += valor;
    acc.itens += 1;
    porMarca.set(key, acc);
  }

  const linhasTodas = [...porMarca.entries()]
    .map(([marca, acc]) => ({
      marca: marca === "(sem marca)" ? null : marca,
      quantidadeItens: acc.itens,
      valorTotal: Math.round(acc.valor * 100) / 100,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal || (a.marca ?? "").localeCompare(b.marca ?? ""));

  return {
    linhas: linhasTodas.slice(0, input.limit),
    totalGeral: Math.round(totalGeral * 100) / 100,
    totalItens,
    totalMarcas: linhasTodas.filter((l) => l.marca !== null).length,
    totalIntragrupo: Math.round(totalIntragrupo * 100) / 100,
  };
}
