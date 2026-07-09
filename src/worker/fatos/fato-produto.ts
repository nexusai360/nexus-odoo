// src/worker/fatos/fato-produto.ts
// FONTE: raw_sped_produto (modelo sped.produto , catalogo de produtos do Odoo).
// Cobre 100% do cadastro, independente de saldo. Junta com fato_estoque_saldo
// por odoo_id <-> produto_id.
// FILTRO: raw_deleted=false.
// Decisao: truncate + insert (raw eh fonte unica, 3787 linhas, padrao dos
// demais builders). skipDuplicates como defesa adicional.

import type { PrismaClient } from "../../generated/prisma/client";
import { type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoProdutoRow {
  odooId: number;
  nome: string;
  codigo: string | null;
  codigoUnico: string | null;
  codigoBarras: string | null;
  ativo: boolean;
  tipo: string | null;
  marcaId: number | null;
  marcaNome: string | null;
  familiaId: number | null;
  familiaNome: string | null;
  unidadeNome: string | null;
  ncmCodigo: string | null;
  controlaEstoque: boolean;
  permiteVenda: boolean;
  permiteCompra: boolean;
  precoCusto: number | null;
  precoVenda: number | null;
  pesoLiquido: number | null;
  pesoBruto: number | null;
  criadoEm: Date | null;
  atualizadoEmOdoo: Date | null;
}

/** Extrai id de M2O Odoo `[id, "nome"]` ou retorna null. */
function relId(m2o: unknown): number | null {
  if (!Array.isArray(m2o) || m2o.length < 1) return null;
  const id = m2o[0];
  return typeof id === "number" ? id : null;
}
function relNome(m2o: unknown): string | null {
  if (!Array.isArray(m2o) || m2o.length < 2) return null;
  const v = m2o[1];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Numero defensivo: Odoo retorna `false` para campos nulos. */
function toNum(v: unknown): number | null {
  if (v === false || v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Codigo de barras: normaliza pra alfanumerico maiusculo. */
function normalizeBarcode(s: unknown): string | null {
  if (typeof s !== "string" || s.length === 0) return null;
  const cleaned = s.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

/** NCM: extrai prefixo numerico/pontuado do label "95.06.91.00 - ...". */
function extractNcmCodigo(m2o: unknown): string | null {
  const nome = relNome(m2o);
  if (!nome) return null;
  const m = nome.match(/^[\d.]+/);
  return m ? m[0] : null;
}

/** Date defensivo: Odoo retorna string ou false. */
function toDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const d = new Date(v.replace(" ", "T") + (v.includes("T") ? "" : "Z"));
  return isNaN(d.getTime()) ? null : d;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function mapProdutoRow(raw: Record<string, unknown>): FatoProdutoRow {
  return {
    odooId: Number(raw.id),
    nome: typeof raw.nome === "string" ? raw.nome : "",
    codigo: strOrNull(raw.codigo),
    codigoUnico: strOrNull(raw.codigo_unico),
    codigoBarras: normalizeBarcode(raw.codigo_barras),
    ativo: raw.active !== false,
    tipo: strOrNull(raw.tipo),
    marcaId: relId(raw.marca_id as OdooM2O),
    marcaNome: relNome(raw.marca_id as OdooM2O),
    familiaId: relId(raw.familia_id as OdooM2O),
    familiaNome: relNome(raw.familia_id as OdooM2O),
    unidadeNome: relNome(raw.unidade_id as OdooM2O),
    ncmCodigo: extractNcmCodigo(raw.ncm_id),
    controlaEstoque: raw.controla_estoque === true,
    permiteVenda: raw.permite_venda !== false,
    permiteCompra: raw.permite_compra !== false,
    precoCusto: toNum(raw.preco_custo),
    precoVenda: toNum(raw.preco_venda),
    pesoLiquido: toNum(raw.peso_liquido),
    pesoBruto: toNum(raw.peso_bruto),
    criadoEm: toDate(raw.create_date),
    atualizadoEmOdoo: toDate(raw.write_date),
  };
}

/** Reconstrói fato_produto a partir de raw_sped_produto.
 *
 * Lê o jsonb `data` SEM os blobs de imagem (image_*). Os campos `fields.Image` do
 * Odoo (image, image_64..image_1920) chegam a 1.7MB por linha; carregados inteiros
 * no heap do worker (findMany do jsonb cru), estouravam o OOM ANTES de a
 * classificacao rodar, deixando bucket_demanda NULL (incidente 2026-07-08). A
 * exclusao acontece no Postgres (operador `-` do jsonb) para o blob NUNCA chegar ao
 * Node. `mapProdutoRow` nao le nenhum image_*, entao o resultado e identico. O
 * field-selection ja barra imagem no sync; isto e a defesa contra legado ja gravado
 * (complementa scripts/_prod-db-cleanup-images.py / strip-raw-images-local.sh).
 */
export async function rebuildFatoProduto(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.$queryRaw<{ data: Record<string, unknown> }[]>`
    SELECT data - 'image' - 'image_64' - 'image_128' - 'image_256' - 'image_512'
                - 'image_1024' - 'image_1920' - 'image_small' - 'image_medium'
                - 'image_big' - 'image_large' AS data
    FROM raw_sped_produto
    WHERE raw_deleted = false`;
  const mapped = rawRows
    .map((r) => mapProdutoRow(r.data))
    .filter((r) => Number.isFinite(r.odooId) && r.nome.length > 0);

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoProduto.deleteMany({});
      if (mapped.length) {
        await tx.fatoProduto.createMany({ data: mapped, skipDuplicates: true });
      }
      await markFatoBuilt(tx, "fato_produto");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
