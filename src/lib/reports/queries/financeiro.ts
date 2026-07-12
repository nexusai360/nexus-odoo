import { corteAtualDate, janelaClampada } from "@/lib/corte-dados";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "@/lib/fiscal/grupo";
// src/lib/reports/queries/financeiro.ts
//
// Núcleo de agregação de financeiro, framework-neutro. Cada função recebe `prisma`
// + filtros e devolve dado de agregação cru , **sem `estado`, sem `freshness`,
// sem shaping de serialização**. **Não captura exceção** (deixa propagar , quem
// trata é o wrapper/handler). `estadoDoFato`/`withFreshness` vivem no handler
// MCP, não aqui.
//
// Campos monetários são `Decimal` no Prisma , converter via `Number()` no shaping.
// `diasAtraso` é calculado NA QUERY (não materializado) , usa `mcp/lib/dias-atraso.ts`.
// Funções implementadas nas tasks 4d.1-q … 4d.7-q (sequenciais , mesmo arquivo).

import type { PrismaClient } from "@/generated/prisma/client";
import { diasAtraso as calcDiasAtraso } from "../../../../mcp/lib/dias-atraso";

// ---------------------------------------------------------------------------
// querySaldoContas , fato_financeiro_saldo (task 4d.1-q)
// ---------------------------------------------------------------------------

/**
 * Saldo das contas bancarias. Corte NAO se aplica: fato_financeiro_saldo e FOTO do saldo
 * de hoje (sem eixo de tempo), como o saldo de estoque.
 */
export async function querySaldoContas(
  prisma: PrismaClient,
): Promise<{ contas: { bancoNome: string | null; tipo: string | null; saldo: number }[]; saldoTotal: number }> {
  const rows = await prisma.fatoFinanceiroSaldo.findMany({
    select: { bancoNome: true, tipo: true, saldo: true },
    // Contrato de lista (Fase B): maiores saldos primeiro, desempate por nome.
    orderBy: [{ saldo: "desc" }, { bancoNome: "asc" }],
  });
  const contas = rows.map((r) => ({
    bancoNome: r.bancoNome,
    tipo: r.tipo,
    saldo: Number(r.saldo),
  }));
  const saldoTotal = contas.reduce((acc, c) => acc + c.saldo, 0);
  return { contas, saldoTotal };
}

// ---------------------------------------------------------------------------
// queryCaixaPeriodo , fato_financeiro_movimento (task 4d.2-q)
// ---------------------------------------------------------------------------

/**
 * Entradas/saidas de caixa no periodo. Movimento financeiro e HISTORICO: a janela e sempre
 * grampeada a data de inicio das analises e, sem periodo, o piso e o proprio corte (antes,
 * um where vazio somava todo o cache). A borda superior e exclusiva (o dia "ate" inteiro).
 */
export async function queryCaixaPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ entrada: number; saida: number; saldo: number }> {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);

  const rows = await prisma.fatoFinanceiroMovimento.findMany({
    where: { data: { gte: j.gte, lt: j.lt } },
    select: { entrada: true, saida: true },
  });

  let entrada = 0;
  let saida = 0;
  for (const r of rows) {
    entrada += Number(r.entrada);
    saida += Number(r.saida);
  }
  const saldo = entrada - saida;
  return { entrada, saida, saldo };
}

// ---------------------------------------------------------------------------
// queryFluxoCaixa , fato_financeiro_movimento (task 4d.3-q)
// ---------------------------------------------------------------------------

/**
 * Serie mensal de realizado x previsto. Mesma regra do caixa: HISTORICO, janela grampeada
 * ao corte, piso obrigatorio quando nao vem periodo , senao a serie do grafico nascia em
 * meses anteriores a data configurada na tela.
 */
