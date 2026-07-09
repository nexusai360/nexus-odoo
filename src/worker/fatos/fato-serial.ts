// A6 (Diretoria): builder de seriais. Cada equipamento por número de série.
// Fonte: raw_sped_produto_lote_serie (modelo sped.produto.lote.serie).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { num } from "./_coerce";

export interface FatoSerialRow {
  odooId: number;
  serial: string | null;
  produtoId: number | null;
  produtoNome: string | null;
  localId: number | null;
  localNome: string | null;
  valorCusto: number;
  dataCompra: Date | null;
  dataSaida: Date | null;
  quantidade: number;
}

function dt(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapSerialRow(raw: Record<string, unknown>): FatoSerialRow {
  return {
    odooId: Number(raw.id),
    serial: raw.nome ? String(raw.nome) : null,
    produtoId: relId(raw.produto_id as OdooM2O),
    produtoNome: relNome(raw.produto_id as OdooM2O),
    localId: relId(raw.local_id as OdooM2O),
    localNome: relNome(raw.local_id as OdooM2O),
    valorCusto: num(raw.valor_custo),
    dataCompra: dt(raw.data_compra),
    // Saída = data de venda; se não houver, a baixa.
    dataSaida: dt(raw.data_venda) ?? dt(raw.data_baixa),
    quantidade: num(raw.quantidade),
  };
}

const CHUNK = 1000;

export async function rebuildFatoSerial(prisma: PrismaClient): Promise<number> {
  // Lê o jsonb `data` SEM os blobs de imagem (image_*). A fonte
  // raw_sped_produto_lote_serie carregava imagens de produto legadas (~3.3GB no
  // total); o `select: { data: true }` antigo ainda trazia o jsonb inteiro com as
  // imagens, pesando o heap. A exclusao acontece no Postgres (operador `-` do jsonb)
  // para o blob nunca chegar ao Node; `mapSerialRow` nao le image_*, resultado
  // identico. Insere em chunks , a tabela tem milhares de seriais.
  const rawRows = await prisma.$queryRaw<{ data: Record<string, unknown> }[]>`
    SELECT data - 'image' - 'image_64' - 'image_128' - 'image_256' - 'image_512'
                - 'image_1024' - 'image_1920' - 'image_small' - 'image_medium'
                - 'image_big' - 'image_large' AS data
    FROM raw_sped_produto_lote_serie
    WHERE raw_deleted = false`;
  const mapped = rawRows.map((r) => mapSerialRow(r.data));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoSerial.deleteMany({});
      for (let i = 0; i < mapped.length; i += CHUNK) {
        await tx.fatoSerial.createMany({ data: mapped.slice(i, i + CHUNK) });
      }
      await markFatoBuilt(tx, "fato_serial");
    },
    { timeout: 300_000, maxWait: 15_000 },
  );

  // Enriquecimento: a fonte raw (sped.produto.lote.serie) vem com local_id/data_venda
  // VAZIOS em todas as linhas. A saida real do serial esta na RASTREABILIDADE de item
  // de nota (serial -> item -> nota de saida autorizada). Preenche data_saida (data da
  // nota de saida mais recente) e local_nome (armazem de origem dessa saida) para os
  // seriais que ja sairam; os parados ficam com data_saida NULL (correto).
  await prisma.$executeRaw`
    UPDATE fato_serial fs
    SET data_saida = sub.data_saida,
        local_nome = COALESCE(fs.local_nome, sub.local_nome)
    FROM (
      SELECT r.data->'lote_serie_id'->>1 AS serial,
             max(n.data_emissao) AS data_saida,
             (array_agg(r.data->'local_origem_id'->>1 ORDER BY n.data_emissao DESC NULLS LAST))[1] AS local_nome
      FROM raw_sped_documento_item_rastreabilidade r
      JOIN fato_nota_fiscal_item ii
        ON ii.odoo_id = CASE WHEN (r.data->'item_id'->>0) ~ '^[0-9]+$'
                             THEN (r.data->'item_id'->>0)::int END
      JOIN fato_nota_fiscal n ON n.odoo_id = ii.documento_id
      WHERE n.entrada_saida = '1' AND n.situacao_nfe = 'autorizada'
      GROUP BY r.data->'lote_serie_id'->>1
    ) sub
    WHERE fs.serial = sub.serial
  `;
  return mapped.length;
}
