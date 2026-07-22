// Relatório de Entregas Parciais (sub-aba de Pedidos & Entregas).
//
// Uma linha por ITEM dos pedidos em demanda aberta que ainda têm saldo a entregar, mais três
// KPIs no topo. Reconcilia a estranheza "61 mi × 21 mi": o total do pedido (header, venda),
// o que falta entregar a venda e o que falta entregar a custo convivem, rotulados.
//
// Reconciliação garantida por construção: o "a atender" de cada linha vem da MESMA função
// (`aAtenderDoItem`) que o card "Demandas a entregar" usa. No mesmo escopo (mesma janela de
// período + empresa + UF), o KPI de custo daqui é idêntico ao card.

import type { PrismaClient } from "@/generated/prisma/client";

import { corteAtualDate, janelaDemandaAberta } from "@/lib/corte-dados";
import { aAtenderDoItem } from "@/lib/diretoria/atendimento-item";
import { corEtapaValida } from "@/lib/diretoria/etapa-cor";
import { formatarNomeEtapa } from "@/lib/diretoria/etapa-formato";
import { rotuloModalidadeFrete } from "@/lib/fiscal/regras/modalidade-frete";
import { atendimentoSincronizado } from "@/lib/diretoria/atendimento-status";
import { siglaDeUf } from "@/lib/diretoria/uf";
import { buildEmpresaWhere } from "@/lib/metrics/_shared/empresa";
import { filtrarTitulosExternos } from "@/lib/reports/queries/financeiro";

export interface FiltrosEntregasParciais {
  ufs?: string[];
  periodoDe?: string;
  periodoAte?: string;
  empresaId?: number;
  /**
   * @deprecated (Fase 1A) A demanda a entregar já não é cortada pelo corte de leitura: ela
   * sempre segue a pílula de período (piso 2000), então este toggle não altera mais o
   * resultado. Mantido no tipo por compatibilidade com o botão da UI, que sai numa fase de
   * frontend. Ver D8/RF-A5.
   */
  ignorarCorteDados?: boolean;
}

