// mcp/tools/estoque/top-movimentados.ts
// Tool MCP: estoque_top_movimentados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryTopMovimentados } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const TOP_TOOL = 20;

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  sentido: z.enum(["entrada", "saida"]).optional(),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  kpis: z.object({ totalProdutos: z.number().int(), totalUnidades: z.number() }),
  top: z.array(z.object({ rotulo: z.string(), valor: z.number() })),
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

function shape(d: Awaited<ReturnType<typeof queryTopMovimentados>>) {
  return {
    kpis: d.kpis,
    top: d.linhas.slice(0, TOP_TOOL),
  };
}

export const estoqueTopMovimentados: ToolEntry<Input, Output> = {
  id: "estoque_top_movimentados",
  dominio: "estoque",
  descricao: "Top 20 produtos mais movimentados em estoque.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_movimento"],
      async () => shape(await queryTopMovimentados(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const top0 = envelope.dados.top[0];
    return enriquecerEnvelope(envelope, "estoque_top_movimentados", {
      destaque: {
        totalProdutos: envelope.dados.kpis.totalProdutos,
        totalUnidades: envelope.dados.kpis.totalUnidades,
        topProduto: top0?.rotulo ?? "",
        movimentosTop: top0?.valor ?? 0,
      },
    });
  },
};
