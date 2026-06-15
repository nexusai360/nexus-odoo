// src/lib/agent/tiers/classificar-tier.ts
// Onda O (Arquitetura 3.0) O.2 , classificador lexical de tiers.
//
// Decide o "tamanho do problema" da pergunta SEM LLM (regex conservadora):
//   T1 simples (maioria)      -> fluxo atual, mini, sem mudanca.
//   T2 composta (multi-eixo)  -> T2-lite: mini + instrucao de decomposicao +
//                                teto maior de iteracoes de tool calls.
//   T3 explicativa/contestacao-> modelo forte (flag agent_settings), memoria
//                                completa, latencia maior aceitavel.
// Na duvida entre T2 e T3, T3 vence (contestacao > composicao). A cascata
// (reprova do validador -> re-executa forte) e independente do tier inicial.
//
// Spec: docs/superpowers/specs/2026-06-12-nex-arquitetura-3-design.md §3.2.

export type Tier = "T1" | "T2" | "T3";

function normaliza(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** T3: pedir explicacao do raciocinio ou contestar um numero ja dado. */
const T3_PADROES: RegExp[] = [
  /\bpor que\b/,
  /\bporque\b.*\?/,
  /\bexpli(que|ca|car)\b/,
  /\bjustifi(que|ca|car)\b/,
  /\bcomo (voce |vc )?(chegou|calculou|obteve)\b/,
  /\btem certeza\b/,
  /\b(esta|estao|ta|tao) (errad[oa]s?|estranh[oa]s?)\b/,
  /\bnao (concordo|bate|batem|confere|conferem|faz sentido)\b/,
  /\bde onde (veio|saiu|vem)\b/,
  /\bconfere\b/,
  /\bduvido\b/,
  /\bcontest/,
];

/** T2: composicao multi-eixo / comparacao / panorama. */
const T2_PADROES: RegExp[] = [
  /\bcompar(e|a|ando|acao)\b/,
  /\bversus\b|\bvs\.?\b/,
  /\be tambem\b/,
  /\balem de\b/,
  /\bpanorama\b/,
  /\bvisao geral\b/,
  /\bresum(a|e|o|ir|indo)\b.*\b(situacao|geral|grupo|operacao|empresa)\b/,
  // dois eixos "por X ... e ... por Y" (por empresa e por vendedor)
  /\bpor \w+( \w+)? e (o |a )?por \w+/,
  // "X e tambem o Y" / "da esteira e o da bike" (duas entidades coordenadas)
  /\b(d[oa] \w+) e (tambem )?(o|a) d[oa] \w+/,
];

export function classificarTier(pergunta: string): Tier {
  const q = normaliza(pergunta);
  if (T3_PADROES.some((re) => re.test(q))) return "T3";
  if (T2_PADROES.some((re) => re.test(q))) return "T2";
  return "T1";
}

/** Instrucao de decomposicao injetada no prompt quando tier = T2 (T2-lite). */
export const INSTRUCAO_T2 =
  "[Pergunta composta] Esta pergunta tem mais de um eixo. Decomponha em subconsultas, " +
  "chame as tools necessarias (uma por eixo, pode usar varias) e sintetize UMA resposta " +
  "que cubra todos os eixos pedidos, sem deixar nenhum de fora.";
