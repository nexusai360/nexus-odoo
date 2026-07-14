// Queries de Estoque & Compras (módulo A do HTML) próprias da Diretoria. Estoque
// agrega fato_estoque_saldo; compras (A8) agregam fato_dfe (notas de entrada).
//
// Data de início das análises (`sync.corte_dados`), fronteira deste arquivo:
//   - SALDO de estoque (fato_estoque_saldo) e seriais em estoque são FOTO do agora, não
//     histórico: não levam piso de data (não há data de documento para filtrar; filtrar
//     esconderia estoque que existe fisicamente hoje);
//   - COMPRA (fato_compra) e NOTA DE ENTRADA (fato_dfe) são documentos com data, ou seja,
//     histórico: levam o piso do corte, sempre, mesmo sem período informado.

import type { PrismaClient } from "@/generated/prisma/client";
import { clampDateAoCorte, corteAtualDate, janelaClampada } from "@/lib/corte-dados";
import { diasRestantes, statusPrazo, type StatusPrazo } from "@/lib/diretoria/cores";
import { VENDA_FUTURA } from "@/lib/fiscal/regras/venda-futura-policy";
import { getIndiceEstoque, aplicarIndice } from "@/lib/indice-estoque";
import { atendimentoSincronizado } from "@/lib/diretoria/atendimento-status";
import type { ClassificacaoLocal } from "@/lib/estoque/classificacao-local";
import {
  localIdsPorClassificacao,
  whereLocal,
} from "@/lib/estoque/locais-por-classificacao";

export interface IndicadoresEstoque {
  /** O número do KPI: valor a custo DIVIDIDO pelo índice configurado (Diretoria > Vendas). */
  valorTotal: number;
  /** O valor a custo puro, sem o índice (mostrado embaixo, para conferência). */
  valorACusto: number;
  /** Índice usado na divisão (padrão 0,95). */
  indice: number;
  itens: number;
  produtos: number;
  locais: number;
  /** Produtos com saldo mas sem preco de custo cadastrado (gap visivel, nao silencioso). */
  produtosSemCusto: number;
  /** Linhas com saldo NEGATIVO no Odoo (furo de estoque). Ficam fora do valor, mas à vista. */
  linhasNegativas: number;
}

/**
 * A4 , Indicadores do estoque (valor, itens, produtos e locais distintos).
 *
 * TRÊS REGRAS, nesta ordem:
 *
 * 1. **Só o que ESTÁ em estoque** (`quantidade > 0`). O `fato_estoque_saldo` guarda também
 *    linhas zeradas (produto que já saiu) e NEGATIVAS (furo de estoque: saída sem entrada
 *    registrada no Odoo). As negativas SUBTRAÍAM do KPI , eram R$ 10,5 mi a menos no cache
 *    real, em 219 linhas. Estoque negativo não é estoque; agora fica fora do valor e é
 *    devolvido em `linhasNegativas` para o problema ficar visível.
 * 2. **Valorização a CUSTO**, produto a produto: `quantidade x fato_produto.preco_custo`.
 *    Produto sem custo cadastrado entra com zero e aparece em `produtosSemCusto`.
 * 3. **Índice** (Configuração > Diretoria > Vendas, padrão 0,95): o valor a custo é DIVIDIDO
 *    por ele, e é esse resultado que vira o KPI. O valor a custo puro vai junto, para a tela
 *    poder mostrar os dois.
 */
export async function queryIndicadoresEstoque(
  prisma: PrismaClient,
): Promise<IndicadoresEstoque> {
  const indice = await getIndiceEstoque(prisma);
  // Só o que é da empresa e está em casa. Sem este filtro, o KPI somava também o
  // estoque Virtual (R$ 10,2 mi) e o que está em poder de Terceiros (R$ 6,1 mi).
  const fisico = await localIdsPorClassificacao(prisma, "fisico");

  // Só o saldo POSITIVO: zerado não é estoque, e negativo é furo de inventário.
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: { quantidade: { gt: 0 }, ...whereLocal(fisico) },
    select: { quantidade: true, produtoId: true, localId: true },
  });
  const linhasNegativas = await prisma.fatoEstoqueSaldo.count({
    where: { quantidade: { lt: 0 }, ...whereLocal(fisico) },
  });

  const produtoIds = [
    ...new Set(rows.map((r) => r.produtoId).filter((x): x is number => x != null)),
  ];
  const catalogo = produtoIds.length
    ? await prisma.fatoProduto.findMany({
        where: { odooId: { in: produtoIds } },
        select: { odooId: true, precoCusto: true },
      })
    : [];
  const custoPorProduto = new Map(
    catalogo.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]),
  );

  let valorACusto = 0;
  let itens = 0;
  const produtos = new Set<number>();
  const locais = new Set<number>();
  const semCusto = new Set<number>();
  for (const r of rows) {
    const qtd = Number(r.quantidade ?? 0);
    itens += qtd;
    if (r.produtoId != null) {
      produtos.add(r.produtoId);
      const custo = custoPorProduto.get(r.produtoId) ?? 0;
      if (custo <= 0) semCusto.add(r.produtoId);
      valorACusto += qtd * custo;
    }
    if (r.localId != null) locais.add(r.localId);
  }
  const arred = (v: number) => Math.round(v * 100) / 100;
  return {
    valorTotal: arred(aplicarIndice(valorACusto, indice)),
    valorACusto: arred(valorACusto),
    indice,
    itens,
    produtos: produtos.size,
    locais: locais.size,
    produtosSemCusto: semCusto.size,
    linhasNegativas,
  };
}

