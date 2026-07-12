// src/worker/sync/corte.ts
// Corte TECNICO da INGESTAO , o quanto de historico o cache guarda.
//
// Este corte e FIXO (2026-01-01) e nao tem nada a ver com a "data de inicio das analises"
// da tela (AppSetting sync.corte_dados, em src/lib/corte-dados.ts). Sao dois conceitos:
//
//   - ingestao (aqui): ate onde o worker vai buscar no Odoo. Define o tamanho do cache.
//   - analise (corte-dados.ts): a partir de quando a plataforma CONSIDERA o que esta no
//     cache. E so filtro de leitura , nada e apagado, e mover a data para tras faz o
//     historico reaparecer na hora.
//
// Amarrar a ingestao a data da tela e um erro ja cometido duas vezes: o worker para de puxar
// o que fica fora dela e a reconciliacao marca o historico como removido. Pior, ler o valor
// no momento do import congela o padrao (16/03) e o cache nunca repoe janeiro a marco.
// Por isso a constante abaixo e literal e nao importa nada de corte-dados.ts.
//
// O corte por modelo vem do MODEL_CATALOG (fonte unica , o purge usa os mesmos nomes).
// Modelos sem `corte` (mestres, foto-atual, titulo financeiro) nao recebem clausula:
// titulo (corteEspecial) sincroniza SEM filtro de data de proposito , divida viva precisa
// entrar sempre; quitados antigos reimportados por write_date sao inofensivos (saldo 0) e o
// purge periodico os remove.

import { MODEL_CATALOG } from "../catalog/model-catalog";

/** Ate onde o worker puxa historico do Odoo. Constante tecnica, nunca configuravel na tela. */
export const CORTE_INGESTAO_ISO = "2026-01-01";

/** @deprecated nome antigo (confundia com a data da tela). Use CORTE_INGESTAO_ISO. */
export const CORTE_DADOS_ISO = CORTE_INGESTAO_ISO;

const POR_MODELO = new Map(MODEL_CATALOG.map((e) => [e.odooModel, e]));

/** Clausula de dominio Odoo do corte de ingestao para o modelo (vazia se nao corta). */
export function corteDomain(odooModel: string): Array<[string, string, string]> {
  const entry = POR_MODELO.get(odooModel);
  if (!entry?.corte) return [];
  return [[entry.corte.odoo, ">=", CORTE_INGESTAO_ISO]];
}