export async function queryFluxoCaixa(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ serie: { periodo: string; realizado: number; previsto: number }[] }> {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);

  const rows = await prisma.fatoFinanceiroMovimento.findMany({
    where: { data: { gte: j.gte, lt: j.lt } },
    select: { data: true, valor: true, valorPrevisto: true },
  });

  const mapa = new Map<string, { realizado: number; previsto: number }>();
  for (const r of rows) {
    if (!r.data) continue; // linha sem data , ignorar na série
    const periodo = r.data.toISOString().slice(0, 7); // YYYY-MM
    const existing = mapa.get(periodo) ?? { realizado: 0, previsto: 0 };
    existing.realizado += Number(r.valor);
    existing.previsto += Number(r.valorPrevisto);
    mapa.set(periodo, existing);
  }

  const serie = [...mapa.entries()]
    .map(([periodo, v]) => ({ periodo, realizado: v.realizado, previsto: v.previsto }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  return { serie };
}

// ---------------------------------------------------------------------------
// Tipo compartilhado de título (a receber / a pagar)
//
// vrSaldo é o valor correto de um título da carteira (finan.lancamento):
//   - em aberto: vrSaldo == vrDocumento == vrTotal (quanto falta receber/pagar)
//   - quitado:   vrSaldo = 0
// Usado nos totais totalAReceber/totalAPagar/totalVencido.
// vrTotal mantido no row para uso granular por título.
// ---------------------------------------------------------------------------

export interface TituloRow {
  participanteNome: string | null;
  numeroDocumento: string | null;
  dataVencimento: Date | null;
  vrSaldo: number;
  vrTotal: number;
  diasAtraso: number;
  /** Situação simplificada da fonte: "aberto" (efetivo/confirmado) ou
   *  "provisorio" (lançado mas não efetivado). Usado para a quebra honesta
   *  do total em aberto (confirmado vs provisório). */
  situacaoSimples: string | null;
}

/** Quebra do total em aberto por situação da fonte. "em aberto" = vrSaldo > 0
 *  (exclui quitado/baixado, que têm saldo 0). `confirmado` = situação 'aberto'
 *  (efetivo); `provisorio` = situação 'provisorio' (lançado, não efetivado). */
export interface QuebraSituacao {
  confirmado: number;
  provisorio: number;
}

/** Soma a quebra confirmado/provisório a partir das linhas em aberto. */
function quebraPorSituacao(
  rows: { situacaoSimples: string | null; vrSaldo: number }[],
): QuebraSituacao {
  let confirmado = 0;
  let provisorio = 0;
  for (const r of rows) {
    if (r.situacaoSimples === "provisorio") provisorio += r.vrSaldo;
    else confirmado += r.vrSaldo;
  }
  return { confirmado, provisorio };
}

// ---------------------------------------------------------------------------
// queryContasAReceber , fato_financeiro_titulo (task 4d.5-q)
// CRITERIO_ABERTO: { vrSaldo > 0 } , inclui efetivo (confirmado) E provisorio
//   (lançado, não efetivado). Exclui quitado/baixado (saldo 0). Decisão
//   2026-06-11: o critério antigo (situacaoSimples='aberto') escondia o
//   provisório; alinhado a financeiro_liquidez e à dívida real. A quebra
//   (confirmado/provisório) é devolvida para transparência.
// totalAReceber usa vrSaldo (= valor correto a receber em aberto na nova fonte).
//
// RECEBIVEL x CARTEIRA (pericia de 2026-07-12): o Odoo da Tauga gera o financeiro de dois
// jeitos, por pedido ("financeiro pelo pedido") ou por nota (duplicata), e o KPI somava os
// dois indiscriminadamente. Resultado: R$ 49,2 mi, dos quais R$ 30,9 mi eram PEDIDOS SEM
// NENHUMA NOTA EMITIDA , receita contratada, parada em etapas pre-faturamento (gera boleto,
// fracionar, input financeiro). Isso e CARTEIRA, nao dinheiro a receber.
// Agora:
//   - `totalAReceber` = so o que ja foi faturado (duplicata de NF, ou titulo de pedido que ja
//     tem NF de venda autorizada), sem dupla contagem quando o pedido tem os dois;
//   - `carteiraAFaturar` = o backlog, devolvido a parte para a tela mostrar como outra coisa.
// ---------------------------------------------------------------------------

export async function queryContasAReceber(
  prisma: PrismaClient,
  filtros: { participanteId?: number },
  hoje: Date,
): Promise<{
  titulos: TituloRow[];
  totalAReceber: number;
  quebra: QuebraSituacao;
  /** Pedidos sem NF: receita contratada, ainda NAO faturada. Nao e conta a receber. */
  carteiraAFaturar: number;
  titulosCarteira: TituloRow[];
}> {
  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      tipo: "a_receber",
      vrSaldo: { gt: 0 },
      // Marco zero: titulo de documento anterior ao corte nao e da operacao atual. Sem isso
      // o KPI somava divida antiga do Odoo (dezenas de milhoes que nao existem hoje).
      dataDocumento: { gte: corteAtualDate() },
      ...(filtros.participanteId ? { participanteId: filtros.participanteId } : {}),
    },
    select: {
      participanteId: true,
      participanteNome: true,
      numeroDocumento: true,
      dataVencimento: true,
      vrSaldo: true,
      vrTotal: true,
      situacaoSimples: true,
      pedidoId: true,
      notaFiscalId: true,
      pedidoFaturado: true,
    },
    // Contrato de lista (Fase B): ordenacao deterministica, maiores primeiro.
    orderBy: [{ vrSaldo: "desc" }, { odooId: "asc" }],
  });

  // Conta entre empresas do PROPRIO grupo nao e dinheiro a receber de cliente , e a mesma
  // regra do faturamento (nao contar duas vezes o que circula dentro de casa). Sao R$ 15,1
  // mi em 192 titulos no cache: inflavam o KPI da diretoria.
  const externos = await filtrarTitulosExternos(prisma, rows);

  // Pedido que JA tem duplicata de NF aberta: o titulo do proprio pedido foi substituido por
  // ela e nao pode somar de novo (dupla contagem , R$ 547 mil no cache em 2026-07-12).
  const pedidosComDuplicata = new Set<number>();
  for (const r of externos) {
    if (r.notaFiscalId != null && r.pedidoId != null) pedidosComDuplicata.add(r.pedidoId);
  }

  const paraLinha = (r: (typeof externos)[number]): TituloRow => ({
    participanteNome: r.participanteNome,
    numeroDocumento: r.numeroDocumento,
    dataVencimento: r.dataVencimento,
    vrSaldo: Number(r.vrSaldo),
    vrTotal: Number(r.vrTotal),
    diasAtraso: calcDiasAtraso(r.dataVencimento, hoje),
    situacaoSimples: r.situacaoSimples,
  });

  const titulos: TituloRow[] = [];
  const titulosCarteira: TituloRow[] = [];
  for (const r of externos) {
    const duplicataDeNota = r.notaFiscalId != null;
    const doPedido = !duplicataDeNota;
    // Recebivel de verdade: a duplicata da NF, ou o titulo de um pedido JA faturado (o Odoo
    // da Tauga tambem opera no modo "financeiro pelo pedido", em que a duplicata nao nasce).
    const jaFaturado = duplicataDeNota || r.pedidoFaturado;
    // ...menos o caso em que o pedido tem os DOIS: a duplicata manda, o titulo do pedido sai.
    const substituidoPelaDuplicata =
      doPedido && r.pedidoId != null && pedidosComDuplicata.has(r.pedidoId);

    if (jaFaturado && !substituidoPelaDuplicata) titulos.push(paraLinha(r));
    else if (!jaFaturado) titulosCarteira.push(paraLinha(r));
  }

  const totalAReceber = titulos.reduce((acc, t) => acc + t.vrSaldo, 0);
  const carteiraAFaturar = titulosCarteira.reduce((acc, t) => acc + t.vrSaldo, 0);
  return {
    titulos,
    totalAReceber,
    quebra: quebraPorSituacao(titulos),
    carteiraAFaturar,
    titulosCarteira,
  };
}

