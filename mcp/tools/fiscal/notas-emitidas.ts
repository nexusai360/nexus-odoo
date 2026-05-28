// mcp/tools/fiscal/notas-emitidas.ts
// Tool MCP: fiscal_notas_emitidas
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryNotasEmitidas } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  situacaoNfe: z.string().optional(),
});

const linhaSchema = z.object({
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  situacaoNfe: z.string().nullable(),
  participanteNome: z.string().nullable(),
  vrNf: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalNotas: z.number().int(),
  valorTotal: z.number(),
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

function shape(d: Awaited<ReturnType<typeof queryNotasEmitidas>>) {
  return {
    linhas: d.linhas.map((l) => ({
      numero: l.numero,
      serie: l.serie,
      dataEmissao: l.dataEmissao ? l.dataEmissao.toISOString() : null,
      situacaoNfe: l.situacaoNfe,
      participanteNome: l.participanteNome,
      vrNf: l.vrNf,
    })),
    totalNotas: d.totalNotas,
    valorTotal: d.valorTotal,
    aviso: "Lista notas fiscais de saída (entradaSaida='1'). Filtre situacaoNfe para restringir por status (ex.: 'autorizada', 'cancelada').",
  };
}

export const fiscalNotasEmitidas: ToolEntry<Input, Output> = {
  id: "fiscal_notas_emitidas",
  dominio: "fiscal",
  descricao: "Notas fiscais de saída emitidas, com valor e situação NFe, opcionalmente filtradas por período ou status.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(await queryNotasEmitidas(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // T-38 (Ronda 3): cap em 30 linhas + envelope canonico. Antes a tool
    // devolvia 7.7MB de linhas cruas e o LLM truncava sem total.
    const todasLinhas = d.linhas;
    const linhasCap = todasLinhas.slice(0, 30);
    return enriquecerEnvelope(
      { ...envelope, dados: { ...d, linhas: linhasCap } },
      "fiscal_notas_emitidas",
      {
        destaque: {
          totalNotas: d.totalNotas,
          valorTotal: d.valorTotal,
          contagem: d.totalNotas,
          linhasExibidas: linhasCap.length,
        },
        agregado: { contagem: d.totalNotas, soma: d.valorTotal },
        listaTruncada: todasLinhas.length > linhasCap.length,
      },
    );
  },
};
