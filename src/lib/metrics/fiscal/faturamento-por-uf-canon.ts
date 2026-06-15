import type { PrismaClient } from "../../../generated/prisma/client";
import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";

/**
 * Faturamento por UF (mesma base canonica da receita externa, Fase 2.5). Agrupa
 * a RECEITA EXTERNA (vrProdutos dos itens + ehReceita por CFOP, intragrupo
 * eliminado) pela UF do participante da nota (fato_parceiro.uf). Antes desta
 * versao a tool somava `vr_nf` cru de TODA nota de saida autorizada (sem
 * classificar receita por CFOP e sem eliminar intragrupo), inflando o
 * faturamento de ~R$ 8,9M para ~R$ 29M e fazendo a UF divergir da tool de
 * periodo. Agora `totalGeral` == receita externa do periodo (bate com
 * receitaConsolidada), as vendas intragrupo vao para `totalIntragrupo` a parte
 * e a UF e a do CLIENTE externo. Pericia: docs/RADAR.md / conversa ea8aa0a3.
 */
export interface UfLinha {
  uf: string | null;
  quantidadeNotas: number;
  valorTotal: number;
}

export interface FaturamentoPorUfResultado {
  linhas: UfLinha[];
  totalGeral: number; // receita externa total (== receitaConsolidada.receitaExterna)
  totalNotas: number; // notas externas distintas
  totalUfs: number; // UFs reais distintas (sem contar "sem UF")
  notasSemUf: number; // notas externas cujo cliente nao tem UF cadastrada
  valorSemUf: number;
  totalIntragrupo: number; // vendas entre empresas do grupo, somadas a parte
}

/** Remove o sufixo " (BR)" e normaliza espacos da UF vinda do cadastro Odoo. */
function limparUf(uf: string | null): string | null {
  if (uf == null) return null;
  const limpo = uf.replace(/\s*\(BR\)\s*$/i, "").trim();
  return limpo.length > 0 ? limpo : null;
}

export async function faturamentoPorUfCanon(
  prisma: PrismaClient,
  input: { periodoDe?: string; periodoAte?: string; empresaId?: number; limit: number },
): Promise<FaturamentoPorUfResultado> {
  const { itens } = await carregarItensVendaComGrupo(prisma, {
    periodoDe: input.periodoDe,
    periodoAte: input.periodoAte,
    empresaId: input.empresaId,
  });

  // UF por participante (so dos participantes que aparecem nos itens de receita externa)
  const idsExternos = [
    ...new Set(
      itens
        .filter((it) => it.ehReceita && !it.intragrupo && it.participanteId != null)
        .map((it) => it.participanteId as number),
    ),
  ];
  const parceiros = idsExternos.length
    ? await prisma.fatoParceiro.findMany({
        where: { odooId: { in: idsExternos } },
        select: { odooId: true, uf: true },
      })
    : [];
  const ufPorId = new Map(parceiros.map((p) => [p.odooId, limparUf(p.uf)]));

  const porUf = new Map<string, { valor: number; notas: Set<number> }>();
  const notasExternas = new Set<number>();
  let totalGeral = 0;
  let totalIntragrupo = 0;
  for (const it of itens) {
    if (!it.ehReceita) continue; // exclui transferencia, remessa, devolucao, bonificacao...
    if (it.intragrupo) {
      totalIntragrupo += it.valorProdutos;
      continue;
    }
    totalGeral += it.valorProdutos;
    if (it.documentoId != null) notasExternas.add(it.documentoId);
    const uf = it.participanteId != null ? ufPorId.get(it.participanteId) ?? null : null;
    const key = uf ?? "(sem UF)";
    const acc = porUf.get(key) ?? { valor: 0, notas: new Set<number>() };
    acc.valor += it.valorProdutos;
    if (it.documentoId != null) acc.notas.add(it.documentoId);
    porUf.set(key, acc);
  }

  const linhasTodas = [...porUf.entries()]
    .map(([uf, acc]) => ({
      uf: uf === "(sem UF)" ? null : uf,
      quantidadeNotas: acc.notas.size,
      valorTotal: Math.round(acc.valor * 100) / 100,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal || (a.uf ?? "").localeCompare(b.uf ?? ""));

  const semUf = linhasTodas.find((l) => l.uf === null);
  return {
    linhas: linhasTodas.slice(0, input.limit),
    totalGeral: Math.round(totalGeral * 100) / 100,
    totalNotas: notasExternas.size,
    totalUfs: linhasTodas.filter((l) => l.uf !== null).length,
    notasSemUf: semUf?.quantidadeNotas ?? 0,
    valorSemUf: semUf?.valorTotal ?? 0,
    totalIntragrupo: Math.round(totalIntragrupo * 100) / 100,
  };
}
