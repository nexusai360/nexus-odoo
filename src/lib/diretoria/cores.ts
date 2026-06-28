/**
 * Helpers semânticos da Diretoria: variação (delta) de KPI, status de prazo e
 * contagem regressiva. Retornam estados nomeados (positivo/negativo/neutro,
 * no_prazo/atencao/atrasado) que a UI mapeia para as cores semânticas (verde/
 * vermelho/azul/amarelo). Lógica pura, testável; `hoje` sempre injetado.
 */

export type ClasseDelta = "positivo" | "negativo" | "neutro";
export type StatusPrazo = "no_prazo" | "atencao" | "atrasado";

export function classeDelta(valor: number): ClasseDelta {
  if (valor > 0) return "positivo";
  if (valor < 0) return "negativo";
  return "neutro";
}

export interface DeltaFormatado {
  pct: number; // variação percentual (atual vs anterior); 0 se anterior = 0
  classe: ClasseDelta;
  simbolo: "▲" | "▼" | "•";
}

export function formatarDelta(atual: number, anterior: number): DeltaFormatado {
  const pct = anterior === 0 ? 0 : ((atual - anterior) / Math.abs(anterior)) * 100;
  const classe = classeDelta(atual - anterior);
  const simbolo = classe === "positivo" ? "▲" : classe === "negativo" ? "▼" : "•";
  return { pct, classe, simbolo };
}

/** Dias inteiros entre hoje e a data prevista (positivo = futuro, negativo = atrasado). */
export function diasRestantes(dataPrevista: Date, hoje: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  const a = Date.UTC(
    dataPrevista.getUTCFullYear(),
    dataPrevista.getUTCMonth(),
    dataPrevista.getUTCDate(),
  );
  const b = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((a - b) / MS);
}

/**
 * Status de prazo a partir da data prevista. Atrasado se já passou; atenção se
 * vence em até `limiarAtencao` dias (padrão 3); no prazo caso contrário.
 */
export function statusPrazo(
  dataPrevista: Date,
  hoje: Date,
  limiarAtencao = 3,
): StatusPrazo {
  const dias = diasRestantes(dataPrevista, hoje);
  if (dias < 0) return "atrasado";
  if (dias <= limiarAtencao) return "atencao";
  return "no_prazo";
}
