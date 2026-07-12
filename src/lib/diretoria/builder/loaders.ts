// Registry de loaders de dados por componente (Onda 1). Cada loader devolve um
// dado PLANO/serializável (sem Map, para cruzar RSC server->client sem quebrar).
// resolverBlocos faz dedupe (mesmo id usado em 2 blocos roda 1x) e tolera falha
// (allSettled: um loader que quebra não derruba o relatório).
import type { PrismaClient } from "@/generated/prisma/client";
import { clampIsoAoCorte, getCorteDados } from "@/lib/corte-dados";
import {
  queryIndicadoresEstoque,
  queryEstoquePorLocal,
  queryEstoquePorFamilia,
  queryEstoquePorMarca,
} from "@/lib/diretoria/queries/estoque";
import {
  queryIndicadoresVendas,
  queryMargemEstimada,
  queryVendasPorUf,
  queryVendasPorMarca,
  queryModalidadesEMaiorPedido,
  queryFormasPagamento,
  type FiltrosVendas,
} from "@/lib/diretoria/queries/vendas";
import { queryDemandasPorUf } from "@/lib/diretoria/queries/pedidos";

export interface LoaderCtx {
  periodoDe?: string;
  periodoAte?: string;
  uf?: string;
  escopoUfs?: string[];
}

export type Loader = (prisma: PrismaClient, ctx: LoaderCtx) => Promise<unknown>;

/** Converte o contexto do relatório nos filtros das queries de Vendas. */
function filtrosVendas(ctx: LoaderCtx): FiltrosVendas {
  return { periodoDe: ctx.periodoDe, periodoAte: ctx.periodoAte, ufs: ctx.escopoUfs };
}

/** Componentes com dado pronto (reusam queries existentes). */
export const LOADERS: Record<string, Loader> = {
  // Estoque
  "A-01": (prisma) => queryIndicadoresEstoque(prisma),
  "A-02": (prisma) => queryEstoquePorLocal(prisma),
  "A-03": (prisma) => queryEstoquePorFamilia(prisma),
  "A-04": (prisma) => queryEstoquePorMarca(prisma),
  // Vendas , normaliza o retorno para o formato que render-componente espera
  "C-01": async (prisma, ctx) => {
    const f = filtrosVendas(ctx);
    const [ind, margem] = await Promise.all([
      queryIndicadoresVendas(prisma, f),
      queryMargemEstimada(prisma, f),
    ]);
    return { ...ind, margemPct: margem.margemPct, margem: margem.margem };
  },
  "C-02": async (prisma, ctx) => {
    const r = await queryVendasPorUf(prisma, filtrosVendas(ctx));
    return { linhas: r.linhas.filter((l) => l.uf !== "??").map((l) => ({ chave: l.uf, valorTotal: l.valorTotal })) };
  },
  "C-03": async (prisma, ctx) => {
    const r = await queryVendasPorMarca(prisma, filtrosVendas(ctx));
    return { linhas: r.linhas.map((l) => ({ chave: l.marca, valorTotal: l.valorTotal })) };
  },
  "C-05": async (prisma, ctx) => {
    const r = await queryModalidadesEMaiorPedido(prisma, filtrosVendas(ctx));
    return {
      linhas: r.modalidades.map((l) => ({ chave: l.modalidade, valorTotal: l.valorTotal })),
      maiorPedido: r.maiorPedido,
    };
  },
  "C-07": async (prisma, ctx) => {
    const r = await queryFormasPagamento(prisma, filtrosVendas(ctx));
    return { linhas: r.linhas.map((l) => ({ chave: l.formaPagamento, valorTotal: l.valorTotal })) };
  },
  // Demandas , mapa por estado (dado p/ o BrazilMap)
  "B-03": async (prisma, ctx) => {
    const r = await queryDemandasPorUf(prisma, {
      ufs: ctx.escopoUfs,
      periodoDe: ctx.periodoDe,
      periodoAte: ctx.periodoAte,
    });
    return { data: r.linhas.filter((l) => l.uf !== "??").map((l) => ({ uf: l.uf, valor: l.valorTotal })) };
  },
};

export interface ResultadoBloco {
  id: string;
  ok: boolean;
  dado?: unknown;
  erro?: string;
}

/**
 * Resolve os dados dos componentes informados. Dedup por id; loaders rodam em
 * paralelo com allSettled. Componente sem loader retorna ok=false (em breve).
 *
 * Ponto de entrada de dados do construtor: aqui a data de início das análises é lida do
 * banco (aquece o cache de processo, senão as queries usariam o valor padrão em memória) e
 * o contexto sai daqui com o período GRAMPEADO. Um relatório montado sem período não
 * significa "todo o histórico": significa "do início das análises até hoje".
 */
export async function resolverBlocos(
  prisma: PrismaClient,
  ids: string[],
  ctx: LoaderCtx = {},
): Promise<Map<string, ResultadoBloco>> {
  const corte = await getCorteDados(prisma);
  const ctxClampado: LoaderCtx = {
    ...ctx,
    periodoDe: clampIsoAoCorte(ctx.periodoDe ?? corte, corte),
  };
  const unicos = [...new Set(ids)];
  const settled = await Promise.allSettled(
    unicos.map(async (id): Promise<ResultadoBloco> => {
      const loader = LOADERS[id];
      if (!loader) return { id, ok: false, erro: "sem_loader" };
      const dado = await loader(prisma, ctxClampado);
      return { id, ok: true, dado };
    }),
  );
  const out = new Map<string, ResultadoBloco>();
  settled.forEach((s, i) => {
    const id = unicos[i];
    if (s.status === "fulfilled") out.set(id, s.value);
    else out.set(id, { id, ok: false, erro: String(s.reason).slice(0, 200) });
  });
  return out;
}
