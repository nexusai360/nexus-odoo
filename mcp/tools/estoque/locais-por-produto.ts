// mcp/tools/estoque/locais-por-produto.ts
// Tool MCP: estoque_locais_por_produto (Onda 3)
//
// Lista os locais/armazens onde um produto tem saldo. Resolve R12/R16
// "Quais armazens tem o produto 102?" onde estoque_saldo_produto trazia
// numLocais=5 mas nao listava os locais.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  termo: z.string().min(1).max(120),
});

const linhaSchema = z.object({
  localId: z.number().int(),
  localNome: z.string().nullable(),
  saldo: z.number(),
});

const dados = z.object({
  produtoNome: z.string().nullable(),
  produtoId: z.number().int().nullable(),
  linhas: z.array(linhaSchema),
  saldoTotal: z.number(),
  totalLocais: z.number().int(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
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

export const estoqueLocaisPorProduto: ToolEntry<Input, Output> = {
  id: "estoque_locais_por_produto",
  dominio: "estoque",
  descricao:
    "Lista todos os armazens/locais onde um produto tem saldo, com saldo por " +
    "local. Use para 'quais armazens tem o produto X', 'onde esta o saldo de Y'. " +
    "Aceita termo (nome ou codigo).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo", "fato_produto"],
      async () => {
        // Busca produto pelo termo (codigo exato ou nome contendo)
        const isCodigoNumerico = /^\d+$/.test(input.termo);
        const produto = await ctx.prisma.fatoProduto.findFirst({
          where: isCodigoNumerico
            ? { codigo: input.termo }
            : { nome: { contains: input.termo, mode: "insensitive" } },
        });
        if (!produto) {
          return {
            produtoNome: null,
            produtoId: null,
            linhas: [],
            saldoTotal: 0,
            totalLocais: 0,
          };
        }
        const rows = await ctx.prisma.fatoEstoqueSaldo.findMany({
          where: { produtoId: produto.odooId },
          select: { localId: true, localNome: true, quantidade: true },
        });
        const linhas = rows
          .filter((r): r is typeof r & { localId: number } => r.localId != null)
          .map((r) => ({
            localId: r.localId,
            localNome: r.localNome,
            saldo: Number(r.quantidade ?? 0),
          }))
          .sort((a, b) => b.saldo - a.saldo);
        const saldoTotal = linhas.reduce((s, l) => s + l.saldo, 0);
        return {
          produtoNome: produto.nome,
          produtoId: produto.odooId,
          linhas,
          saldoTotal,
          totalLocais: linhas.length,
        };
      },
      (d) => d.linhas.length === 0,
    );
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "estoque_locais_por_produto", {
      destaque: {
        produtoNome: envelope.dados.produtoNome ?? "",
        saldoTotal: envelope.dados.saldoTotal,
        totalLocais: envelope.dados.totalLocais,
      },
      agregado: {
        soma: envelope.dados.saldoTotal,
        contagem: envelope.dados.totalLocais,
      },
    });
  },
};
