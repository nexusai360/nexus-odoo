// src/worker/sync/corte.ts
// Limpa 2026+ (spec/plan 2026-06-11): clausula de corte temporal por modelo.
//
// O cache guarda apenas dados de negocio de 2026 em diante. O corte e lido do
// MODEL_CATALOG (fonte unica , o purge usa os mesmos nomes). Modelos sem
// `corte` (mestres, foto-atual, titulo financeiro) nao recebem clausula:
// titulo (corteEspecial) sincroniza SEM filtro de data de proposito , divida
// viva precisa entrar sempre; quitados antigos reimportados por write_date
// sao inofensivos (saldo 0) e o purge periodico os remove.

import { MODEL_CATALOG } from "../catalog/model-catalog";

/** Data de corte ISO (inicio do regime 2026+). AppSetting `sync.corte_dados`
 *  pode sobrepor no futuro; constante basta nesta fase (decisao plan v3). */
export const CORTE_DADOS_ISO = "2026-01-01";

const POR_MODELO = new Map(MODEL_CATALOG.map((e) => [e.odooModel, e]));

/** Clausula de dominio Odoo do corte para o modelo (vazia se nao corta). */
export function corteDomain(odooModel: string): Array<[string, string, string]> {
  const entry = POR_MODELO.get(odooModel);
  if (!entry?.corte) return [];
  return [[entry.corte.odoo, ">=", CORTE_DADOS_ISO]];
}
