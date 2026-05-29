import {
  OdooError,
  OdooAccessError,
  OdooPoolExhaustedError,
  OdooUnavailableError,
} from "@/worker/odoo/client";
import { isAccessError } from "@/worker/odoo/errors";
import type { Motivo, TipoErroRpc } from "./types";

/**
 * A mensagem indica que o modelo/relação não existe (abstract, não instalado,
 * sem tabela). Cobre pt-BR e en porque o OdooClient embrulha o fault original
 * num OdooError genérico, perdendo o tipo (ver tipoErroRpc).
 */
function mensagemIndicaInexistente(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("não existe") ||
    m.includes("nao existe") ||
    m.includes("não foi encontrado") ||
    m.includes("nao foi encontrado") ||
    m.includes("does not exist") ||
    m.includes("doesn't exist") ||
    m.includes("not found") ||
    m.includes("inexistente") ||
    m.includes("keyerror")
  );
}

/**
 * Classifica um erro do OdooClient em acesso/abstract/transitório.
 *
 * Premissa do tipo primeiro; mas o E2E do R2 mostrou que o `OdooClient` embrulha
 * faults mapeados (Access/Missing/...) num `OdooError` genérico
 * "falhou após N tentativas: <msg do servidor>", porque o retry loop só re-lança
 * `OdooRpcFault`/`HttpClientError` de imediato (os demais são re-tentados e, no
 * fim, embrulhados). Logo, para o `OdooError` genérico precisamos inspecionar a
 * mensagem embrulhada (que carrega o texto do servidor) para não mandar
 * acesso/inexistente para `nao_classificados`. Ver RADAR / SPEC §4.5.
 * - OdooAccessError, ou mensagem de acesso (isAccessError)  -> acesso_negado (C)
 * - OdooPoolExhaustedError/Unavailable                      -> transitorio
 * - mensagem de "não existe"/"does not exist"               -> abstract (C)
 * - OdooError genérico restante (rede/timeout real)         -> transitorio
 * - outra subclasse de OdooError (fault persistente)        -> abstract (C)
 * - erro não-Odoo                                           -> transitorio
 */
export function tipoErroRpc(e: unknown): TipoErroRpc {
  if (e instanceof OdooAccessError) return "acesso_negado";
  if (e instanceof OdooPoolExhaustedError || e instanceof OdooUnavailableError)
    return "transitorio";
  if (e instanceof OdooError) {
    if (isAccessError(e)) return "acesso_negado";
    if (mensagemIndicaInexistente(e.message)) return "abstract";
    // OdooError exatamente (não subclasse, sem pista no texto) = rede/timeout.
    if (e.constructor === OdooError) return "transitorio";
    return "abstract";
  }
  return "transitorio";
}

/** Traduz o TipoErroRpc em balde C (com motivo) ou null (nao_classificado). */
export function classificarComErro(
  tipo: TipoErroRpc,
): { balde: "C"; motivo: Motivo } | null {
  if (tipo === "acesso_negado") return { balde: "C", motivo: "acesso_negado" };
  if (tipo === "abstract") return { balde: "C", motivo: "abstract_ou_inexistente" };
  return null;
}
