// mcp/tools/cadastros/servico-listar.ts
// Tool MCP: servico_listar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryServicoListar } from "@/lib/reports/queries/servicos.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  limite: z.number().int().min(1).max(1000).optional(),
});

const linha = z.object({
  odooId: z.number().int(),
  codigo: z.string(),
  codigoFormatado: z.string().nullable(),
  descricao: z.string(),
  codigoTributacao: z.string().nullable(),
  alInssRetido: z.number(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
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

export const cadastrosServicoListar: ToolEntry<Input, Output> = {
  id: "servico_listar",
  dominio: "cadastros",
  descricao:
    "Lista o catálogo de serviços fiscais ordenado por código. Útil para " +
    "panorama dos serviços cadastrados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_servico"], () =>
      queryServicoListar(ctx.prisma, input),
    ),
};
