// src/lib/reports/builder/agent/geracao/critico.ts
// CRITICO SEMANTICO (LLM, 1 chamada): faz SO o juizo que codigo nao faz. NAO re-checa
// invariante (isso e do revisor deterministico, gratis): avalia se o conjunto de
// metricas RESPONDE a intencao, se a metrica escolhida e a resposta certa para a
// pergunta, se a narrativa tem sentido para um humano, e se falta o recorte pedido.
// Recebe uma amostra real do dado para julgar com base na realidade, nao so na forma.
import { z } from "zod";
import type { ChatMessage } from "@/lib/agent/llm/types";
import type { Metrica } from "./metric-catalog";
import type { Plano } from "./plano-types";
import { validarPlanoCru } from "./compositor";
import type { AmostraMetrica } from "./amostra";
import type { IntencaoCurada } from "../../journey/intencao-curada";
import { extrairJson } from "./extrair-json";

const rawSchema = z.object({
  justificativa: z.string().default(""),
  plano: z.unknown(),
});

export function parseCritico(
  raw: unknown,
  metricas: Metrica[],
): { plano: Plano; justificativa: string } {
  const parsed = rawSchema.parse(extrairJson(raw));
  const { plano } = validarPlanoCru(parsed.plano, metricas);
  return { plano, justificativa: parsed.justificativa };
}

export function promptCritico(
  intencao: IntencaoCurada,
  plano: Plano,
  amostra: AmostraMetrica[],
): ChatMessage[] {
  const amostraTxt = amostra
    .map((a) => {
      const partes: string[] = [];
      if (a.escalar !== undefined) partes.push(`valor=${a.escalar}`);
      if (a.cardinalidade !== undefined) partes.push(`categorias=${a.cardinalidade}`);
      if (a.nPontosSerie !== undefined) partes.push(`pontos_serie=${a.nPontosSerie}`);
      return `  - ${a.metricaId}: ${partes.join(", ") || "(sem amostra)"}`;
    })
    .join("\n");

  const system = `Voce e o CRITICO SEMANTICO de um relatorio. Seu unico trabalho e o JUIZO que codigo nao faz: este plano RESPONDE a intencao do usuario? As metricas escolhidas sao a resposta certa para a pergunta? A narrativa faz sentido para um humano? Falta algum recorte que a pessoa pediu?

Voce NAO reformata, NAO reordena, NAO conta blocos, NAO checa duplicata: isso e feito por outra etapa automatica. Voce so melhora a ESCOLHA das metricas e a coerencia com a intencao.

Devolva SOMENTE um JSON:
{"justificativa": "o que voce avaliou e por que mudou (ou manteve)", "plano": { ...o plano, com os mesmos tipos de bloco, eventualmente com metricas trocadas... }}

Use SOMENTE ids de metrica que apareceram no plano recebido ou na amostra.`;

  const user = `Intencao do usuario:
  dominio: ${intencao.dominio}
  objetivo: ${intencao.objetivo}
  recortes pedidos: ${intencao.recortes.length ? intencao.recortes.join(", ") : "(nenhum)"}

Plano proposto:
${JSON.stringify(plano, null, 2)}

Amostra real do dado (para julgar com base na realidade):
${amostraTxt || "  (sem amostra)"}

Avalie e devolva o JSON.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
