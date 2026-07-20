// src/worker/backfill/entregas-antigas.ts , Fase 1B Task 5.
//
// Back-fill dirigido dos pedidos antigos em aberto (anteriores a 2026). NAO se apoia no ciclo
// de reconcile de 24h (que roda o catalogo INTEIRO por timer, sem alvo): chama reconcileModel
// explicitamente para pedido.documento e depois sped.documento.item, com o override de
// ingestao ja no codigo (OVERRIDE_INGESTAO em corte.ts). Reusar reconcileModel (e nao um
// dominio one-off proprio) garante que o cache pos-script seja IDENTICO ao estado de
// convergencia que o reconcile diario manteria: idempotente por construcao, o reconcile do dia
// seguinte nao acha nada novo para os antigos (a nao ser delecoes reais no Odoo).
//
// PRE-REQUISITOS DE RUNTIME (R1/PR#168), garantidos pelo runbook, NAO por este arquivo:
//   1. o override ja tem que estar DEPLOYADO em corte.ts (codigo antes do dado);
//   2. o worker / ciclo incremental PARADO (sem corrida com o back-fill);
//   3. o purge CONGELADO durante a operacao.
// Este modulo nao adquire o lock do Redis de proposito (o wiring do lock vive em worker/index):
// a defesa e o worker parado no runbook. Ver docs/runbooks/backfill-entregas-antigas.md.

import type { OdooClient } from "../odoo/client";
import type { PrismaClient } from "../../generated/prisma/client";
import { corteDomain, corteDomainHerdado } from "../sync/corte";
import { reconcileModel } from "../sync/reconcile";
import { syncAtendimento } from "../sync/atendimento";
import { rebuildFatoPedido } from "../fatos/fato-pedido";
import { rebuildFatoPedidoItem } from "../fatos/fato-pedido-item";
import { rebuildFatoPedidoClassificacao } from "../fatos/fato-pedido-classificacao";
import { markFatoBuilt } from "../fatos/fato-build-state";
import { CHAVE_BUILD_ATENDIMENTO } from "../../lib/diretoria/atendimento-status";

const MODELO_HEADER = "pedido.documento";
const MODELO_ITEM = "sped.documento.item";

interface RawContagemDelegate {
  findMany(args: {
    select: { odooId: true; rawDeleted: true };
  }): Promise<{ odooId: number; rawDeleted: boolean }[]>;
}

export interface BackfillResultado {
  headers: number;
  itens: number;
  atendimento: number;
}

/**
 * Conta, sem escrever nada, quantos registros o reconcile TRARIA para o modelo (o delta do
 * dry-run). Espelha exatamente o `universoParaInserir` do reconcile: para um modelo com corte
 * proprio (header), o universo e `corteDomain`; para um filho sem corte proprio (item), e a
 * UNIAO herdada de `corteDomainHerdado`. Assim o numero do dry-run e o mesmo que o `--apply`
 * inseriria.
 */
async function contarFaltantes(
  client: OdooClient,
  raw: RawContagemDelegate,
  odooModel: string,
): Promise<number> {
  const herdado = corteDomainHerdado(odooModel);
  const universo =
    herdado.length && !corteDomain(odooModel).length
      ? await client.searchIds(odooModel, herdado)
      : await client.searchIds(odooModel, corteDomain(odooModel));
  const noCache = await raw.findMany({ select: { odooId: true, rawDeleted: true } });
  const cacheIds = new Set(noCache.map((r) => r.odooId));
  return universo.filter((id) => !cacheIds.has(id)).length;
}

/**
 * Executa (ou simula, em dry-run) o back-fill. Ordem inegociavel no --apply:
 *   1. reconcileModel do HEADER (pedido.documento) , traz e protege os headers antigos;
 *   2. reconcileModel do ITEM (sped.documento.item) , traz os itens de pedido antigos pela
 *      uniao herdada (so o ramo de pedido recua; o ramo de nota fica em 2026);
 *   3. syncAtendimento , reprocessa a_atender dos itens (dominio recuado);
 *   4. rebuild dos fatos (pedido, item, classificacao) e marca o build de atendimento.
 * O HEADER vem antes do ITEM porque o fato do pedido depende do header vivo.
 */
export async function backfillEntregasAntigas(
  client: OdooClient,
  prisma: PrismaClient,
  opts: { apply: boolean },
): Promise<BackfillResultado> {
  if (!opts.apply) {
    const headers = await contarFaltantes(client, prisma.rawPedidoDocumento as never, MODELO_HEADER);
    const itens = await contarFaltantes(client, prisma.rawSpedDocumentoItem as never, MODELO_ITEM);
    console.log(`[backfill][dry-run] headers faltantes=${headers} itens de pedido faltantes=${itens}`);
    return { headers, itens, atendimento: 0 };
  }

  const rHeader = await reconcileModel(client, prisma.rawPedidoDocumento as never, MODELO_HEADER);
  const rItem = await reconcileModel(client, prisma.rawSpedDocumentoItem as never, MODELO_ITEM);
  const rAt = await syncAtendimento(client, prisma.rawSpedDocumentoItem as never);

  await rebuildFatoPedido(prisma);
  await rebuildFatoPedidoItem(prisma);
  await rebuildFatoPedidoClassificacao(prisma);
  await markFatoBuilt(prisma, CHAVE_BUILD_ATENDIMENTO);

  console.log(
    `[backfill][apply] headers inseridos=${rHeader.inseridosFaltantes} ` +
      `itens inseridos=${rItem.inseridosFaltantes} atendimento atualizados=${rAt.atualizados}`,
  );
  return {
    headers: rHeader.inseridosFaltantes,
    itens: rItem.inseridosFaltantes,
    atendimento: rAt.atualizados,
  };
}
