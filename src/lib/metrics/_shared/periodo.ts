import { corteAtualDate, clampDateAoCorte } from "@/lib/corte-dados";

/**
 * Regra canonica de periodo: filtra por dataEmissao com borda exclusiva.
 * O par precisa estar completo (de E ate); par incompleto retorna {} (mesmo
 * comportamento do fiscal.ts legado). A borda de fim e exclusiva: lt = ate + 1 dia UTC,
 * para o dia "ate" entrar inteiro sem depender de hora. Retorno em shape plano,
 * reusavel tanto no where de fato_nota_fiscal quanto no de fato_nota_fiscal_item
 * (ambos tem dataEmissao desnormalizado).
 */
export function buildPeriodoWhere(de?: string, ate?: string): { dataEmissao?: { gte: Date; lt: Date } } {
  // Sem periodo explicito, o piso ainda vale: a plataforma so tem dado a partir do corte
  // (16/03/2026). Assim nenhuma metrica "sem filtro" volta a varrer documento antigo.
  if (!de || !ate) return { dataEmissao: { gte: corteAtualDate(), lt: new Date("2100-01-01T00:00:00Z") } };
  const ateMais1 = new Date(`${ate}T00:00:00Z`);
  ateMais1.setUTCDate(ateMais1.getUTCDate() + 1);
  // Grampeia o inicio ao corte: pedir "desde 2024" devolve o que existe, a partir do corte.
  return { dataEmissao: { gte: clampDateAoCorte(new Date(`${de}T00:00:00Z`)), lt: ateMais1 } };
}