export interface LinhaEntregaParcial {
  pedidoId: number;
  numero: string | null;
  /** Número de referência do pedido no Mercos (CRM externo), parseado do obs. */
  numeroMercos: string | null;
  uf: string;
  cidade: string | null;
  cliente: string | null;
  produto: string | null;
  familia: string | null;
  marca: string | null;
  /** Operação FISCAL do pedido (natureza da operação por CFOP). Distinta da modalidade de frete. */
  operacao: string | null;
  /** Modalidade de frete (CIF/FOB/terceiros/próprio), rótulo do código NF-e modFrete. */
  modalidade: string | null;
  etapa: string | null;
  /** Hex da cor da etapa vindo do Odoo (raw_pedido_etapa.data.cor), ou null (tag neutra). */
  etapaCor: string | null;
  qtdAAtender: number;
  /** Quantidade cheia do item (total do pedido, antes de atender). */
  quantidadeTotal: number;
  /** Quantidade já atendida (cheia − a atender; 0 se o atendimento não sincronizou). */
  quantidadeAtendida: number;
  valorVendaAAtender: number;
  valorCustoAAtender: number;
  /** Valor total do item a preço de CUSTO (quantidade cheia × custo unitário). */
  valorCustoTotal: number;
  // --- Rentabilidade DO ITEM (campos prontos do Odoo, raw_sped_documento_item;
  //     mesma semântica do pedido, mas por produto). Margem = liquido / subtotal. ---
  /** Alíquota de comissão do item (%) e valor da comissão do item (R$). */
  itemComissaoPct: number;
  itemComissaoValor: number;
  /** Resultado líquido do item (vr_liquido) e margem (%) prontos do Odoo. */
  itemLiquido: number;
  itemMargemPct: number;
  /** Desconto do item (vr_desconto R$ e al_desconto %) prontos do Odoo. */
  itemDescontoValor: number;
  itemDescontoPct: number;
  // --- Rentabilidade do PEDIDO (campos prontos do Odoo, raw_pedido_documento;
  //     repetidos em toda linha do mesmo pedido). Margem = liquido / subtotal. ---
  /** Base tributável do pedido (vr_operacao_tributacao) = "Total geral" do Odoo. */
  subtotal: number;
  /** Total da coluna "Produto" do Odoo (vr_produtos = soma bruta dos produtos, antes do
   * desconto) = "Subtotal" do cabeçalho do Odoo. Puxado do sistema, não somado por nós. */
  valorProduto: number;
  /** Custo comercial (vr_custo_comercial; o custo da aba Rentabilidade). */
  custoComercial: number;
  icms: number;
  difal: number;
  fcp: number;
  pis: number;
  cofins: number;
  /** IRPJ e CSLL do pedido (vr_irpj / vr_csll), prontos do Odoo. */
  irpj: number;
  csll: number;
  /** CBS e IBS do pedido (vr_cbs / vr_ibs, reforma tributária), prontos do Odoo. */
  cbs: number;
  ibs: number;
  /** Alíquota de comissão (%) e valor da comissão (R$). */
  comissaoPct: number;
  comissaoValor: number;
  /** Resultado líquido do pedido (vr_liquido) e margem (%) prontos do Odoo. */
  liquido: number;
  margemPct: number;
  /** Desconto do pedido (vr_desconto R$ e al_desconto %) prontos do Odoo. */
  descontoValor: number;
  descontoPct: number;
  statusFinanceiro: "liberado" | "bloqueado";
  formaPagamento: string | null;
  /** Condição de pagamento do Odoo (condicao_pagamento_id, ex.: "Livre", "Boleto; 6 x"). */
  condicaoPagamento: string | null;
  // --- Fase 3: colunas completas do relatório oficial (ID 28) ---
  /** Data de orçamento do pedido (ISO `YYYY-MM-DD`) ou null. */
  orcamento: string | null;
  /** Data prevista de entrega (ISO) ou null. */
  prevista: string | null;
  /** Data de validade do contrato (`data_validade` do cabeçalho, ISO) ou null. */
  validade: string | null;
  /** Empresa emissora do pedido (razão social). */
  emitente: string | null;
  /** Vendedor responsável pelo pedido. */
  vendedor: string | null;
  /** CNPJ/CPF do cliente (formatado, como no Odoo). */
  cnpj: string | null;
  /** CEP do cliente. */
  cep: string | null;
  /** Código do produto (SKU do cadastro). */
  codigoProduto: string | null;
  /** Preço unitário do item (valor cheio / quantidade; bruto, ver D-F3-2). */
  unitario: number;
  /** Valor cheio da linha (qtd x unitário, sem desconto do a-atender). */
  valorCheio: number;
  /** Observações do pedido (`obs` do raw). */
  observacoes: string | null;
  /** Observação de entrega (`obs_produtos` do raw). TODO(dono): confirmar fonte (D-F3-4). */
  obsEntrega: string | null;
}

export interface IndicadoresEntregasParciais {
  /** Pedidos em aberta distintos no escopo. */
  qtdPedidos: number;
  /** Σ do valor cheio dos pedidos (header, a venda). Inclui o já entregue. */
  totalPedido: number;
  /** Σ do que falta entregar, a preço de venda. */
  aAtenderVenda: number;
  /** Σ do que falta entregar, a custo. Bate com o card no mesmo escopo. */
  aAtenderCusto: number;
}

export interface EntregasParciaisData {
  indicadores: IndicadoresEntregasParciais;
  linhas: LinhaEntregaParcial[];
  /** false = job de atendimento não rodou; a tela avisa que usa a quantidade cheia. */
  atendimentoSincronizado: boolean;
}

/**
 * Constrói o mapa etapa_id -> hex a partir das linhas de `raw_pedido_etapa`. Puro e
 * testável: cada valor passa por `corEtapaValida` (false/lixo -> null). A cor é
 * atributo de domínio da etapa (não histórico datado), então não segue o corte de
 * leitura; apenas registros vivos (`rawDeleted: false`) entram no lote (ver A5).
 */
