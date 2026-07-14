// src/worker/sync/reconcile.ts
import type { OdooClient } from "../odoo/client";
import { getModelFields } from "../odoo/field-selection";
import { corteDomain, corteDomainHerdado } from "./corte";

export interface ReconcileDelegate {
  findMany(args: {
    select: { odooId: true; rawDeleted: true };
  }): Promise<{ odooId: number; rawDeleted: boolean }[]>;
  updateMany(args: {
    where: { odooId: { in: number[] } };
    data: { rawDeleted: boolean };
  }): Promise<{ count: number }>;
  upsert(args: {
    where: { odooId: number };
    create: { odooId: number; data: unknown; syncedAt: Date; rawDeleted: false };
    update: { data: unknown; syncedAt: Date; rawDeleted: false };
  }): Promise<unknown>;
}

export interface ReconcileResult {
  /** Estavam no cache e sumiram do Odoo. */
  marcadosDeletados: number;
  /** Existem no Odoo e NÃO estavam no cache , o buraco que ninguém pescava. */
  inseridosFaltantes: number;
  /** Estavam marcados como deletados aqui, mas o Odoo diz que existem. */
  ressuscitados: number;
}

/** Quantos ids por chamada ao buscar os faltantes (o domínio `id in [...]` não pode explodir). */
const LOTE_FALTANTES = 300;

/**
 * Faz o cache CONVERGIR para o Odoo, nos dois sentidos.
 *
 * Antes (perícia de 2026-07-13) esta rotina era mão única: só marcava `rawDeleted` no que
 * havia sumido do Odoo, e **nunca procurava o que faltava no cache**. Como o ciclo
 * incremental perde registros na janela de commit do Odoo (ver `MARGEM_SEGURANCA_MS` em
 * incremental.ts), o que caía nessa fresta ficava fora para sempre: 158 itens de nota fiscal
 * perdidos em produção, entre eles 4 vendas reais de R$ 493 mil, sem nada no sistema capaz
 * de pescá-los de volta.
 *
 * Agora ela faz os três movimentos que a convergência exige:
 *   1. está aqui e sumiu de lá  -> marca `rawDeleted = true`
 *   2. está lá e falta aqui     -> BUSCA no Odoo e insere (a rede de segurança)
 *   3. está lá e aqui está morto -> ressuscita (`rawDeleted = false`)
 *
 * O passo 2 é a rede de segurança da ingestão: mesmo que o incremental volte a perder um
 * registro por qualquer motivo, o ciclo de reconciliação o traz de volta.
 */
export async function reconcileModel(
  client: OdooClient,
  raw: ReconcileDelegate,
  odooModel: string,
): Promise<ReconcileResult> {
  // Conjunto AMPLO (corte do modelo, como sempre foi): serve para dizer o que MORREU no
  // Odoo. Amplo demais aqui é seguro , no máximo deixa de marcar algo como deletado.
  // Limpa 2026+ (T2c): o conjunto "vivo" usa o MESMO corte do cache , sem
  // isso, IDs pre-2026 vivos no Odoo nunca poderiam ser comparados de forma
  // coerente com um cache que so guarda 2026+.
  const vivos = new Set(await client.searchIds(odooModel, corteDomain(odooModel)));
  const noCache = await raw.findMany({ select: { odooId: true, rawDeleted: true } });
  const cacheIds = new Set(noCache.map((r) => r.odooId));

  // 1. Sumiu do Odoo -> marca como deletado.
  const sumidos = noCache.filter((r) => !vivos.has(r.odooId) && !r.rawDeleted).map((r) => r.odooId);
  let marcadosDeletados = 0;
  if (sumidos.length) {
    const res = await raw.updateMany({
      where: { odooId: { in: sumidos } },
      data: { rawDeleted: true },
    });
    marcadosDeletados = res.count;
  }

  // 3. Está vivo no Odoo, mas aqui estava marcado como deletado -> ressuscita.
  const mortosVivos = noCache.filter((r) => r.rawDeleted && vivos.has(r.odooId)).map((r) => r.odooId);
  let ressuscitados = 0;
  if (mortosVivos.length) {
    const res = await raw.updateMany({
      where: { odooId: { in: mortosVivos } },
      data: { rawDeleted: false },
    });
    ressuscitados = res.count || mortosVivos.length;
  }

  // 2. Está no Odoo e NÃO está no cache -> busca e insere. É o passo que faltava.
  //
  // Aqui o conjunto TEM que ser o RESTRITO (corte herdado do pai). Um filho como
  // `sped.documento.item` não tem data própria, então o corte "amplo" acima é o modelo
  // inteiro: 233.563 itens no Odoo contra 59.804 dentro do corte. Inserir pela lista ampla
  // despejaria ~172 mil registros pré-corte no cache, contra a regra de ingestão e provável
  // OOM do worker. Ver `corteDomainHerdado`.
  const herdado = corteDomainHerdado(odooModel);
  const universoParaInserir =
    herdado.length && !corteDomain(odooModel).length
      ? new Set(await client.searchIds(odooModel, herdado))
      : vivos;
  const faltantes = [...universoParaInserir].filter((id) => !cacheIds.has(id));
  let inseridosFaltantes = 0;
  if (faltantes.length) {
    const fields = await getModelFields(client, odooModel);
    const agora = new Date();
    for (let i = 0; i < faltantes.length; i += LOTE_FALTANTES) {
      const lote = faltantes.slice(i, i + LOTE_FALTANTES);
      const registros = await client.searchRead<Record<string, unknown>>(
        odooModel,
        [["id", "in", lote]],
        fields,
      );
      for (const rec of registros) {
        const odooId = Number(rec.id);
        await raw.upsert({
          where: { odooId },
          create: { odooId, data: rec, syncedAt: agora, rawDeleted: false },
          update: { data: rec, syncedAt: agora, rawDeleted: false },
        });
        inseridosFaltantes++;
      }
    }
  }

  return { marcadosDeletados, inseridosFaltantes, ressuscitados };
}
