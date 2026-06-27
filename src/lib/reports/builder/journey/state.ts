// src/lib/reports/builder/journey/state.ts
// Estado da jornada de construcao + gate de entendimento POR EVIDENCIA da ficha
// (nao por auto-relato do modelo) + transicoes puras de fase. Tudo puro/testavel.
import { obterContrato } from "../source-registry";
import type { BuilderReportEntry } from "../types";
import type { ReportTemplate } from "@/lib/reports/types";

export type FaseJornada = "entrevista" | "resumo" | "refino";

export type Dimensao =
  | "objetivo"
  | "dados"
  | "indicadores"
  | "visualizacao"
  | "filtros"
  | "layout"
  | "periodo";

export interface ResumoJornada {
  itens: { dimensao: Dimensao; texto: string }[];
}

export interface JourneyState {
  fase: FaseJornada;
  /** Ficha em construcao ANTES do Gerar (nao vira SavedReport abrivel ainda). */
  fichaRascunho?: BuilderReportEntry;
  /** Reflexo de entendimento em linguagem natural mostrado ao usuario. */
  entendimento?: string;
  /** Checklist invisivel: dimensoes que a IA ja tocou (so para a UX/prompt). */
  dimensoesTocadas: Record<Dimensao, boolean>;
  /** Numero de turnos de usuario com conteudo (piso anti-pressa). */
  turnosUsuario: number;
  /** O usuario declarou que NAO quer KPIs (dispensa o KPIRow no gate). */
  semKpiDeclarado?: boolean;
  /** Snapshot estruturado montado na fase resumo. */
  resumo?: ResumoJornada;
}

export const TETO_TURNOS = 8;

/** Templates renderaveis que contam como "visualizacao" (NAO inclui KPIRow). */
const TEMPLATES_VISUALIZACAO: ReadonlySet<ReportTemplate> = new Set([
  "BarChart",
  "PieChart",
  "LineChart",
  "DataTable",
]);

const DIMENSOES: Dimensao[] = [
  "objetivo",
  "dados",
  "indicadores",
  "visualizacao",
  "filtros",
  "layout",
  "periodo",
];

function dimensoesZeradas(): Record<Dimensao, boolean> {
  return DIMENSOES.reduce(
    (acc, d) => ((acc[d] = false), acc),
    {} as Record<Dimensao, boolean>,
  );
}

export function journeyStateInicial(): JourneyState {
  return { fase: "entrevista", dimensoesTocadas: dimensoesZeradas(), turnosUsuario: 0 };
}

/**
 * Default de fase ao carregar uma conversa. journeyState existente e respeitado.
 * Legado (conversa com SavedReport linkado mas SEM journeyState) cai em "refino"
 * para nao jogar um relatorio pronto na entrevista.
 */
export function defaultParaConversa(args: {
  temSavedReport: boolean;
  journeyState?: JourneyState | null;
}): JourneyState {
  if (args.journeyState) return args.journeyState;
  if (args.temSavedReport) return { ...journeyStateInicial(), fase: "refino" };
  return journeyStateInicial();
}

/**
 * Gate por EVIDENCIA. Retorna ok=true so quando a ficha rascunho carrega evidencia
 * objetiva das 4 dimensoes do nucleo. `objetivo` e binding: ficha completa em 1
 * turno SEM reflexao de entendimento NAO basta.
 */
export function entendimentoElegivel(s: JourneyState): { ok: boolean; falta?: string } {
  const secoes = s.fichaRascunho?.secoes ?? [];
  const dados = secoes.some((sec) => obterContrato(sec.fato) !== undefined);
  const visualizacao = secoes.some((sec) => TEMPLATES_VISUALIZACAO.has(sec.template));
  const indicadores = secoes.some((sec) => sec.template === "KPIRow") || s.semKpiDeclarado === true;
  const temEntendimento = !!s.entendimento && s.entendimento.trim().length >= 20;
  const objetivo = s.turnosUsuario >= 2 || temEntendimento;

  if (!dados) return { ok: false, falta: "ainda preciso entender qual dado voce quer ver" };
  if (!visualizacao) return { ok: false, falta: "ainda preciso entender como voce quer visualizar (tabela, grafico)" };
  if (!indicadores) return { ok: false, falta: "ainda preciso entender quais indicadores mostrar" };
  if (!objetivo) return { ok: false, falta: "ainda preciso entender melhor o objetivo do relatorio" };
  return { ok: true };
}

export function podeOferecerGeracao(s: JourneyState): boolean {
  return entendimentoElegivel(s).ok;
}

/** entrevista -> resumo (so com elegibilidade). */
export function irParaResumo(s: JourneyState): JourneyState | { erro: string } {
  const e = entendimentoElegivel(s);
  if (!e.ok) return { erro: e.falta ?? "ainda_sem_evidencia" };
  return { ...s, fase: "resumo" };
}

/** resumo -> entrevista (usuario quer ajustar algo). */
export function voltarParaEntrevista(s: JourneyState): JourneyState {
  return { ...s, fase: "entrevista" };
}

/** resumo -> refino (apos o Gerar). */
export function irParaRefino(s: JourneyState): JourneyState {
  return { ...s, fase: "refino" };
}