// ---------------------------------------------------------------------------
// queryContasAPagar , fato_financeiro_titulo (task 4d.6-q)
// CRITERIO_ABERTO: { vrSaldo > 0 } , inclui efetivo (confirmado) E provisorio.
//   No a_pagar o provisório é a MAIORIA da dívida (compras da Johnson etc.,
//   vencidas), então o critério antigo (situacaoSimples='aberto') subreportava
//   ~94%. Decisão 2026-06-11: contar tudo em aberto, com quebra honesta.
// tipo "a_pagar" , campo direto da fonte finan.lancamento (bug R1 corrigido 2026-05-18).
// totalAPagar usa vrSaldo (= valor correto a pagar em aberto na nova fonte).
// ---------------------------------------------------------------------------

export async function queryContasAPagar(
  prisma: PrismaClient,
  filtros: { participanteId?: number },
  hoje: Date,
): Promise<{ titulos: TituloRow[]; totalAPagar: number; quebra: QuebraSituacao }> {
  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      tipo: "a_pagar",
      vrSaldo: { gt: 0 },
      // Idem a receber: so divida cujo documento e do periodo coberto pela plataforma.
      dataDocumento: { gte: corteAtualDate() },
      ...(filtros.participanteId ? { participanteId: filtros.participanteId } : {}),
    },
    select: {
      participanteId: true,
      participanteNome: true,
      numeroDocumento: true,
      dataVencimento: true,
      vrSaldo: true,
      vrTotal: true,
      situacaoSimples: true,
    },
    // Contrato de lista (Fase B): ordenacao deterministica, maiores primeiro.
    orderBy: [{ vrSaldo: "desc" }, { odooId: "asc" }],
  });

  // Idem: divida com empresa do proprio grupo nao e divida com fornecedor.
  const externos = await filtrarTitulosExternos(prisma, rows);

  const titulos: TituloRow[] = externos.map((r) => ({
    participanteNome: r.participanteNome,
    numeroDocumento: r.numeroDocumento,
    dataVencimento: r.dataVencimento,
    vrSaldo: Number(r.vrSaldo),
    vrTotal: Number(r.vrTotal),
    diasAtraso: calcDiasAtraso(r.dataVencimento, hoje),
    situacaoSimples: r.situacaoSimples,
  }));

  const totalAPagar = titulos.reduce((acc, t) => acc + t.vrSaldo, 0);
  return { titulos, totalAPagar, quebra: quebraPorSituacao(titulos) };
}