export interface LinhaAgrupada {
  chave: string;
  quantidade: number;
  valorTotal: number;
}

/** Custo por produto (fato_produto.preco_custo), base da valorizacao do estoque. */
async function custoPorProduto(prisma: PrismaClient): Promise<Map<number, number>> {
  const catalogo = await prisma.fatoProduto.findMany({
    select: { odooId: true, precoCusto: true },
  });
  return new Map(catalogo.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]));
}

async function agrupaSaldo(
  prisma: PrismaClient,
  campo: "localNome" | "familiaNome" | "marcaNome",
  semNome: string,
  classificacao: ClassificacaoLocal = "fisico",
): Promise<{ linhas: LinhaAgrupada[]; valorGeral: number }> {
  const filtro = await localIdsPorClassificacao(prisma, classificacao);
  // Valorizacao a CUSTO (quantidade x preco_custo), a mesma do KPI , senao o donut e o
  // card da mesma tela contariam o estoque por criterios diferentes.
  const [rows, custos] = await Promise.all([
    prisma.fatoEstoqueSaldo.findMany({
      // Mesma regra do KPI: so o saldo POSITIVO (zerado nao e estoque, negativo e furo).
      where: { quantidade: { gt: 0 }, ...whereLocal(filtro) },
      select: {
        [campo]: true,
        quantidade: true,
        produtoId: true,
        localId: true,
      },
    }),
    custoPorProduto(prisma),
  ]);

  // Agrupa por local_id quando o corte e por local: existem DOIS locais com o nome
  // identico ("Proprio / INATIVO"), e agrupar pelo texto os fundiria numa linha so.
  // O nome continua sendo o rotulo; a identidade e o id.
  const porLocal = campo === "localNome";
  const map = new Map<
    string,
    { rotulo: string; quantidade: number; valorTotal: number }
  >();
  let valorGeral = 0;
  for (const r of rows) {
    const nome = (r as Record<string, unknown>)[campo] as string | null;
    const rotulo = nome ?? semNome;
    const k = porLocal ? String(r.localId ?? "sem-local") : rotulo;
    const qtd = Number(r.quantidade ?? 0);
    const v = qtd * (r.produtoId != null ? custos.get(r.produtoId) ?? 0 : 0);
    const cur = map.get(k);
    if (cur) {
      cur.quantidade += qtd;
      cur.valorTotal += v;
    } else {
      map.set(k, { rotulo, quantidade: qtd, valorTotal: v });
    }
    valorGeral += v;
  }
  const linhas = [...map.values()]
    .map((v) => ({
      chave: v.rotulo,
      quantidade: v.quantidade,
      valorTotal: v.valorTotal,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.chave.localeCompare(b.chave));
  return { linhas, valorGeral };
}

/** A2 , Estoque por local (valor por armazém/local). Só o estoque físico. */
export function queryEstoquePorLocal(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "localNome", "Sem local");
}

/** Estoque parado na casa do cliente (demonstração). Não é vendável. */
export function queryEstoqueDemonstracao(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "localNome", "Sem local", "demonstracao");
}

/** A5 , Distribuição do estoque por família. */
export function queryEstoquePorFamilia(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "familiaNome", "Sem família");
}

/** A5 , Distribuição do estoque por marca. */
export function queryEstoquePorMarca(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "marcaNome", "Sem marca");
}

export interface SerialLinha {
  serial: string;
  produto: string | null;
  local: string | null;
  saldo: number;
  valorCusto: number;
}

/**
 * A6 , Seriais que estão em estoque, com o local onde estão e o saldo.
 *
 * Antes esta tela lia `fato_serial`, o cadastro de lote/série do Odoo: listava todo
 * serial já registrado e não sabia onde ele estava. Dos 3.828 que aparecia como "em
 * estoque", **100% tinham local nulo** , a fonte só preenche o local de quem já saiu. Era
 * uma lista de números, sem saldo e sem lugar.
 *
 * Agora lê `fato_serial_saldo`, que nasce da rastreabilidade do saldo de hoje e casa
 * serial + local + saldo. Só entra quem tem saldo positivo (zerado já saiu, negativo é
 * furo de inventário), e o padrão é mostrar só o que está em casa.
 *
 * Foto do agora: a data de início das análises não se aplica (não há documento com data
 * para filtrar , o que está no armazém hoje está no armazém hoje).
 */
