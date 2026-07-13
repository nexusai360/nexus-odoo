// src/lib/reports/queries/comercial.ts
//
// Núcleo de agregação de comercial, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua , sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.

import type { PrismaClient } from "@/generated/prisma/client";
import { diasAtraso } from "../../../../mcp/lib/dias-atraso";
import { VENDA_FUTURA } from "@/lib/fiscal/regras/venda-futura-policy";
import { corteAtualDate, janelaClampada } from "@/lib/corte-dados";
import { atendimentoSincronizado } from "@/lib/diretoria/atendimento-status";
import {
  whereLocalDoEscopo,
  type EscopoLocal,
} from "@/lib/estoque/locais-por-classificacao";

// ---------------------------------------------------------------------------
// Demanda = o que FALTA ENTREGAR, nao o pedido inteiro
//
// O `vr_produtos` do cabecalho e o pedido inteiro: um pedido com 10 itens, 6 ja
// entregues, continuava valendo os 10 (48% da demanda ja tinha sido entregue e seguia
// sendo somada). O quanto falta vem de um campo computado do Odoo, trazido por um job
// diario, e a regra e uma so, igual a da diretoria (src/lib/diretoria/atendimento-status):
//
//   - job JA rodou     -> TODAS as linhas usam a quantidade a atender;
//   - job NUNCA rodou  -> TODAS caem na quantidade cheia, e a resposta avisa.
//
// Misturar as duas bases no mesmo total produziria um numero que nao e nem a demanda
// cheia nem a real, e ninguem saberia explicar de onde ele veio.
//
// Nas consultas em SQL abaixo, a quantidade da linha e sempre
// `GREATEST(0, CASE WHEN <usar> THEN COALESCE(quantidade_a_atender, 0) ELSE quantidade END)`.
// O piso em zero existe porque "a atender" vem NEGATIVO quando entregaram mais do que
// foi pedido: sem ele, essa linha abateria a demanda das outras.
// ---------------------------------------------------------------------------


// Pedidos COMERCIAIS = só operação de VENDA (categoria_operacao='venda',
// materializada). Exclui transferência intragrupo, remessa, bonificação e entrada
// anômala, que não são pedidos de venda e inflavam as contagens (~2x: 654 vs 395
// "abertos"). Mesma verdade da demanda/faturamento. Ver perícia 08.
const SO_PEDIDO_VENDA = { categoriaOperacao: "venda" as const };

// Pedido é DOCUMENTO COM DATA: toda leitura respeita a data de início das análises
// (AppSetting sync.corte_dados). A data do documento é data_orcamento , é ela que
// define se o pedido entra na janela analisada, e não o vencimento das parcelas nem
// a entrada em etapa. Sem período informado, o piso é o corte (uma consulta "sem
// filtro" nunca varre o histórico inteiro). Nada é apagado: mover a data para trás
// faz o histórico voltar na hora.

/**
 * Ids dos pedidos dentro da janela de análise (data do documento >= corte). Serve de
 * piso para as tabelas-filhas que NÃO têm a data do documento (fato_pedido_parcela,
 * fato_comissao): o vencimento da parcela não é a data do pedido, então o recorte
 * precisa vir do pai. O conjunto pós-corte é o lado pequeno da relação.
 */
export async function idsPedidosNoCorte(prisma: PrismaClient): Promise<number[]> {
  const rows = await prisma.fatoPedido.findMany({
    where: { dataOrcamento: { gte: corteAtualDate() } },
    select: { odooId: true },
  });
  return rows.map((r) => r.odooId);
}

export async function queryPedidosPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalPedidos: number; valorTotal: number }> {
  // janelaClampada: grampeia o início no corte e, sem período, usa o corte como piso.
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  const where = {
    ...SO_PEDIDO_VENDA,
    dataOrcamento: { gte: j.gte, lt: j.lt },
  };
  // Usa vrProdutos (valor do pedido independente de faturamento) , consistente
  // com queryPedidosPorEtapa e queryPedidosPorVendedor. vrNf ≈ 0 para pedidos
  // pré-faturamento, o que subnotificaria o valor total do período.
  const rows = await prisma.fatoPedido.findMany({ where, select: { vrProdutos: true } });
  const valorTotal = rows.reduce((acc, r) => acc + Number(r.vrProdutos), 0);
  return { totalPedidos: rows.length, valorTotal };
}

/** Conta o total de pedidos cadastrados (fato_pedido). Devolve só o número,
 * sem amostra de linhas, para perguntas de contagem-total ("quantos pedidos").
 * Conta apenas o que está dentro da janela de análise (piso no corte). */
export async function queryContarPedidos(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string } = {},
): Promise<{ total: number }> {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  const total = await prisma.fatoPedido.count({
    where: { ...SO_PEDIDO_VENDA, dataOrcamento: { gte: j.gte, lt: j.lt } },
  });
  return { total };
}

