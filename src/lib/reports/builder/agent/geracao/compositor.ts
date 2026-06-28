// src/lib/reports/builder/agent/geracao/compositor.ts
// COMPOSITOR (LLM, 1 chamada): recebe a intencao curada + o catalogo de metricas
// (vocabulario) + a gramatica de blocos, e devolve um PLANO (escolhas dentro da
// gramatica, nunca layout livre). parseCompositor valida com o schema e descarta binds
// com metrica fora do catalogo (-> omitidos, nunca em silencio). As INVARIANTES nao sao
// responsabilidade do prompt: ficam no revisor deterministico (codigo, gratis).
import { z } from "zod";
import type { ChatMessage } from "@/lib/agent/llm/types";
import type { Metrica } from "./metric-catalog";
import { obterMetrica } from "./metric-catalog";
import type { Plano, Bloco } from "./plano-types";
import { blocoSchema } from "./plano-types";
import type { IntencaoCurada } from "../../journey/intencao-curada";
import { extrairJson } from "./extrair-json";

const rawSchema = z.object({
  titulo: z.string(),
  objetivo: z.string().default(""),
  dominio: z.string().optional(),
  blocos: z.array(z.unknown()).default([]),
  filtrosIniciais: z.record(z.string(), z.unknown()).optional(),
});

export function parseCompositor(
  raw: unknown,
  metricas: Metrica[],
): { plano: Plano; omitidos: string[] } {
  return validarPlanoCru(extrairJson(raw), metricas);
}

/** Valida um objeto-plano cru (ja desembrulhado do JSON) contra schema + catalogo. */
export function validarPlanoCru(
  cru: unknown,
  metricas: Metrica[],
): { plano: Plano; omitidos: string[] } {
  const parsed = rawSchema.parse(cru);
  const omitidos: string[] = [];
  const blocos: Bloco[] = [];

  for (const cru of parsed.blocos) {
    const r = blocoSchema.safeParse(cru);
    if (!r.success) {
      omitidos.push(`bloco invalido (${descreverCru(cru)})`);
      continue;
    }
    const bloco = validarContraCatalogo(r.data as Bloco, metricas, omitidos);
    if (bloco) blocos.push(bloco);
  }

  return {
    plano: {
      titulo: parsed.titulo,
      objetivo: parsed.objetivo,
      dominio: parsed.dominio ?? "estoque",
      blocos,
      filtrosIniciais: parsed.filtrosIniciais ?? {},
    },
    omitidos,
  };
}

function validarContraCatalogo(bloco: Bloco, metricas: Metrica[], omitidos: string[]): Bloco | null {
  const existe = (id: string) => !!obterMetrica(metricas, id);
  switch (bloco.tipo) {
    case "KpiStrip": {
      const validas = bloco.metricas.filter((id) => {
        if (existe(id)) return true;
        omitidos.push(`KPI ${id} (fora do catalogo)`);
        return false;
      });
      return validas.length ? { ...bloco, metricas: validas } : null;
    }
    case "Ranking":
    case "Tabela":
      if (existe(bloco.metrica)) return bloco;
      omitidos.push(`${bloco.tipo} ${bloco.metrica} (fora do catalogo)`);
      return null;
    case "TendenciaDistribuicao":
      if (existe(bloco.metricaSerie) && existe(bloco.metricaComposicao)) return bloco;
      omitidos.push(`TendenciaDistribuicao (${bloco.metricaSerie}/${bloco.metricaComposicao} fora do catalogo)`);
      return null;
  }
}

function descreverCru(cru: unknown): string {
  const t = (cru as { tipo?: unknown })?.tipo;
  return typeof t === "string" ? t : "desconhecido";
}

export function promptCompositor(intencao: IntencaoCurada, metricas: Metrica[]): ChatMessage[] {
  const vocabulario = metricas
    .map((m) => `  - ${m.id} (${m.rotulo}): ${m.pergunta} [${m.chartPreferido}${m.temSerieTemporal ? ", temporal" : ""}]`)
    .join("\n");

  const system = `Voce e o COMPOSITOR de relatorios da plataforma Nexus. Voce NAO desenha layout: voce ESCOLHE blocos de uma gramatica fixa e VINCULA cada slot a uma metrica do catalogo. A coerencia visual ja esta garantida por construcao; seu trabalho e escolher as metricas certas para a intencao e a narrativa.

Devolva SOMENTE um JSON valido:
{"titulo": "...", "objetivo": "...", "dominio": "estoque", "blocos": [ ... ], "filtrosIniciais": {}}

Blocos disponiveis (use os ids EXATOS do catalogo):
- {"tipo": "KpiStrip", "metricas": ["id", ...]}  panorama: indicadores escalares (do MESMO fato), no topo.
- {"tipo": "TendenciaDistribuicao", "metricaSerie": "id_temporal", "metricaComposicao": "id_categorico"}  evolucao no tempo + composicao lado a lado. So use metricaSerie que seja TEMPORAL.
- {"tipo": "Ranking", "metrica": "id_categorico", "recorte": "armazem|marca|familia"}  comparacao por categoria.
- {"tipo": "Tabela", "metrica": "id_tabela"}  detalhe item a item.

Principios: escolha as metricas que RESPONDEM a intencao; narrativa panorama -> analise -> detalhe; nao repita a mesma informacao. Se a intencao pede algo fora do catalogo, simplesmente nao inclua.

CATALOGO DE METRICAS:
${vocabulario}`;

  const user = `Dominio: ${intencao.dominio}
Objetivo: ${intencao.objetivo}
Recortes pedidos: ${intencao.recortes.length ? intencao.recortes.join(", ") : "(nenhum especifico)"}
${intencao.janela?.de ? `Janela: ${intencao.janela.de}${intencao.janela.ate ? ` a ${intencao.janela.ate}` : ""}` : ""}

Componha o plano em JSON.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
