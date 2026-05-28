// mcp/tools/estoque/entradas-saidas.ts
// Tool MCP: estoque_entradas_saidas
// shape omite detalhe , o agente recebe só a série mensal (mais compacta).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryEntradasSaidas } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  armazemId: z.number().int().positive().optional(),
});

const dados = z.object({
  serie: z.array(z.object({ mes: z.string(), entrada: z.number(), saida: z.number() })),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryEntradasSaidas>>) {
  // detalhe por produto é volumoso , omitido; agente recebe só a série mensal
  return { serie: d.serie };
}

export const estoqueEntradasSaidas: ToolEntry<Input, Output> = {
  id: "estoque_entradas_saidas",
  dominio: "estoque",
  descricao: "Série mensal de entradas e saídas de estoque.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_estoque_movimento"], async () =>
      shape(await queryEntradasSaidas(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    // T-32 (Ronda 2): _DESTAQUE com totais de entrada/saida para o formatador
    // gerar _RESPOSTA pronto. Resolve casos onde a serie e vazia ou tudo 0
    // (vira "Nao ha entradas/saidas no periodo" via regra §10b).
    const totalEntrada = envelope.dados.serie.reduce((s, r) => s + r.entrada, 0);
    const totalSaida = envelope.dados.serie.reduce((s, r) => s + r.saida, 0);
    return enriquecerEnvelope(envelope, "estoque_entradas_saidas", {
      destaque: {
        totalEntrada,
        totalSaida,
        periodos: envelope.dados.serie.length,
      },
    });
  },
};