// ---------------------------------------------------------------------------
// TituloVencidoRow , inclui tipo (task 4d.7-q)
//
// vrSaldo é o valor correto a receber/pagar para título em aberto (finan.lancamento).
// totalVencido usa vrSaldo.
// ---------------------------------------------------------------------------

export interface TituloVencidoRow {
  tipo: string;
  participanteNome: string | null;
  numeroDocumento: string | null;
  dataVencimento: Date | null;
  vrSaldo: number;
  vrTotal: number;
  diasAtraso: number;
  situacaoSimples: string | null;
}

// ---------------------------------------------------------------------------
// queryTitulosVencidos , fato_financeiro_titulo (task 4d.7-q)
// CRITERIO_ABERTO: { vrSaldo > 0 } , inclui efetivo E provisorio (a maior parte
//   dos vencidos a_pagar é provisória). Decisão 2026-06-11, alinhado às contas.
// Fonte corrigida para finan.lancamento (bug R1 , 2026-05-18).
// Só títulos em aberto E com dataVencimento < início do dia de hoje estão vencidos.
// totalVencido usa vrSaldo (= valor correto a receber/pagar na nova fonte).
//
// Alinhado a queryContasAReceber/queryContasAPagar (mesma tabela, mesma regra):
//   - piso `dataDocumento >= corte` (data de inicio das analises). Sem ele, a divida velha
//     do Odoo que ja tinha sido tirada dos KPIs voltava pelo relatorio/tool de vencidos
//     (titulo de 2019 com saldo residual aparecia "vencido ha 2000 dias");
//   - eliminacao intragrupo (filtrarTitulosExternos): conta entre empresas da casa nao e
//     divida vencida com terceiro.
// ---------------------------------------------------------------------------

export async function queryTitulosVencidos(
  prisma: PrismaClient,
  hoje: Date,
): Promise<{ titulos: TituloVencidoRow[]; totalVencido: number; quebra: QuebraSituacao }> {
  // Normaliza para início do dia local , reutiliza o mesmo padrão de
  // dias-atraso.ts , para que um título que vence HOJE (gravado como
  // T00:00:00) não seja incluído como vencido. Só está vencido quem venceu
  // ANTES de hoje, i.e. diasAtraso > 0.
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      vrSaldo: { gt: 0 },
      dataVencimento: { lt: inicioDoDia },
      // Marco zero: so titulo cujo DOCUMENTO e do periodo coberto pela plataforma.
      dataDocumento: { gte: corteAtualDate() },
    },
    select: {
      tipo: true,
      participanteId: true,
      participanteNome: true,
      numeroDocumento: true,
      dataVencimento: true,
      vrSaldo: true,
      vrTotal: true,
      situacaoSimples: true,
    },
    // Contrato de lista (Fase B): ordenação determinística por valor desc com
    // desempate por id. Sem isso a ordem era a do PK e o agente rotulava as
    // primeiras N linhas de "maiores" (caso forense #1 do laudo 2026-06-11).
    orderBy: [{ vrSaldo: "desc" }, { odooId: "asc" }],
  });

  // Idem contas a receber/pagar: titulo com empresa do proprio grupo nao entra.
  const externos = await filtrarTitulosExternos(prisma, rows);

  const titulos: TituloVencidoRow[] = externos.map((r) => ({
    tipo: r.tipo,
    participanteNome: r.participanteNome,
    numeroDocumento: r.numeroDocumento,
    dataVencimento: r.dataVencimento,
    vrSaldo: Number(r.vrSaldo),
    vrTotal: Number(r.vrTotal),
    diasAtraso: calcDiasAtraso(r.dataVencimento, hoje),
    situacaoSimples: r.situacaoSimples,
  }));

  const totalVencido = titulos.reduce((acc, t) => acc + t.vrSaldo, 0);
  return { titulos, totalVencido, quebra: quebraPorSituacao(titulos) };
}


/**
 * Descarta os titulos cujo participante e do PROPRIO grupo (conta entre empresas da casa).
 * Mesma regra do faturamento: o que circula dentro do grupo nao e receita nem divida com
 * terceiro. Reusa a cascata de deteccao (whitelist -> cadastro -> CNPJ no nome).
 */
async function filtrarTitulosExternos<
  T extends { participanteId: number | null; participanteNome: string | null },
>(prisma: PrismaClient, titulos: T[]): Promise<T[]> {
  const participantesGrupo = await carregarParticipantesGrupo(prisma);
  return titulos.filter((t) => !ehNotaIntragrupo(t, participantesGrupo));
}