export async function querySeriais(
  prisma: PrismaClient,
  limit = 200,
  classificacao: ClassificacaoLocal = "fisico",
): Promise<{ linhas: SerialLinha[]; total: number }> {
  const where = { classificacao };
  const [total, rows] = await Promise.all([
    prisma.fatoSerialSaldo.count({ where }),
    prisma.fatoSerialSaldo.findMany({
      where,
      orderBy: [{ localNome: "asc" }, { produtoNome: "asc" }, { serial: "asc" }],
      take: limit,
      select: {
        serial: true,
        produtoNome: true,
        localNome: true,
        saldo: true,
        valorCusto: true,
      },
    }),
  ]);

  const linhas = rows.map((r) => ({
    serial: r.serial,
    produto: r.produtoNome,
    local: r.localNome,
    saldo: Number(r.saldo ?? 0),
    valorCusto: Number(r.valorCusto ?? 0),
  }));
  return { linhas, total };
}

export interface CatalogoModelo {
  produto: string;
  familia: string | null;
  marca: string | null;
  quantidade: number;
  valorTotal: number;
  locais: number;
}

export interface CatalogoEstoque {
  linhas: CatalogoModelo[];
  total: number;
  valorGeral: number;
}

/**
 * A3 , Modelos do catálogo em estoque. Agrega fato_estoque_saldo por produto
 * (modelo), somando quantidade e valor e contando em quantos locais aparece.
 * Ordena por valor desc; retorna o catálogo completo (UI pagina/limita).
 */
