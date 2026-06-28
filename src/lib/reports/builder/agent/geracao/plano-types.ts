// src/lib/reports/builder/agent/geracao/plano-types.ts
// A GRAMATICA: um Plano e uma sequencia ordenada de BLOCOS de um catalogo fechado.
// O compositor (LLM) so emite escolhas dentro desta gramatica (metrica -> slot); nunca
// layout livre. O bloco composto "TendenciaDistribuicao" vira 2 secoes irmas no build
// (LineChart + PieChart com grupoId), nao um novo ReportTemplate.
import { z } from "zod";

export type PapelBloco = "panorama" | "analise" | "detalhe";

export interface BlocoKpi {
  tipo: "KpiStrip";
  metricas: string[];
}
export interface BlocoTendencia {
  tipo: "TendenciaDistribuicao";
  metricaSerie: string;
  metricaComposicao: string;
}
export interface BlocoRanking {
  tipo: "Ranking";
  metrica: string;
  recorte: string;
}
export interface BlocoTabela {
  tipo: "Tabela";
  metrica: string;
}
export type Bloco = BlocoKpi | BlocoTendencia | BlocoRanking | BlocoTabela;

export interface Plano {
  titulo: string;
  objetivo: string;
  dominio: string;
  blocos: Bloco[];
  filtrosIniciais: Record<string, unknown>;
}

const blocoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("KpiStrip"), metricas: z.array(z.string()).min(1) }),
  z.object({
    tipo: z.literal("TendenciaDistribuicao"),
    metricaSerie: z.string(),
    metricaComposicao: z.string(),
  }),
  z.object({ tipo: z.literal("Ranking"), metrica: z.string(), recorte: z.string() }),
  z.object({ tipo: z.literal("Tabela"), metrica: z.string() }),
]);

export const planoSchema: z.ZodType<Plano> = z.object({
  titulo: z.string().min(1),
  objetivo: z.string(),
  dominio: z.string().min(1),
  blocos: z.array(blocoSchema),
  filtrosIniciais: z.record(z.string(), z.unknown()),
}) as z.ZodType<Plano>;

export function papelDoBloco(b: Bloco): PapelBloco {
  switch (b.tipo) {
    case "KpiStrip":
      return "panorama";
    case "TendenciaDistribuicao":
    case "Ranking":
      return "analise";
    case "Tabela":
      return "detalhe";
  }
}
