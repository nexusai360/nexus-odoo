// mcp/tools/fiscal/contar-notas.ts
// Tool MCP: fiscal_contar_notas
// dados só tem escalares — sem array; cai no ramo "ok" do withFreshness.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarNotas } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  total: z.number().int(),
  totalEntrada: z.number().int(),
  totalSaida: z.number().int(),
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

export const fiscalContarNotas: ToolEntry<Input, Output> = {
  id: "fiscal_contar_notas",
  dominio: "fiscal",
  descricao:
    "Contagem total de notas fiscais. Use para perguntas de quantidade " +
    "absoluta ('quantas notas fiscais existem'): devolve só os números — " +
    "`total`, `totalEntrada` (DF-e de fornecedores) e `totalSaida` (emitidas).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_nota_fiscal"], () =>
      queryContarNotas(ctx.prisma),
    ),
};