export function mapaCorEtapa(
  rows: { odooId: number; data: unknown }[],
): Map<number, string | null> {
  const m = new Map<number, string | null>();
  for (const r of rows) {
    const cor = (r.data as { cor?: unknown } | null)?.cor;
    m.set(r.odooId, corEtapaValida(cor));
  }
  return m;
}

// --- Fase 3: helpers puros (colunas completas do relatório oficial) ---

/** Normaliza um valor do Odoo em string útil: não-string (ex.: `false`), vazio ou só
 * espaços viram null. */
function strOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Data ISO `YYYY-MM-DD` a partir de um Date, ou null. Reusa o padrão provado no repo
 * (`estoque.ts`): as datas do Odoo são `timestamp` 00:00:00 em UTC, então `toISOString`
 * não desloca o dia (ver review D-F3-8/B2). */
export function isoData(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Preço unitário do item: valor cheio da linha dividido pela quantidade. Bruto (o
 * `vr_produtos` do Odoo não subtrai desconto); bate com `vr_unitario` a menos de drift
 * de arredondamento de centavo em ~1,4% dos itens (review B1). Quantidade 0/negativa => 0. */
export function precoUnitarioItem(valorCheio: number, quantidade: number): number {
  return quantidade > 0 ? valorCheio / quantidade : 0;
}

/** Extrai as observações do pedido do jsonb raw: `obs` (observações gerais) e
 * `obs_produtos` (candidato a "Obs entrega", D-F3-4). `false`/vazio do Odoo => null. */
export function extrairObsPedido(
  data: unknown,
): { obs: string | null; obsEntrega: string | null } {
  const d = data as { obs?: unknown; obs_produtos?: unknown } | null;
  return { obs: strOuNull(d?.obs), obsEntrega: strOuNull(d?.obs_produtos) };
}

/** Forma de pagamento do CABEÇALHO do pedido (`pedido.documento.forma_pagamento_id`,
 * many2one `[id, nome]`). É a fonte fiel: muitos pedidos em aberto não têm parcela,
 * então a forma vinda de `fato_pedido_parcela` some (o bug do "Não informado").
 * `false`/vazio do Odoo => null. */
export function extrairFormaPagamento(data: unknown): string | null {
  const v = (data as { forma_pagamento_id?: unknown } | null)?.forma_pagamento_id;
  return Array.isArray(v) && typeof v[1] === "string" ? strOuNull(v[1]) : null;
}

/** Condição de pagamento do CABEÇALHO (`pedido.documento.condicao_pagamento_id`,
 * many2one `[id, nome]`, ex.: "Livre", "Boleto; 6 x", "[Sem Pagamento] ..."). Fonte
 * fiel do Odoo (mesmo campo da tela do pedido). `false`/vazio => null. */
export function extrairCondicaoPagamento(data: unknown): string | null {
  const v = (data as { condicao_pagamento_id?: unknown } | null)?.condicao_pagamento_id;
  return Array.isArray(v) && typeof v[1] === "string" ? strOuNull(v[1]) : null;
}

/** Desconto do PEDIDO (cabeçalho): `vr_desconto` (R$) e `al_desconto` (%), prontos do
 * Odoo. 0 quando não há desconto (a maioria dos pedidos). */
export function extrairDesconto(data: unknown): { descontoValor: number; descontoPct: number } {
  const d = data as Record<string, unknown> | null;
  return { descontoValor: numJson(d?.vr_desconto), descontoPct: numJson(d?.al_desconto) };
}

/** Número do jsonb do Odoo: o Odoo devolve `false` (não nulo) em campo não
 * aplicável; string/número viram número, o resto vira 0. */
function numJson(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Rentabilidade do PEDIDO, campos JÁ CALCULADOS pelo Odoo em
 * `raw_pedido_documento.data` (mesma aba Rentabilidade do ERP). Margem e líquido
 * vêm prontos (NÃO recalcular: é Lucro Real, o líquido já abate créditos). */
export function extrairRentabilidade(data: unknown): {
  subtotal: number; valorProduto: number; custoComercial: number; icms: number; difal: number; fcp: number;
  pis: number; cofins: number; irpj: number; csll: number; cbs: number; ibs: number; comissaoPct: number; comissaoValor: number; liquido: number; margemPct: number;
} {
  const d = data as Record<string, unknown> | null;
  return {
    subtotal: numJson(d?.vr_operacao_tributacao),
    valorProduto: numJson(d?.vr_produtos),
    custoComercial: numJson(d?.vr_custo_comercial),
    icms: numJson(d?.vr_icms_proprio),
    difal: numJson(d?.vr_difal),
    fcp: numJson(d?.vr_fcp),
    pis: numJson(d?.vr_pis_proprio),
    cofins: numJson(d?.vr_cofins_proprio),
    irpj: numJson(d?.vr_irpj),
    csll: numJson(d?.vr_csll),
    cbs: numJson(d?.vr_cbs),
    ibs: numJson(d?.vr_ibs),
    comissaoPct: numJson(d?.al_comissao),
    comissaoValor: numJson(d?.vr_comissao),
    liquido: numJson(d?.vr_liquido),
    margemPct: numJson(d?.al_margem),
  };
}

/** Rentabilidade DO ITEM, campos JÁ CALCULADOS pelo Odoo em
 * `raw_sped_documento_item.data` (mesma semântica do pedido, por produto). Margem e
 * líquido vêm PRONTOS (NÃO recalcular: é Lucro Real, o líquido já abate créditos). */
export function extrairRentabilidadeItem(data: unknown): {
  itemComissaoPct: number; itemComissaoValor: number; itemLiquido: number; itemMargemPct: number;
  itemDescontoValor: number; itemDescontoPct: number;
} {
  const d = data as Record<string, unknown> | null;
  return {
    itemComissaoPct: numJson(d?.al_comissao),
    itemComissaoValor: numJson(d?.vr_comissao),
    itemLiquido: numJson(d?.vr_liquido),
    itemMargemPct: numJson(d?.al_margem),
    itemDescontoValor: numJson(d?.vr_desconto),
    itemDescontoPct: numJson(d?.al_desconto),
  };
}

// REGRA_BLOQUEIO (D-b, versão SIMPLES, pendente de veredito do dono , 2026-07-18):
// REGRA_BLOQUEIO (decisão do dono, 2026-07-19): segue a fonte da verdade, o ERP Odoo. No Odoo,
// "conta a receber" é o título FATURADO (nota emitida OU pedido já faturado, que gerou a
// duplicata); a carteira (pedido confirmado ainda não faturado) NÃO é conta a receber, é receita
// contratada. Então um cliente fica "bloqueado" quando tem título a_receber FATURADO vencido em
// aberto , exatamente o que o menu Contas a Receber do Odoo lista como em atraso.

/**
 * Clientes bloqueados: os que têm conta a receber (faturada) vencida em aberto, como o ERP Odoo
 * define. Mesmo predicado dos Títulos Vencidos (`vrSaldo>0`, vencimento antes de hoje, documento
 * pós-corte, intragrupo fora), numa única query batched por participante (sem N+1).
 */
export async function statusBloqueioPorCliente(
  prisma: PrismaClient,
  participanteIds: number[],
  hoje: Date,
): Promise<Set<number>> {
  if (!participanteIds.length) return new Set();
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      tipo: "a_receber",
      participanteId: { in: participanteIds },
      vrSaldo: { gt: 0 },
      dataVencimento: { lt: inicioDoDia },
      dataDocumento: { gte: corteAtualDate() },
      // Faturado = conta a receber no Odoo: tem nota OU o pedido já foi faturado (gerou duplicata).
      OR: [{ notaFiscalId: { not: null } }, { pedidoFaturado: true }],
    },
    select: { participanteId: true, participanteNome: true },
  });

  const externos = await filtrarTitulosExternos(prisma, rows);
  return new Set(
    externos.map((r) => r.participanteId).filter((x): x is number => x != null),
  );
}

