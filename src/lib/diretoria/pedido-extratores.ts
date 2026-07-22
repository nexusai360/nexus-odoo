// src/lib/diretoria/pedido-extratores.ts
//
// Extratores PUROS do jsonb do pedido (raw_pedido_documento.data / raw_sped_documento_item.data).
// Modulo FOLHA de proposito: sem imports de prisma, next, server-only nem de qualquer outra parte
// do dominio. Assim a TELA (src/lib/diretoria/queries/entregas-parciais.ts) e o WORKER
// (src/worker/fatos/captura-pedido-valor.ts) compartilham a MESMA fonte de mapeamento de campos,
// sem arrastar o grafo server-only para dentro do worker (fronteira, review B-1 2026-07-22).
//
// REGRA: margem e liquido vem PRONTOS do Odoo (Lucro Real, o liquido ja abate creditos). NUNCA
// recalcular , so copiar o valor.

/** Numero do jsonb do Odoo: o Odoo devolve `false` (nao nulo) em campo nao aplicavel; string/
 * numero viram numero, o resto vira 0. */
export function numJson(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza um valor do Odoo em string util: nao-string (ex.: `false`), vazio ou so espacos
 * viram null. */
export function strOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Desconto do PEDIDO (cabecalho): `vr_desconto` (R$) e `al_desconto` (%), prontos do Odoo. */
export function extrairDesconto(data: unknown): { descontoValor: number; descontoPct: number } {
  const d = data as Record<string, unknown> | null;
  return { descontoValor: numJson(d?.vr_desconto), descontoPct: numJson(d?.al_desconto) };
}

/** Rentabilidade do PEDIDO, campos JA CALCULADOS pelo Odoo em `raw_pedido_documento.data`. Margem
 * e liquido vem prontos (NAO recalcular). */
export function extrairRentabilidade(data: unknown): {
  subtotal: number; valorProduto: number; custoComercial: number; icms: number; difal: number; fcp: number;
  pis: number; cofins: number; irpj: number; csll: number; cbs: number; ibs: number; comissaoPct: number; comissaoValor: number; liquido: number; margemPct: number;
} {
  const d = data as Record<string, unknown> | null;
  return {
    subtotal: numJson(d?.vr_operacao_tributacao),
    valorProduto: numJson(d?.vr_produtos),
    custoComercial: numJson(d?.vr_custo_comercial),
    icms: numJson(d?.vr_icms_proprio),
    difal: numJson(d?.vr_difal),
    fcp: numJson(d?.vr_fcp),
    pis: numJson(d?.vr_pis_proprio),
    cofins: numJson(d?.vr_cofins_proprio),
    irpj: numJson(d?.vr_irpj),
    csll: numJson(d?.vr_csll),
    cbs: numJson(d?.vr_cbs),
    ibs: numJson(d?.vr_ibs),
    comissaoPct: numJson(d?.al_comissao),
    comissaoValor: numJson(d?.vr_comissao),
    liquido: numJson(d?.vr_liquido),
    margemPct: numJson(d?.al_margem),
  };
}

/** Rentabilidade DO ITEM, campos JA CALCULADOS pelo Odoo em `raw_sped_documento_item.data`. */
export function extrairRentabilidadeItem(data: unknown): {
  itemComissaoPct: number; itemComissaoValor: number; itemLiquido: number; itemMargemPct: number;
  itemDescontoValor: number; itemDescontoPct: number;
} {
  const d = data as Record<string, unknown> | null;
  return {
    itemComissaoPct: numJson(d?.al_comissao),
    itemComissaoValor: numJson(d?.vr_comissao),
    itemLiquido: numJson(d?.vr_liquido),
    itemMargemPct: numJson(d?.al_margem),
    itemDescontoValor: numJson(d?.vr_desconto),
    itemDescontoPct: numJson(d?.al_desconto),
  };
}

/** Condicao de pagamento do CABECALHO (`pedido.documento.condicao_pagamento_id`, m2o `[id, nome]`).
 * Fonte fiel do Odoo. `false`/vazio => null. */
export function extrairCondicaoPagamento(data: unknown): string | null {
  const v = (data as { condicao_pagamento_id?: unknown } | null)?.condicao_pagamento_id;
  return Array.isArray(v) && typeof v[1] === "string" ? strOuNull(v[1]) : null;
}