export async function queryCatalogoEstoque(
  prisma: PrismaClient,
  limit = 100,
): Promise<CatalogoEstoque> {
  // Valorizacao a CUSTO (quantidade x preco_custo), a MESMA do KPI e do donut. O `vr_saldo`
  // que vem do Odoo e valorizado por outro criterio: usa-lo aqui fazia a mesma tela mostrar
  // dois valores diferentes para o mesmo estoque.
  const fisico = await localIdsPorClassificacao(prisma, "fisico");
  const [rows, custos] = await Promise.all([
    prisma.fatoEstoqueSaldo.findMany({
      where: { quantidade: { gt: 0 }, ...whereLocal(fisico) },
      select: {
        produtoId: true,
        produtoNome: true,
        familiaNome: true,
        marcaNome: true,
        localId: true,
        quantidade: true,
      },
    }),
    custoPorProduto(prisma),
  ]);
  const map = new Map<
    string,
    {
      produto: string;
      familia: string | null;
      marca: string | null;
      quantidade: number;
      valorTotal: number;
      locais: Set<number>;
    }
  >();
  let valorGeral = 0;
  for (const r of rows) {
    const chave = r.produtoId != null ? `id:${r.produtoId}` : `nome:${r.produtoNome ?? "?"}`;
    const qtd = Number(r.quantidade ?? 0);
    const valor = qtd * (r.produtoId != null ? custos.get(r.produtoId) ?? 0 : 0);
    valorGeral += valor;
    const cur = map.get(chave);
    if (cur) {
      cur.quantidade += qtd;
      cur.valorTotal += valor;
      if (r.localId != null) cur.locais.add(r.localId);
    } else {
      const locais = new Set<number>();
      if (r.localId != null) locais.add(r.localId);
      map.set(chave, {
        produto: r.produtoNome ?? "Sem nome",
        familia: r.familiaNome,
        marca: r.marcaNome,
        quantidade: qtd,
        valorTotal: valor,
        locais,
      });
    }
  }
  const todas = [...map.values()]
    .map((v) => ({
      produto: v.produto,
      familia: v.familia,
      marca: v.marca,
      quantidade: v.quantidade,
      valorTotal: v.valorTotal,
      locais: v.locais.size,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.produto.localeCompare(b.produto));
  return { linhas: todas.slice(0, limit), total: todas.length, valorGeral };
}

export interface CompraFornecedor {
  fornecedor: string;
  notas: number;
  valorTotal: number;
}

/**
 * A8 , Compras por fornecedor (notas fiscais de entrada do período).
 *
 * NF de entrada é documento com data = histórico: o período é grampeado à data de início
 * das análises e, sem período (é como a página chama hoje), o piso continua sendo o corte.
 * Antes, sem período o where era `{}` e a matriz somava todo o fato_dfe já ingerido.
 */
export async function queryComprasPorFornecedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string } = {},
): Promise<{ linhas: CompraFornecedor[]; valorGeral: number }> {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  const rows = await prisma.fatoDfe.findMany({
    where: { dataEmissao: { gte: j.gte, lt: j.lt } },
    select: { fornecedorNome: true, vrNf: true },
  });
  const map = new Map<string, { notas: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const r of rows) {
    const k = r.fornecedorNome ?? "Não informado";
    const v = Number(r.vrNf ?? 0);
    const cur = map.get(k);
    if (cur) {
      cur.notas += 1;
      cur.valorTotal += v;
    } else {
      map.set(k, { notas: 1, valorTotal: v });
    }
    valorGeral += v;
  }
  const linhas = [...map.entries()]
    .map(([fornecedor, v]) => ({ fornecedor, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.fornecedor.localeCompare(b.fornecedor));
  return { linhas, valorGeral };
}

export interface LinhaEstoqueGranular {
  produtoId: number | null;
  produto: string;
  familia: string;
  marca: string;
  local: string;
  quantidade: number;
  valor: number;
}

/**
 * Linhas GRANULARES do saldo (produto×local) com família/marca/local resolvidos.
 * Base dos filtros globais cruzados do construtor: o client filtra estas linhas e
 * recomputa indicadores, donuts, estoque por local e catálogo de forma consistente.
 */
export async function queryEstoqueGranular(
  prisma: PrismaClient,
): Promise<LinhaEstoqueGranular[]> {
  // A CUSTO, igual ao KPI e ao catalogo: e sobre estas linhas que o construtor recomputa os
  // indicadores quando o usuario cruza filtros. Se aqui fosse `vr_saldo`, o mesmo card mudaria
  // de valor so por causa do filtro.
  const fisico = await localIdsPorClassificacao(prisma, "fisico");
  const [rows, custos] = await Promise.all([
    prisma.fatoEstoqueSaldo.findMany({
      where: { quantidade: { gt: 0 }, ...whereLocal(fisico) },
      select: { produtoId: true, produtoNome: true, familiaNome: true, marcaNome: true, localNome: true, quantidade: true },
    }),
    custoPorProduto(prisma),
  ]);
  return rows.map((r) => {
    const qtd = Number(r.quantidade ?? 0);
    return {
      produtoId: r.produtoId,
      produto: r.produtoNome ?? "Sem nome",
      familia: r.familiaNome ?? "Sem família",
      marca: r.marcaNome ?? "Sem marca",
      local: r.localNome ?? "Sem local",
      quantidade: qtd,
      valor: qtd * (r.produtoId != null ? custos.get(r.produtoId) ?? 0 : 0),
    };
  });
}

export interface PontoSerie {
  /** Chave temporal: "YYYY-MM-DD" na série diária; "YYYY-MM" na mensal. */
  data: string;
  valor: number;
  notas: number;
}

export interface ComprasSerie {
  diaria: PontoSerie[];
  mensal: PontoSerie[];
}

/**
 * A-10 , Série temporal de compras (NF de entrada). Agrega fato_dfe por dia e
 * por mês a partir de dataEmissao + vrNf. A UI fatia janelas (semana/mês) e
 * navega com ‹ ›. Ignora notas sem dataEmissao. Ordenado crescente.
 *
 * Série histórica: a janela nunca começa antes da data de início das análises (o `gte` já
 * descarta as notas sem dataEmissao, que antes eram excluídas pelo `not: null`).
 */
export async function queryComprasSerie(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string } = {},
): Promise<ComprasSerie> {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  const rows = await prisma.fatoDfe.findMany({
    where: { dataEmissao: { gte: j.gte, lt: j.lt } },
    select: { dataEmissao: true, vrNf: true },
  });
  const dia = new Map<string, { valor: number; notas: number }>();
  const mes = new Map<string, { valor: number; notas: number }>();
  for (const r of rows) {
    if (!r.dataEmissao) continue;
    const iso = r.dataEmissao.toISOString();
    const kDia = iso.slice(0, 10); // YYYY-MM-DD
    const kMes = iso.slice(0, 7); // YYYY-MM
    const v = Number(r.vrNf ?? 0);
    const cd = dia.get(kDia);
    if (cd) { cd.valor += v; cd.notas += 1; } else dia.set(kDia, { valor: v, notas: 1 });
    const cm = mes.get(kMes);
    if (cm) { cm.valor += v; cm.notas += 1; } else mes.set(kMes, { valor: v, notas: 1 });
  }
  const ordena = (m: Map<string, { valor: number; notas: number }>): PontoSerie[] =>
    [...m.entries()]
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => a.data.localeCompare(b.data));
  return { diaria: ordena(dia), mensal: ordena(mes) };
}

export interface FornecedorResumo {
  fornecedor: string;
  ativas: number;
  comprado: number;
  pago: number;
  aPagar: number;
  atrasadas: number;
}

export interface ResumoCompras {
  totalComprado: number;
  totalPago: number;
  totalAPagar: number;
  comprasAtivas: number;
  atrasadas: number;
  fornecedores: FornecedorResumo[];
}

/**
 * A8 , Resumo de compras + matriz por fornecedor. Agrega fato_compra (ordens de
 * compra). "Ativa" = não recebida e não cancelada. A pagar = vrNf - vrPago.
 * Atrasada = ativa com dataPrevista vencida. `hoje` injetado para testabilidade.
 *
 * Ordem de compra é documento com data: os acumulados (comprado/pago/a pagar) só contam
 * ordens a partir da data de início das análises, o mesmo critério já aplicado nos títulos
 * financeiros. Sem isso, uma OC velha do Odoo inflava o KPI e a matriz por fornecedor.
 */
