// Formatação compartilhada do KIT da Diretoria. Centraliza moeda/número/percentual
// e a abreviação compacta (mi/mil) usada nos KPIs estreitos , o valor cheio fica
// disponível no hover/title via `brl`.

export const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export const num = new Intl.NumberFormat("pt-BR");

export const pct1 = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Placeholder de vazio (nunca vírgula solta). */
export const DASH = "-";

/**
 * Moeda compacta para cards estreitos: >= 1 mi vira "R$ X,Y mi"; >= 10 mil vira
 * "R$ N mil"; abaixo disso, moeda cheia. O valor cheio deve ir no title.
 */
export function brlCompacto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000)
    return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (a >= 10_000) return `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
  return brl.format(v);
}
