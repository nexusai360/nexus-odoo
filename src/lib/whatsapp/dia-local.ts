/**
 * Corte de "dia" no fuso do Brasil (America/Sao_Paulo) para o teto diário.
 *
 * Os containers rodam em UTC: `setHours(0,0,0,0)` cortava o dia às 21h do
 * Brasil e zerava o contador no meio da noite do usuário. O dia do teto é o
 * dia CIVIL de São Paulo.
 *
 * O Brasil não tem horário de verão desde 2019: America/Sao_Paulo é UTC-3
 * fixo, então a meia-noite local é sempre 03:00Z do mesmo dia civil. A data
 * civil é resolvida via Intl (não por aritmética de -3h), o que mantém o
 * cálculo correto mesmo se o TZ do processo mudar.
 *
 * Módulo puro, sem efeitos colaterais.
 */

const FUSO_BR = "America/Sao_Paulo";
const OFFSET_BR_HORAS = 3; // UTC-3 fixo (sem DST desde 2019)

/** Meia-noite de São Paulo do dia civil (em SP) que contém `agora`. */
export function inicioDoDiaEmSaoPaulo(agora: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [ano, mes, dia] = fmt.format(agora).split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, OFFSET_BR_HORAS, 0, 0, 0));
}
