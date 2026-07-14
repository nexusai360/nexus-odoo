// src/worker/fatos/fato-financeiro-titulo.ts
// FONTE: raw_finan_lancamento (modelo finan.lancamento , "carteira de títulos").
//   Corrigido em 2026-05-18 (bug R1): a fonte anterior era raw_finan_pagamento_divida
//   (finan.pagamento.divida = eventos de pagamento), que continha apenas 21 títulos abertos
//   com vr_saldo ~zero. A fonte correta é finan.lancamento, com 138 títulos abertos
//   (120 a_receber / R$ 1.164.266,36 + 18 a_pagar / R$ 95.694,95).
// FILTRO: tipo IN ('a_receber', 'a_pagar') , descarta tipo='recebimento','pagamento',
//   'entrada','saida' que são lançamentos de caixa, não títulos da carteira.
// tipo é campo selection direto da fonte: 'a_receber' | 'a_pagar' (sem derivação).
// vrSaldo é o valor correto para título em aberto (= vrDocumento = vrTotal quando aberto;
//   vrSaldo=0 quando quitado). Usado nas tools de totais.
// CRITERIO_ABERTO: situacaoSimples == 'aberto' , campo situacao_divida_simples é o oráculo.
// dataPagamento vem false (não string) quando não pago , mapeado para null.
// diasAtraso NÃO é coluna , calculado em runtime nas tools de vencidos.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoFinanceiroTituloRow {
  odooId: number;
  tipo: string;
  participanteId: number | null;
  participanteNome: string | null;
  contaId: number | null;
  contaNome: string | null;
  numeroDocumento: string | null;
  /** Pedido de origem (o Odoo da Tauga gera financeiro pelo PEDIDO ou pela NOTA). */
  pedidoId: number | null;
  /** Nota fiscal de origem, quando o titulo e duplicata de NF. */
  notaFiscalId: number | null;
  /** O pedido de origem ja tem NF de venda autorizada (preenchido no rebuild). */
  pedidoFaturado: boolean;
  dataDocumento: Date | null;
  dataVencimento: Date | null;
  dataPagamento: Date | null;
  situacao: string | null;
  situacaoSimples: string | null;
  formaPagamentoNome: string | null;
  provisorio: boolean;
  empresaId: number | null;
  vrDocumento: number;
  vrSaldo: number;
  vrTotal: number;
  vrJuros: number;
  vrMulta: number;
  vrDesconto: number;
  // NÃO inclui atualizadoEm , campo tem @default(now()) no schema (decisão N5)
  // NÃO inclui diasAtraso , não é coluna do schema
}

/** Tipos de finan.lancamento que são títulos da carteira (não lançamentos de caixa). */
const TIPOS_TITULO = new Set(["a_receber", "a_pagar"]);

export function mapTituloRow(
  raw: Record<string, unknown>,
  /** Pedidos que ja tem NF de venda autorizada. Vazio = ninguem faturado (uso em teste). */
  pedidosFaturados: ReadonlySet<number> = new Set(),
  /** Pedido de cada NF (nf_id -> pedido_id), para a duplicata saber de que pedido veio. */
  pedidoDaNota: ReadonlyMap<number, number> = new Map(),
): FatoFinanceiroTituloRow {
  const notaFiscalId = relId(raw.sped_documento_id as OdooM2O);
  // O titulo aponta para o pedido diretamente (financeiro pelo pedido) ou, quando e duplicata
  // de NF, herda o pedido da nota , e assim os dois lados falam do MESMO pedido.
  const pedidoId =
    relId(raw.pedido_id as OdooM2O) ??
    (notaFiscalId != null ? pedidoDaNota.get(notaFiscalId) ?? null : null);

  return {
    odooId: Number(raw.id),
    // tipo é campo direto da fonte: 'a_receber' | 'a_pagar'
    tipo: typeof raw.tipo === "string" ? raw.tipo : "",
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
    contaId: relId(raw.conta_id as OdooM2O),
    contaNome: relNome(raw.conta_id as OdooM2O),
    // campo real é "numero"
    numeroDocumento: typeof raw.numero === "string" ? raw.numero : null,
    pedidoId,
    notaFiscalId,
    // A forma de pagamento mora aqui, no titulo, nao na parcela do pedido: e o documento de
    // cobranca de verdade.
    //
    // Conferido no banco de PRODUCAO em 2026-07-14, no universo QUE O PAINEL USA (titulo a
    // receber): 5.537 titulos, e apenas 1 sem forma preenchida (99,98%). O "Nao informado" do
    // grafico e esse unico titulo de R$ 31.157,90 , residuo de cadastro no Odoo, acionavel.
    //
    // (Nota para quem for medir de novo: no universo de TODOS os lancamentos, incluindo os a
    // pagar, a cobertura cai para 90,2%. Sao coisas diferentes, e o painel so mostra os a
    // receber. Ja errei essa conta uma vez medindo o universo errado.)
    formaPagamentoNome: relNome(raw.forma_pagamento_id as OdooM2O),
    provisorio: raw.provisorio === true,
    empresaId: relId(raw.empresa_id as OdooM2O),
    pedidoFaturado: pedidoId != null && pedidosFaturados.has(pedidoId),
    // I2: sufixo T00:00:00 força parsing como hora local, evitando desvio UTC→GMT-3.
    dataDocumento: typeof raw.data_documento === "string" ? new Date(`${raw.data_documento}T00:00:00Z`) : null,
    dataVencimento: typeof raw.data_vencimento === "string" ? new Date(`${raw.data_vencimento}T00:00:00Z`) : null,
    // data_pagamento vem false (não string) quando não pago , mapeado para null
    dataPagamento: typeof raw.data_pagamento === "string" ? new Date(`${raw.data_pagamento}T00:00:00Z`) : null,
    situacao: typeof raw.situacao === "string" ? raw.situacao : null,
    situacaoSimples: typeof raw.situacao_divida_simples === "string" ? raw.situacao_divida_simples : null,
    vrDocumento: Number(raw.vr_documento ?? 0),
    // vrSaldo é o valor correto para título em aberto (= vrDocumento = vrTotal);
    // para quitado vr_saldo=0. Usado como base dos totais nas tools.
    vrSaldo: Number(raw.vr_saldo ?? 0),
    vrTotal: Number(raw.vr_total ?? 0),
    vrJuros: Number(raw.vr_juros ?? 0),
    vrMulta: Number(raw.vr_multa ?? 0),
    vrDesconto: Number(raw.vr_desconto ?? 0),
  };
}

