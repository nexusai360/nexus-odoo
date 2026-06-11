// mcp/tools/fiscal/impostos-periodo.ts
// Tool MCP: fiscal_impostos_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryImpostosPeriodo } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { montarEscopoEmpresa, type EscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal, TEXTO_HONESTO_PRE_CORTE } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
});

// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness.
// aviso FIXO: IBPT é estimativa do cabeçalho; imposto exato item-a-item é refinamento futuro.
const dados = z.object({
  totalNotas: z.number().int(),
  somaIbpt: z.number(),
  somaIcmsProprio: z.number(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
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

function shape(d: Awaited<ReturnType<typeof queryImpostosPeriodo>>, escopo: EscopoEmpresa) {
  return {
    totalNotas: d.totalNotas,
    somaIbpt: d.somaIbpt,
    somaIcmsProprio: d.somaIcmsProprio,
    escopoEmpresa: escopo as unknown as Record<string, unknown>,
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
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(
        await queryImpostosPeriodo(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
          empresaId: escopo.empresaId,
        }),
        escopo.escopo,
      ),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: per.preCorte
          ? `${TEXTO_HONESTO_PRE_CORTE} (Periodo pedido: ${per.label}.)`
          : `Impostos no periodo ${per.label} (${d.totalNotas} notas): IBPT (estimativa) ${fmt(d.somaIbpt)}, ICMS proprio ${fmt(d.somaIcmsProprio)}.`,
        _DESTAQUE: { totalNotas: d.totalNotas, somaIbpt: d.somaIbpt, somaIcmsProprio: d.somaIcmsProprio, ...(per.preCorte ? { periodoPreCorte: 1 } : {}) },
        _agregado: { contagem: d.totalNotas, soma: d.somaIbpt + d.somaIcmsProprio },
      },
    };
  },
};
