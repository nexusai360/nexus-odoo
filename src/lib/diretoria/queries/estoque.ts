// Queries de Estoque & Compras (módulo A do HTML) próprias da Diretoria. Estoque
// agrega fato_estoque_saldo; compras (A8) agregam fato_dfe (notas de entrada).

import type { PrismaClient } from "@/generated/prisma/client";
import { diasRestantes, statusPrazo, type StatusPrazo } from "@/lib/diretoria/cores";

export interface IndicadoresEstoque {
  valorTotal: number;
  itens: number;
  produtos: number;
  locais: number;
}

/** A4 , Indicadores do estoque (valor total, itens, produtos e locais distintos). */
export async function queryIndicadoresEstoque(
  prisma: PrismaClient,
): Promise<IndicadoresEstoque> {
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    select: { quantidade: true, vrSaldo: true, produtoId: true, localId: true },
  });
  let valorTotal = 0;
  let itens = 0;
  const produtos = new Set<number>();
  const locais = new Set<number>();
  for (const r of rows) {
    valorTotal += Number(r.vrSaldo ?? 0);
    itens += Number(r.quantidade ?? 0);
    if (r.produtoId != null) produtos.add(r.produtoId);
    if (r.localId != null) locais.add(r.localId);
  }
  return { valorTotal, itens, produtos: produtos.size, locais: locais.size };
}

export interface LinhaAgrupada {
  chave: string;
  quantidade: number;
  valorTotal: number;
}

async function agrupaSaldo(
  prisma: PrismaClient,
  campo: "localNome" | "familiaNome" | "marcaNome",
  semNome: string,
): Promise<{ linhas: LinhaAgrupada[]; valorGeral: number }> {
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    select: { [campo]: true, quantidade: true, vrSaldo: true },
  });
  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const r of rows) {
    const chave = (r as Record<string, unknown>)[campo] as string | null;
    const k = chave ?? semNome;
    const v = Number(r.vrSaldo ?? 0);
    const cur = map.get(k);
    if (cur) {
      cur.quantidade += Number(r.quantidade ?? 0);
      cur.valorTotal += v;
    } else {
      map.set(k, { quantidade: Number(r.quantidade ?? 0), valorTotal: v });
    }
    valorGeral += v;
  }
  const linhas = [...map.entries()]
    .map(([chave, v]) => ({ chave, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.chave.localeCompare(b.chave));
  return { linhas, valorGeral };
}

/** A2 , Estoque por local (valor por armazém/local). */
export function queryEstoquePorLocal(prisma: PrismaClient) {
  return agrupaSaldo(prisma, "localNome", "Sem local");
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
  serial: string | null;
  produto: string | null;
  local: string | null;
  valorCusto: number;
  chegada: string | null;
  saida: string | null;
  idadeDias: number | null;
}

/** A6 , Lista de seriais (em estoque = sem data de saída), com idade em dias. */
export async function querySeriais(
  prisma: PrismaClient,
  hoje: Date,
  limit = 50,
): Promise<{ linhas: SerialLinha[]; total: number }> {
  const total = await prisma.fatoSerial.count({ where: { serial: { not: null } } });
  const rows = await prisma.fatoSerial.findMany({
    where: { serial: { not: null } },
    orderBy: [{ dataCompra: "desc" }],
    take: limit,
    select: {
      serial: true,
      produtoNome: true,
      localNome: true,
      valorCusto: true,
      dataCompra: true,
      dataSaida: true,
    },
  });
  const MS = 86_400_000;
  const linhas = rows.map((r) => ({
    serial: r.serial,
    produto: r.produtoNome,
    local: r.localNome,
    valorCusto: Number(r.valorCusto ?? 0),
    chegada: r.dataCompra ? r.dataCompra.toISOString().slice(0, 10) : null,
    saida: r.dataSaida ? r.dataSaida.toISOString().slice(0, 10) : null,
    idadeDias: r.dataCompra
      ? Math.floor((hoje.getTime() - r.dataCompra.getTime()) / MS)
      : null,
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
  const rows = await prisma.fatoEstoqueSaldo.findMany({
    select: {
      produtoId: true,
      produtoNome: true,
      familiaNome: true,
      marcaNome: true,
      localId: true,
      quantidade: true,
      vrSaldo: true,
    },
  });
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
    const valor = Number(r.vrSaldo ?? 0);
    const qtd = Number(r.quantidade ?? 0);
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

/** A8 , Compras por fornecedor (notas fiscais de entrada do período). */
export async function queryComprasPorFornecedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string } = {},
): Promise<{ linhas: CompraFornecedor[]; valorGeral: number }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataEmissao: {
            gte: new Date(`${filtros.periodoDe}T00:00:00Z`),
            lte: new Date(`${filtros.periodoAte}T23:59:59Z`),
          },
        }
      : {};
  const rows = await prisma.fatoDfe.findMany({
    where,
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
 */
export async function queryComprasSerie(
  prisma: PrismaClient,
): Promise<ComprasSerie> {
  const rows = await prisma.fatoDfe.findMany({
    where: { dataEmissao: { not: null } },
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
 */
export async function queryResumoCompras(
  prisma: PrismaClient,
  hoje: Date,
): Promise<ResumoCompras> {
  const rows = await prisma.fatoCompra.findMany({
    where: { cancelada: false },
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
 */
export async function queryIndicadoresAvancadosEstoque(
  prisma: PrismaClient,
  hoje: Date,
): Promise<IndicadoresAvancados> {
  const MS = 86_400_000;
  const desde30 = new Date(hoje.getTime() - 30 * MS);

  const [saldos, vendidos, seriais] = await Promise.all([
    prisma.fatoEstoqueSaldo.findMany({ select: { quantidade: true, vrSaldo: true, produtoId: true } }),
    prisma.fatoNotaFiscalItem.findMany({
      where: { entradaSaida: "1", dataEmissao: { gte: desde30, lte: hoje } },
      select: { quantidade: true },
    }),
    prisma.fatoSerial.findMany({
      where: { dataSaida: null, dataCompra: { not: null } },
      select: { dataCompra: true },
    }),
  ]);

  let estoqueQtd = 0;
  let valorEstoque = 0;
  const produtos = new Set<number>();
  for (const s of saldos) {
    estoqueQtd += Number(s.quantidade ?? 0);
    valorEstoque += Number(s.vrSaldo ?? 0);
    if (s.produtoId != null) produtos.add(s.produtoId);
  }
  const vendidoQtd = vendidos.reduce((acc, v) => acc + Number(v.quantidade ?? 0), 0);
  const demandaDiaria = vendidoQtd / 30;

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
    giroAnual: estoqueQtd > 0 ? Number(((vendidoQtd * 12) / estoqueQtd).toFixed(2)) : null,
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
 */
export async function queryComprasAtivas(
  prisma: PrismaClient,
  hoje: Date,
  limit = 50,
): Promise<ComprasAtivas> {
  const rows = await prisma.fatoCompra.findMany({
    where: { recebida: false, cancelada: false },
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
