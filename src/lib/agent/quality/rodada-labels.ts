/**
 * Mapeamento marker -> nome de rodada (R8..R16+).
 * Hardcoded para markers conhecidos; fallback usa data do marker (R-DD/MM HH:MM)
 * para rodadas futuras ainda nao catalogadas.
 */

const KNOWN_MARKERS: Record<string, string> = {
  "[AUDIT-POS-2026-05-26T17-21-31]": "R8",
  "[AUDIT-POS-2026-05-26T18-01-27]": "R9",
  "[AUDIT-POS-2026-05-26T18-05-49]": "R10",
  "[AUDIT-POS-2026-05-26T21-58-49]": "R11",
  "[AUDIT-POS-2026-05-26T22-44-49]": "R12",
  "[AUDIT-POS-2026-05-27T01-32-20]": "R13",
  "[AUDIT-POS-2026-05-27T02-47-42]": "R14",
  "[AUDIT-POS-2026-05-27T03-33-55]": "R15",
  "[AUDIT-POS-2026-05-27T04-13-16]": "R16",
  "[AUDIT-POS-2026-05-27T15-10-40]": "R17",
};

/**
 * Converte um marker completo (com [colchetes]) para nome curto de rodada.
 * Marker desconhecido vira fallback "R-DD/MM HH:MM".
 */
export function markerToRodadaName(marker: string | null | undefined): string {
  if (!marker) return ",";
  if (KNOWN_MARKERS[marker]) return KNOWN_MARKERS[marker];
  // Fallback: extrair data do marker
  const m = marker.match(
    /\[AUDIT-(?:[A-Z]+-)?(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/,
  );
  if (!m) return marker;
  const [, , month, day, hour, min] = m;
  return `R-${day}/${month} ${hour}:${min}`;
}
