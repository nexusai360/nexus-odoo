// mcp/tools/contabil/conta-referencial.ts
// Tool MCP: contabil_conta_referencial
//
// Plano de contas REFERENCIAL do SPED (de-para padronizado da Receita), lido de
// fato_contabil_conta_referencial. Diferente das tools de gestão, esta responde
// com DADO REAL hoje (2216 contas referenciais). Filtra por natureza (01..09)
// e/ou termo (código/nome).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContaReferencial } from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  natureza: z.string().optional(),
  termo: z.string().optional(),
  limite: z.number().int().positive().optional(),
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  codigo: z.string(),
  nome: z.string().nullable(),
  natureza: z.string().nullable(),
  nivel: z.number().int().nullable(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  truncado: z.boolean(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

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

export const contabilContaReferencial: ToolEntry<Input, Output> = {
  id: "contabil_conta_referencial",
  dominio: "contabil",
  descricao:
    "Plano de contas referencial do SPED (de-para padronizado da Receita Federal): código, nome, natureza (01 a 09) e nível hierárquico. " +
    "Filtre por natureza e/ou termo (código/nome). Este é dado real e disponível agora.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_contabil_conta_referencial"],
      async () => {
        const result = await queryContaReferencial(ctx.prisma, input);
        return { linhas: result.linhas, total: result.total, truncado: result.truncado };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const exibidas = envelope.dados.linhas.length;
    // listaTruncada:false suprime o auto-aviso (que conta linhas financeiras e
    // erra "listando 0"); o aviso correto é montado abaixo com a contagem real.
    const out = enriquecerEnvelope(envelope, "contabil_conta_referencial", {
      destaque: {
        contagem: envelope.dados.total,
        linhasExibidas: exibidas,
        natureza: input.natureza ?? "",
        termo: input.termo ?? "",
      },
      listaTruncada: false,
    });
    if (out.estado !== "preparando" && envelope.dados.truncado) {
      out.dados._listaTruncada = true;
      out.dados._RESPOSTA = `${out.dados._RESPOSTA} Encontrei ${envelope.dados.total} contas referenciais, listando ${exibidas}. Refine por natureza/termo ou aumente o limite.`.trim();
    }
    return out;
  },
};
