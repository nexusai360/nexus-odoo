/**
 * Mapeamento marker -> nome de rodada (R8, R9, R10, ...).
 *
 * REGRA DE OURO: NUNCA editar `KNOWN_MARKERS` manualmente. Toda nova rodada
 * deve ser auto-numerada via `buildRodadaNamesFromMarkers(allMarkers)`:
 * ordena os markers cronologicamente pelo timestamp embutido e atribui
 * R8, R9, R10, ... sequencialmente. Assim, R20, R21, R30 viram corretos
 * sem ninguem precisar lembrar de editar este arquivo.
 *
 * `markerToRodadaName(marker)` (versao legada, hardcoded) so e usado em
 * componentes que ainda nao foram migrados para a versao dinamica. Novos
 * usos devem ir direto via `buildRodadaNamesFromMarkers`.
 */

/** Origem da numeracao: marker do R8 (primeira rodada catalogada). */
const RODADA_ZERO = 8;

/** Marcadores virtuais (nao-AUDIT) para origens vindas do uso real do
 *  agente. Permitem filtrar conversas in_app/whatsapp/playground na mesma
 *  estrutura do filtro de rodada (uma coluna so de "Origem"). */
export const ORIGEM_AGENTE_NEX = "__origem:agente-nex";
export const ORIGEM_PLAYGROUND = "__origem:playground";

export const ORIGEM_LABELS: Record<string, string> = {
  [ORIGEM_AGENTE_NEX]: "Agente Nex",
  [ORIGEM_PLAYGROUND]: "Playground",
};

/** Channels do Prisma `AgentChannel` enum que viram cada origem. */
const AGENTE_NEX_CHANNELS = new Set(["whatsapp", "in_app"]);
const PLAYGROUND_CHANNELS = new Set(["playground"]);

/** Dado um channel, devolve a origem virtual canonica. null se desconhecido. */
export function channelToOrigem(
  channel: string | null | undefined,
): string | null {
  if (!channel) return null;
  if (AGENTE_NEX_CHANNELS.has(channel)) return ORIGEM_AGENTE_NEX;
  if (PLAYGROUND_CHANNELS.has(channel)) return ORIGEM_PLAYGROUND;
  return null;
}

/** Cache estatico para a versao legada (chamada por marker unico). */
const LEGACY_MARKERS: Record<string, string> = {
  "[AUDIT-POS-2026-05-26T17-21-31]": "Rodada 8",
  "[AUDIT-POS-2026-05-26T18-01-27]": "Rodada 9",
  "[AUDIT-POS-2026-05-26T18-05-49]": "Rodada 10",
  "[AUDIT-POS-2026-05-26T21-58-49]": "Rodada 11",
  "[AUDIT-POS-2026-05-26T22-44-49]": "Rodada 12",
  "[AUDIT-POS-2026-05-27T01-32-20]": "Rodada 13",
  "[AUDIT-POS-2026-05-27T02-47-42]": "Rodada 14",
  "[AUDIT-POS-2026-05-27T03-33-55]": "Rodada 15",
  "[AUDIT-POS-2026-05-27T04-13-16]": "Rodada 16",
  "[AUDIT-POS-2026-05-27T15-10-40]": "Rodada 17",
  "[AUDIT-POS-2026-05-27T16-16-15]": "Rodada 18",
  "[AUDIT-POS-2026-05-27T21-50-50]": "Rodada 19",
};

/** Extrai timestamp ISO do marker para ordenacao. Retorna null se invalido. */
function extractTimestamp(marker: string): number | null {
  const m = marker.match(
    /\[AUDIT-(?:[A-Z]+-)?(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/,
  );
  if (!m) return null;
  const [, year, month, day, hour, min, sec] = m;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(min),
    Number(sec),
  );
}

/**
 * Recebe todos os markers conhecidos do sistema (ex: extraidos via
 * `SELECT DISTINCT title FROM conversations WHERE title LIKE '%AUDIT-POS-%'`)
 * e retorna um Map marker -> nome de rodada (R8, R9, ...) atribuido
 * sequencialmente pela ordem cronologica do timestamp embutido no marker.
 *
 * Markers cujo timestamp nao parsea sao colocados no final com o fallback
 * "R-DD/MM HH:MM".
 *
 * Esta e a forma CANONICA de gerar nomes de rodada. Use isto, nao
 * `markerToRodadaName` (legado).
 */
export function buildRodadaNamesFromMarkers(
  markers: ReadonlyArray<string>,
): Map<string, string> {
  const ordenados = [...new Set(markers)]
    .map((marker) => ({ marker, ts: extractTimestamp(marker) }))
    .filter((x): x is { marker: string; ts: number } => x.ts !== null)
    .sort((a, b) => a.ts - b.ts);

  const result = new Map<string, string>();
  for (let i = 0; i < ordenados.length; i++) {
    result.set(ordenados[i].marker, `Rodada ${RODADA_ZERO + i}`);
  }
  // Markers sem timestamp parseavel: fallback estatico.
  for (const marker of markers) {
    if (result.has(marker)) continue;
    // Origens virtuais (Agente Nex, Playground) tem label proprio.
    if (marker in ORIGEM_LABELS) {
      result.set(marker, ORIGEM_LABELS[marker]!);
      continue;
    }
    result.set(marker, fallbackFromMarker(marker));
  }
  return result;
}

/** Fallback "Rodada DD/MM HH:MM" para markers sem ordenacao possivel. */
function fallbackFromMarker(marker: string): string {
  const m = marker.match(
    /\[AUDIT-(?:[A-Z]+-)?(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/,
  );
  if (!m) return marker;
  const [, , month, day, hour, min] = m;
  return `Rodada ${day}/${month} ${hour}:${min}`;
}

/**
 * Converte um marker completo (com [colchetes]) para nome curto de rodada.
 *
 * VERSAO LEGADA. Usa tabela hardcoded e fallback "R-DD/MM HH:MM" para
 * markers desconhecidos. Em novos chamadores, prefira
 * `buildRodadaNamesFromMarkers` que auto-numera a partir do banco.
 *
 * Mantida pra compatibilidade enquanto chamadores existentes sao migrados.
 */
export function markerToRodadaName(marker: string | null | undefined): string {
  if (!marker) return ",";
  if (LEGACY_MARKERS[marker]) return LEGACY_MARKERS[marker];
  if (marker in ORIGEM_LABELS) return ORIGEM_LABELS[marker]!;
  return fallbackFromMarker(marker);
}