export async function queryResumoCompras(
  prisma: PrismaClient,
  hoje: Date,
): Promise<ResumoCompras> {
  const rows = await prisma.fatoCompra.findMany({
    where: { cancelada: false, dataOrcamento: { gte: corteAtualDate() } },
    select: {
      fornecedorNome: true,
      vrNf: true,
      vrPago: true,
      recebida: true,
      dataPrevista: true,
    },
  });
  const map = new Map<string, FornecedorResumo>();
  let totalComprado = 0;
  let totalPago = 0;
  let comprasAtivas = 0;
  let atrasadas = 0;
  for (const r of rows) {
    const nf = Number(r.vrNf ?? 0);
    const pago = Number(r.vrPago ?? 0);
    const ativa = !r.recebida;
    const atrasada = ativa && r.dataPrevista != null && r.dataPrevista < hoje;
    totalComprado += nf;
    totalPago += pago;
    if (ativa) comprasAtivas += 1;
    if (atrasada) atrasadas += 1;
    const k = r.fornecedorNome ?? "Não informado";
    const cur = map.get(k) ?? { fornecedor: k, ativas: 0, comprado: 0, pago: 0, aPagar: 0, atrasadas: 0 };
    cur.comprado += nf;
    cur.pago += pago;
    cur.aPagar += nf - pago;
    if (ativa) cur.ativas += 1;
    if (atrasada) cur.atrasadas += 1;
    map.set(k, cur);
  }
  const fornecedores = [...map.values()].sort((a, b) => b.comprado - a.comprado);
  return {
    totalComprado,
    totalPago,
    totalAPagar: totalComprado - totalPago,
    comprasAtivas,
    atrasadas,
    fornecedores,
  };
}

export interface IndicadoresAvancados {
  idadeMediaDias: number | null;
  coberturaDias: number | null;
  giroAnual: number | null;
  valorMedioProduto: number;
}

/**
 * A4 , Indicadores avançados de estoque (BI). Idade média via fato_serial
 * (seriais em estoque, dataCompra→hoje); cobertura = estoque ÷ demanda diária dos
 * últimos 30 dias; giro anualizado = (vendido 30d × 12) ÷ estoque; valor médio por
 * produto. `hoje` injetado. Métricas de demanda dependem de NF de saída do período.
 *
 * A janela de demanda (últimos 30 dias) é grampeada à data de início das análises: se o
 * corte for mais recente que hoje-30, a janela encolhe e a demanda diária passa a ser
 * dividida pelos dias REALMENTE cobertos (senão a demanda ficaria subestimada e a cobertura
 * inflada). Saldo e idade média continuam sem piso: são a foto do estoque de agora.
 */
export async function queryIndicadoresAvancadosEstoque(
  prisma: PrismaClient,
  hoje: Date,
): Promise<IndicadoresAvancados> {
  const MS = 86_400_000;
  const desde30 = clampDateAoCorte(new Date(hoje.getTime() - 30 * MS));
  const diasJanela = Math.max(1, Math.round((hoje.getTime() - desde30.getTime()) / MS));

  const fisico = await localIdsPorClassificacao(prisma, "fisico");
  const [saldos, custos, vendidos, seriaisSaldo] = await Promise.all([
    prisma.fatoEstoqueSaldo.findMany({ where: { quantidade: { gt: 0 }, ...whereLocal(fisico) }, select: { quantidade: true, produtoId: true } }),
    // Mesma valorizacao a CUSTO do KPI: o giro e a cobertura sao lidos lado a lado com ele.
    custoPorProduto(prisma),
    prisma.fatoNotaFiscalItem.findMany({
      where: { entradaSaida: "1", dataEmissao: { gte: desde30, lte: hoje } },
      select: { quantidade: true },
    }),
    // Os seriais que ESTÃO em estoque, pela mesma fonte que a tabela A-06 usa , senão a
    // idade média seria calculada sobre uma lista de seriais e a tela mostraria outra.
    // A data de compra só existe no cadastro de lote/série, então cruzamos as duas: a
    // rastreabilidade diz quem está em casa, o cadastro diz desde quando.
    prisma.fatoSerialSaldo.findMany({
      where: { classificacao: "fisico" },
      select: { serial: true },
    }),
  ]);
  const seriaisEmCasa = seriaisSaldo.map((s) => s.serial);
  const seriais = seriaisEmCasa.length
    ? await prisma.fatoSerial.findMany({
        where: { serial: { in: seriaisEmCasa }, dataCompra: { not: null } },
        select: { dataCompra: true },
      })
    : [];

  let estoqueQtd = 0;
  let valorEstoque = 0;
  const produtos = new Set<number>();
  for (const s of saldos) {
    const qtd = Number(s.quantidade ?? 0);
    estoqueQtd += qtd;
    valorEstoque += qtd * (s.produtoId != null ? custos.get(s.produtoId) ?? 0 : 0);
    if (s.produtoId != null) produtos.add(s.produtoId);
  }
  const vendidoQtd = vendidos.reduce((acc, v) => acc + Number(v.quantidade ?? 0), 0);
  const demandaDiaria = vendidoQtd / diasJanela;

  let idadeMediaDias: number | null = null;
  if (seriais.length) {
    const soma = seriais.reduce(
      (acc, s) => acc + Math.floor((hoje.getTime() - (s.dataCompra as Date).getTime()) / MS),
      0,
    );
    idadeMediaDias = Math.round(soma / seriais.length);
  }

  return {
    idadeMediaDias,
    coberturaDias: demandaDiaria > 0 ? Math.round(estoqueQtd / demandaDiaria) : null,
    // Anualiza a demanda diária (12 meses de 30 dias). Com a janela cheia dá exatamente o
    // antigo (vendido30 x 12) / estoque; com a janela encurtada pelo corte, projeta certo.
    giroAnual:
      estoqueQtd > 0
        ? Number(((demandaDiaria * 360) / estoqueQtd).toFixed(2))
        : null,
    valorMedioProduto: produtos.size > 0 ? valorEstoque / produtos.size : 0,
  };
}

