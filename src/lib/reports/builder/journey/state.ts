// src/lib/reports/builder/journey/state.ts
// Estado da jornada de construcao + gate de entendimento POR EVIDENCIA da ficha
// (nao por auto-relato do modelo) + transicoes puras de fase. Tudo puro/testavel.
import type { BuilderReportEntry } from "../types";
import type { ReportTemplate } from "@/lib/reports/types";
import { intencaoInicial, type IntencaoColeta } from "./intencao";
import { roteiroDerivado, dimensaoCoberta, NUCLEO } from "./roteiro";
import type { Blueprint } from "../agent/geracao/blueprint-types";

export type FaseJornada = "entrevista" | "refino";

export type Dimensao =
  | "objetivo"
  | "dados"
  | "indicadores"
  | "visualizacao"
  | "filtros"
  | "layout"
  | "periodo";

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
  /** Intencao estruturada coletada no brainstorm (evidencia objetiva do gate). */
  intencao: IntencaoColeta;
  /** Dimensoes em escopo (roteiro): nucleo + opcionais marcadas pela IA. */
  dimensoesRelevantes: Dimensao[];
  /** Ultimo blueprint gerado (reaproveitado no "regenerar" pos-reveal). */
  ultimoBlueprint?: Blueprint;
}

export const TETO_TURNOS = 8;

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
  return {
    fase: "entrevista",
    dimensoesTocadas: dimensoesZeradas(),
    turnosUsuario: 0,
    intencao: intencaoInicial(),
    dimensoesRelevantes: [...NUCLEO],
  };
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
  if (args.journeyState) return backfillCampos(args.journeyState);
  if (args.temSavedReport) return { ...journeyStateInicial(), fase: "refino" };
  return journeyStateInicial();
}

/** Backfill aditivo para journeyState legado (sem intencao/dimensoesRelevantes). */
function backfillCampos(st: JourneyState): JourneyState {
  return {
    ...st,
    intencao: st.intencao ?? intencaoInicial(),
    dimensoesRelevantes: st.dimensoesRelevantes ?? [...NUCLEO],
    dimensoesTocadas: st.dimensoesTocadas ?? dimensoesZeradas(),
    turnosUsuario: st.turnosUsuario ?? 0,
  };
}

/**
 * Gate por EVIDENCIA. Retorna ok=true so quando a ficha rascunho carrega evidencia
 * objetiva das 4 dimensoes do nucleo. `objetivo` e binding: ficha completa em 1
 * turno SEM reflexao de entendimento NAO basta.
 */
/**
 * Gate por EVIDENCIA OBJETIVA: as dimensoes-nucleo precisam estar cobertas pela
 * INTENCAO estruturada (secoes viaveis no catalogo, nao auto-relato do modelo) E o
 * roteiro derivado tem que estar cumprido (todas as dimensoes relevantes cobertas).
 */
export function entendimentoElegivel(s: JourneyState): { ok: boolean; falta?: string } {
  if (!dimensaoCoberta(s, "dados"))
    return { ok: false, falta: "ainda preciso entender qual dado voce quer ver" };
  if (!dimensaoCoberta(s, "visualizacao"))
    return { ok: false, falta: "ainda preciso entender como voce quer visualizar (tabela, grafico)" };
  if (!dimensaoCoberta(s, "indicadores"))
    return { ok: false, falta: "ainda preciso entender quais indicadores mostrar" };
  if (!dimensaoCoberta(s, "objetivo"))
    return { ok: false, falta: "ainda preciso entender melhor o objetivo do relatorio" };
  const r = roteiroDerivado(s);
  if (r.respondidas < r.total)
    return { ok: false, falta: "ainda faltam alguns pontos para eu montar do seu jeito" };
  return { ok: true };
}

/**
 * Marca uma dimensao OPCIONAL (filtros/layout/periodo) como relevante , e onde o
 * roteiro cresce. Congela apos elegivel (nao retrai o botao Gerar) e respeita o
 * teto de 7.
 */
export function marcarDimensaoRelevante(s: JourneyState, d: Dimensao): JourneyState {
  if (podeOferecerGeracao(s)) return s;
  if (s.dimensoesRelevantes.includes(d)) return s;
  // Teto BAIXO (5 = nucleo 4 + 1 opcional): a entrevista tem que ser curta, nao um
  // interrogatorio infinito. Alem disso o brainstorm nao deve inflar o roteiro.
  if (s.dimensoesRelevantes.length >= 5) return s;
  return { ...s, dimensoesRelevantes: [...s.dimensoesRelevantes, d] };
}

export function podeOferecerGeracao(s: JourneyState): boolean {
  return entendimentoElegivel(s).ok;
}

/** entrevista -> refino (apos o Gerar). */
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

