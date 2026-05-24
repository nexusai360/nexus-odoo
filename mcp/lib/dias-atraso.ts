// mcp/lib/dias-atraso.ts
// Função pura de cálculo de dias de atraso , Task 4d.4.

/**
 * Calcula dias de atraso de um título.
 *
 * @param dataVencimento , data de vencimento do título (ou null).
 * @param hoje , data de referência (normalmente `new Date()`).
 * @returns Número inteiro de dias de atraso. Vencimento futuro ou null → 0.
 *
 * Cálculo por diferença de dias de calendário (sem componente de hora):
 * ambas as datas são normalizadas para início do dia (local) para evitar
 * variação de fuso na contagem de dias , padrão adotado pelos builders de 4b.
 */
export function diasAtraso(dataVencimento: Date | null, hoje: Date): number {
  if (dataVencimento === null) return 0;

  // Normaliza para início do dia (local) , consistente com os builders de 4b
  const venc = new Date(
    dataVencimento.getFullYear(),
    dataVencimento.getMonth(),
    dataVencimento.getDate(),
  ).getTime();
  const ref = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate(),
  ).getTime();

  const diffMs = ref - venc;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
