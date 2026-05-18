// mcp/tools/cadastros/parceiros-por-uf.ts
// Tool MCP: cadastro_parceiros_por_uf
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryParceirosPorUf } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  apenasClientes: z.boolean().optional(),
});

const linhaSchema = z.object({
  uf: z.string().nullable(),
  quantidade: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
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

export const cadastroParceirosPorUf: ToolEntry<Input, Output> = {
  id: "cadastro_parceiros_por_uf",
  dominio: "cadastros",
  descricao: "Distribuição geográfica de parceiros por UF (estado), ordenado por quantidade decrescente. Pode filtrar apenas clientes.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_parceiro"], async () => {
      const result = await queryParceirosPorUf(ctx.prisma, input);
      return { linhas: result.linhas };
    }),
};
