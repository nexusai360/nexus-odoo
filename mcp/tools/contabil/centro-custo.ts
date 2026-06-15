// mcp/tools/contabil/centro-custo.ts
// Tool MCP: contabil_centro_custo
//
// Saldo por centro de custo no período. Lê de fato_contabil_lancamento_item
// (centro de custo denormalizado no item). Enquanto a contabilidade não é
// operada no Odoo (0 lançamentos), responde honestamente "não operado".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import {
  queryCentroCusto,
  fatoContabilItemCount,
  mensagemContabilGestaoVazia,
} from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  limite: z.number().int().positive().optional(),
});

const linhaSchema = z.object({
  centroCustoId: z.number().int().nullable(),
  centroCustoNome: z.string().nullable(),
  debito: z.number(),
  credito: z.number(),
  saldo: z.number(),
});

const dados = z.object({
  // Contrato de lista (Fase B): ordenacao declarada.
  ordenadoPor: z.string().optional(),
  linhas: z.array(linhaSchema),
  total: z.number().int(),
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

export const contabilCentroCusto: ToolEntry<Input, Output> = {
  id: "contabil_centro_custo",
  dominio: "contabil",
  descricao:
    "Saldo contábil por centro de custo no período: para cada centro de custo, soma de débitos, créditos e saldo. " +
    "Filtre por período (dataInicio/dataFim, AAAA-MM-DD). " +
    "NOTA: a contabilidade ainda não é operada no Odoo da Matrix (sem lançamentos); responde automaticamente quando os lançamentos forem lançados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_contabil_lancamento_item"],
      async () => {
        const result = await queryCentroCusto(ctx.prisma, input);
        return { linhas: result.linhas, total: result.total, ordenadoPor: "nome do centro de custo asc" };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const out = enriquecerEnvelope(envelope, "contabil_centro_custo", {
      destaque: { contagem: envelope.dados.total },
    });
    if (out.estado === "vazio") {
      const n = await fatoContabilItemCount(ctx.prisma);
      out.dados._RESPOSTA = mensagemContabilGestaoVazia(n);
    }
    return out;
  },
};