export async function queryPedidosPorEtapa(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string } = {},
): Promise<{ linhas: { etapaNome: string | null; etapaFinaliza: boolean; quantidade: number; valorTotal: number }[] }> {
  // Usa vrProdutos (valor do pedido independente de faturamento) em vez de vrNf.
  // vrNf é 0 para pedidos ainda não faturados (etapas pré-conclusão), o que
  // subnotificaria todo o pipeline em aberto , distorcendo a pergunta-alvo
  // "qual o volume por etapa". vrProdutos reflete o valor comprometido em
  // qualquer etapa. A mesma decisão se aplica a queryPedidosPorVendedor.
  // O funil é um agregado sobre DOCUMENTOS: piso no corte (pedido de 2024 parado numa
  // etapa não pode inflar o volume da etapa).
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  const rows = await prisma.fatoPedido.findMany({
    where: { ...SO_PEDIDO_VENDA, dataOrcamento: { gte: j.gte, lt: j.lt } },
    select: { etapaNome: true, etapaFinaliza: true, vrProdutos: true },
  });
  // Agrupa em memória por etapaNome (não groupBy , precisa carregar etapaFinaliza)
  const map = new Map<string | null, { etapaFinaliza: boolean; quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.etapaNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrProdutos);
    } else {
      map.set(key, { etapaFinaliza: r.etapaFinaliza, quantidade: 1, valorTotal: Number(r.vrProdutos) });
    }
  }
  const linhas = [...map.entries()].map(([etapaNome, v]) => ({ etapaNome, ...v }));
  return { linhas };
}

export type OrdenacaoDemanda = "tempo_parado" | "valor" | "data_criacao";

/**
 * Demanda em aberta: pedidos com bucket_demanda='ABERTA' (materializado pelo builder
 * de classificacao = venda a cliente externo, aprovado, sem NF ao consumidor final).
 * Retorna total (pedidos e R$), quebra por etapa, e a lista das mais paradas.
 * "Tempo parado" = dias desde a entrada na etapa ATUAL (fato_pedido_historico), com
 * fallback data_aprovacao/data_orcamento (153 pedidos sem historico). Volume pequeno
 * (~395), entao busca todas e agrega/ordena em memoria.
 */
