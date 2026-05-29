import {
  OdooError,
  OdooAccessError,
  OdooPoolExhaustedError,
  OdooUnavailableError,
} from "@/worker/odoo/client";
import type { Motivo, TipoErroRpc } from "./types";

/**
 * Classifica um erro do OdooClient por TIPO (nunca por texto: a Tauga responde
 * em pt-BR). Ver SPEC R2 §4.5 / review B2.
 * - OdooAccessError                       -> acesso_negado (C)
 * - OdooPoolExhaustedError/Unavailable    -> transitorio   (re-rodável)
 * - OdooError "puro" (rede/timeout)       -> transitorio
 * - qualquer outra subclasse de OdooError -> abstract       (fault persistente)
 * - erro não-Odoo                         -> transitorio    (conservador)
 */
export function tipoErroRpc(e: unknown): TipoErroRpc {
  if (e instanceof OdooAccessError) return "acesso_negado";
  if (e instanceof OdooPoolExhaustedError || e instanceof OdooUnavailableError)
    return "transitorio";
  if (e instanceof OdooError) {
    // OdooError exatamente (não subclasse) = "falhou após N tentativas" (rede/timeout).
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
