// Registry de loaders de dados por componente (Onda 1). Cada loader devolve um
// dado PLANO/serializável (sem Map, para cruzar RSC server->client sem quebrar).
// resolverBlocos faz dedupe (mesmo id usado em 2 blocos roda 1x) e tolera falha
// (allSettled: um loader que quebra não derruba o relatório).
import type { PrismaClient } from "@/generated/prisma/client";
import {
  queryIndicadoresEstoque,
  queryEstoquePorLocal,
  queryEstoquePorFamilia,
  queryEstoquePorMarca,
} from "@/lib/diretoria/queries/estoque";

export interface LoaderCtx {
  periodoDe?: string;
  periodoAte?: string;
  uf?: string;
  escopoUfs?: string[];
}

export type Loader = (prisma: PrismaClient, ctx: LoaderCtx) => Promise<unknown>;

/** Componentes com dado pronto na Onda 1 (reusam queries existentes). */
export const LOADERS: Record<string, Loader> = {
  "A-01": (prisma) => queryIndicadoresEstoque(prisma),
  "A-02": (prisma) => queryEstoquePorLocal(prisma),
  "A-03": (prisma) => queryEstoquePorFamilia(prisma),
  "A-04": (prisma) => queryEstoquePorMarca(prisma),
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
 */
export async function resolverBlocos(
  prisma: PrismaClient,
  ids: string[],
  ctx: LoaderCtx = {},
): Promise<Map<string, ResultadoBloco>> {
  const unicos = [...new Set(ids)];
  const settled = await Promise.allSettled(
    unicos.map(async (id): Promise<ResultadoBloco> => {
      const loader = LOADERS[id];
      if (!loader) return { id, ok: false, erro: "sem_loader" };
      const dado = await loader(prisma, ctx);
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
