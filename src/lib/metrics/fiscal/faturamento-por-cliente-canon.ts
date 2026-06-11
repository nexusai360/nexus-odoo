import type { PrismaClient } from "../../../generated/prisma/client";
import { carregarItensVendaComGrupo } from "./_itens-venda-grupo";
import { formatarCnpj } from "../../fiscal/cnpj";

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
  /** B3: CNPJ de exibicao (modo cliente: completo; modo cnpj_raiz: a raiz). */
  documento?: string | null;
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
  input: {
    periodoDe?: string;
    periodoAte?: string;
    empresaId?: number;
    limit: number;
    offset: number;
    /** B3: cnpj_raiz agrega matriz+filiais pela raiz de 8 digitos do CNPJ. */
    agruparPor?: "cliente" | "cnpj_raiz";
  },
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

  // B3: documento (vat) dos participantes externos , fato_parceiro ja guarda
  // documento (BR-mascara) e documento_digits (normalizado).
  const ids = [...externos.keys()].filter((k) => k > 0);
  const docs = ids.length
    ? await prisma.fatoParceiro.findMany({
        where: { odooId: { in: ids } },
        select: { odooId: true, documento: true, documentoDigits: true },
      })
    : [];
  const docPorId = new Map(docs.map((d) => [d.odooId, d]));
  for (const [key, linha] of externos) {
    linha.documento = formatarCnpj(docPorId.get(key)?.documentoDigits ?? docPorId.get(key)?.documento ?? null);
  }

  // B3: agrupamento por raiz de CNPJ (matriz + filiais). Sem CNPJ valido,
  // o cliente fica como linha propria (chave sintetica por participante).
  let agregados = [...externos.values()];
  if (input.agruparPor === "cnpj_raiz") {
    const porRaiz = new Map<string, ClienteLinha>();
    for (const [key, linha] of externos) {
      const digits = docPorId.get(key)?.documentoDigits ?? null;
      const raiz = digits && digits.length === 14 ? digits.slice(0, 8) : `sem-cnpj-${key}`;
      const cur = porRaiz.get(raiz);
      if (!cur) {
        porRaiz.set(raiz, {
          participanteId: linha.participanteId,
          participanteNome: linha.participanteNome,
          quantidade: linha.quantidade,
          valorTotal: linha.valorTotal,
          documento: raiz.startsWith("sem-cnpj-")
            ? null
            : `${raiz.slice(0, 2)}.${raiz.slice(2, 5)}.${raiz.slice(5, 8)}`,
        });
      } else {
        cur.quantidade += linha.quantidade;
        // rotulo = nome do participante de maior valor da raiz
        if (linha.valorTotal > cur.valorTotal) cur.participanteNome = linha.participanteNome;
        cur.valorTotal += linha.valorTotal;
      }
    }
    agregados = [...porRaiz.values()];
  }

  const ordenado = agregados.sort(
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
