// mcp/tools/contabil/estrutura-conta.ts
// Tool MCP: contabil_estrutura_conta
//
// NOTA OBRIGATÓRIA: não há lançamento/movimento contábil no Odoo da Matrix
// Fitness Group , apenas a estrutura do plano de contas (tipo S/A).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryEstruturaConta } from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

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

// Onda 1.C: envelope canonico
const dados = z.object({
  conta: contaSchema.nullable(),
  filhas: z.array(filhaSchema),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
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
    atualizadoHa: z.string(),
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
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_conta_contabil"],
      async () => {
        const result = await queryEstruturaConta(ctx.prisma, input);
        return { conta: result.conta, filhas: result.filhas, aviso: AVISO };
      },
      (d) => d.conta === null,
    );
    if (envelope.estado === "preparando") return envelope;
    const conta = envelope.dados.conta;
    return enriquecerEnvelope(envelope, "contabil_estrutura_conta", {
      destaque: {
        codigo: conta?.codigo ?? "",
        nome: conta?.nome ?? "",
        totalFilhos: envelope.dados.filhas.length,
      },
    });
  },
};
