// mcp/tools/contabil/detalhar-conta.ts
// Tool MCP: contabil_detalhar_conta (detalhe por odooId, gated admin/super_admin)
//
// Retorna o detalhe completo de uma conta contabil a partir do odooId.
// GATE DE ROLE: restrita a admin/super_admin (defesa de seguranca via gatedRoles,
// aplicada na camada de catalogo/registry, nao depende de prompt).
//
// NOTA: nao ha lancamento/movimento contabil no Odoo da Matrix Fitness Group,
// apenas a estrutura do plano de contas (contas sinteticas e analiticas).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
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
  natureza: z.string().nullable(),
  nivel: z.number().int().nullable(),
  contaPaiNome: z.string().nullable(),
  parentPath: z.string().nullable(),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  encontrado: z.boolean(),
  conta: contaSchema.nullable(),
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

export const contabilDetalharConta: ToolEntry<Input, Output> = {
  id: "contabil_detalhar_conta",
  dominio: "contabil",
  gatedRoles: ["admin", "super_admin"],
  descricao:
    "Detalhe completo de uma conta contabil a partir do odooId (restrita a admin/super_admin): " +
    "codigo hierarquico, nome, tipo (S=sintetica/A=analitica), natureza, nivel, conta pai e caminho (parentPath). " +
    "NOTA: nao ha lancamento/movimento contabil no Odoo da Matrix, apenas a estrutura do plano de contas.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_conta_contabil"],
      async () => {
        const row = await ctx.prisma.fatoContaContabil.findFirst({
          where: { odooId: input.odooId },
        });
        if (!row) return { encontrado: false, conta: null };
        return {
          encontrado: true,
          conta: {
            odooId: row.odooId,
            codigo: row.codigo,
            nome: row.nome,
            tipo: row.tipo,
            natureza: row.natureza,
            nivel: row.nivel,
            contaPaiNome: row.contaPaiNome,
            parentPath: row.parentPath,
          },
        };
      },
      (d) => !d.encontrado,
    );
    if (envelope.estado === "preparando") return envelope;
    const c = envelope.dados.conta;
    return enriquecerEnvelope(envelope, "contabil_detalhar_conta", {
      destaque: c
        ? {
            codigo: c.codigo,
            nome: c.nome,
            tipo: c.tipo,
            natureza: c.natureza ?? "",
            nivel: c.nivel ?? "",
          }
        : { encontrado: "nao" },
    });
  },
};
