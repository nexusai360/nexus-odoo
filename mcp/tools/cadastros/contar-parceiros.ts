// mcp/tools/cadastros/contar-parceiros.ts
// Tool MCP: cadastro_contar_parceiros
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarParceiros } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({});

// Onda 1.C: envelope canonico
const dados = z.object({
  totalParceiros: z.number().int(),
  totalClientes: z.number().int(),
  totalFornecedores: z.number().int(),
  totalEmpresas: z.number().int(),
  totalPessoasFisicas: z.number().int(),
  totalAtivos: z.number().int(),
  totalInativos: z.number().int(),
  totalClientesAtivos: z.number().int(),
  totalFornecedoresAtivos: z.number().int(),
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
  handler: async (_input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_parceiro"],
      async () => {
        const result = await queryContarParceiros(ctx.prisma);
        return result;
      },
    );
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "cadastro_contar_parceiros", {
      destaque: {
        total: envelope.dados.totalParceiros,
        totalClientes: envelope.dados.totalClientes,
        totalFornecedores: envelope.dados.totalFornecedores,
        totalAtivos: envelope.dados.totalAtivos,
      },
    });
  },
};