/** NF de venda autorizada, saida (o que prova que o pedido virou faturamento). */
interface NotaOrigemRow {
  odoo_id: number;
  pedido_id: number | null;
  faturou: boolean;
}

/**
 * Le, do raw das notas, o pedido de cada NF e quais pedidos ja foram faturados de verdade
 * (NF de SAIDA, AUTORIZADA, com operacao de venda). E o que separa recebivel de carteira.
 */
async function origensDeNota(prisma: PrismaClient): Promise<{
  pedidoDaNota: Map<number, number>;
  pedidosFaturados: Set<number>;
}> {
  const rows = await prisma.$queryRaw<NotaOrigemRow[]>`
    SELECT
      odoo_id,
      CASE WHEN (data->'pedido_id'->>0) ~ '^[0-9]+$' THEN (data->'pedido_id'->>0)::int END AS pedido_id,
      (
        data->>'entrada_saida' = '1'
        AND data->>'situacao_nfe' = 'autorizada'
        AND coalesce(data->'operacao_id'->>1, '') ILIKE '%venda%'
      ) AS faturou
    FROM raw_sped_documento
    WHERE coalesce(raw_deleted, false) = false`;

  const pedidoDaNota = new Map<number, number>();
  const pedidosFaturados = new Set<number>();
  for (const r of rows) {
    if (r.pedido_id == null) continue;
    pedidoDaNota.set(r.odoo_id, r.pedido_id);
    if (r.faturou) pedidosFaturados.add(r.pedido_id);
  }
  return { pedidoDaNota, pedidosFaturados };
}

/** Reconstrói fato_financeiro_titulo a partir de raw_finan_lancamento.
 * Filtra tipo IN ('a_receber','a_pagar') , descarta lançamentos de caixa. */
export async function rebuildFatoFinanceiroTitulo(
  prisma: PrismaClient,
): Promise<number> {
  const [rawRows, origens] = await Promise.all([
    prisma.rawFinanLancamento.findMany({ where: { rawDeleted: false } }),
    origensDeNota(prisma),
  ]);
  // Filtro em memória: tipo deve ser título da carteira
  const tituloRows = rawRows.filter((r) => {
    const data = r.data as Record<string, unknown>;
    const tipo = typeof data.tipo === "string" ? data.tipo : "";
    return TIPOS_TITULO.has(tipo);
  });
  const mapped = tituloRows.map((r) =>
    mapTituloRow(
      r.data as Record<string, unknown>,
      origens.pedidosFaturados,
      origens.pedidoDaNota,
    ),
  );
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoFinanceiroTitulo.deleteMany({});
      if (mapped.length) {
        // data: mapped , sem injetar atualizadoEm (decisão N5)
        await tx.fatoFinanceiroTitulo.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_financeiro_titulo");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
