// src/worker/sync/atendimento.ts
//
// Quanto de cada pedido ainda falta entregar.
//
// O Odoo sabe responder isso (`quantidade_a_atender_pedido`), mas o campo e COMPUTADO:
// ele nao existe em coluna, o Odoo calcula na hora. Dois efeitos praticos:
//
//   1. o sync normal nao o copiava (so copia campo armazenado). Sem ele, a diretoria
//      contava o pedido INTEIRO como pendente , 47% da demanda ja tinha sido entregue e
//      continuava sendo somada;
//
//   2. o ciclo incremental nao consegue mante-lo fresco. Ele filtra por `write_date`, e
//      o `write_date` do item do pedido NAO MUDA quando a entrega acontece , quem nasce
//      e outro registro (a nota). Medido: item escrito em 23/06, atendido por uma nota
//      de 30/06. Se dependessemos do incremental, o valor entraria uma vez e congelaria
//      para sempre no numero pre-entrega , o mesmo bug, so que mais dificil de enxergar.
//
// Por isso este job existe: ele relê os itens de pedido IGNORANDO o write_date, uma vez
// por dia. Custa ~4 a 8 min contra o Odoo, e o dado que ele traz e de diretoria, nao de
// operacao minuto a minuto.
import type { OdooClient } from "../odoo/client";
import { parseWriteDate } from "../odoo/datetime";
import { getModelFields } from "../odoo/field-selection";
import { CORTE_INGESTAO_ISO } from "./corte";
import { PAGE_SIZE, type RawDelegate } from "./incremental";

const MODELO = "sped.documento.item";

/**
 * So itens que pertencem a um pedido, e so dentro do corte de ingestao.
 *
 * O corte vem explicito porque `corteDomain(MODELO)` devolve vazio: o modelo corta por
 * `cortePai` (a data mora no documento pai), nao por campo proprio. Sem esta clausula, o
 * job reimportaria o historico que a limpeza ja removeu.
 *
 * E NAO ha filtro de `write_date` , e o ponto do job.
 */
export const DOMINIO_ATENDIMENTO: Array<[string, string, string | boolean]> = [
  ["pedido_id", "!=", false],
  ["documento_id.data_emissao", ">=", CORTE_INGESTAO_ISO],
];

export interface ResultadoAtendimento {
  lidos: number;
  atualizados: number;
  duracaoMs: number;
}

/**
 * Relê do Odoo os itens de pedido e regrava o raw.
 *
 * Pede TODOS os campos do modelo, nao so os dois computados. Isso nao e desperdicio: o
 * upsert do raw substitui o `data` inteiro (e assim que o sync funciona). Um search_read
 * so com os campos novos gravaria `{id, qtd_a_atender, qtd_atendida}` por cima do
 * registro e apagaria produto, quantidade, valor e o proprio `pedido_id` , o builder do
 * fato deixaria de encontrar qualquer item e a tela de pedidos zeraria, em silencio.
 */
export async function syncAtendimento(
  client: OdooClient,
  raw: RawDelegate,
  prazoMs = Number.POSITIVE_INFINITY,
): Promise<ResultadoAtendimento> {
  const inicio = Date.now();
  const fields = await getModelFields(client, MODELO);
  const agora = new Date();

  let lidos = 0;
  let atualizados = 0;
  let offset = 0;

  // Pagina de propósito: sao ~23 mil itens e ~196 MB de JSON. O worker roda com 2 GB de
  // heap e ja morreu de OOM antes , carregar tudo de uma vez repetiria o incidente.
  for (;;) {
    // Cancelamento cooperativo: quem chama nos da um prazo, e paramos de verdade quando
    // ele estoura. Sem isto, um Promise.race la fora desistiria da espera mas este laco
    // continuaria escrevendo na mesma tabela que o ciclo de sync , duas escritas
    // concorrentes no mesmo raw, uma sobrescrevendo a outra.
    if (Date.now() - inicio > prazoMs) {
      throw new Error(
        `atendimento excedeu o prazo de ${Math.round(prazoMs / 1000)}s (parou em ${lidos} itens)`,
      );
    }

    const { records, hasMore } = await client.searchReadPage(
      MODELO,
      DOMINIO_ATENDIMENTO,
      { offset, pageSize: PAGE_SIZE, fields },
    );

    const typedRecords = records as Record<string, unknown>[];

    for (const rec of typedRecords) {
      const odooId = Number(rec.id);
      if (!Number.isFinite(odooId)) continue;
      const odooWriteDate = parseWriteDate(rec.write_date);
      await raw.upsert({
        where: { odooId },
        create: { odooId, data: rec, odooWriteDate, syncedAt: agora },
        update: { data: rec, odooWriteDate, syncedAt: agora },
      });
      atualizados += 1;
    }

    lidos += typedRecords.length;
    if (!hasMore) break;
    offset += PAGE_SIZE;
  }

  return { lidos, atualizados, duracaoMs: Date.now() - inicio };
}