/**
 * Forma(s) de pagamento por pedido, da PARCELA do pedido (`fato_pedido_parcela`).
 *
 * Medido no cache: pedido em demanda aberta é pré-nota, então o título financeiro dele é
 * carteira e vem SEM forma de pagamento (0% preenchido). A forma mora na parcela do pedido
 * (251 dos 342 pedidos abertos têm). Um pedido pode ter mais de uma forma (entrada + saldo);
 * juntamos as distintas.
 */
async function formaPagamentoPorPedido(
  prisma: PrismaClient,
  pedidoIds: number[],
): Promise<Map<number, string>> {
  if (!pedidoIds.length) return new Map();
  const parcelas = await prisma.fatoPedidoParcela.findMany({
    where: { pedidoId: { in: pedidoIds }, formaPagamentoNome: { not: null } },
    select: { pedidoId: true, formaPagamentoNome: true },
  });
  const setDe = new Map<number, Set<string>>();
  for (const pc of parcelas) {
    if (pc.pedidoId == null || !pc.formaPagamentoNome) continue;
    const s = setDe.get(pc.pedidoId) ?? new Set<string>();
    s.add(pc.formaPagamentoNome);
    setDe.set(pc.pedidoId, s);
  }
  const map = new Map<number, string>();
  for (const [id, s] of setDe) map.set(id, [...s].join(", "));
  return map;
}

