// mcp/tools/estoque/valor-armazem.ts
// Tool MCP: estoque_valor_armazem
// percentual é shaping — calculado aqui na tool (regra N8), não no núcleo.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryValorArmazem } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  kpis: z.object({ valorTotal: z.number(), numArmazens: z.number().int() }),
  linhas: z.array(z.object({
    armazem: z.string(),
    valor: z.number(),
    numProdutos: z.number().int(),
    percentual: z.number(),
  })),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryValorArmazem>>) {
  return {
    kpis: d.kpis,
    linhas: d.linhasBruto.map((l) => ({
      armazem: l.armazem,
      valor: l.valor,
      numProdutos: l.numProdutos,
      // percentual é shaping — calculado aqui, não no núcleo (regra N8)
      percentual: d.kpis.valorTotal > 0 ? (l.valor / d.kpis.valorTotal) * 100 : 0,
    })),
  };
}

export const estoqueValorArmazem: ToolEntry<Input, Output> = {
  id: "estoque_valor_armazem",
  dominio: "estoque",
  descricao: "Valor de estoque a preço de custo por armazém.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_estoque_saldo"], async () =>
      shape(await queryValorArmazem(ctx.prisma)),
    ),
};
