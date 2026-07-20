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

import { MODEL_CATALOG, rawTableFor } from "../catalog/model-catalog";

/** Ate onde o worker puxa historico do Odoo. Constante tecnica, nunca configuravel na tela. */
export const CORTE_INGESTAO_ISO = "2026-01-01";

/** @deprecated nome antigo (confundia com a data da tela). Use CORTE_INGESTAO_ISO. */
export const CORTE_DADOS_ISO = CORTE_INGESTAO_ISO;

/**
 * Recuo cirurgico do corte de ingestao POR MODELO (Fase 1B). Fonte UNICA, literal e
 * PERMANENTE (deployada com o codigo, nunca configuravel na tela). Lida de forma IDENTICA por
 * corteDomain, corteDomainHerdado, dominioAtendimento e o purge (alvos.ts), para que
 * reconcile, atendimento e limpeza nunca divirjam sobre ate onde o cache guarda cada modelo.
 *
 * So `pedido.documento` (header do pedido) e `sped.documento.item` (itens de pedido) recuam,
 * para trazer os pedidos em aberto anteriores a 2026 SEM repor o historico de notas/financeiro.
 * A data (2024-11-01) e o piso do mes do pedido em aberto mais antigo, confirmado ao vivo na
 * Task 0: min(data_orcamento)=2024-11-27; o min(documento_id.data_emissao) dos itens desses
 * pedidos e 2026-03-04 (mais tarde, logo nenhum item some por pai anterior). Ver PLAN Fase 1B.
 *
 * HAZARD DE ROLLBACK (nao remover sem re-sync): enquanto este literal estiver deployado, o
 * reconcile diario mantem vivos(pedido)=data_orcamento>=2024-11 e nunca marca os antigos como
 * rawDeleted. Reverter/rollar para uma versao SEM o override re-arma o PR#168: o proximo
 * reconcile marcaria todo pedido 2024-11..2025 como removido. Ha um teste que trava este
 * conteudo justamente para que um revert quebre a suite. Ver runbook backfill-entregas-antigas.
 */
export const OVERRIDE_INGESTAO: ReadonlyMap<string, string> = new Map([
  ["pedido.documento", "2024-11-01"],
  ["sped.documento.item", "2024-11-01"],
]);

/** Data de corte de ingestao EFETIVA do modelo: override da Fase 1B se houver, senao o global. */
export function corteIngestaoDe(odooModel: string): string {
  return OVERRIDE_INGESTAO.get(odooModel) ?? CORTE_INGESTAO_ISO;
}

const POR_MODELO = new Map(MODEL_CATALOG.map((e) => [e.odooModel, e]));
const POR_TABELA_RAW = new Map(MODEL_CATALOG.map((e) => [rawTableFor(e.odooModel), e]));

/** Clausula de dominio Odoo do corte de ingestao para o modelo (vazia se nao corta). */
export function corteDomain(odooModel: string): Array<[string, string, string]> {
  const entry = POR_MODELO.get(odooModel);
  if (!entry?.corte) return [];
  return [[entry.corte.odoo, ">=", corteIngestaoDe(odooModel)]];
}

/**
 * Corte de ingestao do modelo INCLUINDO o herdado do pai (ou do avo), via dot-notation do
 * dominio Odoo (`documento_id.data_emissao`, `item_id.documento_id.data_emissao`).
 *
 * Para que serve, e por que NAO da para usar o `corteDomain` puro aqui: um filho como
 * `sped.documento.item` nao tem data propria , o corte dele e o do documento pai
 * (`cortePai` no catalogo). Como `corteDomain` devolve clausula VAZIA para esses modelos,
 * quem perguntar ao Odoo "quais existem" recebe o modelo INTEIRO: 233.563 itens, sendo que
 * so 59.804 estao dentro do corte.
 *
 * Isso e inofensivo para DETECTAR EXCLUSAO (um conjunto amplo demais so evita marcar coisa
 * viva como deletada). Mas e desastroso para BUSCAR O QUE FALTA no cache: sem o corte
 * herdado, a reconciliacao despejaria ~172 mil registros pre-corte no banco, contrariando a
 * regra de ingestao e derrubando o worker por memoria. Dai esta funcao existir separada.
 */
export function corteDomainHerdado(odooModel: string): Array<[string, string, string]> {
  const entry = POR_MODELO.get(odooModel);
  if (!entry) return [];
  if (entry.corte) return [[entry.corte.odoo, ">=", CORTE_INGESTAO_ISO]];
  if (!entry.cortePai) return [];

  const pai = POR_TABELA_RAW.get(entry.cortePai.tabelaRawPai);
  if (!pai) return [];

  // Pai com data propria: `<fk>.<campo_do_pai>`.
  if (pai.corte) {
    return [[`${entry.cortePai.fkRaw}.${pai.corte.odoo}`, ">=", CORTE_INGESTAO_ISO]];
  }
  // Pai intermediario (ex.: rastreabilidade -> item -> documento): encadeia ate o avo.
  if (pai.cortePai) {
    const avo = POR_TABELA_RAW.get(pai.cortePai.tabelaRawPai);
    if (avo?.corte) {
      return [
        [
          `${entry.cortePai.fkRaw}.${pai.cortePai.fkRaw}.${avo.corte.odoo}`,
          ">=",
          CORTE_INGESTAO_ISO,
        ],
      ];
    }
  }
  return [];
}
