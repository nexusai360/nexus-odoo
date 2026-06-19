/**
 * Parse + guardrails do JSON destilado pelo headless Claude (Onda 2). O destilado e gravado
 * SEM gate de aprovacao, entao este parse e a TRAVA estrutural: rejeita tudo que possa ocultar
 * dado, vazar PII ou exceder o tamanho. Default-deny. Spec 6.1/6.2/6.5.
 *
 * Modulo PURO.
 */

import { z } from "zod";
import type { PresentationPrefs } from "./types";
import { violaPrivacidade } from "./pii-guard";

export const MAX_INTERACTION_PROMPT = 900;

/** Verbos/expressoes que indicam OCULTACAO ou recorte mandatorio de dado (proibido). */
export const VERBOS_OCULTACAO: readonly string[] = [
  "ignore", "ignorar", "nao mostre", "não mostre", "nao mostrar", "esconda", "esconder",
  "oculte", "ocultar", "filtre", "filtrar", "so considere", "só considere", "somente considere",
  "remova", "remover", "exclua", "excluir", "desconsidere", "deixa de lado", "deixe de lado",
  "foca so", "foca só", "foque so", "foque só", "apenas os", "apenas as", "nunca mostre",
];

/** Valores de breakdown LEGITIMOS (visao de apresentacao). Fora disso, e filtro disfarcado. */
export const ALLOWLIST_BREAKDOWNS: readonly string[] = [
  "empresa", "cfop", "operacao", "cliente", "vendedor", "marca", "uf", "etapa",
  "categoria", "produto", "periodo", "familia",
];

export interface DistilledProfile {
  interactionPrompt: string;
  presentationPrefs: PresentationPrefs;
}

export type ParseResult =
  | { ok: true; value: DistilledProfile }
  | { ok: false; motivo: string };

const schema = z.object({
  interactionPrompt: z.string(),
  presentationPrefs: z.record(z.string(), z.object({ breakdownPreferido: z.string().optional() })).optional(),
});

function normalizarBaixo(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Valida o JSON destilado contra as mensagens ORIGINAIS do usuario (para o anti-verbatim).
 * `mensagensOriginais` NUNCA deve vir vazio em producao , sem elas o anti-verbatim do pii-guard
 * fica cego; o caller (--apply) deve recarregar do banco. Aqui apenas confiamos no que recebe.
 */
export function parseDistilled(rawJson: string, mensagensOriginais: string[]): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, motivo: "json invalido" };
  }
  const r = schema.safeParse(parsed);
  if (!r.success) return { ok: false, motivo: "shape invalido" };

  const interactionPrompt = r.data.interactionPrompt.trim();
  if (interactionPrompt.length === 0) return { ok: false, motivo: "interactionPrompt vazio" };
  if (interactionPrompt.length > MAX_INTERACTION_PROMPT) {
    return { ok: false, motivo: `interactionPrompt > ${MAX_INTERACTION_PROMPT} chars` };
  }

  const baixo = normalizarBaixo(interactionPrompt);
  for (const verbo of VERBOS_OCULTACAO) {
    if (baixo.includes(normalizarBaixo(verbo))) {
      return { ok: false, motivo: `contem verbo de ocultacao: "${verbo}"` };
    }
  }

  if (violaPrivacidade(interactionPrompt, mensagensOriginais)) {
    return { ok: false, motivo: "viola privacidade (PII/verbatim)" };
  }

  // presentationPrefs: so breakdownPreferido com valor do allowlist. Qualquer outra coisa rejeita.
  const prefsIn = r.data.presentationPrefs ?? {};
  const presentationPrefs: PresentationPrefs = {};
  for (const [familia, v] of Object.entries(prefsIn)) {
    const bd = v?.breakdownPreferido;
    if (bd === undefined) continue;
    if (!ALLOWLIST_BREAKDOWNS.includes(normalizarBaixo(bd))) {
      return { ok: false, motivo: `breakdownPreferido fora do allowlist: "${bd}"` };
    }
    presentationPrefs[familia] = { breakdownPreferido: normalizarBaixo(bd) };
  }

  return { ok: true, value: { interactionPrompt, presentationPrefs } };
}
