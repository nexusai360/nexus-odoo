// mcp/tools/financeiro/resultado-por-conta.ts
// Tool MCP: financeiro_resultado_por_conta
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryResultadoPorConta } from "@/lib/reports/queries/financeiro-resultado.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional().describe("Início do período, AAAA-MM-DD."),
  periodoAte: z.string().optional().describe("Fim do período, AAAA-MM-DD."),
  natureza: z.enum(["receita", "despesa"]).optional().describe("Filtra só receita ou só despesa."),
  limite: z.number().int().min(1).max(200).optional(),
});

const linhaSchema = z.object({
  contaNome: z.string().nullable(),
  natureza: z.string(),
  total: z.number(),
  itens: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalReceita: z.number(),
  totalDespesa: z.number(),
  resultado: z.number(),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});
const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryResultadoPorConta>>) {
  return {
    ...d,
    aviso:
      "DRE gerencial: receitas e despesas agrupadas por conta gerencial (itens do " +
      "lançamento financeiro). resultado = receita - despesa. Não confundir com " +
      "saldo bancário (financeiro_saldo_contas) nem fluxo de caixa.",
  };
}

export const financeiroResultadoPorConta: ToolEntry<Input, Output> = {
  id: "financeiro_resultado_por_conta",
  dominio: "financeiro",
  descricao:
    "Resultado gerencial (DRE simplificada) por conta gerencial: receitas e " +
    "despesas agrupadas por conta, com total e resultado (receita - despesa). " +
    "Use para 'quanto gastei/recebi por conta', 'principais despesas por conta', " +
    "'DRE gerencial'. Filtros: período (periodoDe/periodoAte AAAA-MM-DD) e " +
    "natureza (receita|despesa).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_financeiro_lancamento_item"], async () =>
      shape(await queryResultadoPorConta(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const todasLinhas = d.linhas;
    const linhasCap = todasLinhas.slice(0, 30);
    const top = todasLinhas[0];
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        linhas: linhasCap,
        _RESPOSTA: `Resultado gerencial: receita ${fmt(d.totalReceita)}, despesa ${fmt(d.totalDespesa)}, resultado ${fmt(d.resultado)}.${top ? ` Maior: ${top.contaNome ?? "(sem conta)"} (${top.natureza}, ${fmt(top.total)}).` : ""}`,
        _DESTAQUE: {
          totalReceita: d.totalReceita,
          totalDespesa: d.totalDespesa,
          resultado: d.resultado,
          contaTop: top?.contaNome ?? "",
        },
        _agregado: { soma: d.resultado },
        _listaTruncada: todasLinhas.length > linhasCap.length,
      },
    };
  },
};
