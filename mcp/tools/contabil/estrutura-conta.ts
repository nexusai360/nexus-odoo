// mcp/tools/contabil/estrutura-conta.ts
// Tool MCP: contabil_estrutura_conta
//
// NOTA OBRIGATÓRIA: não há lançamento/movimento contábil no Odoo da Matrix
// Fitness Group , apenas a estrutura do plano de contas (tipo S/A).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryEstruturaConta } from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  odooId: z.number().int().positive(),
});

const contaSchema = z.object({
  odooId: z.number().int(),
  codigo: z.string(),
  nome: z.string(),
  tipo: z.string(),
  contaPaiNome: z.string().nullable(),
});

const filhaSchema = z.object({
  odooId: z.number().int(),
  codigo: z.string(),
  nome: z.string(),
  tipo: z.string(),
});

const dados = z.object({
  conta: contaSchema.nullable(),
  filhas: z.array(filhaSchema),
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
  "ATENÇÃO: não há lançamento/movimento contábil no Odoo da Matrix Fitness Group , " +
  "este domínio expõe apenas a estrutura do plano de contas (contas sintéticas e analíticas).";

export const contabilEstruturaConta: ToolEntry<Input, Output> = {
  id: "contabil_estrutura_conta",
  dominio: "contabil",
  descricao:
    "Retorna os detalhes de uma conta contábil pelo odooId e suas contas filhas diretas. " +
    "Útil para navegar a hierarquia do plano de contas. " +
    "NOTA: não há lançamento/movimento contábil no Odoo da Matrix, apenas a estrutura do plano de contas.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  // isVazio custom: "vazio" apenas quando a conta não existe (conta=null).
  // Uma conta-folha (conta populada, filhas=[]) é estado "ok" , P-M1.
  handler: (input, ctx) =>
    withFreshness(
      ctx.prisma,
      ["fato_conta_contabil"],
      async () => {
        const result = await queryEstruturaConta(ctx.prisma, input);
        return { conta: result.conta, filhas: result.filhas, aviso: AVISO };
      },
      (d) => d.conta === null,
    ),
};
