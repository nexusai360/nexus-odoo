// F5 Evals , marcadores canonicos de "nao operado / sem registros", derivados
// dos textos REAIS emitidos pelas honest-tools, cobranca, mdfe, reinf,
// contabil (mensagemContabilGestaoVazia) e registrar_lacuna. Confirmados via
// grep em 2026-06-07. Se uma tool de dominio-vazio passar a emitir texto fora
// desta lista, o harness/golden falha e a lista deve ser atualizada.
export const MARCADORES_NAO_OPERADO: string[] = [
  "nao e operado",
  "nao e operada",
  "nao sao operadas",
  "ainda nao tem itens processados",
  "nao ha retornos",
  "nao ha remessas",
  "nao ha carteiras",
  "sem cheques",
  "sem registros de pix",
  "sem cotacoes",
  "sem comissoes",
  "nao ha parametros de minimo/maximo",
  "nao tenho dados suficientes",
  "sem lancamentos",
  "nao ha saldos contabeis",
  "nao encontrei lancamentos contabeis",
  "sem manifestos",
  "sem eventos",
  "nenhum certificado",
  "sem processos",
];

function norm(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function contemMarcadorNaoOperado(texto: string): boolean {
  const t = norm(texto);
  return MARCADORES_NAO_OPERADO.some((m) => t.includes(norm(m)));
}

/** Afirmacao factual = ha numero/valor afirmado, e o texto NAO e uma negacao de
 *  dado. Usado na sub-classe A (registrar_lacuna nao pode afirmar numero). */
export function contemAfirmacaoFactual(texto: string): boolean {
  if (contemMarcadorNaoOperado(texto)) return false;
  return /\d/.test(texto);
}
