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
} from "../../lib/fiscal/regras";
import { frasePendencia } from "../../lib/comercial/pendencia-etapa";

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
  apr_ped: boolean;
  apr_fin: boolean;
  apr_est: boolean;
  apr_fat: boolean;
  fin_fin: boolean;
  fin_est: boolean;
}
interface NotaRow {
  odoo_id: number;
  entrada_saida: string | null;
  situacao_nfe: string | null;
  modelo: string | null;
  operacao_nome: string | null;
  finalidade_nfe: string | null;
  participante_id: number | null;
  participante_nome: string | null;
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
           coalesce((data->>'finaliza_pedido_cancelando')::boolean, false) as fin_canc,
           coalesce((data->>'aprova_pedido')::boolean, false) as apr_ped,
           coalesce((data->>'aprova_financeiro')::boolean, false) as apr_fin,
           coalesce((data->>'aprova_estoque')::boolean, false) as apr_est,
           coalesce((data->>'aprova_faturamento')::boolean, false) as apr_fat,
           coalesce((data->>'finaliza_financeiro')::boolean, false) as fin_fin,
           coalesce((data->>'finaliza_estoque')::boolean, false) as fin_est
    from raw_pedido_etapa
    where coalesce(raw_deleted, false) = false`;
  const gatilhoPorEtapa = new Map<number, EtapaRow>(etapas.map((e) => [e.odoo_id, e]));
  // Pendencia ("o que falta para avancar") por etapa, derivada dos gatilhos.
  const pendenciaPorEtapa = new Map<number, string | null>(
    etapas.map((e) => [
      e.odoo_id,
      frasePendencia({
        aprovaPedido: e.apr_ped,
        aprovaFinanceiro: e.apr_fin,
        aprovaEstoque: e.apr_est,
        aprovaFaturamento: e.apr_fat,
        finalizaFinanceiro: e.fin_fin,
        finalizaEstoque: e.fin_est,
        finalizaFaturamento: e.fin_fat,
        finalizaPedidoConfirmando: e.fin_conf,
      }),
    ]),
  );

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
    // Pendencia so faz sentido para demanda ABERTA (pedido comercial em andamento).
    const pendencia =
      bucket === "ABERTA" && p.etapa_id !== null
        ? pendenciaPorEtapa.get(p.etapa_id) ?? null
        : null;
    const chave = JSON.stringify([op.categoria, bucket, pendencia]);
    const arr = gruposPedido.get(chave);
    if (arr) arr.push(p.odoo_id);
    else gruposPedido.set(chave, [p.odoo_id]);
  }

  for (const [chave, ids] of gruposPedido) {
    const [categoria, bucket, pendencia] = JSON.parse(chave) as [string, string, string | null];
    for (let i = 0; i < ids.length; i += CHUNK) {
      await prisma.fatoPedido.updateMany({
        where: { odooId: { in: ids.slice(i, i + CHUNK) } },
        data: { categoriaOperacao: categoria, bucketDemanda: bucket, pendenciaEtapa: pendencia },
      });
    }
  }

  // Notas: is_venda_externa. O criterio de venda passou a ser a OPERACAO FISCAL da propria
  // nota (operacao_nome), que e o que o Odoo usa. O CFOP representativo do item saiu da
  // regra: ele nao separava venda de venda interna (as duas tem CFOP de venda) e derrubava a
  // venda sem item no cache. Sem o CFOP, esta consulta nao precisa mais visitar os itens.
  const notas = await prisma.$queryRaw<NotaRow[]>`
    select n.odoo_id, n.entrada_saida, n.situacao_nfe, n.modelo,
           n.operacao_nome, n.finalidade_nfe,
           n.participante_id, n.participante_nome
    from fato_nota_fiscal n`;

  const notasExternas: number[] = [];
  for (const n of notas) {
    const intragrupo = ehNotaIntragrupo(
      { participanteId: n.participante_id, participanteNome: n.participante_nome },
      participantesGrupo,
    );
    if (
      notaEhVendaExterna({
        entradaSaida: n.entrada_saida,
        situacaoNfe: n.situacao_nfe,
        modelo: n.modelo,
        operacaoNome: n.operacao_nome,
        finalidadeNfe: n.finalidade_nfe,
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
