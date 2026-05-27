// mcp/tools/estoque/produtos-parados.ts
// Tool MCP: estoque_produtos_parados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryProdutosParados } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  faixaDias: z.number().int().nonnegative().optional(),
  armazemId: z.number().int().positive().optional(),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  kpis: z.object({ totalParados: z.number().int(), valorImobilizado: z.number() }),
  linhas: z.array(z.object({
    produtoNome: z.string().nullable(),
    localNome: z.string().nullable(),
    saldo: z.number(),
    dias: z.number().int(),
    vrSaldo: z.number(),
  })),
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

function shape(d: Awaited<ReturnType<typeof queryProdutosParados>>) {
  return { kpis: d.kpis, linhas: d.linhas };
}

export const estoqueProdutosParados: ToolEntry<Input, Output> = {
  id: "estoque_produtos_parados",
  dominio: "estoque",
  descricao: "Produtos parados em estoque (saldo > 0, sem movimento).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_produto_parado"],
      async () => shape(await queryProdutosParados(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "estoque_produtos_parados", {
      destaque: {
        totalProdutos: envelope.dados.kpis.totalParados,
        valorImobilizado: envelope.dados.kpis.valorImobilizado,
      },
      agregado: {
        soma: envelope.dados.kpis.valorImobilizado,
        contagem: envelope.dados.kpis.totalParados,
      },
    });
  },
};
