// mcp/tools/fiscal/notas-recebidas-por-fornecedor.ts
// Tool MCP: fiscal_notas_recebidas_por_fornecedor
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryNotasRecebidasPorFornecedor } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  /** Filtra por nome do fornecedor (busca parcial). Use para perguntas
   * sobre um fornecedor específico, em vez de depender do ranking. */
  fornecedor: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe(
      "Nome (ou parte) do fornecedor. Pode casar com matriz e filiais ao " +
        "mesmo tempo: para o total do fornecedor leia `totalAgregado`, não uma linha.",
    ),
  /** CNPJ ou CPF do fornecedor , identificação inequívoca. */
  documento: z
    .string()
    .min(1)
    .max(20)
    .optional()
    .describe("CNPJ/CPF do fornecedor. Identifica o fornecedor sem ambiguidade."),
  periodoDe: z.string().optional().describe("Início do período, AAAA-MM-DD."),
  periodoAte: z.string().optional().describe("Fim do período, AAAA-MM-DD."),
  limite: z.number().int().min(1).max(200).optional(),
});

const linhaSchema = z.object({
  participanteNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalAgregado: z.object({
    quantidade: z.number().int(),
    valorTotal: z.number(),
  }),
  totalFornecedoresDistintos: z.number().int(),
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

function shape(d: Awaited<ReturnType<typeof queryNotasRecebidasPorFornecedor>>) {
  return {
    linhas: d.linhas,
    totalAgregado: d.totalAgregado,
    totalFornecedoresDistintos: d.totalFornecedoresDistintos,
    aviso:
      "Agrupa notas fiscais de entrada (DF-e de fornecedores) por fornecedor, " +
      "ordenado por valor recebido decrescente. `totalAgregado` soma todas as " +
      "notas que casaram o filtro (use-o para 'quantas notas do fornecedor X'); " +
      "`linhas` é o detalhamento por participante.",
  };
}

export const fiscalNotasRecebidasPorFornecedor: ToolEntry<Input, Output> = {
  id: "fiscal_notas_recebidas_por_fornecedor",
  dominio: "fiscal",
  descricao:
    "Notas fiscais de entrada (compras e devoluções, DF-e de fornecedores) " +
    "agrupadas por fornecedor, ordenadas por valor total decrescente. " +
    "Para perguntas sobre um fornecedor específico, passe `fornecedor` (nome " +
    "ou parte) ou `documento` (CNPJ/CPF, sem ambiguidade). Quando filtrado, " +
    "`totalAgregado` traz a contagem e o valor somados de todas as notas que " +
    "casaram , é a resposta para 'quantas notas do fornecedor X'. Aceita " +
    "filtro de período (periodoDe/periodoAte AAAA-MM-DD).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(await queryNotasRecebidasPorFornecedor(ctx.prisma, input)),
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
        _RESPOSTA: top
          ? `Notas recebidas por fornecedor: ${d.totalAgregado.quantidade} notas, ${fmt(d.totalAgregado.valorTotal)} em ${d.totalFornecedoresDistintos} fornecedores. Top: ${top.participanteNome ?? "(sem nome)"} ${fmt(top.valorTotal)}.`
          : "Nao ha notas recebidas no periodo.",
        _DESTAQUE: {
          totalNotas: d.totalAgregado.quantidade,
          valorTotal: d.totalAgregado.valorTotal,
          totalFornecedores: d.totalFornecedoresDistintos,
          topFornecedor: top?.participanteNome ?? "",
          valorTopFornecedor: top?.valorTotal ?? 0,
        },
        _agregado: { contagem: d.totalAgregado.quantidade, soma: d.totalAgregado.valorTotal },
        _listaTruncada: todasLinhas.length > linhasCap.length,
      },
    };
  },
};
