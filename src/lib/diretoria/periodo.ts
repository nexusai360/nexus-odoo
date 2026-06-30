/**
 * Resolução de período da Diretoria com os presets do painel HTML do cliente.
 * Próprio (não reusa o `periodo.ts` dos relatórios) para não regredir aquele
 * menu, que só tem 4 presets. `hoje` é sempre injetado (nunca `Date.now()`),
 * para ser testável e determinístico.
 */
export type DiretoriaPeriodoPreset =
  | "hoje"
  | "semana"
  | "este_mes"
  | "ano_atual"
  | "ano_anterior"
  | "ultimos_7"
  | "ultimos_30"
  | "ultimos_90"
  | "tudo"
  | "custom";

export const DIRETORIA_PERIODO_PRESETS: {
  id: DiretoriaPeriodoPreset;
  label: string;
}[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "este_mes", label: "Este mês" },
  { id: "ano_atual", label: "Este ano" },
  { id: "tudo", label: "Tudo" },
  { id: "custom", label: "Personalizado" },
];

// Presets ainda aceitos na URL (compatibilidade), embora não exibidos como pílula.
const PRESETS_OCULTOS: DiretoriaPeriodoPreset[] = [
  "ano_anterior",
  "ultimos_7",
  "ultimos_30",
  "ultimos_90",
];

export interface PeriodoDirParams {
  periodo?: string;
  de?: string;
  ate?: string;
}

export interface PeriodoDirResolvido {
  de: Date;
  ate: Date;
  preset: DiretoriaPeriodoPreset;
}

function diaUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

const PRESETS_VALIDOS = new Set<DiretoriaPeriodoPreset>([
  ...DIRETORIA_PERIODO_PRESETS.map((p) => p.id),
  ...PRESETS_OCULTOS,
]);

export function resolverPeriodoDir(
  params: PeriodoDirParams,
  hoje: Date,
): PeriodoDirResolvido {
  const h = diaUTC(hoje);
  const y = h.getUTCFullYear();
  const m = h.getUTCMonth();

  const candidato = (params.periodo ?? "este_mes") as DiretoriaPeriodoPreset;
  const preset = PRESETS_VALIDOS.has(candidato) ? candidato : "este_mes";

  switch (preset) {
    case "hoje":
      return { de: h, ate: h, preset };
    case "semana": {
      const dow = (h.getUTCDay() + 6) % 7; // 0 = segunda-feira
      const seg = addDias(h, -dow);
      return { de: seg, ate: addDias(seg, 6), preset };
    }
    case "este_mes":
      return {
        de: new Date(Date.UTC(y, m, 1)),
        ate: new Date(Date.UTC(y, m + 1, 0)),
        preset,
      };
    case "ano_atual":
      return {
        de: new Date(Date.UTC(y, 0, 1)),
        ate: new Date(Date.UTC(y, 11, 31)),
        preset,
      };
    case "ano_anterior":
      return {
        de: new Date(Date.UTC(y - 1, 0, 1)),
        ate: new Date(Date.UTC(y - 1, 11, 31)),
        preset,
      };
    case "ultimos_7":
      return { de: addDias(h, -7), ate: h, preset };
    case "ultimos_30":
      return { de: addDias(h, -30), ate: h, preset };
    case "ultimos_90":
      return { de: addDias(h, -90), ate: h, preset };
    case "tudo":
      return { de: new Date(Date.UTC(2000, 0, 1)), ate: h, preset };
    case "custom": {
      const de = params.de ? diaUTC(new Date(params.de)) : h;
      const ate = params.ate ? diaUTC(new Date(params.ate)) : h;
      return { de, ate, preset: "custom" };
    }
    default:
      return {
        de: new Date(Date.UTC(y, m, 1)),
        ate: new Date(Date.UTC(y, m + 1, 0)),
        preset: "este_mes",
      };
  }
}