export async function queryEntregasParciais(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosEntregasParciais = {},
): Promise<EntregasParciaisData> {
  // Demanda a entregar segue a pílula de período, nunca o corte de leitura (D8/RF-A5).
  // `ignorarCorteDados` ficou obsoleto: a demanda já abre pela pílula (piso 2000). Sem período,
  // é "Tudo" (do primeiro pedido ao futuro). As outras métricas seguem o corte, esta não.
  const janela = janelaDemandaAberta(filtros.periodoDe, filtros.periodoAte);

  const pedidos = await prisma.fatoPedido.findMany({
    where: {
      bucketDemanda: "ABERTA",
      ...buildEmpresaWhere(filtros.empresaId),
      dataOrcamento: { gte: janela.gte, lt: janela.lt },
    },
    select: {
      odooId: true,
      numero: true,
      numeroMercos: true,
      participanteId: true,
      participanteNome: true,
      operacaoNome: true,
      modalidadeFrete: true,
      etapaId: true,
      etapaNome: true,
      vrProdutos: true,
      // Fase 3: datas, emitente e vendedor já materializados no fato (sem migration).
      dataOrcamento: true,
      dataPrevista: true,
      dataValidade: true,
      empresaNome: true,
      vendedorNome: true,
    },
  });

  const ids = pedidos.map((p) => p.odooId);
  const participanteIds = [
    ...new Set(pedidos.map((p) => p.participanteId).filter((x): x is number => x != null)),
  ];

  const [itens, produtos, status, parceiros, bloqueados, formaDe, obsRaw] = await Promise.all([
    prisma.fatoPedidoItem.findMany({
      where: { pedidoId: { in: ids } },
      select: {
        odooId: true,
        pedidoId: true,
        produtoId: true,
        produtoNome: true,
        familiaNome: true,
        marcaNome: true,
        quantidade: true,
        quantidadeAAtender: true,
        quantidadeAtendida: true,
        vrProdutos: true,
      },
    }),
    prisma.fatoProduto.findMany({ select: { odooId: true, precoCusto: true, codigo: true } }),
    atendimentoSincronizado(prisma),
    prisma.fatoParceiro.findMany({
      where: { odooId: { in: participanteIds } },
      select: { odooId: true, uf: true, cidade: true, documento: true, cep: true },
    }),
    statusBloqueioPorCliente(prisma, participanteIds, hoje),
    formaPagamentoPorPedido(prisma, ids),
    // Fase 3: observações do pedido em um único lote no raw (padrão da cor da etapa;
    // sem migration, sem rebuild). Só registros vivos. Guarda: sem ids, não dispara.
    ids.length
      ? prisma.rawPedidoDocumento.findMany({
          where: { odooId: { in: ids }, rawDeleted: false },
          select: { odooId: true, data: true },
        })
      : Promise.resolve([] as { odooId: number; data: unknown }[]),
  ]);

  const custoMap = new Map(produtos.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]));
  const custoDe = (id: number): number | undefined => custoMap.get(id);
  const codigoProdutoDe = new Map(produtos.map((p) => [p.odooId, p.codigo ?? null]));
  const ufDe = new Map(parceiros.map((p) => [p.odooId, siglaDeUf(p.uf) ?? "??"]));
  const cidadeDe = new Map(parceiros.map((p) => [p.odooId, p.cidade]));
  const cnpjDe = new Map(parceiros.map((p) => [p.odooId, p.documento ?? null]));
  const cepDe = new Map(parceiros.map((p) => [p.odooId, p.cep ?? null]));
  const obsDe = new Map(obsRaw.map((r) => [r.odooId, extrairObsPedido(r.data)]));
  // Forma de pagamento fiel: cabeçalho do pedido (cobre 100%); parcela é fallback.
  const formaCabecalhoDe = new Map(obsRaw.map((r) => [r.odooId, extrairFormaPagamento(r.data)]));
  // Condição de pagamento fiel: cabeçalho do pedido (mesmo jsonb já carregado).
  const condicaoDe = new Map(obsRaw.map((r) => [r.odooId, extrairCondicaoPagamento(r.data)]));
  // Desconto do pedido (vr_desconto / al_desconto), do cabeçalho.
  const descontoDe = new Map(obsRaw.map((r) => [r.odooId, extrairDesconto(r.data)]));
  const descontoZero = extrairDesconto(null);
  // Rentabilidade do pedido (comissão / subtotal / margem / impostos), do cabeçalho.
  const rentabDe = new Map(obsRaw.map((r) => [r.odooId, extrairRentabilidade(r.data)]));
  const rentabZero = extrairRentabilidade(null);

  // Rentabilidade POR ITEM: um único lote em `raw_sped_documento_item` pelos odooId dos
  // itens (FatoPedidoItem.odooId = raw_sped_documento_item.odoo_id, join 1:1 provado no
  // cache). Mesmo padrão jsonb do cabeçalho, sem migration e sem rebuild do worker. Só
  // registros vivos (rawDeleted: false, A5).
  const itemOdooIds = itens.map((it) => it.odooId);
  const itemRaw = itemOdooIds.length
    ? await prisma.rawSpedDocumentoItem.findMany({
        where: { odooId: { in: itemOdooIds }, rawDeleted: false },
        select: { odooId: true, data: true },
      })
    : [];
  const rentabItemDe = new Map(itemRaw.map((r) => [r.odooId, extrairRentabilidadeItem(r.data)]));
  const rentabItemZero = extrairRentabilidadeItem(null);

  const escopo = filtros.ufs && filtros.ufs.length ? new Set(filtros.ufs) : null;
  const ufDoPedido = (participanteId: number | null): string =>
    participanteId != null ? ufDe.get(participanteId) ?? "??" : "??";

  // Pedidos dentro do escopo de UF (mesmo recorte do card: sigla via siglaDeUf, "??" fora).
  const pedidosEscopo = pedidos.filter(
    (p) => !escopo || escopo.has(ufDoPedido(p.participanteId)),
  );
  const idsEscopo = new Set(pedidosEscopo.map((p) => p.odooId));
  const pedidoDe = new Map(pedidosEscopo.map((p) => [p.odooId, p]));

  // Cor da etapa: um único lote em `raw_pedido_etapa` pelos etapa_id em uso (sem N+1,
  // sem migration, sem rebuild do worker). Só registros vivos (rawDeleted: false, A5).
  const etapaIds = [
    ...new Set(pedidosEscopo.map((p) => p.etapaId).filter((x): x is number => x != null)),
  ];
  const etapasRaw = etapaIds.length
    ? await prisma.rawPedidoEtapa.findMany({
        where: { odooId: { in: etapaIds }, rawDeleted: false },
        select: { odooId: true, data: true },
      })
    : [];
  const corDe = mapaCorEtapa(etapasRaw);

  let totalPedido = 0;
  for (const p of pedidosEscopo) totalPedido += Number(p.vrProdutos ?? 0);

  let aAtenderVenda = 0;
  let aAtenderCusto = 0;
  const linhas: LinhaEntregaParcial[] = [];

  for (const it of itens) {
    if (!idsEscopo.has(it.pedidoId)) continue;
    const p = pedidoDe.get(it.pedidoId);
    if (!p) continue;

    const linha = aAtenderDoItem(it, custoDe, status.ok);
    // KPIs a-atender somam TODOS os itens do escopo (inclusive os já entregues, que valem 0),
    // garantindo a igualdade com o card. A TABELA só mostra o que de fato falta entregar.
    aAtenderVenda += linha.vendaLinha;
    aAtenderCusto += linha.custoLinha;
    if (linha.aAtender <= 0) continue;

    const valorCheio = Number(it.vrProdutos ?? 0);
    const obsPedido = obsDe.get(it.pedidoId) ?? { obs: null, obsEntrega: null };
    // Quantidades diretas do fato = as 3 colunas do Odoo (Quantidade/Atendido/A atender).
    const quantidadeTotalItem = Number(it.quantidade ?? 0);
    const qtdAtendidaItem = Number(it.quantidadeAtendida ?? 0);
    const custoUnitario = it.produtoId != null ? (custoDe(it.produtoId) ?? 0) : 0;

    linhas.push({
      pedidoId: it.pedidoId,
      numero: p.numero,
      numeroMercos: p.numeroMercos ?? null,
      uf: ufDoPedido(p.participanteId),
      cidade: p.participanteId != null ? cidadeDe.get(p.participanteId) ?? null : null,
      cliente: p.participanteNome,
      produto: it.produtoNome,
      familia: it.familiaNome,
      marca: it.marcaNome,
      operacao: p.operacaoNome,
      modalidade: rotuloModalidadeFrete(p.modalidadeFrete),
      // Preserva o null quando não há etapa (a UI cai no DASH); só formata quando há nome.
      etapa: p.etapaNome ? formatarNomeEtapa(p.etapaNome) : null,
      etapaCor: p.etapaId != null ? corDe.get(p.etapaId) ?? null : null,
      qtdAAtender: linha.aAtender,
      quantidadeTotal: quantidadeTotalItem,
      quantidadeAtendida: qtdAtendidaItem,
      valorVendaAAtender: linha.vendaLinha,
      valorCustoAAtender: linha.custoLinha,
      valorCustoTotal: quantidadeTotalItem * custoUnitario,
      ...(rentabItemDe.get(it.odooId) ?? rentabItemZero),
      ...(rentabDe.get(it.pedidoId) ?? rentabZero),
      ...(descontoDe.get(it.pedidoId) ?? descontoZero),
      statusFinanceiro:
        p.participanteId != null && bloqueados.has(p.participanteId)
          ? "bloqueado"
          : "liberado",
      formaPagamento: formaCabecalhoDe.get(it.pedidoId) ?? formaDe.get(it.pedidoId) ?? null,
      condicaoPagamento: condicaoDe.get(it.pedidoId) ?? null,
      // --- Fase 3 ---
      orcamento: isoData(p.dataOrcamento),
      prevista: isoData(p.dataPrevista),
      validade: isoData(p.dataValidade),
      emitente: p.empresaNome ?? null,
      vendedor: p.vendedorNome ?? null,
      cnpj: p.participanteId != null ? cnpjDe.get(p.participanteId) ?? null : null,
      cep: p.participanteId != null ? cepDe.get(p.participanteId) ?? null : null,
      codigoProduto: it.produtoId != null ? codigoProdutoDe.get(it.produtoId) ?? null : null,
      unitario: precoUnitarioItem(valorCheio, Number(it.quantidade ?? 0)),
      valorCheio,
      observacoes: obsPedido.obs,
      obsEntrega: obsPedido.obsEntrega,
    });
  }

  linhas.sort((a, b) => b.valorCustoAAtender - a.valorCustoAAtender);

  return {
    indicadores: {
      qtdPedidos: pedidosEscopo.length,
      totalPedido,
      aAtenderVenda,
      aAtenderCusto,
    },
    linhas,
    atendimentoSincronizado: status.ok,
  };
}
