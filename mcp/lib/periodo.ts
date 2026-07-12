/**
 * Helper de periodo: converte nomes canonicos para datas ISO no fuso BR.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A11.
 *
 * CRIT-A v1 (review do plano) endereçado: container roda em UTC; getDate/setDate
 * local nao basta. Sempre que precisar de "dia BR" (-3), usar Intl formatter
 * com timeZone explicito.
 *
 * PISO DA DATA DE INICIO DAS ANALISES (2026-07-12): a saida deste helper alimenta wheres
 * de HISTORICO, entao o inicio e sempre grampeado a data de inicio das analises
 * (AppSetting `sync.corte_dados`, fonte unica em src/lib/corte-dados.ts):
 *
 *   - "ano_corrente" pedia 01/01, que pode ser meses antes do inicio das analises , agora
 *     volta grampeado no corte, com `cortado: true`;
 *   - `periodoDe`/`periodoAte` explicitos tambem sao grampeados;
 *   - sem `periodoNome` e sem par de datas, NAO estoura mais: assume o piso do corte ate
 *     hoje (uma consulta "sem periodo" jamais pode varrer o historico inteiro).
 *
 * Nada e apagado: o clamp so estreita a LEITURA. Quem quiser o periodo pedido "cru" (para
 * dizer ao usuario o que ele pediu) tem `cortado` e o proprio input.
 */

import { clampIsoAoCorte, corteAtual, pedeAntesDoCorte } from "@/lib/corte-dados.js";

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
  periodoDe: string; // YYYY-MM-DD , nunca anterior a data de inicio das analises
  periodoAte: string; // YYYY-MM-DD
  /** true quando o periodo pedido comecava antes do corte e foi grampeado nele. */
  cortado: boolean;
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

/**
 * Grampeia o inicio ao corte e marca `cortado`. Passa por aqui TODA saida do helper , e o
 * unico ponto que garante que nenhum preset (nem um `periodoDe` cru do agente) leve a
 * consulta para antes da data de inicio das analises.
 */
function clampar(periodoDe: string, periodoAte: string): PeriodoResolvido {
  const corte = corteAtual();
  return {
    periodoDe: clampIsoAoCorte(periodoDe, corte),
    periodoAte,
    cortado: pedeAntesDoCorte(periodoDe, corte),
  };
}

export function resolverPeriodo(
  input: ResolverPeriodoInput,
): PeriodoResolvido {
  if (input.periodoDe && input.periodoAte) {
    return clampar(input.periodoDe, input.periodoAte);
  }

  const hoje = input.hoje ?? new Date();

  // Nada informado: em vez de estourar (e antes de qualquer chamador cair na tentacao de
  // consultar "tudo"), assume o piso , da data de inicio das analises ate hoje.
  if (!input.periodoNome) {
    if (input.periodoDe || input.periodoAte) {
      // Par incompleto: fecha o que falta (inicio no corte, fim em hoje) e grampeia.
      return clampar(input.periodoDe ?? corteAtual(), input.periodoAte ?? toIsoDate(hoje));
    }
    return clampar(corteAtual(), toIsoDate(hoje));
  }

  switch (input.periodoNome) {
    case "hoje":
      return clampar(toIsoDate(hoje), toIsoDate(hoje));
    case "amanha": {
      const amanha = addDays(hoje, 1);
      return clampar(toIsoDate(amanha), toIsoDate(amanha));
    }
    case "essa_semana": {
      const seg = startOfWeekISO(hoje);
      const dom = addDays(seg, 6);
      return clampar(toIsoDate(seg), toIsoDate(dom));
    }
    case "semana_passada": {
      const segPassada = addDays(startOfWeekISO(hoje), -7);
      const domPassado = addDays(segPassada, 6);
      return clampar(toIsoDate(segPassada), toIsoDate(domPassado));
    }
    case "mes_corrente":
      return clampar(toIsoDate(startOfMonth(hoje)), toIsoDate(hoje));
    case "mes_anterior":
    case "mes_passado": {
      const { y, m } = partsBR(hoje);
      const refAnt =
        m === 1 ? dateFromBR(y - 1, 12, 15) : dateFromBR(y, m - 1, 15);
      return clampar(
        toIsoDate(startOfMonth(refAnt)),
        toIsoDate(endOfMonth(refAnt)),
      );
    }
    case "ano_corrente": {
      const { y } = partsBR(hoje);
      // 01/01 pode ser meses antes da data de inicio das analises: o clamp resolve e a
      // flag `cortado` deixa a tool avisar o usuario do periodo realmente coberto.
      return clampar(`${y}-01-01`, toIsoDate(hoje));
    }
    default:
      // periodoNome informado mas desconhecido continua sendo erro de programacao/agente.
      throw new Error(
        `resolverPeriodo: periodoNome desconhecido (${String(input.periodoNome)}). Passe periodoDe+periodoAte ou um periodoNome valido.`,
      );
  }
}