export async function queryDemandaEmAberta(
  prisma: PrismaClient,
  filtros: { empresaId?: number; etapa?: string; limite?: number; ordenacao?: OrdenacaoDemanda } = {},
): Promise<{
  totalPedidos: number;
  /** O que falta entregar, a preço de VENDA. */
  valorTotal: number;
  /** O mesmo recorte, a preço de CUSTO (a base do painel da diretoria). */
  valorCusto: number;
  porEtapa: {
    etapaNome: string | null;
    quantidade: number;
    valorTotal: number;
    valorCusto: number;
  }[];
  lista: {
    numero: string | null;
    etapaNome: string | null;
    empresaNome: string | null;
    participanteNome: string | null;
    valorProdutos: number;
    valorCusto: number;
    diasParado: number | null;
  }[];
  ordenadoPor: OrdenacaoDemanda;
  /** Quando o job de atendimento completou pela última vez (null = nunca). */
  atendimentoSincronizadoEm: string | null;
  /** true quando o valor é provisório (caiu na quantidade cheia por falta do job). */
  parcial: boolean;
}> {
  const limite = Math.min(Math.max(filtros.limite ?? 20, 1), 100);
  const ordenacao = filtros.ordenacao ?? "tempo_parado";
  const status = await atendimentoSincronizado(prisma);

  const todas = await prisma.$queryRaw<
    {
      numero: string | null;
      etapa_nome: string | null;
      empresa_id: number | null;
      empresa_nome: string | null;
      participante_nome: string | null;
      valor: number;
      valor_custo: number;
      dias_parado: number | null;
      data_orcamento: Date | null;
    }[]
  >`
    WITH linha AS (
      SELECT it.pedido_id,
             GREATEST(0, CASE WHEN ${status.ok}::boolean
                              THEN COALESCE(it.quantidade_a_atender, 0)
                              ELSE it.quantidade END)::float8 AS qtd,
             -- Preço unitário reconstruído da própria linha; o custo vem de fato_produto
             -- (o custo da linha do pedido vem zerado no Odoo), a MESMA fonte do valor de
             -- estoque, para as duas telas fecharem entre si.
             CASE WHEN it.quantidade > 0
                  THEN (it.vr_produtos / it.quantidade)::float8 ELSE 0 END AS preco_unit,
             COALESCE(p.preco_custo, 0)::float8 AS custo_unit
      FROM fato_pedido_item it
      LEFT JOIN fato_produto p ON p.odoo_id = it.produto_id
    ),
    item AS (
      SELECT pedido_id,
             sum(qtd * preco_unit) AS valor_venda,
             sum(qtd * custo_unit) AS valor_custo
      FROM linha GROUP BY pedido_id
    )
    SELECT f.numero, f.etapa_nome, f.empresa_id, f.empresa_nome, f.participante_nome,
           COALESCE(i.valor_venda, 0)::float8 AS valor,
           COALESCE(i.valor_custo, 0)::float8 AS valor_custo,
           EXTRACT(DAY FROM now() - COALESCE(h.data_entrada, f.data_aprovacao, f.data_orcamento))::int AS dias_parado,
           f.data_orcamento
    FROM fato_pedido f
    LEFT JOIN item i ON i.pedido_id = f.odoo_id
    LEFT JOIN LATERAL (
      SELECT max(data_entrada) AS data_entrada
      FROM fato_pedido_historico h
      WHERE h.pedido_id = f.odoo_id AND h.etapa_id = f.etapa_id
    ) h ON true
    WHERE f.bucket_demanda = 'ABERTA'
      -- Piso da janela de análise: pedido é documento com data. Sem isso, um pedido
      -- pré-corte preso em "ABERTA" entra no total e lidera o ranking de mais parado.
      AND f.data_orcamento >= ${corteAtualDate()}
  `;
  // Filtros em memoria (volume pequeno, ~395), evita SQL condicional. Etapa e
  // substring case-insensitive: e a ponte "demanda na etapa X" -> pedidos (com
  // numero) daquela etapa, para o agente conseguir imergir num pedido especifico.
  const etapaAlvo = filtros.etapa?.trim().toLowerCase();
  const rows = todas.filter(
    (r) =>
      (filtros.empresaId == null || r.empresa_id === filtros.empresaId) &&
      (!etapaAlvo || (r.etapa_nome ?? "").toLowerCase().includes(etapaAlvo)),
  );

  const totalPedidos = rows.length;
  const valorTotal = rows.reduce((s, r) => s + (r.valor ?? 0), 0);
  const valorCusto = rows.reduce((s, r) => s + (r.valor_custo ?? 0), 0);

  const mapEtapa = new Map<
    string | null,
    { quantidade: number; valorTotal: number; valorCusto: number }
  >();
  for (const r of rows) {
    const e = mapEtapa.get(r.etapa_nome) ?? {
      quantidade: 0,
      valorTotal: 0,
      valorCusto: 0,
    };
    e.quantidade += 1;
    e.valorTotal += r.valor ?? 0;
    e.valorCusto += r.valor_custo ?? 0;
    mapEtapa.set(r.etapa_nome, e);
  }
  const porEtapa = [...mapEtapa.entries()]
    .map(([etapaNome, v]) => ({ etapaNome, ...v }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const ordenar = {
    tempo_parado: (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      (b.dias_parado ?? -1) - (a.dias_parado ?? -1),
    valor: (a: (typeof rows)[number], b: (typeof rows)[number]) => b.valor - a.valor,
    data_criacao: (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      (a.data_orcamento?.getTime() ?? Infinity) - (b.data_orcamento?.getTime() ?? Infinity),
  }[ordenacao];

  const lista = [...rows]
    .sort(ordenar)
    .slice(0, limite)
    .map((r) => ({
      numero: r.numero,
      etapaNome: r.etapa_nome,
      empresaNome: r.empresa_nome,
      participanteNome: r.participante_nome,
      valorProdutos: r.valor,
      valorCusto: r.valor_custo,
      diasParado: r.dias_parado,
    }));

  return {
    totalPedidos,
    valorTotal,
    valorCusto,
    porEtapa,
    lista,
    ordenadoPor: ordenacao,
    atendimentoSincronizadoEm: status.em ? status.em.toISOString() : null,
    parcial: !status.ok,
  };
}

/**
 * Situacao (imersao) de um pedido: por onde passou (trilha), em que etapa esta, ha
 * quanto tempo (dias parado na etapa atual) e os dados-chave. Busca por numero
 * (ex.: "PV-2037/26"); aceita match parcial/case-insensitive para tolerar variacoes.
 */
export async function queryPedidoSituacao(
  prisma: PrismaClient,
  filtros: { numero: string },
): Promise<{
  encontrado: boolean;
  /** true quando existe pedido com esse número, mas ele é anterior à data de início
   * das análises , a plataforma não o considera, então não devolvemos o conteúdo. */
  foraDaJanela: boolean;
  pedido: {
    numero: string | null;
    etapaNome: string | null;
    bucketDemanda: string | null;
    categoriaOperacao: string | null;
    operacaoNome: string | null;
    empresaNome: string | null;
    participanteNome: string | null;
    vendedorNome: string | null;
    valorProdutos: number;
    dataAprovacao: string | null;
    dataPrevista: string | null;
    diasParado: number | null;
  } | null;
  trilha: {
    etapaNome: string | null;
    entrouEm: string | null;
    tempoEtapaDias: number | null;
  }[];
  itens: {
    produtoId: number | null;
    produtoNome: string | null;
    quantidade: number;
    valorProdutos: number;
    saldoEstoque: number;
    faltando: number;
    temEstoque: boolean;
  }[];
  /** O que falta para o pedido avançar, derivado dos gatilhos da etapa atual. */
  pendencia: string | null;
}> {
  const alvo = filtros.numero.trim();
  const pedido = await prisma.fatoPedido.findFirst({
    where: { numero: { contains: alvo, mode: "insensitive" } },
    orderBy: { dataOrcamento: "desc" },
  });
  if (!pedido) {
    return { encontrado: false, foraDaJanela: false, pedido: null, trilha: [], itens: [], pendencia: null };
  }
  // Drill nominal, mas continua sendo documento com data: pedido anterior à data de
  // início das análises não é considerado pela plataforma. O orderBy desc já traz o
  // match mais recente, então só caímos aqui quando TODOS os candidatos são pré-corte.
  if (pedido.dataOrcamento && pedido.dataOrcamento < corteAtualDate()) {
    return { encontrado: false, foraDaJanela: true, pedido: null, trilha: [], itens: [], pendencia: null };
  }

  const historico = await prisma.fatoPedidoHistorico.findMany({
    where: { pedidoId: pedido.odooId },
    orderBy: [{ dataEntrada: "asc" }, { odooId: "asc" }],
    select: { etapaId: true, etapaNome: true, dataEntrada: true, tempoEtapaDias: true },
  });

  // Dias parado = desde a ULTIMA entrada na etapa ATUAL (fallback aprovacao/orcamento).
  const entradasEtapaAtual = historico
    .filter((h) => h.etapaId === pedido.etapaId && h.dataEntrada)
    .map((h) => h.dataEntrada!.getTime());
  const refMs = entradasEtapaAtual.length
    ? Math.max(...entradasEtapaAtual)
    : (pedido.dataAprovacao ?? pedido.dataOrcamento)?.getTime() ?? null;
  const diasParado =
    refMs != null ? Math.floor((Date.now() - refMs) / 86_400_000) : null;

  // "O que falta para avancar": lido da coluna materializada fato_pedido.pendencia_etapa
  // (o builder de classificacao deriva dos gatilhos da etapa; o MCP le so fato_*).
  const pendencia = pedido.pendenciaEtapa ?? null;

  // Imersao: os PRODUTOS do pedido + o saldo fisico de cada um (fato_estoque_saldo).
  // faltando>0 = precisa comprar/repor para conseguir avancar. E o dado que o
  // usuario pede ("o que tem no pedido, o que falta em estoque para avancar").
  const itensRaw = await prisma.$queryRaw<
    {
      produto_id: number | null;
      produto_nome: string | null;
      quantidade: number;
      valor: number;
      saldo: number;
    }[]
  >`
    WITH itens AS (
      SELECT produto_id, max(produto_nome) AS produto_nome,
             sum(quantidade)::float8 AS quantidade, sum(vr_produtos)::float8 AS valor
      FROM fato_pedido_item WHERE pedido_id = ${pedido.odooId} GROUP BY produto_id
    ),
    saldo AS (
      SELECT produto_id, sum(quantidade)::float8 AS q FROM fato_estoque_saldo GROUP BY produto_id
    )
    SELECT i.produto_id, i.produto_nome, i.quantidade, i.valor, COALESCE(s.q, 0) AS saldo
    FROM itens i LEFT JOIN saldo s ON s.produto_id = i.produto_id
    ORDER BY i.valor DESC
  `;
  const itens = itensRaw.map((r) => {
    const quantidade = r.quantidade ?? 0;
    const saldoEstoque = r.saldo ?? 0;
    const faltando = Math.max(quantidade - saldoEstoque, 0);
    return {
      produtoId: r.produto_id,
      produtoNome: r.produto_nome,
      quantidade,
      valorProdutos: r.valor ?? 0,
      saldoEstoque,
      faltando,
      temEstoque: saldoEstoque >= quantidade,
    };
  });

  return {
    encontrado: true,
    foraDaJanela: false,
    pedido: {
      numero: pedido.numero,
      etapaNome: pedido.etapaNome,
      bucketDemanda: pedido.bucketDemanda,
      categoriaOperacao: pedido.categoriaOperacao,
      operacaoNome: pedido.operacaoNome,
      empresaNome: pedido.empresaNome,
      participanteNome: pedido.participanteNome,
      vendedorNome: pedido.vendedorNome,
      valorProdutos: Number(pedido.vrProdutos),
      dataAprovacao: pedido.dataAprovacao?.toISOString() ?? null,
      dataPrevista: pedido.dataPrevista?.toISOString() ?? null,
      diasParado,
    },
    trilha: historico.map((h) => ({
      etapaNome: h.etapaNome,
      entrouEm: h.dataEntrada?.toISOString() ?? null,
      tempoEtapaDias: h.tempoEtapaDias,
    })),
    itens,
    pendencia,
  };
}

/**
 * Produto com mais demanda (por QUANTIDADE): soma a quantidade dos itens em pedidos
 * de demanda aberta (bucket_demanda='ABERTA'), agrupada por produto. Ranking por
 * quantidade (decisao do usuario). Usa fato_pedido_item + fato_pedido.
 */
export async function queryDemandaPorProduto(
  prisma: PrismaClient,
  filtros: { limite?: number; empresaId?: number } = {},
): Promise<{
  linhas: {
    produtoId: number | null;
    produtoNome: string | null;
    familiaNome: string | null;
    /** Unidades que ainda faltam entregar (não o pedido inteiro). */
    quantidade: number;
    /** Essas unidades a preço de venda. */
    valorProdutos: number;
    /** As mesmas unidades a preço de custo. */
    valorCusto: number;
  }[];
  totalProdutos: number;
  atendimentoSincronizadoEm: string | null;
  parcial: boolean;
}> {
  const limite = Math.min(Math.max(filtros.limite ?? 20, 1), 100);
  // Recorte opcional por empresa (decisão #2: demanda por grupo E por empresa).
  const empresaId = filtros.empresaId ?? null;
  const status = await atendimentoSincronizado(prisma);
  const rows = await prisma.$queryRaw<
    {
      produto_id: number | null;
      produto_nome: string | null;
      familia_nome: string | null;
      quantidade: number;
      valor: number;
      valor_custo: number;
    }[]
  >`
    WITH linha AS (
      SELECT it.produto_id, it.produto_nome, it.familia_nome,
             GREATEST(0, CASE WHEN ${status.ok}::boolean
                              THEN COALESCE(it.quantidade_a_atender, 0)
                              ELSE it.quantidade END)::float8 AS qtd,
             CASE WHEN it.quantidade > 0
                  THEN (it.vr_produtos / it.quantidade)::float8 ELSE 0 END AS preco_unit,
             COALESCE(p.preco_custo, 0)::float8 AS custo_unit
      FROM fato_pedido_item it
      JOIN fato_pedido f ON f.odoo_id = it.pedido_id
      LEFT JOIN fato_produto p ON p.odoo_id = it.produto_id
      WHERE f.bucket_demanda = 'ABERTA'
        -- Piso da janela de análise (data do documento pai): item de pedido pré-corte
        -- não pode somar quantidade no ranking de produto com mais demanda.
        AND f.data_orcamento >= ${corteAtualDate()}
        AND (${empresaId}::int IS NULL OR f.empresa_id = ${empresaId}::int)
    )
    SELECT produto_id, produto_nome, familia_nome,
           sum(qtd)::float8 AS quantidade,
           sum(qtd * preco_unit)::float8 AS valor,
           sum(qtd * custo_unit)::float8 AS valor_custo
    FROM linha
    GROUP BY produto_id, produto_nome, familia_nome
    -- Produto totalmente entregue sai do ranking: a demanda dele é zero agora.
    HAVING sum(qtd) > 0
    ORDER BY sum(qtd) DESC
  `;
  return {
    totalProdutos: rows.length,
    linhas: rows.slice(0, limite).map((r) => ({
      produtoId: r.produto_id,
      produtoNome: r.produto_nome,
      familiaNome: r.familia_nome,
      quantidade: r.quantidade,
      valorProdutos: r.valor,
      valorCusto: r.valor_custo,
    })),
    atendimentoSincronizadoEm: status.em ? status.em.toISOString() : null,
    parcial: !status.ok,
  };
}

/**
 * Estoque disponivel = saldo total (fato_estoque_saldo) menos o comprometido em
 * demanda aberta (soma dos itens em pedidos bucket_demanda='ABERTA'), por produto.
 * Pode ficar NEGATIVO (vendido mais do que ha em estoque = precisa comprar). Aceita
 * busca por nome/codigo do produto e um recorte "apenas negativos".
 */
export async function queryEstoqueDisponivel(
  prisma: PrismaClient,
  filtros: {
    produto?: string;
    apenasNegativos?: boolean;
    limite?: number;
    /** Escopo do lado do SALDO. Padrão: só o estoque próprio (o da casa). */
    classificacao?: EscopoLocal;
  } = {},
): Promise<{
  linhas: {
    produtoId: number | null;
    produtoNome: string | null;
    saldo: number;
    /** Unidades que faltam entregar (não o pedido inteiro). */
    demanda: number;
    /** Essas unidades a preço de venda e a preço de custo. */
    demandaValorVenda: number;
    demandaValorCusto: number;
    disponivel: number;
  }[];
  total: number;
  negativos: number;
  atendimentoSincronizadoEm: string | null;
  parcial: boolean;
}> {
  const limite = Math.min(Math.max(filtros.limite ?? 20, 1), 100);
  const status = await atendimentoSincronizado(prisma);

  // Lado do SALDO: só o estoque que existe dentro de casa. Contar demonstração e
  // terceiros aqui daria "disponível" onde não há mercadoria para entregar. O escopo sai
  // do Prisma (e não de um pedaço de SQL montado na mão) para o filtro de local ser o
  // mesmo das telas de estoque.
  const escopo = await whereLocalDoEscopo(prisma, filtros.classificacao ?? "fisico");
  const saldoRows = await prisma.fatoEstoqueSaldo.findMany({
    where: {
      ...escopo,
      produtoId: { not: null },
      // Mesma regra do painel A-12 e do KPI: so o saldo POSITIVO. Somar as linhas
      // negativas (furo de inventario) rebaixava o saldo do produto e fabricava
      // "disponivel negativo" que nao existe , e fazia a tool divergir da tela.
      quantidade: { gt: 0 },
      ...(filtros.produto
        ? { produtoNome: { contains: filtros.produto, mode: "insensitive" as const } }
        : {}),
    },
    select: { produtoId: true, produtoNome: true, quantidade: true },
  });

  const saldoPorProduto = new Map<number, { nome: string | null; saldo: number }>();
  for (const r of saldoRows) {
    if (r.produtoId == null) continue;
    const atual = saldoPorProduto.get(r.produtoId);
    const q = Number(r.quantidade ?? 0);
    if (atual) atual.saldo += q;
    else saldoPorProduto.set(r.produtoId, { nome: r.produtoNome, saldo: q });
  }

  // Lado da DEMANDA: o que falta entregar, com o valor a venda e a custo.
  const demRows = await prisma.$queryRaw<
    { produto_id: number | null; q: number; venda: number; custo: number }[]
  >`
    WITH linha AS (
      SELECT it.produto_id,
             GREATEST(0, CASE WHEN ${status.ok}::boolean
                              THEN COALESCE(it.quantidade_a_atender, 0)
                              ELSE it.quantidade END)::float8 AS qtd,
             CASE WHEN it.quantidade > 0
                  THEN (it.vr_produtos / it.quantidade)::float8 ELSE 0 END AS preco_unit,
             COALESCE(p.preco_custo, 0)::float8 AS custo_unit
      FROM fato_pedido_item it
      JOIN fato_pedido f ON f.odoo_id = it.pedido_id
      LEFT JOIN fato_produto p ON p.odoo_id = it.produto_id
      -- Comprometido em demanda aberta; e, se a politica de venda futura estiver
      -- ligada (VENDA_FUTURA.RESERVA_ESTOQUE_ATE_REMESSA), tambem o simples
      -- faturamento (venda futura ja faturada, reservada ate a remessa).
      WHERE (f.bucket_demanda = 'ABERTA'
             OR (${VENDA_FUTURA.RESERVA_ESTOQUE_ATE_REMESSA} AND f.categoria_operacao = 'simples_faturamento'))
        -- Piso da janela de análise no lado da DEMANDA (documento com data). O lado do
        -- saldo é foto do estoque de hoje: não se aplica. Sem o piso, pedido pré-corte
        -- comprometia estoque e gerava "disponível negativo" falso.
        AND f.data_orcamento >= ${corteAtualDate()}
    )
    SELECT produto_id,
           sum(qtd)::float8 AS q,
           sum(qtd * preco_unit)::float8 AS venda,
           sum(qtd * custo_unit)::float8 AS custo
    FROM linha
    GROUP BY produto_id
  `;
  const demandaPorProduto = new Map(
    demRows
      .filter((r) => r.produto_id != null)
      .map((r) => [r.produto_id as number, r]),
  );

  const rows = [...saldoPorProduto.entries()]
    .map(([produtoId, s]) => {
      const d = demandaPorProduto.get(produtoId);
      const demanda = d?.q ?? 0;
      return {
        produtoId,
        produtoNome: s.nome,
        saldo: s.saldo,
        demanda,
        demandaValorVenda: d?.venda ?? 0,
        demandaValorCusto: d?.custo ?? 0,
        disponivel: s.saldo - demanda,
      };
    })
    // Menor disponibilidade primeiro: quem precisa de compra aparece no topo.
    .sort((a, b) => a.disponivel - b.disponivel);

  // O contador de negativos conta a lista INTEIRA, nao a pagina. Antes ele lia a lista ja
  // cortada em 500 e publicava um numero capado , a tool dizia "500 negativos" quando eram
  // mais, e nunca batia com o painel.
  const negativos = rows.filter((r) => r.disponivel < 0).length;
  const filtradas = filtros.apenasNegativos
    ? rows.filter((r) => r.disponivel < 0)
    : rows;
  return {
    total: filtradas.length,
    negativos,
    linhas: filtradas.slice(0, limite),
    atendimentoSincronizadoEm: status.em ? status.em.toISOString() : null,
    parcial: !status.ok,
  };
}

/**
 * Seriais em estoque por produto, a partir de `fato_serial_saldo`: cada serial com saldo
 * positivo, onde ele está (local) e em que classificação esse local cai.
 *
 * A fonte antiga (`fato_serial`) NÃO sabia onde o serial estava: 100% dos seriais "em
 * estoque" tinham local nulo, então "parado" era um serial sem endereço, e a pergunta
 * "onde está o serial X?" não tinha resposta. Aqui só entra serial com saldo > 0 e com
 * local, que é o que se pode ir buscar na prateleira.
 */
export async function querySeriaisProduto(
  prisma: PrismaClient,
  filtros: { produto?: string; limite?: number; classificacao?: EscopoLocal } = {},
): Promise<{
  linhas: {
    produtoNome: string | null;
    /** Seriais em estoque (saldo > 0) do produto, no escopo pedido. */
    emEstoque: number;
    /** Quantos deles estão em local de estoque próprio e quantos em demonstração. */
    proprio: number;
    demonstracao: number;
    /** Quantos locais diferentes guardam seriais desse produto. */
    locais: number;
    saldo: number;
  }[];
  totalProdutos: number;
  totalSeriais: number;
}> {
  const limite = Math.min(Math.max(filtros.limite ?? 20, 1), 100);
  const padrao = filtros.produto ? `%${filtros.produto}%` : "%";
  // Aqui o padrão é "todos": a pergunta é "onde está o serial", e esconder os que estão
  // em demonstração seria sumir com equipamento que existe. A quebra por classificação
  // vai nas colunas, para a resposta poder dizer quantos são de cada tipo.
  const escopo = filtros.classificacao ?? "todos";

  const rows = await prisma.$queryRaw<
    {
      produto_nome: string | null;
      em_estoque: number;
      proprio: number;
      demonstracao: number;
      locais: number;
      saldo: number;
    }[]
  >`
    SELECT s.produto_nome,
           count(*)::int AS em_estoque,
           count(*) FILTER (WHERE s.classificacao = 'fisico')::int AS proprio,
           count(*) FILTER (WHERE s.classificacao = 'demonstracao')::int AS demonstracao,
           count(DISTINCT s.local_id)::int AS locais,
           sum(s.saldo)::float8 AS saldo
    FROM fato_serial_saldo s
    WHERE s.produto_nome ILIKE ${padrao}
      -- Serial é foto de estoque (não tem eixo de tempo): a data de início das análises
      -- não se aplica. Saldo > 0 e local conhecido: é o que existe para ir buscar.
      AND s.saldo > 0
      AND s.local_id IS NOT NULL
      -- Escopo como parâmetro, sem montar SQL na mão: 'todos' passa reto, o resto compara
      -- a classificação já materializada no fato.
      AND (${escopo}::text = 'todos' OR s.classificacao = ${escopo}::text)
    GROUP BY s.produto_nome
    ORDER BY count(*) DESC
    LIMIT 500
  `;
  return {
    totalProdutos: rows.length,
    totalSeriais: rows.reduce((s, r) => s + r.em_estoque, 0),
    linhas: rows.slice(0, limite).map((r) => ({
      produtoNome: r.produto_nome,
      emEstoque: r.em_estoque,
      proprio: r.proprio,
      demonstracao: r.demonstracao,
      locais: r.locais,
      saldo: r.saldo,
    })),
  };
}

export async function queryPedidosPorVendedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ linhas: { vendedorNome: string | null; quantidade: number; valorTotal: number }[] }> {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  const where = {
    ...SO_PEDIDO_VENDA,
    dataOrcamento: { gte: j.gte, lt: j.lt },
  };
  // Usa vrProdutos , mesma decisão de queryPedidosPorEtapa: vrNf=0 para
  // pedidos não faturados, o que subnotificaria vendedores com pedidos em aberto.
  const rows = await prisma.fatoPedido.findMany({
    where,
    select: { vendedorNome: true, vrProdutos: true },
  });
  const map = new Map<string | null, { quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.vendedorNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrProdutos);
    } else {
      map.set(key, { quantidade: 1, valorTotal: Number(r.vrProdutos) });
    }
  }
  const linhas = [...map.entries()]
    .map(([vendedorNome, v]) => ({ vendedorNome, ...v }))
    // Ordenacao ESTAVEL: valorTotal desc + desempate por vendedorNome, para que
    // a paginacao em memoria (slice no handler) nao repita nem pule vendedor.
    .sort(
      (a, b) =>
        b.valorTotal - a.valorTotal ||
        (a.vendedorNome ?? "").localeCompare(b.vendedorNome ?? ""),
    );
  return { linhas };
}

export async function queryPedidosAtrasados(
  prisma: PrismaClient,
  hoje: Date,
  paginacao?: { limit?: number; offset?: number },
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number; diasAtraso: number }[]; totalAtrasado: number; totalEncontrados: number; maxDiasAtraso: number }> {
  // Normaliza para início do dia local , parcelas gravadas como T00:00:00 não
  // devem ser contadas como atrasadas se vencem HOJE. Mesmo padrão de
  // queryTitulosVencidos (financeiro.ts:230).
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  // A parcela não guarda a data do DOCUMENTO: o piso da janela de análise tem que vir
  // do pedido pai (data_orcamento >= corte). Sem isso, parcela de pedido pré-corte
  // entra como "atrasada há N dias" e infla totalAtrasado/maxDiasAtraso , mesmo bug
  // da dívida velha já removida das contas a pagar/receber.
  const pedidosNoCorte = await idsPedidosNoCorte(prisma);
  const where = {
    dataVencimento: { lt: inicioDoDia },
    parcelaFaturada: false,
    pedidoId: { in: pedidosNoCorte },
  };
  // Alavanca 2b: paginacao via take/skip no SQL. orderBy por dataVencimento
  // (mais antigo primeiro = maior atraso) + desempate por odooId.
  const [rows, totalEncontrados, somaAgg, maisAntiga] = await Promise.all([
    prisma.fatoPedidoParcela.findMany({
      where,
      select: {
        pedidoId: true,
        participanteNome: true,
        numero: true,
        dataVencimento: true,
        valor: true,
      },
      orderBy: [{ dataVencimento: "asc" }, { odooId: "asc" }],
      take: paginacao?.limit,
      skip: paginacao?.offset,
    }),
    prisma.fatoPedidoParcela.count({ where }),
    prisma.fatoPedidoParcela.aggregate({ where, _sum: { valor: true } }),
    // Parcela mais antiga = maior atraso (independente da pagina), para _DESTAQUE.
    prisma.fatoPedidoParcela.findFirst({
      where,
      select: { dataVencimento: true },
      orderBy: [{ dataVencimento: "asc" }],
    }),
  ]);
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
    diasAtraso: diasAtraso(r.dataVencimento, inicioDoDia),
  }));
  // totalAtrasado e maxDias consideram TODO o recorte, nao so a pagina.
  const totalAtrasado = Number(somaAgg._sum.valor ?? 0);
  const maxDiasAtraso = maisAntiga ? diasAtraso(maisAntiga.dataVencimento, inicioDoDia) : 0;
  return { linhas, totalAtrasado, totalEncontrados, maxDiasAtraso };
}

