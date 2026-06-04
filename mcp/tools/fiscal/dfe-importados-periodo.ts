// mcp/tools/fiscal/dfe-importados-periodo.ts
// Tool MCP: fiscal_dfe_importados_periodo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryDfeImportadosPeriodo } from "@/lib/reports/queries/dfe.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional().describe("Início do período, AAAA-MM-DD."),
  periodoAte: z.string().optional().describe("Fim do período, AAAA-MM-DD."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  chave: z.string().nullable(),
  numero: z.string().nullable(),
  modelo: z.string().nullable(),
  cnpjFornecedor: z.string().nullable(),
  fornecedorNome: z.string().nullable(),
  vrNf: z.number(),
  dataEmissao: z.string().nullable(),
  manifestacao: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalNotas: z.number().int(),
  valorTotal: z.number(),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

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

function shape(d: Awaited<ReturnType<typeof queryDfeImportadosPeriodo>>) {
  return {
    linhas: d.linhas,
    totalNotas: d.totalNotas,
    valorTotal: d.valorTotal,
    aviso:
      "DF-e (notas de fornecedores capturadas eletronicamente / manifestação do " +
      "destinatário). Diferente de 'notas recebidas' (documentos próprios de " +
      "entrada). O valor (vrNf) pode vir 0 nesta base; o valor confiável de compra " +
      "vem do financeiro.",
  };
}

export const fiscalDfeImportadosPeriodo: ToolEntry<Input, Output> = {
  id: "fiscal_dfe_importados_periodo",
  dominio: "fiscal",
  descricao:
    "DF-e importados (notas de fornecedores capturadas eletronicamente, via " +
    "manifestação do destinatário) no período. Use para 'quais notas/DF-e de " +
    "fornecedores chegaram'. Distinto de notas recebidas próprias. Filtro de " +
    "período periodoDe/periodoAte (AAAA-MM-DD).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_dfe"], async () =>
      shape(await queryDfeImportadosPeriodo(ctx.prisma, { ...input, limit, offset })),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.totalNotas, offset, limit, d.linhas.length);
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          d.totalNotas > 0
            ? `DF-e importados no período: ${d.totalNotas} notas (valor declarado ${fmt(d.valorTotal)}, pode estar 0 nesta base).`
            : "Nenhum DF-e importado no período.",
        _DESTAQUE: { totalDfe: d.totalNotas, valorTotal: d.valorTotal },
        _agregado: { contagem: d.totalNotas, soma: d.valorTotal },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
