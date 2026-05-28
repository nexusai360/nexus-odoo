// mcp/tools/financeiro/caixa-periodo.ts
// Tool MCP: financeiro_caixa_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryCaixaPeriodo } from "@/lib/reports/queries/financeiro.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const dados = z.object({
  entrada: z.number(),
  saida: z.number(),
  saldo: z.number(),
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

export const financeiroCaixaPeriodo: ToolEntry<Input, Output> = {
  id: "financeiro_caixa_periodo",
  dominio: "financeiro",
  descricao: "Entradas, saídas e saldo de caixa realizado em um período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  // SEM ESTADO "VAZIO" , decisão explícita (no-op intencional):
  // `dados` é escalar ({ entrada, saida, saldo }), sem array. `withFreshness`
  // não tem como inferir "vazio" pela heurística padrão (ARRAY_KEYS_PRIORITY),
  // então sempre emite "ok". Isso é CORRETO para esta tool: caixa zerado num
  // período é um resultado válido e informativo , "entrada: 0, saida: 0,
  // saldo: 0" comunica que não houve movimentação, o que é diferente de
  // "nenhum dado disponível". Não passamos `isVazio` por intenção deliberada.
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_financeiro_movimento"], async () =>
      queryCaixaPeriodo(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const resposta =
      d.entrada === 0 && d.saida === 0
        ? "Nao ha movimentacao de caixa no periodo."
        : `Caixa do periodo: entradas ${fmt(d.entrada)}, saidas ${fmt(d.saida)}, saldo ${fmt(d.saldo)}.`;
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _DESTAQUE: { entradaTotal: d.entrada, saidaTotal: d.saida, saldo: d.saldo },
        _agregado: { soma: d.saldo },
      },
    };
  },
};
