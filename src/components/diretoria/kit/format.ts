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

/** UF legível: troca código vazio/desconhecido ("??") por "Sem UF". */
export function rotuloUf(uf: string | null | undefined): string {
  const u = (uf ?? "").trim();
  return !u || u === "??" ? "Sem UF" : u;
}

const UFS_VALIDAS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);
/** UF com geografia no mapa (exclui "??"/nula, que não tem posição). */
export function ufValida(uf: string | null | undefined): boolean {
  return UFS_VALIDAS.has((uf ?? "").trim().toUpperCase());
}

/** Razão social legível: remove o CNPJ (XX.XXX.XXX/XXXX-XX) e separadores soltos. */
export function nomeLimpo(raw: string | null | undefined, maxLen = 34): string {
  let s = (raw ?? "").replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, "").trim();
  s = s.replace(/^[-–\s]+|[-–\s]+$/g, "").trim(); // separadores nas pontas
  if (!s) s = (raw ?? "").trim();
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

/**
 * Moeda compacta para cards estreitos: >= 1 mi vira "R$ X,Y mi"; >= 10 mil vira
 * "R$ N,Y mil" (1 casa só quando há resto, ex.: 134.501 -> "R$ 134,5 mil",
 * 50.000 -> "R$ 50 mil"); abaixo disso, moeda cheia. O valor cheio vai no hover.
 */
export function brlCompacto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000)
    return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (a >= 10_000)
    return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl.format(v);
}
