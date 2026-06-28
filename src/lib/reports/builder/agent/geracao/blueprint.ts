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
import { extrairJson } from "./extrair-json";

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
  const parsed = blueprintRawSchema.parse(extrairJson(raw));

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

  const system = `Voce e um DESIGNER de relatorios de estoque da plataforma Nexus. A partir do que foi coletado numa entrevista, voce PENSA com cuidado (use seu raciocinio) e monta a estrutura de UM relatorio coerente, enxuto e bonito. Devolva SOMENTE um JSON valido (sem texto fora do JSON):
{"titulo": "...", "objetivo": "...", "secoes": [{"template": "KPIRow|BarChart|PieChart|LineChart|DataTable", "fato": "fato_...", "shapeDerivado": "kpis|agregacaoCategorica|serieTemporal|tabela", "config": {"titulo": "...", "recorte": "por armazem|por marca|por familia"}, "justificativa": "por que serve ao objetivo"}], "filtros": {}}

REGRAS DE DESIGN (duras , sao o que separa um relatorio bom de uma salada):
1. ENXUTO: no maximo 5 secoes. Menos e melhor. Cada secao tem que ganhar o seu lugar; se duas dizem quase a mesma coisa, fique com UMA.
2. UMA UNICA faixa de indicadores: no maximo 1 secao "KPIRow", no topo, com KPIs DISTINTOS e nao redundantes (nunca repita o mesmo numero com nomes diferentes, ex.: "Valor Total" e "Valor Imobilizado" iguais).
3. TITULO HONESTO: o titulo de cada secao tem que descrever EXATAMENTE o dado que ela mostra. Se a secao mostra valor por marca, o titulo e "Valor por marca", nunca "Itens com estoque negativo". Titulo que nao bate com o dado e proibido.
4. GRAFICO CERTO: comparacao entre categorias -> BarChart; evolucao no tempo -> LineChart; proporcao de poucas fatias -> PieChart; detalhe item a item -> DataTable. Nao use o mesmo grafico repetido para a mesma metrica.
5. NARRATIVA: panorama (KPIs no topo) -> comparacoes (graficos) -> detalhe (1 tabela no fim, se precisar). No maximo 1 tabela.
6. INTELIGENCIA: priorize o que ajuda a DECIDIR (ex.: estoque negativo e risco no topo). Use SOMENTE fatos e shapes do catalogo abaixo; nunca invente fonte. O que a pessoa pediu mas nao existe no catalogo, simplesmente nao inclua.

Pense antes de responder e entregue a MELHOR versao, nao a maior.

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
