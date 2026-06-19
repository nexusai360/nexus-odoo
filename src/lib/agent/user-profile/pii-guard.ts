/**
 * Guarda de privacidade do texto destilado (Onda 2). Bloqueia VERBATIM/PII no `interactionPrompt`
 * antes de ele ser gravado e injetado no prompt , o destilado vem de um LLM lendo as conversas
 * reais do usuario, entao pode tentar copiar nome/CNPJ/valor/e-mail. Spec 6.5.
 *
 * Default-deny: na duvida, considera violacao. Modulo PURO.
 */

/** Termos de negocio que NAO sao PII (aparecem no destilado legitimamente). */
export const ALLOWLIST_NEGOCIO: readonly string[] = [
  "faturamento", "receita", "estoque", "produto", "produtos", "empresa", "empresas",
  "cliente", "clientes", "fornecedor", "pedido", "pedidos", "financeiro", "fiscal",
  "comercial", "vendas", "vendedor", "imposto", "impostos", "nota", "notas", "cfop",
  "etapa", "armazem", "saldo", "caixa", "titulo", "titulos", "parceiro", "marca",
  "operacao", "periodo", "mes", "ano", "semana", "dia", "consolidado", "aprovado",
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Remove tudo que nao e digito e checa um corredor longo (CNPJ/CPF/telefone/valor). */
export function temDigitosLongos(s: string): boolean {
  const soDigitos = s.replace(/\D/g, "");
  return soDigitos.length >= 7; // CPF=11, CNPJ=14, telefone=10-11, valores grandes
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigramas(s: string): Set<string> {
  const t = normalizar(s);
  const palavras = t.split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= palavras.length; i++) {
    out.add(palavras.slice(i, i + 3).join(" "));
  }
  return out;
}

/** true se `texto` compartilha QUALQUER trigrama de palavras com alguma mensagem original
 *  (default-deny contra copia verbatim). Mensagens muito curtas (<3 palavras) sao ignoradas. */
export function compartilhaTrigramaCom(texto: string, originais: string[]): boolean {
  const alvo = trigramas(texto);
  if (alvo.size === 0) return false;
  for (const orig of originais) {
    for (const g of trigramas(orig)) {
      if (alvo.has(g)) return true;
    }
  }
  return false;
}

/** Palavra capitalizada que NAO esta no allowlist de negocio = provavel nome proprio. */
function temNomeProprioSuspeito(texto: string): boolean {
  const palavras = texto.split(/\s+/);
  for (const p of palavras) {
    const limpa = p.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (limpa.length >= 3 && /^[A-ZÀ-Þ]/.test(limpa)) {
      const base = normalizar(limpa);
      if (!ALLOWLIST_NEGOCIO.includes(base)) return true;
    }
  }
  return false;
}

/** Veredito de privacidade do texto destilado contra as mensagens originais do usuario. */
export function violaPrivacidade(texto: string, mensagensOriginais: string[]): boolean {
  if (temDigitosLongos(texto)) return true;
  if (EMAIL_RE.test(texto)) return true;
  if (compartilhaTrigramaCom(texto, mensagensOriginais)) return true;
  if (temNomeProprioSuspeito(texto)) return true;
  return false;
}
