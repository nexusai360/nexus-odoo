// Helpers PUROS de datetime — sem dependências de DB ou Node-only.
// Pode ser importado por Client Components, Server Components, libs.
//
// A versão server-side completa (com leitura de settings da plataforma)
// vive em `@/lib/datetime`, que re-exporta este módulo.

import {
  startOfDay,
  endOfDay,
  startOfMonth,
  startOfWeek,
  addDays,
  addMonths,
  addWeeks,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export type PeriodKey =
  | "hoje"
  | "semana_atual"
  | "mes_atual"
  | "todos"
  | "custom";

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface CustomRangeInput {
  start: Date;
  end: Date;
}

export const DEFAULT_TZ = "America/Sao_Paulo";
export const DEFAULT_LOCALE = "pt-BR";

// ---------------------------------------------------------------------------
// Helper canônico v0.42 — fonte única da verdade para cálculo de período.
// ---------------------------------------------------------------------------
//
// Regra suprema do projeto (definida pelo usuário):
//   "começa na segunda e termina no domingo, sempre"
//
// → semana é ISO week (segunda → próxima segunda, end-exclusive).
//   `weekStartsOn: 1` é HARDCODED. Não é configurável.
//
// → mês é mês civil (dia 1 → dia 1 do mês seguinte, end-exclusive).
//
// → "rolling" (now-7d..now etc.) NÃO existe mais. Settings legados
//   `dashboard.week_mode` e `dashboard.month_mode` são deprecados em v0.42
//   e ignorados pelo helper.
//
// Convenção de end: TODO `end` é EXCLUSIVE (próximo 00:00 BRT). Para SQL com
// `column >= start AND column < end`. Não usamos mais `endOfDay(...)` (que
// retorna 23:59:59.999) porque cria off-by-1ms entre prev/current.

export type CanonicalPeriodLabel =
  | "hoje"
  | "semana"
  | "mes"
  | "todos"
  | "custom";

export interface CanonicalPeriod {
  /** UTC, inclusive */
  start: Date;
  /** UTC, EXCLUSIVE (próximo 00:00 BRT) */
  end: Date;
  /** Período de mesma duração imediatamente anterior. `prev.end === start`. */
  prev: { start: Date; end: Date };
}

export interface CanonicalPeriodInput {
  label: CanonicalPeriodLabel;
  tz: string;
  /** ISO string. Default = `new Date()`. */
  refIso?: string;
  /** Apenas para `label: "custom"`. Formato YYYY-MM-DD. */
  customStart?: string;
  /** Apenas para `label: "custom"`. Formato YYYY-MM-DD (inclusive). */
  customEnd?: string;
  /**
   * Dia de início da semana (0=domingo … 6=sábado). Default = 1 (segunda).
   * Lido de `app_settings.dashboard.week_starts_on`.
   */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Calcula o período canônico (start, end, prev) em UTC.
 *
 * @example
 * ```ts
 * const r = getCanonicalPeriod({ label: "semana", tz: "America/Sao_Paulo" });
 * // r.start = segunda 00:00 BRT (UTC = 03:00)
 * // r.end   = próxima segunda 00:00 BRT (UTC = 03:00)
 * ```
 */
export function getCanonicalPeriod(args: CanonicalPeriodInput): CanonicalPeriod {
  const { label, tz } = args;
  const ref = args.refIso ? new Date(args.refIso) : new Date();
  const refInTz = toZonedTime(ref, tz);

  let start: Date;
  let end: Date;

  switch (label) {
    case "hoje": {
      const startLocal = startOfDay(refInTz);
      const nextDayLocal = addDays(startLocal, 1);
      start = fromZonedTime(startLocal, tz);
      end = fromZonedTime(nextDayLocal, tz);
      break;
    }

    case "semana": {
      const wso = (args.weekStartsOn ?? 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const startLocal = startOfWeek(refInTz, { weekStartsOn: wso });
      const nextWeekLocal = addWeeks(startLocal, 1);
      start = fromZonedTime(startLocal, tz);
      end = fromZonedTime(nextWeekLocal, tz);
      break;
    }

    case "mes": {
      const startLocal = startOfMonth(refInTz);
      const nextMonthLocal = addMonths(startLocal, 1);
      start = fromZonedTime(startLocal, tz);
      end = fromZonedTime(nextMonthLocal, tz);
      break;
    }

    case "todos": {
      start = new Date(0);
      end = new Date();
      break;
    }

    case "custom": {
      if (!args.customStart || !args.customEnd) {
        throw new Error(
          'getCanonicalPeriod: "custom" requer customStart e customEnd (YYYY-MM-DD)',
        );
      }
      // Parse YYYY-MM-DD em civil-day no tz.
      // `new Date("2026-04-15T00:00:00Z")` é UTC midnight; em BRT (UTC-3)
      // representa 21:00 do dia anterior. Para tratar como "15 de abril BRT",
      // extraímos Y/M/D em UTC e construímos local.
      const startUtc = new Date(args.customStart + "T00:00:00.000Z");
      const endUtc = new Date(args.customEnd + "T00:00:00.000Z");
      const startCivil = new Date(
        startUtc.getUTCFullYear(),
        startUtc.getUTCMonth(),
        startUtc.getUTCDate(),
      );
      const endCivilInclusive = new Date(
        endUtc.getUTCFullYear(),
        endUtc.getUTCMonth(),
        endUtc.getUTCDate(),
      );
      // end-exclusive: 00:00 BRT do dia seguinte ao último dia inclusive.
      const endCivilExclusive = addDays(endCivilInclusive, 1);
      start = fromZonedTime(startCivil, tz);
      end = fromZonedTime(endCivilExclusive, tz);
      break;
    }

    default: {
      const _exhaustive: never = label;
      throw new Error(
        `getCanonicalPeriod: label desconhecido "${String(_exhaustive)}"`,
      );
    }
  }

  const span = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime());
  const prevStart = new Date(start.getTime() - span);

  return { start, end, prev: { start: prevStart, end: prevEnd } };
}

// ---------------------------------------------------------------------------
// `getPeriodInTz` — wrapper legado (compat). Usa `getCanonicalPeriod` por baixo.
// ---------------------------------------------------------------------------

/**
 * Calcula o intervalo (em UTC) correspondente ao "dia/semana/mês" no
 * timezone informado.
 *
 * Para `semana_atual` é ISO week (segunda-feira) — REGRA CANÔNICA v0.42:
 * sempre segunda → próxima segunda, sem `rolling`.
 *
 * @deprecated em favor de `getCanonicalPeriod`. Mantido para compat.
 */
export function getPeriodInTz(
  key: PeriodKey,
  tz: string,
  customRange?: CustomRangeInput,
): PeriodRange {
  switch (key) {
    case "hoje": {
      const r = getCanonicalPeriod({ label: "hoje", tz });
      return { start: r.start, end: r.end };
    }
    case "semana_atual": {
      const r = getCanonicalPeriod({ label: "semana", tz });
      return { start: r.start, end: r.end };
    }
    case "mes_atual": {
      const r = getCanonicalPeriod({ label: "mes", tz });
      return { start: r.start, end: r.end };
    }
    case "todos": {
      const r = getCanonicalPeriod({ label: "todos", tz });
      return { start: r.start, end: r.end };
    }
    case "custom": {
      if (!customRange) {
        throw new Error(
          'getPeriodInTz: customRange é obrigatório para key="custom"',
        );
      }
      // Compat: getPeriodInTz herdou semântica de "endOfDay no tz" para
      // o end (23:59:59.999), enquanto getCanonicalPeriod usa end-exclusive
      // (próximo 00:00 BRT). Para não quebrar callers que dependem do .999,
      // mantemos a forma antiga aqui e delegamos a normalização ao caller.
      const startLocal = startOfDay(
        new Date(
          customRange.start.getUTCFullYear(),
          customRange.start.getUTCMonth(),
          customRange.start.getUTCDate(),
        ),
      );
      const endLocal = endOfDay(
        new Date(
          customRange.end.getUTCFullYear(),
          customRange.end.getUTCMonth(),
          customRange.end.getUTCDate(),
        ),
      );
      return {
        start: fromZonedTime(startLocal, tz),
        end: fromZonedTime(endLocal, tz),
      };
    }
    default: {
      const _exhaustive: never = key;
      throw new Error(`getPeriodInTz: chave desconhecida "${String(_exhaustive)}"`);
    }
  }
}

export function addDaysInTz(date: Date, tz: string, days: number): Date {
  const inTz = toZonedTime(date, tz);
  const moved = addDays(inTz, days);
  return fromZonedTime(moved, tz);
}

export function formatDateInTz(
  d: Date,
  tz: string,
  locale: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...opts,
  });
  return fmt.format(d);
}

export function formatDateTimeInTz(
  d: Date,
  tz: string,
  locale: string,
): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(d);
}

export function formatRelativeTimeInTz(d: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const diffMs = d.getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtf.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtf.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, "month");
  const diffYear = Math.round(diffMonth / 12);
  return rtf.format(diffYear, "year");
}
