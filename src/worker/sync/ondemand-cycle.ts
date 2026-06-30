// src/worker/sync/ondemand-cycle.ts
// Escopo do sync sob demanda: dada uma lista de modelos Odoo, devolve o
// MODEL_CATALOG filtrado para passar a processIncrementalCycle (que já aceita um
// catálogo pré-filtrado). E o mapa area -> modelos relevantes de cada tela da
// Diretoria, usado pela server action do botão "Atualizar agora".

import { MODEL_CATALOG } from "@/worker/catalog/model-catalog";

/** Filtra o catálogo aos modelos pedidos (escopo do ciclo incremental on-demand). */
export function escoparCatalogo(models: string[]) {
  const set = new Set(models);
  return MODEL_CATALOG.filter((e) => set.has(e.odooModel));
}

/**
 * Modelos Odoo a re-sincronizar por área da Diretoria. Conservador: cobre as
 * fontes que alimentam os fatos de cada tela. Agenda é dado nativo (não-Odoo),
 * logo não dispara sync.
 */
export const AREA_SYNC_MODELS: Record<string, string[]> = {
  vendas: [
    "pedido.documento",
    "pedido.parcela",
    "sped.documento",
    "sped.documento.item",
  ],
  pedidos: [
    "pedido.documento",
    "pedido.documento.historico",
    "finan.lancamento",
    "finan.lancamento.item",
  ],
  estoque: [
    "estoque.saldo.hoje",
    "estoque.local",
    "estoque.saldo.rastreabilidade.hoje",
    "sped.documento",
  ],
  visao_geral: [
    "pedido.documento",
    "sped.documento",
    "estoque.saldo.hoje",
    "finan.lancamento",
  ],
  agenda: [],
};

/** Modelos a sincronizar para uma área (vazio = nada a fazer). */
export function modelsForArea(area: string): string[] {
  return AREA_SYNC_MODELS[area] ?? [];
}
