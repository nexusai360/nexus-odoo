// src/lib/reports/builder/agent/geracao/revisar.ts
// FASE 2 do pipeline: auto-critica ADVERSARIAL do blueprint nas 4 dimensoes de
// qualidade (completude, visual certo, narrativa, insight). Devolve um blueprint
// corrigido OU "sem reparos" , mas sem confiar cegamente: "sem reparos" so vale com
// notas justificando, senao mantemos o anterior (a critica e melhoria, nao bloqueio).
import { z } from "zod";
import type { ChatMessage } from "@/lib/agent/llm/types";
import type { Blueprint } from "./blueprint-types";
import { parseBlueprint } from "./blueprint";
import { extrairJson } from "./extrair-json";

const revisaoRawSchema = z.object({
  semReparos: z.boolean().optional(),
  notas: z.array(z.string()).default([]),
  titulo: z.string().optional(),
  objetivo: z.string().optional(),
  secoes: z.array(z.unknown()).optional(),
  filtros: z.record(z.string(), z.unknown()).optional(),
});

export function parseRevisao(
  raw: unknown,
  blueprintAnterior: Blueprint,
): { blueprint: Blueprint; semReparos: boolean; notas: string[] } {
  const parsed = revisaoRawSchema.parse(extrairJson(raw));

  // "Sem reparos" (ou sem secoes corrigidas) -> mantem o anterior. Nao confiamos
  // cegamente: a falta de notas e so registrada, nunca degrada o que ja temos.
  if (parsed.semReparos || !parsed.secoes || !parsed.titulo || !parsed.objetivo) {
    return { blueprint: blueprintAnterior, semReparos: true, notas: parsed.notas };
  }

  // Blueprint corrigido: revalida pelo mesmo parser (machine-applicable + viavel).
  const { blueprint } = parseBlueprint({
    titulo: parsed.titulo,
    objetivo: parsed.objetivo,
    secoes: parsed.secoes,
    filtros: parsed.filtros,
  });
  return { blueprint, semReparos: false, notas: parsed.notas };
}

/** Mensagens da fase de revisao: critica adversarial pelas 4 dimensoes. */
export function promptRevisao(blueprint: Blueprint): ChatMessage[] {
  const system = `Voce REVISA criticamente a estrutura de um relatorio de estoque (o blueprint abaixo), cacando o que esta fraco em 4 dimensoes:
- COMPLETUDE: falta alguma secao/metrica importante para o objetivo?
- VISUAL CERTO: o template de cada secao e o melhor para aquela metrica (ex.: comparacao por categoria pede barras, nao pizza com muitas fatias)?
- NARRATIVA: a ordem conta uma historia (panorama -> comparacao -> detalhe)? Ha hierarquia?
- INSIGHT: da para deixar mais inteligente (destacar estoque negativo no topo, KPI util, recorte que ajuda a decidir)?

Devolva SOMENTE JSON. Se houver melhorias, devolva o blueprint CORRIGIDO no mesmo formato { "titulo", "objetivo", "secoes":[{template,fato,shapeDerivado,config,justificativa}], "filtros" } mais um campo "notas":["o que mudou e por que, por dimensao"]. Se realmente nao houver nada a melhorar, devolva {"semReparos": true, "notas":["justifique por dimensao por que ja esta bom"]}. Use SOMENTE fatos/shapes que ja estao no blueprint (nao invente fonte nova).`;

  const user = `Blueprint atual:\n${JSON.stringify(blueprint, null, 2)}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
