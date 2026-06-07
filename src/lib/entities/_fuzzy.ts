// Distancia de Levenshtein + normalizacao de texto + score fuzzy (0..1).
// Usado por todos os resolvedores no ramo de nome.

/** Distancia de edicao classica (matriz DP iterativa, sem libs). Recebe strings cruas. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

/** lowercase + remove acentos (NFD) + trim + colapsa espacos internos. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Score de similaridade 0..1 entre dois textos (normaliza ambos antes). 1 = identicos. */
export function scoreFuzzy(a: string, b: string): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}
