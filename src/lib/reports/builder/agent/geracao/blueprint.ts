// src/lib/reports/builder/agent/geracao/blueprint.ts
// FASE 1 do pipeline: monta o blueprint (a "spec" do relatorio) a partir da intencao
// coletada. Saida machine-applicable (args das tools de build), cada secao validada
// por seccaoViavel; o que nao casa o catalogo vai para `omitidos` (VISIVEL no reveal,
// nunca descartado em silencio).
import { z } from "zod";
import type { ChatMessage } from "@/lib/agent/llm/types";
import type { ShapeDerivado } from "../../types";
import { descreverComponente } from "../../component-catalog";
import { seccaoViavel } from "../../journey/viabilidade";
import { capabilityComoTextoPrompt } from "../../capabilities";
import type { Blueprint, BlueprintSecao } from "./blueprint-types";
import type { EntradaGeracao } from "./types";

const blueprintSecaoRawSchema = z.object({
  template: z.string(),
  fato: z.string(),
  shapeDerivado: z.string().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  justificativa: z.string().optional(),
});

const blueprintRawSchema = z.object({
  titulo: z.string(),
  objetivo: z.string(),
  secoes: z.array(blueprintSecaoRawSchema),
  filtros: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Valida o JSON do modelo e separa as secoes VIAVEIS (entram na ficha) das
 * inviaveis (vao para `omitidos`, com motivo legivel). Lanca se o JSON nao casar o
 * schema basico (titulo/objetivo/secoes).
 */
export function parseBlueprint(raw: unknown): { blueprint: Blueprint; omitidos: string[] } {
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  const parsed = blueprintRawSchema.parse(obj);

  const secoes: BlueprintSecao[] = [];
  const omitidos: string[] = [];

  for (const s of parsed.secoes) {
    const componente = descreverComponente(s.template);
    const shape = (s.shapeDerivado ?? componente?.shapeDerivadoExigido) as ShapeDerivado | undefined;
    const v = seccaoViavel({
      fato: s.fato,
      shapeDerivado: shape,
      template: s.template as BlueprintSecao["template"],
    });
    if (!v.ok || !shape) {
      omitidos.push(`${s.template} sobre ${s.fato} (${!v.ok ? v.motivo : "shape_indefinido"})`);
      continue;
    }
    secoes.push({
      template: s.template as BlueprintSecao["template"],
      fato: s.fato,
      shapeDerivado: shape,
      config: s.config,
      justificativa: s.justificativa,
    });
  }

  return {
    blueprint: { titulo: parsed.titulo, objetivo: parsed.objetivo, secoes, filtros: parsed.filtros },
    omitidos,
  };
}

/** Monta as mensagens da fase blueprint (system + user com a intencao + catalogo). */
export function promptBlueprint(entrada: EntradaGeracao): ChatMessage[] {
  const intencaoTxt = entrada.intencao.secoes
    .map((s, i) => `  ${i + 1}. ${s.template} sobre ${s.fato}${s.recorte ? ` (${s.recorte})` : ""}${s.rotulo ? ` , "${s.rotulo}"` : ""}`)
    .join("\n");

  const system = `Voce monta a ESTRUTURA de um relatorio de estoque da plataforma Nexus a partir do que foi coletado numa entrevista. Devolva SOMENTE um JSON valido (sem texto fora do JSON) com o formato:
{"titulo": "...", "objetivo": "...", "secoes": [{"template": "KPIRow|BarChart|PieChart|LineChart|DataTable", "fato": "fato_...", "shapeDerivado": "kpis|agregacaoCategorica|serieTemporal|tabela", "config": { "titulo": "..." }, "justificativa": "por que esta secao serve ao objetivo"}], "filtros": {}}

Regras: use SOMENTE fatos e shapes do catalogo abaixo; escolha o template certo para cada metrica; de a cada secao um titulo claro em portugues; conte uma narrativa (panorama -> comparacao -> detalhe). Nao invente fatos fora do catalogo.

${capabilityComoTextoPrompt()}`;

  const user = `Objetivo entendido: ${entrada.entendimento}

Secoes que a pessoa quer (intencao coletada):
${intencaoTxt || "  (nenhuma secao explicita; derive do objetivo)"}
${entrada.ajuste ? `\nAjuste pedido agora: ${entrada.ajuste}` : ""}

Monte o blueprint completo em JSON.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