export interface CompraAtivaLinha {
  numero: string | null;
  fornecedor: string | null;
  comprador: string | null;
  etapa: string | null;
  valor: number;
  dataOrcamento: string | null;
  dataPrevista: string | null;
  diasRestantes: number | null;
  statusPrazo: StatusPrazo | null;
}

export interface ComprasAtivas {
  linhas: CompraAtivaLinha[];
  total: number;
  valorTotal: number;
  atrasadas: number;
}

/**
 * A7 , Compras ativas (ordens de compra não recebidas e não canceladas).
 * Contagem regressiva (diasRestantes/statusPrazo) só quando há data prevista;
 * caso contrário fica null ("sem previsão"). `hoje` injetado para testabilidade.
 *
 * Ordem de compra em aberto continua sendo um documento com data: entra a partir da data de
 * início das análises, mesmo critério do título financeiro em aberto (título anterior ao
 * corte não entra). Uma OC velha e esquecida no Odoo não infla mais o valor em aberto.
 */
export async function queryComprasAtivas(
  prisma: PrismaClient,
  hoje: Date,
  limit = 50,
): Promise<ComprasAtivas> {
  const rows = await prisma.fatoCompra.findMany({
    where: {
      recebida: false,
      cancelada: false,
      dataOrcamento: { gte: corteAtualDate() },
    },
    orderBy: [{ vrNf: "desc" }],
    select: {
      numero: true,
      fornecedorNome: true,
      compradorNome: true,
      etapaNome: true,
      vrNf: true,
      dataOrcamento: true,
      dataPrevista: true,
    },
  });
  let valorTotal = 0;
  let atrasadas = 0;
  const linhas: CompraAtivaLinha[] = rows.map((r) => {
    const valor = Number(r.vrNf ?? 0);
    valorTotal += valor;
    const dias = r.dataPrevista ? diasRestantes(r.dataPrevista, hoje) : null;
    const status = r.dataPrevista ? statusPrazo(r.dataPrevista, hoje) : null;
    if (status === "atrasado") atrasadas += 1;
    return {
      numero: r.numero,
      fornecedor: r.fornecedorNome,
      comprador: r.compradorNome,
      etapa: r.etapaNome,
      valor,
      dataOrcamento: r.dataOrcamento ? r.dataOrcamento.toISOString().slice(0, 10) : null,
      dataPrevista: r.dataPrevista ? r.dataPrevista.toISOString().slice(0, 10) : null,
      diasRestantes: dias,
      statusPrazo: status,
    };
  });
  return { linhas: linhas.slice(0, limit), total: rows.length, valorTotal, atrasadas };
}

export interface EstoqueDisponivelLinha {
  produtoId: number | null;
  produto: string | null;
  saldo: number;
  demanda: number;
  disponivel: number;
}

/**
 * A12 , Estoque disponível = saldo físico (fato_estoque_saldo) menos o já
 * comprometido em demanda em aberta (itens de pedidos bucket_demanda='ABERTA').
 * Disponível NEGATIVO = vendido mais do que há em estoque = precisa comprar.
 * Espelha a tool comercial_estoque_disponivel (paridade: 484 negativos no cache
 * atual). Ordena do mais negativo (maior urgência de compra) para o mais positivo.
 */
