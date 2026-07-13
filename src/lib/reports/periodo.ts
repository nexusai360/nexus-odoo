// src/lib/reports/periodo.ts

import { clampMesAoCorte, corteAtual } from "@/lib/corte-dados";

/** Presets escolhíveis na barra de período. */
export type PeriodoPreset = "mes" | "3meses" | "ano" | "tudo" | "custom";

/** Subconjunto válido como padrão de catálogo , "custom" exige de/ate. */
export type PeriodoPresetPadrao = Exclude<PeriodoPreset, "custom">;

/** Par de meses inclusivo; de/ate null = sem limite (preset "tudo"). */
export interface PeriodoResolvido {
  preset: PeriodoPreset;
  de: string | null;
  ate: string | null;
}

const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MESES_ABREV = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Valida o formato YYYY-MM (mês 01,12). */
export function ehMesValido(s: string): boolean {
  return typeof s === "string" && MES_REGEX.test(s);
}

/** Converte "YYYY-MM" num índice absoluto de mês (ano*12 + mês0). */
function mesParaIndice(m: string): number {
  const [ano, mes] = m.split("-").map(Number);
  return ano * 12 + (mes - 1);
}

/** Converte um índice absoluto de mês de volta para "YYYY-MM". */
function indiceParaMes(i: number): string {
  const ano = Math.floor(i / 12);
  const mes = (i % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** Mês corrente no formato "YYYY-MM", em UTC. */
export function mesCorrente(hoje: Date = new Date()): string {
  return `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Resolve searchParams + padrão do catálogo num período concreto.
 * Aplica todas as regras da spec §"Regras de resolverPeriodo".
 *
 * O início SEMPRE é grampeado ao mês da data de início das análises (`corte`). Sem isso o
 * rótulo da barra mentia: o preset "Ano" nascia em janeiro, o calendário deixava escolher
 * um mês pré-corte, a query grampeava por baixo (o dado saía certo) e a tela continuava
 * anunciando "jan..jul". A janela mostrada tem que ser a janela lida.
 */
export function resolverPeriodo(
  params: { periodo?: string; de?: string; ate?: string },
  padrao: PeriodoPresetPadrao,
  hoje: Date = new Date(),
  corte: string = corteAtual(),
): PeriodoResolvido {
  const corrente = mesCorrente(hoje);
  const idxCorrente = mesParaIndice(corrente);
  // Piso: o mês do corte. O mês entra INTEIRO (o dia é aplicado na query, que também
  // grampeia por `data`), então uma barra de meses não consegue ser mais fina que isso.
  const mesDoCorte = corte.slice(0, 7);
  const idxPiso = mesParaIndice(mesDoCorte);
  const comPiso = (mes: string): string =>
    mesParaIndice(mes) < idxPiso ? mesDoCorte : mes;

  const resolverPreset = (preset: PeriodoPresetPadrao): PeriodoResolvido => {
    if (preset === "mes") return { preset, de: comPiso(corrente), ate: corrente };
    if (preset === "3meses") {
      return { preset, de: comPiso(indiceParaMes(idxCorrente - 2)), ate: corrente };
    }
    if (preset === "ano") {
      return { preset, de: comPiso(`${hoje.getUTCFullYear()}-01`), ate: corrente };
    }
    // "tudo" não é o cache inteiro: é tudo o que a plataforma analisa, ou seja, do corte
    // para cá. O teto continua ABERTO (`ate: null`) de propósito: documento com data futura
    // (vencimento, previsão de entrega) tem que continuar entrando.
    return { preset: "tudo", de: mesDoCorte, ate: null };
  };

  const p = params.periodo;
  if (p === "custom") {
    const { de, ate } = params;
    if (!de || !ate || !ehMesValido(de) || !ehMesValido(ate)) {
      return resolverPreset(padrao);
    }
    let di = mesParaIndice(de);
    let ai = mesParaIndice(ate);
    if (di > ai) [di, ai] = [ai, di];
    if (di > idxCorrente) di = idxCorrente;
    if (ai > idxCorrente) ai = idxCorrente;
    if (di < idxPiso) di = idxPiso;
    if (ai < idxPiso) ai = idxPiso;
    return { preset: "custom", de: indiceParaMes(di), ate: indiceParaMes(ai) };
  }
  if (p === "mes" || p === "3meses" || p === "ano" || p === "tudo") {
    return resolverPreset(p);
  }
  return resolverPreset(padrao);
}

/**
 * Serializa um período num objeto de searchParams. Sempre inclui `periodo`;
 * inclui `de`/`ate` apenas quando `preset === "custom"`.
 */
export function periodoParaParams(p: PeriodoResolvido): Record<string, string> {
  if (p.preset === "custom" && p.de && p.ate) {
    return { periodo: "custom", de: p.de, ate: p.ate };
  }
  return { periodo: p.preset };
}

/** Formata "YYYY-MM" como "mmm/aaaa" (ex.: "mar/2026"). */
function formatarMes(m: string): string {
  const [ano, mes] = m.split("-").map(Number);
  return `${MESES_ABREV[mes - 1]}/${ano}`;
}

/**
 * Rótulo legível de um período: "Tudo" | "mar/2026" | "jan/2026 , mar/2026".
 * Consumido apenas pela pílula "Personalizado" da PeriodBar.
 */
export function rotuloPeriodo(p: PeriodoResolvido): string {
  if (!p.de || !p.ate) return "Tudo";
  if (p.de === p.ate) return formatarMes(p.de);
  return `${formatarMes(p.de)} , ${formatarMes(p.ate)}`;
}
