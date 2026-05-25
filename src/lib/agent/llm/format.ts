/**
 * Formatadores de moeda e duração da tela de consumo do Agente Nex.
 *
 * Portado do nexus-insights (`lib/llm/format.ts` + `formatDuration` de
 * `lib/format/date.ts`).
 */

/** Moeda BRL com 4 casas decimais; "," para valor nulo/inválido. */
export function formatBrl4(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ",";
  const rounded = Math.round(v * 1e4) / 1e4;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rounded);
}

/** Moeda USD com 4 casas decimais; "," para valor nulo/inválido. */
export function formatUsd4(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ",";
  const rounded = Math.round(v * 1e4) / 1e4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rounded);
}

/** Contagem inteira em pt-BR; compacta com 1 casa decimal (e sufixo MI/BI/TRI/QUA)
 *  a partir de 1 milhao para economizar espaco em KPIs. Abaixo disso usa
 *  o formato normal com separador de milhar (`83.421`). Sempre arredonda
 *  para baixo (truncamento) para nao "subir" um digito sem o valor real
 *  alcancar a marca (ex.: 83.999.999 -> "83,9 MI" e nao "84,0 MI").
 */
export function formatCompactCount(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ",";
  const n = Math.max(0, Math.floor(v));
  if (n < 1_000_000) {
    return new Intl.NumberFormat("pt-BR").format(n);
  }
  const units: Array<{ threshold: number; suffix: string }> = [
    { threshold: 1_000_000_000_000_000, suffix: "QUA" },
    { threshold: 1_000_000_000_000, suffix: "TRI" },
    { threshold: 1_000_000_000, suffix: "BI" },
    { threshold: 1_000_000, suffix: "MI" },
  ];
  for (const { threshold, suffix } of units) {
    if (n >= threshold) {
      const truncated = Math.floor((n / threshold) * 10) / 10;
      return `${truncated.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${suffix}`;
    }
  }
  return new Intl.NumberFormat("pt-BR").format(n);
}

/** Duração legível com granularidade automática (ms / s / min / h). */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ",";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m} min ${rs} s` : `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`;
}