export async function queryEstoqueDisponivelDiretoria(
  prisma: PrismaClient,
  filtros: { limite?: number } = {},
): Promise<{
  linhas: EstoqueDisponivelLinha[];
  produtos: number;
  negativos: number;
  unidadesAComprar: number;
}> {
  const limite = Math.min(Math.max(filtros.limite ?? 50, 1), 300);

  // Saldo físico agregado por produto. FOTO do agora (fato_estoque_saldo não tem data de
  // documento): a data de início das análises não se aplica aqui , o que está no armazém
  // hoje está no armazém hoje, independente de quando entrou.
  const fisico = await localIdsPorClassificacao(prisma, "fisico");
  // Mesma regra do KPI e da necessidade de compra: so o saldo POSITIVO. Antes esta query
  // somava tambem as linhas negativas (furo de inventario), o que rebaixava o saldo do
  // produto e fabricava "disponivel negativo" que nao existia.
  const saldos = await prisma.fatoEstoqueSaldo.findMany({
    where: { quantidade: { gt: 0 }, ...whereLocal(fisico) },
    select: { produtoId: true, produtoNome: true, quantidade: true },
  });
  const saldoMap = new Map<number, { nome: string | null; q: number }>();
  for (const s of saldos) {
    if (s.produtoId == null) continue;
    const q = Number(s.quantidade ?? 0);
    const cur = saldoMap.get(s.produtoId);
    if (cur) {
      cur.q += q;
      if (!cur.nome && s.produtoNome) cur.nome = s.produtoNome;
    } else {
      saldoMap.set(s.produtoId, { nome: s.produtoNome, q });
    }
  }

  // Demanda em aberta agregada por produto (itens de pedidos ABERTA). Se a
  // politica de venda futura estiver ligada, inclui tambem o simples faturamento
  // (venda futura ja faturada, reservada ate a remessa) , ENGATILHADO.
  //
  // Diferente do saldo, o PEDIDO é documento com data: só compromete estoque se for
  // posterior à data de início das análises. Sem esse piso, um pedido velho preso em
  // "ABERTA" subtraía saldo e fabricava "disponível negativo" (e unidades a comprar) que
  // não existem.
  const abertos = await prisma.fatoPedido.findMany({
    where: {
      dataOrcamento: { gte: corteAtualDate() },
      ...(VENDA_FUTURA.RESERVA_ESTOQUE_ATE_REMESSA
        ? { OR: [{ bucketDemanda: "ABERTA" }, { categoriaOperacao: "simples_faturamento" }] }
        : { bucketDemanda: "ABERTA" }),
    },
    select: { odooId: true },
  });
  const ids = abertos.map((a) => a.odooId);
  const status = await atendimentoSincronizado(prisma);
  const itens = ids.length
    ? await prisma.fatoPedidoItem.findMany({
        where: { pedidoId: { in: ids } },
        select: {
          produtoId: true,
          produtoNome: true,
          quantidade: true,
          quantidadeAAtender: true,
        },
      })
    : [];
  const demMap = new Map<number, number>();
  const nomeDemanda = new Map<number, string | null>();
  for (const it of itens) {
    if (it.produtoId == null) continue;
    // O que compromete o estoque é o que falta ENTREGAR, não o que foi pedido. Um pedido
    // 90% entregue travava 100% do estoque, e o "disponível" ficava negativo à toa.
    const cheia = Number(it.quantidade ?? 0);
    // Piso em zero: o Odoo devolve "a atender" NEGATIVO quando entregaram mais do que
    // foi pedido (o pedido 2305 pediu 2 e recebeu 3). Entregar a mais nao devolve
    // mercadoria ao estoque, entao isso nao e demanda negativa , sem o piso, o excesso
    // de um pedido abatia a falta de outro e a necessidade de compra saia menor.
    const compromete = Math.max(
      0,
      status.ok ? Number(it.quantidadeAAtender ?? 0) : cheia,
    );
    demMap.set(it.produtoId, (demMap.get(it.produtoId) ?? 0) + compromete);
    if (!nomeDemanda.has(it.produtoId)) nomeDemanda.set(it.produtoId, it.produtoNome);
  }

  const linhas: EstoqueDisponivelLinha[] = [];
  let negativos = 0;
  let unidadesAComprar = 0;
  const todosProdutos = new Set([...saldoMap.keys(), ...demMap.keys()]);
  for (const produtoId of todosProdutos) {
    const saldo = saldoMap.get(produtoId);
    const q = saldo?.q ?? 0;
    const nome = saldo?.nome ?? nomeDemanda.get(produtoId) ?? null;
    const demanda = demMap.get(produtoId) ?? 0;
    const disponivel = q - demanda;
    if (disponivel < 0) {
      negativos += 1;
      unidadesAComprar += demanda - q;
    }
    linhas.push({ produtoId, produto: nome, saldo: q, demanda, disponivel });
  }
  linhas.sort((a, b) => a.disponivel - b.disponivel || (b.demanda - a.demanda));
  return {
    linhas: linhas.slice(0, limite),
    produtos: todosProdutos.size,
    negativos,
    unidadesAComprar,
  };
}

export interface SaldoPorDeposito {
  local: string;
  saldo: number;
}

export interface NecessidadeCompraLinha {
  produtoId: number;
  produto: string | null;
  /** Quanto ainda falta entregar dos pedidos em aberto. */
  demanda: number;
  /** Quanto existe nos depósitos próprios. */
  saldoFisico: number;
  /** O que falta comprar: demanda menos saldo (nunca negativo). */
  falta: number;
  /** Custo estimado da compra (falta x preço de custo). */
  custoEstimado: number;
  /** Onde a mercadoria que existe está , para decidir entre transferir e comprar. */
  porDeposito: SaldoPorDeposito[];
}

