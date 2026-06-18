/**
 * Lista curada de países para o seletor de DDI do campo de WhatsApp, mais os
 * helpers puros que convertem entre o formato exibido (DDI + número nacional)
 * e o formato canônico E.164 gravado no banco.
 *
 * A lista é curada de propósito: Brasil em primeiro (caso predominante),
 * seguido dos países mais comuns na operação e dos principais do mundo. Não é
 * a tabela completa de DDIs , a normalização final fica a cargo do backend
 * (`normalizeE164`), que aceita qualquer DDI informado com `+`.
 */
export interface Country {
  /** ISO 3166-1 alpha-2, ex.: "BR". Casa com os componentes de bandeira. */
  iso: string;
  /** Nome em português. */
  name: string;
  /** Código de discagem internacional, com `+`, ex.: "+55". */
  dial: string;
}

export const COUNTRIES: Country[] = [
  { iso: "BR", name: "Brasil", dial: "+55" },
  { iso: "PT", name: "Portugal", dial: "+351" },
  { iso: "US", name: "Estados Unidos", dial: "+1" },
  { iso: "AR", name: "Argentina", dial: "+54" },
  { iso: "PY", name: "Paraguai", dial: "+595" },
  { iso: "UY", name: "Uruguai", dial: "+598" },
  { iso: "CL", name: "Chile", dial: "+56" },
  { iso: "BO", name: "Bolívia", dial: "+591" },
  { iso: "PE", name: "Peru", dial: "+51" },
  { iso: "CO", name: "Colômbia", dial: "+57" },
  { iso: "MX", name: "México", dial: "+52" },
  { iso: "ES", name: "Espanha", dial: "+34" },
  { iso: "GB", name: "Reino Unido", dial: "+44" },
  { iso: "FR", name: "França", dial: "+33" },
  { iso: "DE", name: "Alemanha", dial: "+49" },
  { iso: "IT", name: "Itália", dial: "+39" },
  { iso: "CA", name: "Canadá", dial: "+1" },
  { iso: "CN", name: "China", dial: "+86" },
  { iso: "JP", name: "Japão", dial: "+81" },
  { iso: "AU", name: "Austrália", dial: "+61" },
];

/** País padrão do seletor: Brasil. */
export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.iso === "BR") ?? COUNTRIES[0];

/** Apenas os dígitos de uma string (descarta `+`, espaços, parênteses, hífen). */
function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Remove acentos e baixa a caixa, para busca tolerante em português. */
function foldText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra a lista curada por nome (em português, ignorando acento), código ISO
 * ou código de discagem (com ou sem `+`). Busca vazia devolve a lista inteira,
 * preservando a ordem curada (Brasil em primeiro).
 */
export function searchCountries(query: string): Country[] {
  const q = foldText(query);
  if (!q) return COUNTRIES;
  const qDigits = onlyDigits(query);
  return COUNTRIES.filter(
    (c) =>
      foldText(c.name).includes(q) ||
      c.iso.toLowerCase().includes(q) ||
      (qDigits.length > 0 && c.dial.slice(1).includes(qDigits)),
  );
}

/**
 * Encontra o país de um número E.164 pelo prefixo de DDI mais longo que casa.
 *
 * A ordenação por comprimento de DDI evita que `+595…` (Paraguai) seja
 * confundido com `+55…` (Brasil). Quando dois países compartilham o mesmo DDI
 * (ex.: US e CA com `+1`), vence o primeiro da lista curada.
 */
export function findCountryByE164(e164: string): Country | undefined {
  const digits = onlyDigits(e164);
  if (!digits) return undefined;

  const byDialLengthDesc = [...COUNTRIES].sort(
    (a, b) => b.dial.length - a.dial.length,
  );
  return byDialLengthDesc.find((c) => digits.startsWith(c.dial.slice(1)));
}

/**
 * Separa um E.164 em país (quando reconhecido) e número nacional (só dígitos,
 * sem o DDI). Sem país reconhecido, devolve todos os dígitos como nacionais.
 */
export function splitE164(e164: string): {
  country?: Country;
  nationalDigits: string;
} {
  const digits = onlyDigits(e164);
  const country = findCountryByE164(e164);
  if (!country) return { nationalDigits: digits };
  return {
    country,
    nationalDigits: digits.slice(country.dial.length - 1),
  };
}

