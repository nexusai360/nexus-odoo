// mcp/tools/fiscal/faturamento-por-cliente.ts
// Tool MCP: fiscal_faturamento_por_cliente
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryFaturamentoPorCliente } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const linhaSchema = z.object({
  participanteNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
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

function shape(d: Awaited<ReturnType<typeof queryFaturamentoPorCliente>>) {
  return {
    linhas: d.linhas,
    aviso: "Agrupa notas de saída autorizadas por cliente, ordenado por valor total descendente.",
  };
}

export const fiscalFaturamentoPorCliente: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_cliente",
  dominio: "fiscal",
  descricao: "Faturamento agrupado por cliente (notas de saída autorizadas), ordenado por valor total decrescente.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(await queryFaturamentoPorCliente(ctx.prisma, input)),
    ),
};
