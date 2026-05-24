// mcp/tools/cadastros/servico-buscar.ts
// Tool MCP: servico_buscar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryServicoBuscar } from "@/lib/reports/queries/servicos.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  termo: z.string().min(1).max(120),
  limite: z.number().int().min(1).max(200).optional(),
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

export const cadastrosServicoBuscar: ToolEntry<Input, Output> = {
  id: "servico_buscar",
  dominio: "cadastros",
  descricao:
    "Busca serviços no catálogo fiscal por termo (código ou descrição). " +
    "Retorna código, descrição, código de tributação e alíquota de INSS retido.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_servico"], () =>
      queryServicoBuscar(ctx.prisma, input),
    ),
};
