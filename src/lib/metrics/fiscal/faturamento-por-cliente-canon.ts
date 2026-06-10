import type { PrismaClient } from "../../../generated/prisma/client";
import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";

/**
 * Faturamento por cliente (Fase 2.5), sobre o core compartilhado. Ranqueia apenas os
 * clientes EXTERNOS (vendas intragrupo nao sao cliente, vao para `totalIntragrupo`
 * separado). Base vrProdutos + ehReceita via CFOP (consistente com a receita externa).
 */
export interface ClienteLinha {
  participanteId: number | null;
  participanteNome: string | null;
  quantidade: number;
  valorTotal: number;
}

export interface FaturamentoPorClienteResultado {
  linhas: ClienteLinha[];
  total: number; // clientes externos distintos
  totalExterno: number;
  totalIntragrupo: number;
  topClienteExterno: string | null;
}

export async function faturamentoPorClienteCanon(
  prisma: PrismaClient,
  input: { periodoDe?: string; periodoAte?: string; empresaId?: number; limit: number; offset: number },
): Promise<FaturamentoPorClienteResultado> {
  const { itens } = await carregarItensVendaComGrupo(prisma, input);

  const externos = new Map<number, ClienteLinha>();
  let totalIntragrupo = 0;
  let totalExterno = 0;
  for (const it of itens) {
    if (!it.ehReceita) continue;
    if (it.intragrupo) {
      totalIntragrupo += it.valorProdutos;
      continue;
    }
    totalExterno += it.valorProdutos;
    const key = it.participanteId ?? -1;
    const cur =
      externos.get(key) ??
      { participanteId: it.participanteId, participanteNome: it.participanteNome, quantidade: 0, valorTotal: 0 };
    cur.quantidade += 1;
    cur.valorTotal += it.valorProdutos;
    externos.set(key, cur);
  }

  const ordenado = [...externos.values()].sort(
    (a, b) =>
      b.valorTotal - a.valorTotal ||
      (a.participanteNome ?? "").localeCompare(b.participanteNome ?? ""),
  );
  const total = ordenado.length;
  const linhas = ordenado.slice(input.offset, input.offset + input.limit);
  return {
    linhas,
    total,
    totalExterno,
    totalIntragrupo,
    topClienteExterno: ordenado[0]?.participanteNome ?? null,
  };
}
