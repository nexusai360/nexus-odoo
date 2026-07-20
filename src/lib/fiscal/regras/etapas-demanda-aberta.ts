// src/lib/fiscal/regras/etapas-demanda-aberta.ts
// Whitelist AUTORITATIVA das etapas que contam como "demanda a entregar" (bucket ABERTA).
// Lista curada a dedo pelo dono no relatorio oficial de Entregas Parciais do Odoo (ID 28),
// reproduzindo o `pd.etapa_id IN (...)` daquele SQL. Pertencer ao conjunto VENCE os flags
// dinamicos da etapa (finaliza_faturamento/confirmando/cancelando): a regra dinamica antiga
// vazava Cancelado, cauda longa, pecas e venda a consumidor final para dentro da demanda.
//
// TODO(dono): revisar inclusao de pecas/consumidor final na demanda (D7)
//   Ao adotar os 27, pecas e venda a consumidor final SAEM da demanda (some o comprometido
//   dessas familias na necessidade de compra). O dono autorizou remover POR ORA para avancar,
//   mas EXIGE a decisao final. Ver PENDENCIA P1 na pesquisa mestre 2026-07-20.
export const ETAPAS_DEMANDA_ABERTA: ReadonlySet<number> = new Set<number>([
  130, 94, 95, 5, 132, 86, 133, 4, 129, 124, 120, 171, 121, 103, 87, 167,
  202, 203, 204, 205, 179, 180, 185, 186, 187, 183, 226,
]);
