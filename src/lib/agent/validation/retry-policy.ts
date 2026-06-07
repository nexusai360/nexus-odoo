// F3 (cerebro, onda 3b): politica de falha do verificador.
//
// O retry corretivo existente (run-agent ~984-1060) e SO-TEXTO: re-chama o LLM
// para reescrever a resposta, NAO reexecuta a tool nem conta MAX_ITERATIONS.
//  - V1-V5 sao problemas de REDACAO/recusa => retry de texto resolve (cap=1).
//  - V6/V7 sao incoerencia ESTRUTURAL do dado (total nao bate, JOIN duplicado)
//    => reescrever texto NAO conserta o dado; vai direto a Falta Honesta (nao
//    gasta retry inutil). Hoje V6/V7 rodam so em shadow (telemetria); esta
//    politica define o comportamento quando forem promovidos a active.

import type { ValidationFailReason } from "./auto-validator";

export type RetryDecision = "retry-texto" | "falta-honesta" | "nenhuma";

export function decideRetryOuGap(reason: ValidationFailReason): RetryDecision {
  if (reason === null) return "nenhuma";
  if (reason === "V6" || reason === "V7") return "falta-honesta";
  return "retry-texto";
}
