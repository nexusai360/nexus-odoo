import type { PrismaClient } from "../../generated/prisma/client";
import type { Resolucao, ResolverOpcoes } from "./types";
import { classificarRef } from "./_classificar-ref";

/**
 * Defaults conservadores do resolvedor de pedido. Pedido NAO tem ramo fuzzy de nome (pedido
 * nao tem nome textual), entao nao ha limiarFuzzy: a defesa contra entidade falsa e o regex de
 * formato do numero (`^[A-Z]+-\d+/\d{2}$`). topN limita as candidatas de uma resolucao ambigua;
 * margemFolga fica reservada para uniformidade com os demais resolvedores.
 */
export const DEFAULTS_PEDIDO = { topN: 3, margemFolga: 0.1 } as const;

/** Formato canonico do numero de pedido na Tauga (ex.: "DV-0001/26", "TRANSF-0014/26"). */
const NUMERO_PEDIDO_REGEX = /^[A-Z]+-\d+\/\d{2}$/;

/** Candidata de pedido (shape contratado no plano B27). */
export interface PedidoCandidata {
  odooId: number;
  numero: string | null;
  tipo: string | null;
  etapaNome: string | null;
  participanteNome: string | null;
  dataOrcamento: Date | null;
  vrProdutos: unknown;
}

/** Linha crua de FatoPedido com os campos que projetamos para a candidata. */
interface PedidoRow {
  odooId: number;
  numero: string | null;
  tipo: string | null;
  etapaNome: string | null;
  participanteNome: string | null;
  dataOrcamento: Date | null;
  vrProdutos: unknown;
}

function projetar(row: PedidoRow): PedidoCandidata {
  return {
    odooId: row.odooId,
    numero: row.numero,
    tipo: row.tipo,
    etapaNome: row.etapaNome,
    participanteNome: row.participanteNome,
    dataOrcamento: row.dataOrcamento,
    vrProdutos: row.vrProdutos,
  };
}

const SELECT_PEDIDO = {
  odooId: true,
  numero: true,
  tipo: true,
  etapaNome: true,
  participanteNome: true,
  dataOrcamento: true,
  vrProdutos: true,
} as const;

/**
 * Resolve uma referencia textual para um pedido (`fato_pedido`). Ramos, em ordem (spec 4.7):
 *   1. id    , `^\d{1,9}$` via classificarRef => `findUnique({ where: { odooId } })`.
 *   2. numero , so quando casa `^[A-Z]+-\d+/\d{2}$`: `findMany({ where: { numero } })`
 *               (+ `tipo` quando `opcoes.filtros.tipo` desempata). Mesmo numero em tipos
 *               diferentes => ambigua (criterio "codigo"). Numero fora do formato NAO consulta
 *               o banco e NAO cai em fuzzy (CS4 nao se aplica a pedido; a defesa e o regex).
 *   3. lista  , quando ha `opcoes.filtros` de data (`dataDe`/`dataAte` sobre `dataOrcamento`),
 *               `tipo` e/ou `participanteId`, retorna a lista de pedidos como resolucao
 *               "ambigua" (nunca "unica" so por data, nem mesmo com 1 match, spec 4.7).
 * Nunca devolve pedido falso: na duvida retorna ambigua (candidatas) ou nenhuma.
 */
export async function resolverPedido(
  prisma: PrismaClient,
  ref: string,
  opcoes?: ResolverOpcoes,
): Promise<Resolucao<PedidoCandidata>> {
  const r = ref.trim();
  const filtros = opcoes?.filtros ?? {};

  // Ramo 1: id (odooId, faixa Int32). classificarRef("123") === "id".
  if (r.length > 0 && classificarRef(r) === "id") {
    const found = await prisma.fatoPedido.findUnique({
      where: { odooId: Number(r) },
      select: SELECT_PEDIDO,
    });
    if (found) return { status: "unica", entidade: projetar(found), score: 1 };
    return { status: "nenhuma" };
  }

  // Ramo 2: numero no formato canonico. So consulta o banco quando o formato casa;
  // texto livre ("pedido 123") nunca vai ao banco (pedido nao tem ramo de nome).
  if (NUMERO_PEDIDO_REGEX.test(r)) {
    const tipoFiltro = typeof filtros.tipo === "string" ? filtros.tipo : undefined;
    const where: { numero: string; tipo?: string } = { numero: r };
    if (tipoFiltro !== undefined) where.tipo = tipoFiltro;

    const rows = await prisma.fatoPedido.findMany({ where, select: SELECT_PEDIDO });
    if (rows.length === 0) return { status: "nenhuma" };
    if (rows.length === 1) {
      return { status: "unica", entidade: projetar(rows[0]), score: 1 };
    }
    // Mesmo numero em mais de um tipo: ambiguo por codigo (numero e o "codigo" do pedido).
    return {
      status: "ambigua",
      candidatas: rows.slice(0, DEFAULTS_PEDIDO.topN).map((row) => ({
        entidade: projetar(row),
        score: 1,
      })),
      criterio: "codigo",
    };
  }

  // Ramo 3: lista por data/tipo/participante. So dispara se houver filtros utilizaveis.
  const where = buildWhereLista(filtros);
  if (where !== null) {
    const rows = await prisma.fatoPedido.findMany({
      where,
      select: SELECT_PEDIDO,
      orderBy: { dataOrcamento: "desc" },
    });
    if (rows.length === 0) return { status: "nenhuma" };
    // Lista de pedidos: SEMPRE ambigua (nunca unica so por data/tipo, mesmo com 1 match).
    // criterio "nome" e o rotulo generico de "lista para o usuario escolher".
    return {
      status: "ambigua",
      candidatas: rows.map((row) => ({ entidade: projetar(row), score: 1 })),
      criterio: "nome",
    };
  }

  return { status: "nenhuma" };
}

/**
 * Monta o where do ramo lista a partir de `opcoes.filtros`. Retorna null quando nenhum filtro
 * utilizavel foi informado (evita findMany cego sobre toda a tabela).
 */
function buildWhereLista(
  filtros: Record<string, unknown>,
): Record<string, unknown> | null {
  const where: Record<string, unknown> = {};
  let usavel = false;

  if (typeof filtros.tipo === "string") {
    where.tipo = filtros.tipo;
    usavel = true;
  }
  if (typeof filtros.participanteId === "number") {
    where.participanteId = filtros.participanteId;
    usavel = true;
  }

  const dataDe = filtros.dataDe;
  const dataAte = filtros.dataAte;
  const intervalo: { gte?: Date; lte?: Date } = {};
  if (typeof dataDe === "string" || dataDe instanceof Date) {
    intervalo.gte = new Date(dataDe);
    usavel = true;
  }
  if (typeof dataAte === "string" || dataAte instanceof Date) {
    intervalo.lte = new Date(dataAte);
    usavel = true;
  }
  if (intervalo.gte !== undefined || intervalo.lte !== undefined) {
    where.dataOrcamento = intervalo;
  }

  return usavel ? where : null;
}
