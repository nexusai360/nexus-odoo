// mcp/tools/fiscal/carta-correcao.ts
// Tool MCP: fiscal_carta_correcao
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryCartaCorrecao } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  documentoId: z.number().int().positive().optional(),
  limite: z.number().int().min(1).max(300).optional(),
});

const linha = z.object({
  odooId: z.number().int(),
  descricao: z.string().nullable(),
  correcao: z.string().nullable(),
  documentoId: z.number().int().nullable(),
  dataAutorizacao: z.string().nullable(),
  protocoloAutorizacao: z.string().nullable(),
  sequencia: z.number().int().nullable(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
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

export const fiscalCartaCorrecao: ToolEntry<Input, Output> = {
  id: "fiscal_carta_correcao",
  dominio: "fiscal",
  descricao:
    "Cartas de correção (CC-e) de documentos fiscais: o texto da correção, o " +
    "documento corrigido, a data e o protocolo de autorização. Filtra por " +
    "documentoId.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_carta_correcao"], () =>
      queryCartaCorrecao(ctx.prisma, input),
    ),
};
