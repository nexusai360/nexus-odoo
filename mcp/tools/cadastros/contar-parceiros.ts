// mcp/tools/cadastros/contar-parceiros.ts
// Tool MCP: cadastro_contar_parceiros
// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness
// (sem isVazio custom , comportamento correto).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarParceiros } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  totalParceiros: z.number().int(),
  totalClientes: z.number().int(),
  totalFornecedores: z.number().int(),
  /** Pessoas juridicas (ehEmpresa=true). */
  totalEmpresas: z.number().int(),
  /** Pessoas fisicas (ehEmpresa=false). */
  totalPessoasFisicas: z.number().int(),
  /** Parceiros ativos (ativo=true). */
  totalAtivos: z.number().int(),
  totalInativos: z.number().int(),
  totalClientesAtivos: z.number().int(),
  totalFornecedoresAtivos: z.number().int(),
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
  descricao:
    "Contagem segmentada de parceiros cadastrados. Retorna: " +
    "`totalParceiros`, `totalClientes`, `totalFornecedores`, `totalEmpresas` " +
    "(PJ), `totalPessoasFisicas` (PF), `totalAtivos`, `totalInativos`, " +
    "`totalClientesAtivos`, `totalFornecedoresAtivos`. " +
    "Use para perguntas tipo 'quantos clientes', 'quantos fornecedores', " +
    "'quantos PF/PJ', 'quantos ativos', 'fornecedores ativos'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_parceiro"], async () => {
      const result = await queryContarParceiros(ctx.prisma);
      return result;
    }),
};
