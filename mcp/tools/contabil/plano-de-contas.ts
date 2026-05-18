// mcp/tools/contabil/plano-de-contas.ts
// Tool MCP: contabil_plano_de_contas
//
// NOTA OBRIGATÓRIA: não há lançamento/movimento contábil no Odoo da Matrix
// Fitness Group — apenas a estrutura do plano de contas (tipo S/A).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPlanoDeContas } from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  termo: z.string().optional(),
  limite: z.number().int().positive().optional(),
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  codigo: z.string(),
  nome: z.string(),
  tipo: z.string(),
  contaPaiNome: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  aviso: z.string(),
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

const AVISO =
  "ATENÇÃO: não há lançamento/movimento contábil no Odoo da Matrix Fitness Group — " +
  "este domínio expõe apenas a estrutura do plano de contas (contas sintéticas e analíticas).";

export const contabilPlanoDeContas: ToolEntry<Input, Output> = {
  id: "contabil_plano_de_contas",
  dominio: "contabil",
  descricao:
    "Lista as contas do plano de contas contábil da Matrix, com código hierárquico, nome, tipo (S=sintética/A=analítica) e conta pai. " +
    "Filtre por termo (código ou nome). " +
    "NOTA: não há lançamento/movimento contábil no Odoo da Matrix — apenas a estrutura do plano de contas.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_conta_contabil"], async () => {
      const result = await queryPlanoDeContas(ctx.prisma, input);
      return { linhas: result.linhas, aviso: AVISO };
    }),
};
