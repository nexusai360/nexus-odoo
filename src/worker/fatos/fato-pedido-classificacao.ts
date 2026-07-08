// src/worker/fatos/fato-pedido-classificacao.ts
// Builder de POS-PASSO (cycle "incremental", registrado por ULTIMO em FATO_BUILDERS):
// materializa categoria_operacao/bucket_demanda em fato_pedido e is_venda_externa em
// fato_nota_fiscal, reusando os helpers PUROS do nucleo fiscal (sem duplicar a logica
// em SQL). Leitura via $queryRaw; escrita set-based via updateMany agrupado. Como as
// bases (fato_pedido/fato_nota_fiscal) fazem truncate+insert por ciclo e nao carregam
// essas colunas, este builder repopula por ULTIMO no mesmo ciclo. Ver SPEC/PLAN v3.
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../lib/fiscal/grupo";
import {
  classificaOperacao,
  classificaEtapaDemanda,
  notaEhVendaExterna,
  classificarCfop,
} from "../../lib/fiscal/regras";

interface PedidoRow {
  odoo_id: number;
  etapa_id: number | null;
  participante_id: number | null;
  participante_nome: string | null;
  cfop: string | null;
}
interface EtapaRow {
  odoo_id: number;
  nome: string | null;
  fin_fat: boolean;
  fin_conf: boolean;
  fin_canc: boolean;
}
interface NotaRow {
  odoo_id: number;
  entrada_saida: string | null;
  situacao_nfe: string | null;
  modelo: string | null;
  participante_id: number | null;
  participante_nome: string | null;
  cfop: string | null;
}

const CHUNK = 5000;

export async function rebuildFatoPedidoClassificacao(prisma: PrismaClient): Promise<number> {
  const participantesGrupo = await carregarParticipantesGrupo(prisma);

  // Gatilhos por etapa (raw_pedido_etapa.data jsonb)
  const etapas = await prisma.$queryRaw<EtapaRow[]>`
    select odoo_id,
           data->>'nome' as nome,
           coalesce((data->>'finaliza_faturamento')::boolean, false) as fin_fat,
           coalesce((data->>'finaliza_pedido_confirmando')::boolean, false) as fin_conf,
           coalesce((data->>'finaliza_pedido_cancelando')::boolean, false) as fin_canc
    from raw_pedido_etapa
    where coalesce(raw_deleted, false) = false`;
  const gatilhoPorEtapa = new Map<number, EtapaRow>(etapas.map((e) => [e.odoo_id, e]));

  // Pedidos + CFOP representativo (item de maior quantidade). Uma passada nos itens
  // (distinct on pedido) + join, para evitar subquery correlacionada (Seq Scan por linha).
  const pedidos = await prisma.$queryRaw<PedidoRow[]>`
    with itens as (
      select distinct on ((i.data->'pedido_id'->>0)::int)
             (i.data->'pedido_id'->>0)::int as pedido_id,
             substring((i.data->'cfop_id'->>1) from '^[0-9]{4}') as cfop
      from raw_sped_documento_item i
      where jsonb_typeof(i.data->'pedido_id') = 'array'
      order by (i.data->'pedido_id'->>0)::int, (i.data->>'quantidade')::numeric desc nulls last
    )
    select f.odoo_id, f.etapa_id, f.participante_id, f.participante_nome, it.cfop
    from fato_pedido f
    left join itens it on it.pedido_id = f.odoo_id`;

  // Classificar em memoria e agrupar por (categoria|bucket)
  const gruposPedido = new Map<string, number[]>();
  for (const p of pedidos) {
    const op = classificaOperacao(
      { cfop: p.cfop, participanteId: p.participante_id, participanteNome: p.participante_nome },
      participantesGrupo,
    );
    let bucket: string;
    if (!op.entraDemanda) {
      bucket = "IGNORAR";
    } else {
      const g = p.etapa_id !== null ? gatilhoPorEtapa.get(p.etapa_id) : undefined;
      bucket = g
        ? classificaEtapaDemanda({
            nome: g.nome ?? "",
            finalizaFaturamento: g.fin_fat,
            finalizaPedidoConfirmando: g.fin_conf,
            finalizaPedidoCancelando: g.fin_canc,
          })
        : "ABERTA";
    }
    const chave = `${op.categoria}|${bucket}`;
    const arr = gruposPedido.get(chave);
    if (arr) arr.push(p.odoo_id);
    else gruposPedido.set(chave, [p.odoo_id]);
  }

  for (const [chave, ids] of gruposPedido) {
    const sep = chave.indexOf("|");
    const categoria = chave.slice(0, sep);
    const bucket = chave.slice(sep + 1);
    for (let i = 0; i < ids.length; i += CHUNK) {
      await prisma.fatoPedido.updateMany({
        where: { odooId: { in: ids.slice(i, i + CHUNK) } },
        data: { categoriaOperacao: categoria, bucketDemanda: bucket },
      });
    }
  }

  // Notas: is_venda_externa (CFOP representativo do item de maior valor). Uma passada.
  const notas = await prisma.$queryRaw<NotaRow[]>`
    with itens as (
      select distinct on (ii.documento_id)
             ii.documento_id,
             substring(ii.cfop_nome from '^[0-9]{4}') as cfop
      from fato_nota_fiscal_item ii
      order by ii.documento_id, ii.vr_produtos desc nulls last
    )
    select n.odoo_id, n.entrada_saida, n.situacao_nfe, n.modelo,
           n.participante_id, n.participante_nome, it.cfop
    from fato_nota_fiscal n
    left join itens it on it.documento_id = n.odoo_id`;

  const notasExternas: number[] = [];
  for (const n of notas) {
    const ehReceita = classificarCfop(n.cfop).ehReceita;
    const intragrupo = ehNotaIntragrupo(
      { participanteId: n.participante_id, participanteNome: n.participante_nome },
      participantesGrupo,
    );
    if (
      notaEhVendaExterna({
        entradaSaida: n.entrada_saida,
        situacaoNfe: n.situacao_nfe,
        modelo: n.modelo,
        ehReceita,
        intragrupo,
      })
    ) {
      notasExternas.push(n.odoo_id);
    }
  }

  // reset todas false, depois marca as externas (evita IN gigante)
  await prisma.fatoNotaFiscal.updateMany({ data: { isVendaExterna: false } });
  for (let i = 0; i < notasExternas.length; i += CHUNK) {
    await prisma.fatoNotaFiscal.updateMany({
      where: { odooId: { in: notasExternas.slice(i, i + CHUNK) } },
      data: { isVendaExterna: true },
    });
  }

  await markFatoBuilt(prisma, "fato_pedido_classificacao");
  return pedidos.length;
}
