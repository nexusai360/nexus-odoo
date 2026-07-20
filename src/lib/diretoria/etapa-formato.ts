// Padronizacao do nome da etapa do pedido para exibicao (bloco B-09).
//
// Regra (dono, refinada na review A1 de 2026-07-20): title-case POR PALAVRA dentro
// de cada clausula (a clausula e separada por " - "), preservando numeros, barras,
// colchetes e pontuacao; conectores curtos ("x", "de", "da"...) ficam minusculos
// (menos quando abrem a clausula); e SO ENTAO a allowlist de siglas forca caixa alta.
// Ex.: "GERA BOLETO" -> "Gera Boleto"; "VF - Novo Fracionamento" -> "VF - Novo
// Fracionamento"; "Transf. DF x Sergipe confirma" -> "Transf. DF x Sergipe Confirma".

/**
 * Siglas que permanecem em CAIXA ALTA apos a padronizacao. Allowlist explicita
 * (nao "detectar 2 letras"), confirmada contra as 79 etapas de venda reais do
 * cache em 2026-07-20. Comparacao case-insensitive; o token pode conter ponto
 * (V.O) para casar a sigla com pontuacao interna.
 *
 * FAT, TRANSF, CONF e MOV ficam em title-case por decisao (aparecem como palavra
 * comum, nao sigla). Para elevar qualquer um a sigla, basta acrescentar aqui , uma
 * linha, sem mudar codigo.
 */
export const SIGLAS_ETAPA = [
  "DF", "NF", "VF", "V.O", "PDV", "JDS", "JIB", "SN", "LR", "LP", "SMARTFIT",
] as const;

const SIGLAS_UPPER = new Set<string>(
  SIGLAS_ETAPA.map((s) => s.toLocaleUpperCase("pt-BR")),
);

/**
 * Conectores que ficam minusculos no meio da clausula (convencao de title-case em
 * portugues; "x" e o separador "contra" dos nomes de faturamento/transferencia).
 * A palavra que ABRE a clausula e sempre capitalizada, mesmo sendo conector.
 * Extensivel em uma linha.
 */
const CONECTORES = new Set<string>(["x", "de", "da", "do", "das", "dos", "e"]);

function capitalizarInicial(palavra: string): string {
  return palavra.replace(/\p{L}/u, (c) => c.toLocaleUpperCase("pt-BR"));
}

function formatarClausula(clausula: string): string {
  let jaViuPalavra = false;
  // "Palavra" = run de letras/digitos/pontos (mantem V.O, Transf., 5117 juntos);
  // espacos, "/", "[", "]", "(", ")" e "-" ficam FORA e sao preservados intactos.
  return clausula.replace(/[\p{L}\p{N}.]+/gu, (token) => {
    const alta = token.toLocaleUpperCase("pt-BR");
    const baixa = token.toLocaleLowerCase("pt-BR");
    const abriuClausula = !jaViuPalavra;
    if (/\p{L}/u.test(token)) jaViuPalavra = true;

    // 1) allowlist de siglas: caixa alta, ganha de tudo.
    if (SIGLAS_UPPER.has(alta)) return alta;
    // 2) conector no meio da clausula: minusculo.
    if (!abriuClausula && CONECTORES.has(baixa)) return baixa;
    // 3) title-case: 1a letra de cada palavra (inclusive apos "/") em maiuscula.
    return baixa.split("/").map(capitalizarInicial).join("/");
  });
}

/**
 * Padroniza o nome da etapa: title-case por palavra dentro de cada clausula
 * (separada por " - "), conectores curtos minusculos no meio, e siglas da
 * allowlist em caixa alta. Preserva numeros, "/", colchetes e pontuacao.
 */
export function formatarNomeEtapa(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .trim()
    .split(" - ")
    .map((clausula) => formatarClausula(clausula))
    .join(" - ");
}