/**
 * Monta o E.164 canônico a partir do DDI selecionado e do número nacional
 * digitado (com ou sem máscara). Ex.: ("+55", "(11) 99123-4567") -> "+5511991234567".
 */
export function composeE164(dial: string, nationalInput: string): string {
  return `+${onlyDigits(dial)}${onlyDigits(nationalInput)}`;
}

/**
 * Valida o número nacional (DDD + número, só dígitos) para o país escolhido.
 * Retorna a mensagem de erro ou `null` quando o número está válido. Mesma regra
 * usada no campo de WhatsApp do perfil e no número da empresa do webhook.
 */
export function validateNationalPhone(
  country: Country,
  national: string,
): string | null {
  const digits = onlyDigits(national);
  if (!digits) return "Informe o número.";
  if (country.iso === "BR" && digits.length !== 10 && digits.length !== 11) {
    return "Para o Brasil, informe DDD + número (10 ou 11 dígitos).";
  }
  if (digits.length < 8) return "Número muito curto.";
  return null;
}

/**
 * Formata o número nacional (sem DDI) para leitura. Para o Brasil aplica a
 * máscara local (celular 9XXXX-XXXX, fixo XXXX-XXXX); demais países e números
 * parciais voltam sem máscara forçada.
 */
export function formatNational(
  country: Country | undefined,
  nationalDigits: string,
): string {
  const d = onlyDigits(nationalDigits);
  if (country?.iso === "BR") {
    if (d.length === 11) {
      return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
      return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
    }
  }
  return d;
}

/** Dígito inicial de assinante de celular no Brasil (faixa 6 a 9). */
function isCelularStart(digit: string): boolean {
  return digit >= "6" && digit <= "9";
}

/**
 * Chave canônica de equivalência de um número. No Brasil, um celular com o nono
 * dígito (`9`) e o mesmo celular sem o nono dígito representam a mesma linha, e
 * por isso colapsam na mesma chave (sempre na forma sem o `9`). Fixos e números
 * de outros países usam os próprios dígitos, sem regra do nono dígito.
 */
export function phoneEquivalenceKey(e164: string): string {
  const { country, nationalDigits } = splitE164(e164);
  if (country?.iso !== "BR") return onlyDigits(e164);

  const ddd = nationalDigits.slice(0, 2);
  let sub = nationalDigits.slice(2);
  // Só colapsa quando é mesmo um celular: 9 dígitos, começando com 9 e o
  // dígito seguinte na faixa de celular (6 a 9). Assim um fixo nunca é
  // confundido com um celular.
  if (sub.length === 9 && sub[0] === "9" && isCelularStart(sub[1])) {
    sub = sub.slice(1);
  }
  return `55${ddd}${sub}`;
}

/**
 * True quando dois números representam a mesma linha, considerando a regra do
 * nono dígito de celular brasileiro (com e sem o `9`).
 */
export function areEquivalentNumbers(a: string, b: string): boolean {
  return phoneEquivalenceKey(a) === phoneEquivalenceKey(b);
}

/**
 * Formas E.164 equivalentes a um número, para busca de duplicidade no banco
 * (`phoneE164 IN (...)`). Para celular brasileiro inclui a forma com e sem o
 * nono dígito; para fixo e demais países, só o próprio número.
 */
export function phoneVariants(e164: string): string[] {
  const { country, nationalDigits } = splitE164(e164);
  if (country?.iso !== "BR") return [e164];

  const ddd = nationalDigits.slice(0, 2);
  const sub = nationalDigits.slice(2);
  const variants = new Set<string>([e164]);
  if (sub.length === 9 && sub[0] === "9" && isCelularStart(sub[1])) {
    variants.add(composeE164(country.dial, `${ddd}${sub.slice(1)}`));
  } else if (sub.length === 8 && isCelularStart(sub[0])) {
    variants.add(composeE164(country.dial, `${ddd}9${sub}`));
  }
  return [...variants];
}

/**
 * Formata um E.164 completo para exibição, com DDI separado do número nacional
 * (ex.: "+55 61 98440-9067"). Números sem país reconhecido voltam como `+` mais
 * os dígitos.
 */
export function formatE164ForDisplay(e164: string): string {
  const { country, nationalDigits } = splitE164(e164);
  if (!country) return `+${onlyDigits(e164)}`;
  return `${country.dial} ${formatNational(country, nationalDigits)}`;
}
