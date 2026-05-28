// mcp/tools/fiscal/contar-notas.ts
// Tool MCP: fiscal_contar_notas
// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarNotas } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({});

const dados = z.object({
  total: z.number().int(),
  totalEntrada: z.number().int(),
  totalSaida: z.number().int(),
  _RESPOSTA: z.string().optional(),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalContarNotas: ToolEntry<Input, Output> = {
  id: "fiscal_contar_notas",
  dominio: "fiscal",
  descricao:
    "Contagem total de notas fiscais. Use para perguntas de quantidade " +
    "absoluta ('quantas notas fiscais existem'): devolve só os números , " +
    "`total`, `totalEntrada` (DF-e de fornecedores) e `totalSaida` (emitidas).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], () =>
      queryContarNotas(ctx.prisma),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const resposta = `${d.total} notas fiscais no total: ${d.totalSaida} emitidas (saída) e ${d.totalEntrada} recebidas (entrada).`;
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _DESTAQUE: { totalNotas: d.total, totalSaida: d.totalSaida, totalEntrada: d.totalEntrada },
        _agregado: { contagem: d.total },
      },
    };
  },
};
