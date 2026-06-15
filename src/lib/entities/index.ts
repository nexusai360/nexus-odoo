// Ponto unico de import da camada de resolucao de entidades (Fase 2).
// Empresa permanece em src/lib/metrics/_shared/empresa.ts (em producao desde a F1) e NAO e
// editada aqui; o adaptador resolverEmpresaGenerica uniformiza a API para Resolucao<T>, que e
// o contrato que a Fase 3 (cerebro de orquestracao) vai consumir para todas as entidades.
// Os resolvedores das demais entidades sao adicionados a este barrel ao fim de cada impl
// (Bloco B), e o de parceiro no Bloco C-bis.
import type { PrismaClient } from "../../generated/prisma/client";
import { resolverEmpresa } from "../metrics/_shared/empresa";
import type { EmpresaCandidata } from "../metrics/_shared/types";
import type { Resolucao, ResolverOpcoes } from "./types";

export * from "./types";
export * from "./_fuzzy";
export * from "./_documento";
export * from "./_classificar-ref";
export * from "./sinonimias";
export * from "./_lacuna";
export * from "./_ranking";
// Resolvedores de entidade (Bloco B). Parceiro entra no Bloco C-bis (depende de documentoDigits).
export * from "./armazem";
export * from "./produto";
export * from "./nota-fiscal";
export * from "./conta-contabil";
export * from "./conta-referencial";
export * from "./pedido";
export * from "./natureza-operacao";
export * from "./centro-resultado";
// Parceiro (Bloco C-bis): depende de documentoDigits, exportado so aqui.
export * from "./parceiro";

/**
 * Adaptador que envelopa o resolverEmpresa da F1 (cujo retorno EmpresaResolucao nao tem
 * score/criterio) na forma generica Resolucao<T>, sem editar o codigo de producao.
 */
export async function resolverEmpresaGenerica(
  prisma: PrismaClient,
  ref: string,
  _opcoes?: ResolverOpcoes,
): Promise<Resolucao<EmpresaCandidata>> {
  const r = await resolverEmpresa(prisma, ref);
  if (r.status === "unica") return { status: "unica", entidade: r.empresa, score: 1 };
  if (r.status === "ambigua") {
    return {
      status: "ambigua",
      candidatas: r.candidatas.map((c) => ({ entidade: c, score: 1 })),
      criterio: "nome",
    };
  }
  return { status: "nenhuma" };
}
