// mcp/tools/fiscal/notas-recebidas-por-fornecedor.ts
// Tool MCP: fiscal_notas_recebidas_por_fornecedor
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryNotasRecebidasPorFornecedor } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  limite: z.number().int().min(1).max(200).optional(),
});

const linhaSchema = z.object({
  participanteNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  aviso: z.string(),
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

function shape(d: Awaited<ReturnType<typeof queryNotasRecebidasPorFornecedor>>) {
  return {
    linhas: d.linhas,
    aviso:
      "Agrupa notas fiscais de entrada (DF-e de fornecedores) por fornecedor, " +
      "ordenado por valor recebido decrescente.",
  };
}

export const fiscalNotasRecebidasPorFornecedor: ToolEntry<Input, Output> = {
  id: "fiscal_notas_recebidas_por_fornecedor",
  dominio: "fiscal",
  descricao:
    "Notas fiscais de entrada (compras e devoluções, DF-e de fornecedores) " +
    "agrupadas por fornecedor, ordenadas por valor total decrescente. " +
    "Aceita filtro de período (periodoDe/periodoAte em AAAA-MM-DD).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(await queryNotasRecebidasPorFornecedor(ctx.prisma, input)),
    ),
};
