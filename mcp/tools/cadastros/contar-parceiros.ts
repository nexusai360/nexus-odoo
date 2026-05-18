// mcp/tools/cadastros/contar-parceiros.ts
// Tool MCP: cadastro_contar_parceiros
// dados só tem escalares — sem array; cai no ramo "ok" do withFreshness
// (sem isVazio custom — comportamento correto).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarParceiros } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  totalParceiros: z.number().int(),
  totalClientes: z.number().int(),
  totalFornecedores: z.number().int(),
  totalEmpresas: z.number().int(),
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

export const cadastroContarParceiros: ToolEntry<Input, Output> = {
  id: "cadastro_contar_parceiros",
  dominio: "cadastros",
  descricao: "Contagem total de parceiros cadastrados, segmentada por tipo: clientes, fornecedores e empresas.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_parceiro"], async () => {
      const result = await queryContarParceiros(ctx.prisma);
      return result;
    }),
};
