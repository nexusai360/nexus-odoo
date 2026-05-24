// mcp/tools/fiscal/impostos-periodo.ts
// Tool MCP: fiscal_impostos_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryImpostosPeriodo } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness.
// aviso FIXO: IBPT é estimativa do cabeçalho; imposto exato item-a-item é refinamento futuro.
const dados = z.object({
  totalNotas: z.number().int(),
  somaIbpt: z.number(),
  somaIcmsProprio: z.number(),
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

function shape(d: Awaited<ReturnType<typeof queryImpostosPeriodo>>) {
  return {
    totalNotas: d.totalNotas,
    somaIbpt: d.somaIbpt,
    somaIcmsProprio: d.somaIcmsProprio,
    aviso:
      "O somaIbpt é a estimativa IBPT registrada no cabeçalho da nota fiscal (campo vr_ibpt). " +
      "Para imposto exato item-a-item, consulte a tool fiscal_produtos_faturados. " +
      "somaIcmsProprio é o ICMS próprio do cabeçalho (vr_icms_proprio).",
  };
}

export const fiscalImpostosPeriodo: ToolEntry<Input, Output> = {
  id: "fiscal_impostos_periodo",
  dominio: "fiscal",
  descricao: "Estimativa de impostos (IBPT e ICMS próprio) no período, agregados do cabeçalho da nota fiscal.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(await queryImpostosPeriodo(ctx.prisma, input)),
    ),
};
