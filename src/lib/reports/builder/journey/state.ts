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

// ---------------------------------------------------------------------------
// Handlers das tools de jornada (puros; mutam o JourneyState, nao a ficha).
// ---------------------------------------------------------------------------

/** Card de opcao oferecido ao usuario (thumbnail). */
export interface OpcaoCard {
  id: string;
  rotulo: string;
  descricao?: string;
  /** Template ilustrado (valida contra TEMPLATES_ONDA1); opcional. */
  tipoVisual?: ReportTemplate;
}

const TEMPLATES_VALIDOS: ReadonlySet<ReportTemplate> = new Set([
  "KPIRow",
  "BarChart",
  "PieChart",
  "LineChart",
  "DataTable",
]);

/** Define o reflexo de entendimento e marca as dimensoes tocadas. */
export function atualizarEntendimento(
  s: JourneyState,
  args: { texto: string; dimensoes?: Dimensao[] },
): { journeyState: JourneyState } | { erro: string } {
  const texto = args.texto?.trim();
  if (!texto) return { erro: "texto_vazio" };
  const dimensoesTocadas = { ...s.dimensoesTocadas };
  for (const d of args.dimensoes ?? []) {
    if (d in dimensoesTocadas) dimensoesTocadas[d] = true;
  }
  return { journeyState: { ...s, entendimento: texto, dimensoesTocadas } };
}

/** Valida e devolve as opcoes oferecidas (descarta tipoVisual invalido). */
export function oferecerOpcoes(args: {
  titulo: string;
  opcoes: OpcaoCard[];
}): { titulo: string; opcoes: OpcaoCard[] } | { erro: string } {
  const titulo = args.titulo?.trim();
  if (!titulo) return { erro: "titulo_vazio" };
  const opcoes = (args.opcoes ?? [])
    .filter((o) => o && o.id && o.rotulo)
    .map((o) => {
      const tipoVisual = o.tipoVisual && TEMPLATES_VALIDOS.has(o.tipoVisual) ? o.tipoVisual : undefined;
      return { id: o.id, rotulo: o.rotulo, descricao: o.descricao, tipoVisual };
    });
  if (opcoes.length === 0) return { erro: "sem_opcoes_validas" };
  return { titulo, opcoes };
}

/** A IA sinaliza que da para gerar. So aceita com elegibilidade por evidencia. */
export function oferecerGeracao(
  s: JourneyState,
): { journeyState: JourneyState } | { erro: "ainda_sem_evidencia"; falta?: string } {
  const r = irParaResumo(s);
  if ("erro" in r) return { erro: "ainda_sem_evidencia", falta: r.erro };
  return { journeyState: r };
}

/** Monta o resumo estruturado (so com elegibilidade), lendo ficha + entendimento. */
export function montarResumo(
  s: JourneyState,
): { journeyState: JourneyState } | { erro: string } {
  const e = entendimentoElegivel(s);
  if (!e.ok) return { erro: e.falta ?? "ainda_sem_evidencia" };
  const ficha = s.fichaRascunho;
  const itens: ResumoJornada["itens"] = [];
  if (s.entendimento) itens.push({ dimensao: "objetivo", texto: s.entendimento });
  for (const sec of ficha?.secoes ?? []) {
    const titulo = typeof sec.config?.titulo === "string" ? sec.config.titulo : sec.template;
    const dimensao: Dimensao = sec.template === "KPIRow" ? "indicadores" : "visualizacao";
    itens.push({ dimensao, texto: `${titulo} (${sec.template}) sobre ${sec.fato}` });
  }
  return { journeyState: { ...s, resumo: { itens } } };
}
