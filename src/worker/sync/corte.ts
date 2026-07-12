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

// A data do corte vive em src/lib/corte-dados.ts (fonte unica: sync, purge, consultas, UI
// e agente leem de la) e e CONFIGURAVEL na tela de Configuracao. Aqui so se le o valor
// vigente , o ciclo do worker chama getCorteDados(prisma) antes de sincronizar.
import { corteAtual } from "../../lib/corte-dados";

/** @deprecated use corteAtual() , o corte agora e configuravel. Mantido para os testes. */
export const CORTE_DADOS_ISO = corteAtual();

const POR_MODELO = new Map(MODEL_CATALOG.map((e) => [e.odooModel, e]));

/** Clausula de dominio Odoo do corte para o modelo (vazia se nao corta). */
export function corteDomain(odooModel: string): Array<[string, string, string]> {
  const entry = POR_MODELO.get(odooModel);
  if (!entry?.corte) return [];
  return [[entry.corte.odoo, ">=", CORTE_DADOS_ISO]];
}
