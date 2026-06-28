// De-para nome do estado -> sigla (UF). No cache, `fato_parceiro.uf` guarda o
// nome do estado vindo do Odoo no formato "São Paulo (BR)", não a sigla. O Mapa
// do Brasil e o UF-scoping trabalham com siglas, então normalizamos aqui.

const NOME_PARA_SIGLA: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

const SIGLAS = new Set(Object.values(NOME_PARA_SIGLA));

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Converte o valor de UF do cache para a sigla (2 letras). Aceita já-sigla
 * ("SP"), nome com sufixo de país ("São Paulo (BR)") e variações de acento/caixa.
 * Retorna null quando não reconhece.
 */
export function siglaDeUf(valor: string | null | undefined): string | null {
  if (!valor) return null;
  // remove sufixo " (BR)" / " (xx)" e espaços
  const limpo = valor.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (limpo.length === 2 && SIGLAS.has(limpo.toUpperCase())) {
    return limpo.toUpperCase();
  }
  const chave = semAcento(limpo).toLowerCase();
  return NOME_PARA_SIGLA[chave] ?? null;
}
