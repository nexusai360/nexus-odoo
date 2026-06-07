// mcp/tools/fiscal/detalhar-nota.ts
// Tool MCP: fiscal_detalhar_nota (detalhe por odooId)
//
// Retorna o detalhe completo de uma nota fiscal a partir do odooId.
// O campo `numero` e omitido de proposito: e 100% null no banco (spec 4.4/7).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  odooId: z.number().int().positive(),
});

const dados = z.object({
  encontrado: z.boolean(),
  nota: z
    .object({
      odooId: z.number().int(),
      serie: z.string().nullable(),
      modelo: z.string().nullable(),
      chave: z.string().nullable(),
      entradaSaida: z.string().nullable(),
      situacaoNfe: z.string().nullable(),
      participanteNome: z.string().nullable(),
      naturezaOperacaoNome: z.string().nullable(),
      dataEmissao: z.string().nullable(),
      vrNf: z.number(),
      vrProdutos: z.number(),
    })
    .nullable(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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

export const fiscalDetalharNota: ToolEntry<Input, Output> = {
  id: "fiscal_detalhar_nota",
  dominio: "fiscal",
  descricao:
    "Detalhe completo de uma nota fiscal a partir do odooId (sem numero, " +
    "pois o campo nao e populado): serie, modelo, chave, entrada/saida, " +
    "situacao NF-e, participante, natureza da operacao, data de emissao, " +
    "valor da NF e valor dos produtos.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_nota_fiscal"],
      async () => {
        const row = await ctx.prisma.fatoNotaFiscal.findFirst({
          where: { odooId: input.odooId },
        });
        if (!row) return { encontrado: false, nota: null };
        return {
          encontrado: true,
          nota: {
            odooId: row.odooId,
            serie: row.serie,
            modelo: row.modelo,
            chave: row.chave,
            entradaSaida: row.entradaSaida,
            situacaoNfe: row.situacaoNfe,
            participanteNome: row.participanteNome,
            naturezaOperacaoNome: row.naturezaOperacaoNome,
            dataEmissao: row.dataEmissao ? row.dataEmissao.toISOString() : null,
            vrNf: Number(row.vrNf),
            vrProdutos: Number(row.vrProdutos),
          },
        };
      },
      (d) => !d.encontrado,
    );
    if (envelope.estado === "preparando") return envelope;
    const n = envelope.dados.nota;
    return enriquecerEnvelope(envelope, "fiscal_detalhar_nota", {
      destaque: n
        ? {
            chave: n.chave ?? "",
            participante: n.participanteNome ?? "",
            situacao: n.situacaoNfe ?? "",
            vrNf: n.vrNf,
          }
        : { encontrado: "nao" },
    });
  },
};
