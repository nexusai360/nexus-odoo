/**
 * Helper de periodo: converte nomes canonicos para datas ISO no fuso BR.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A11.
 *
 * CRIT-A v1 (review do plano) endereçado: container roda em UTC; getDate/setDate
 * local nao basta. Sempre que precisar de "dia BR" (-3), usar Intl formatter
 * com timeZone explicito.
 */

export type PeriodoNome =
  | "hoje"
  | "amanha"
  | "essa_semana"
  | "semana_passada"
  | "mes_corrente"
  | "mes_anterior"
  | "mes_passado"
  | "ano_corrente";

export interface PeriodoResolvido {
  periodoDe: string; // YYYY-MM-DD
  periodoAte: string; // YYYY-MM-DD
}

export interface ResolverPeriodoInput {
  periodoNome?: PeriodoNome;
  periodoDe?: string;
  periodoAte?: string;
  /** Permite teste deterministico. Em producao, default = new Date(). */
  hoje?: Date;
}

const TZ_BR = "America/Sao_Paulo";

// Formatters cacheados (HIGH-epsilon v2: evita realocacao em loops).
const FMT_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_BR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toIsoDate(d: Date): string {
  // en-CA produz YYYY-MM-DD nativamente.
  return FMT_ISO.format(d);
}

function partsBR(d: Date): { y: number; m: number; day: number } {
  const [y, m, day] = FMT_ISO.format(d).split("-").map(Number);
  return { y: y as number, m: m as number, day: day as number };
}

function dateFromBR(y: number, m: number, day: number): Date {
  // Constroi Date em UTC representando 12:00 BR (15:00 UTC) daquele dia.
  // Usa Date.UTC numerico para tolerar day fora do range (0, 32, etc).
  // Date.UTC normaliza: Date.UTC(2026, 4, 0) -> 30/04 (mes 0-indexed).
  return new Date(Date.UTC(y, m - 1, day, 15, 0, 0));
}

function addDays(base: Date, n: number): Date {
  const { y, m, day } = partsBR(base);
  return dateFromBR(y, m, day + n);
}

function startOfWeekISO(d: Date): Date {
  // ISO 8601 / padrao BR: semana comeca na segunda.
  const { y, m, day } = partsBR(d);
  const local = dateFromBR(y, m, day);
  // local representa 12:00 BR = 15:00 UTC do mesmo dia BR.
  // getUTCDay e seguro porque nao ha virada de dia.
  const dow = local.getUTCDay(); // 0=dom..6=sab
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(local, diff);
}

function startOfMonth(d: Date): Date {
  const { y, m } = partsBR(d);
  return dateFromBR(y, m, 1);
}

function endOfMonth(d: Date): Date {
  const { y, m } = partsBR(d);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return addDays(dateFromBR(next.y, next.m, 1), -1);
}

export function resolverPeriodo(
  input: ResolverPeriodoInput,
): PeriodoResolvido {
  if (input.periodoDe && input.periodoAte) {
    return { periodoDe: input.periodoDe, periodoAte: input.periodoAte };
  }

  const hoje = input.hoje ?? new Date();

  switch (input.periodoNome) {
    case "hoje":
      return { periodoDe: toIsoDate(hoje), periodoAte: toIsoDate(hoje) };
    case "amanha": {
      const amanha = addDays(hoje, 1);
      return { periodoDe: toIsoDate(amanha), periodoAte: toIsoDate(amanha) };
    }
    case "essa_semana": {
      const seg = startOfWeekISO(hoje);
      const dom = addDays(seg, 6);
      return { periodoDe: toIsoDate(seg), periodoAte: toIsoDate(dom) };
    }
    case "semana_passada": {
      const segPassada = addDays(startOfWeekISO(hoje), -7);
      const domPassado = addDays(segPassada, 6);
      return {
        periodoDe: toIsoDate(segPassada),
        periodoAte: toIsoDate(domPassado),
      };
    }
    case "mes_corrente":
      return {
        periodoDe: toIsoDate(startOfMonth(hoje)),
        periodoAte: toIsoDate(hoje),
      };
    case "mes_anterior":
    case "mes_passado": {
      const { y, m } = partsBR(hoje);
      const refAnt =
        m === 1 ? dateFromBR(y - 1, 12, 15) : dateFromBR(y, m - 1, 15);
      return {
        periodoDe: toIsoDate(startOfMonth(refAnt)),
        periodoAte: toIsoDate(endOfMonth(refAnt)),
      };
    }
    case "ano_corrente": {
      const { y } = partsBR(hoje);
      return {
        periodoDe: `${y}-01-01`,
        periodoAte: toIsoDate(hoje),
      };
    }
    default:
      throw new Error(
        `resolverPeriodo: periodoNome ausente ou desconhecido (${String(input.periodoNome)}). Passe periodoDe+periodoAte ou um periodoNome valido.`,
      );
  }
}
