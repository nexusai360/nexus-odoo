// mcp/tools/cadastros/detalhar-produto.ts
// Tool MCP: cadastro_detalhar_produto
//
// Retorna o detalhe completo de um produto a partir do odooId (nome, codigos,
// marca, familia, unidade, ncm, precos, ativo). Usar depois de uma busca de
// produto quando o usuario pediu o cadastro/detalhe de um item especifico.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  odooId: z.number().int().positive(),
});

const dados = z.object({
  encontrado: z.boolean(),
  produto: z
    .object({
      odooId: z.number().int(),
      nome: z.string(),
      codigo: z.string().nullable(),
      codigoUnico: z.string().nullable(),
      codigoBarras: z.string().nullable(),
      marcaNome: z.string().nullable(),
      familiaNome: z.string().nullable(),
      unidadeNome: z.string().nullable(),
      ncmCodigo: z.string().nullable(),
      precoVenda: z.number().nullable(),
      precoCusto: z.number().nullable(),
      ativo: z.boolean(),
    })
    .nullable(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const fonteStatus = z.object({
  status: z.string(),
  ultimaSyncEm: z.string().nullable(),
});

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados,
    atualizadoEm: z.string(),
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const cadastroDetalharProduto: ToolEntry<Input, Output> = {
  id: "cadastro_detalhar_produto",
  dominio: "cadastros",
  descricao:
    "Retorna o detalhe completo de um produto a partir do odooId: nome, " +
    "codigo, codigo unico, codigo de barras, marca, familia, unidade, NCM, " +
    "preco de venda, preco de custo e se esta ativo. Use depois de uma busca " +
    "de produto quando o usuario pediu o detalhe de um item especifico.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_produto"],
      async () => {
        const row = await ctx.prisma.fatoProduto.findFirst({
          where: { odooId: input.odooId },
        });
        if (!row) return { encontrado: false, produto: null };
        return {
          encontrado: true,
          produto: {
            odooId: row.odooId,
            nome: row.nome,
            codigo: row.codigo,
            codigoUnico: row.codigoUnico,
            codigoBarras: row.codigoBarras,
            marcaNome: row.marcaNome,
            familiaNome: row.familiaNome,
            unidadeNome: row.unidadeNome,
            ncmCodigo: row.ncmCodigo,
            precoVenda: row.precoVenda === null ? null : Number(row.precoVenda),
            precoCusto: row.precoCusto === null ? null : Number(row.precoCusto),
            ativo: row.ativo,
          },
        };
      },
      (d) => !d.encontrado,
    );
    if (envelope.estado === "preparando") return envelope;
    const p = envelope.dados.produto;
    return enriquecerEnvelope(envelope, "cadastro_detalhar_produto", {
      destaque: p
        ? {
            nome: p.nome,
            codigo: p.codigo ?? "",
            marca: p.marcaNome ?? "",
            precoVenda: p.precoVenda ?? 0,
            ativo: p.ativo ? "sim" : "nao",
          }
        : { encontrado: "nao" },
    });
  },
};
