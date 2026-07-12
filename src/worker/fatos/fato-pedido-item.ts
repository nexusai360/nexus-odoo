// src/worker/fatos/fato-pedido-item.ts
// Builder de fato_pedido_item: DERIVACAO INTERNA de raw_sped_documento_item (NAO
// chama o Odoo). Uma linha por item de pedido (join por pedido_id). Base de "produto
// com mais demanda", estoque disponivel e seriais. INSERT..SELECT numa passada, com
// join a fato_produto para familia/marca. Roda APOS fato_produto e antes do pos-passo
// de classificacao. Ver SPEC/PLAN v3 (campos reais: vr_custo_estoque, local_reserva_livre_id).
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";

export async function rebuildFatoPedidoItem(prisma: PrismaClient): Promise<number> {
  // Troca atomica: DELETE + INSERT na MESMA transacao. Antes era um TRUNCATE solto, que
  // commita sozinho e deixava a tabela VAZIA por alguns segundos , quem abrisse a tela nesse
  // intervalo via demanda por produto e estoque disponivel zerados. DELETE (e nao TRUNCATE)
  // de proposito: nao pega ACCESS EXCLUSIVE, entao o leitor nem bloqueia, so continua vendo
  // as linhas antigas ate o commit.
  const n = await prisma.$transaction(
    async (tx) => {
      await tx.fatoPedidoItem.deleteMany({});
      await tx.$executeRaw`
    INSERT INTO fato_pedido_item (
      odoo_id, pedido_id, produto_id, produto_nome, familia_nome, marca_nome,
      quantidade, cfop_id, local_reserva_id, vr_produtos, vr_custo, atualizado_em
    )
    SELECT
      i.odoo_id,
      CASE WHEN (i.data->'pedido_id'->>0) ~ '^[0-9]+$' THEN (i.data->'pedido_id'->>0)::int END,
      CASE WHEN (i.data->'produto_id'->>0) ~ '^[0-9]+$' THEN (i.data->'produto_id'->>0)::int END,
      CASE WHEN jsonb_typeof(i.data->'produto_id') = 'array' THEN i.data->'produto_id'->>1 END,
      p.familia_nome,
      p.marca_nome,
      COALESCE((i.data->>'quantidade')::numeric, 0),
      CASE WHEN (i.data->'cfop_id'->>0) ~ '^[0-9]+$' THEN (i.data->'cfop_id'->>0)::int END,
      CASE WHEN (i.data->'local_reserva_livre_id'->>0) ~ '^[0-9]+$' THEN (i.data->'local_reserva_livre_id'->>0)::int END,
      COALESCE((i.data->>'vr_produtos')::numeric, 0),
      COALESCE((i.data->>'vr_custo_estoque')::numeric, 0),
      now()
    FROM raw_sped_documento_item i
    LEFT JOIN fato_produto p
      ON p.odoo_id = CASE WHEN (i.data->'produto_id'->>0) ~ '^[0-9]+$'
                          THEN (i.data->'produto_id'->>0)::int END
    WHERE (i.data->'pedido_id'->>0) ~ '^[0-9]+$'
      AND COALESCE((i.data->>'quantidade')::numeric, 0) > 0
  `;
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM fato_pedido_item`;
      // Estado de build junto com os dados: o freshness so avanca no commit.
      await markFatoBuilt(tx, "fato_pedido_item");
      return Number(n);
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return n;
}
