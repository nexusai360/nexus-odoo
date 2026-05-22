// mcp/tools/fiscal/apuracao-fiscal.ts
// Tool MCP: fiscal_apuracao
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryApuracaoFiscal } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  tipo: z.enum(["ICMS-IPI", "PIS-COFINS"]).optional(),
  limite: z.number().int().min(1).max(200).optional(),
});

const linha = z.object({
  odooId: z.number().int(),
  empresaNome: z.string().nullable(),
  dataInicial: z.string().nullable(),
  dataFinal: z.string().nullable(),
  tipo: z.string().nullable(),
  entregue: z.boolean(),
  regimeTributario: z.string().nullable(),
  vrIcmsARecolher: z.number(),
  vrIcmsSaldoCredor: z.number(),
  vrIpiARecolher: z.number(),
  vrPisARecolher: z.number(),
  vrCofinsARecolher: z.number(),
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

export const fiscalApuracao: ToolEntry<Input, Output> = {
  id: "fiscal_apuracao",
  dominio: "fiscal",
  descricao:
    "Apurações fiscais da empresa (ICMS-IPI e PIS-COFINS): período, valores a " +
    "recolher de ICMS, IPI, PIS e COFINS, saldo credor de ICMS e se a apuração " +
    "foi entregue. Filtra por tipo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_apuracao"], () =>
      queryApuracaoFiscal(ctx.prisma, input),
    ),
};