/**
 * A14 , Necessidade de compra.
 *
 * O que os clientes já pediram e ainda não recebemos, menos o que temos em casa:
 *
 *     falta(produto) = max(0, demanda_a_atender - saldo_fisico)
 *
 * A demanda é a mesma "demanda em aberta" canônica da plataforma (a regra definida com a
 * Mariane: pedido de venda a cliente externo, aprovado, ainda sem NF ao consumidor final),
 * mas contando o que **falta entregar**, não o que foi pedido.
 *
 * O saldo é só o dos depósitos próprios , o que está em poder de terceiros ou em local
 * virtual não pode atender pedido nenhum.
 *
 * A conta é NACIONAL: a operação transfere mercadoria entre as filiais, então quem decide
 * a compra olha o grupo inteiro. O drill-down por depósito existe para o time ver ONDE a
 * mercadoria está e escolher entre transferir e comprar.
 *
 * Não há estoque mínimo nesta conta porque o Odoo do cliente não tem esse parâmetro
 * preenchido (`fato_estoque_min_max` está vazia). Lead time e mercadoria em trânsito
 * ficaram para uma segunda onda.
 */
export async function queryNecessidadeCompra(
  prisma: PrismaClient,
  limite = 100,
): Promise<{
  linhas: NecessidadeCompraLinha[];
  produtosEmFalta: number;
  unidadesAComprar: number;
  custoTotalEstimado: number;
  atendimentoSincronizado: boolean;
}> {
  const [fisico, status] = await Promise.all([
    localIdsPorClassificacao(prisma, "fisico"),
    atendimentoSincronizado(prisma),
  ]);

  const [saldos, custos, abertos] = await Promise.all([
    prisma.fatoEstoqueSaldo.findMany({
      where: { quantidade: { gt: 0 }, ...whereLocal(fisico) },
      select: {
        produtoId: true,
        produtoNome: true,
        quantidade: true,
        localNome: true,
      },
    }),
    custoPorProduto(prisma),
    prisma.fatoPedido.findMany({
      where: {
        dataOrcamento: { gte: corteAtualDate() },
        ...(VENDA_FUTURA.RESERVA_ESTOQUE_ATE_REMESSA
          ? {
              OR: [
                { bucketDemanda: "ABERTA" },
                { categoriaOperacao: "simples_faturamento" },
              ],
            }
          : { bucketDemanda: "ABERTA" }),
      },
      select: { odooId: true },
    }),
  ]);

  // Saldo por produto, e onde ele está.
  const saldoMap = new Map<
    number,
    { nome: string | null; total: number; porLocal: Map<string, number> }
  >();
  for (const s of saldos) {
    if (s.produtoId == null) continue;
    const q = Number(s.quantidade ?? 0);
    const cur = saldoMap.get(s.produtoId) ?? {
      nome: s.produtoNome,
      total: 0,
      porLocal: new Map<string, number>(),
    };
    cur.total += q;
    const local = s.localNome ?? "Sem local";
    cur.porLocal.set(local, (cur.porLocal.get(local) ?? 0) + q);
    if (!cur.nome && s.produtoNome) cur.nome = s.produtoNome;
    saldoMap.set(s.produtoId, cur);
  }

  // Demanda por produto: o que falta entregar dos pedidos em aberto.
  const ids = abertos.map((a) => a.odooId);
  const itens = ids.length
    ? await prisma.fatoPedidoItem.findMany({
        where: { pedidoId: { in: ids } },
        select: {
          produtoId: true,
          produtoNome: true,
          quantidade: true,
          quantidadeAAtender: true,
        },
      })
    : [];

  const demanda = new Map<number, { nome: string | null; q: number }>();
  for (const it of itens) {
    if (it.produtoId == null) continue;
    const cheia = Number(it.quantidade ?? 0);
    const falta = status.ok ? Number(it.quantidadeAAtender ?? 0) : cheia;
    if (falta <= 0) continue;
    const cur = demanda.get(it.produtoId);
    if (cur) cur.q += falta;
    else demanda.set(it.produtoId, { nome: it.produtoNome, q: falta });
  }

  const linhas: NecessidadeCompraLinha[] = [];
  let unidadesAComprar = 0;
  let custoTotalEstimado = 0;

  for (const [produtoId, dem] of demanda) {
    const saldo = saldoMap.get(produtoId);
    const saldoFisico = saldo?.total ?? 0;
    const falta = dem.q - saldoFisico;
    if (falta <= 0) continue; // o que já temos em casa não precisa ser comprado

    const custoUnit = custos.get(produtoId) ?? 0;
    const custoEstimado = falta * custoUnit;
    unidadesAComprar += falta;
    custoTotalEstimado += custoEstimado;

    linhas.push({
      produtoId,
      produto: dem.nome ?? saldo?.nome ?? null,
      demanda: dem.q,
      saldoFisico,
      falta,
      custoEstimado,
      porDeposito: [...(saldo?.porLocal ?? new Map())]
        .map(([local, s]) => ({ local, saldo: s }))
        .sort((a, b) => b.saldo - a.saldo),
    });
  }

  linhas.sort((a, b) => b.falta - a.falta || b.custoEstimado - a.custoEstimado);

  return {
    linhas: linhas.slice(0, limite),
    produtosEmFalta: linhas.length,
    unidadesAComprar,
    custoTotalEstimado,
    atendimentoSincronizado: status.ok,
  };
}
