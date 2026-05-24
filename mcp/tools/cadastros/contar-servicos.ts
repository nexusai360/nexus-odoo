// mcp/tools/cadastros/contar-servicos.ts
// Tool MCP: servico_contar
// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarServicos } from "@/lib/reports/queries/servicos.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  total: z.number().int(),
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

export const cadastrosServicoContar: ToolEntry<Input, Output> = {
  id: "servico_contar",
  dominio: "cadastros",
  descricao:
    "Contagem total de serviços no catálogo. Use para perguntas de quantidade " +
    "absoluta ('quantos serviços existem'): devolve só o número, sem amostra.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_servico"], () =>
      queryContarServicos(ctx.prisma),
    ),
};