export async function queryParcelasAVencer(
  prisma: PrismaClient,
  filtros: { ateDias?: number; limit?: number; offset?: number },
  hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number }[]; totalAVencer: number; totalEncontrados: number }> {
  // Normaliza para início do dia local , parcelas que vencem HOJE (gravadas como
  // T00:00:00) devem ser incluídas em "a vencer". Mesmo padrão de
  // queryTitulosVencidos (financeiro.ts:230).
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const ateDias = filtros.ateDias ?? 30;
  const limite = new Date(inicioDoDia.getTime() + ateDias * 24 * 60 * 60 * 1000);
  // O vencimento aqui é futuro (nunca cai antes do corte), mas o DOCUMENTO de origem
  // precisa estar na janela de análise: parcela de um pedido pré-corte não é receita
  // a vencer que a plataforma considera. Piso pela data do pedido pai.
  const pedidosNoCorte = await idsPedidosNoCorte(prisma);
  const where = {
    dataVencimento: { gte: inicioDoDia, lte: limite },
    parcelaFaturada: false,
    pedidoId: { in: pedidosNoCorte },
  };
  // Alavanca 2b: paginacao via take/skip no SQL. orderBy estavel com desempate
  // por odooId para que "os proximos" nao repitam nem pulem parcela.
  const [rows, totalEncontrados, somaAgg] = await Promise.all([
    prisma.fatoPedidoParcela.findMany({
      where,
      select: {
        pedidoId: true,
        participanteNome: true,
        numero: true,
        dataVencimento: true,
        valor: true,
      },
      orderBy: [{ dataVencimento: "asc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoPedidoParcela.count({ where }),
    prisma.fatoPedidoParcela.aggregate({ where, _sum: { valor: true } }),
  ]);
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
  }));
  // totalAVencer e a soma de TODAS as parcelas do recorte (nao so da pagina).
  const totalAVencer = Number(somaAgg._sum.valor ?? 0);
  return { linhas, totalAVencer, totalEncontrados };
}
