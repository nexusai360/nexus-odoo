// mcp/tools/fiscal/dfe-por-fornecedor.ts
// Tool MCP: fiscal_dfe_por_fornecedor
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryDfePorFornecedor } from "@/lib/reports/queries/dfe.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  documento: z
    .string()
    .min(1)
    .max(20)
    .optional()
    .describe("CNPJ/CPF do fornecedor (compara só os dígitos)."),
  periodoDe: z.string().optional().describe("Início do período, AAAA-MM-DD."),
  periodoAte: z.string().optional().describe("Fim do período, AAAA-MM-DD."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  cnpjFornecedor: z.string().nullable(),
  fornecedorNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalAgregado: z.object({ quantidade: z.number().int(), valorTotal: z.number() }),
  totalFornecedoresDistintos: z.number().int(),
  aviso: z.string(),
  // Contrato de lista (Fase B): a query ordena por quantidade de notas desc
  // (vrNf costuma vir 0 nesta base), com desempate por valor e CNPJ.
  ordenadoPor: z.string().optional(),
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

function shape(d: Awaited<ReturnType<typeof queryDfePorFornecedor>>) {
  return {
    linhas: d.linhas,
    totalAgregado: d.totalAgregado,
    totalFornecedoresDistintos: d.totalFornecedoresDistintos,
    ordenadoPor: "quantidade desc",
    aviso:
      "DF-e de fornecedores agrupados por CNPJ/CPF (participante_id costuma vir " +
      "vazio, por isso a chave é o documento). Ordenado por quantidade de notas. " +
      "vrNf pode estar 0 nesta base.",
  };
}

export const fiscalDfePorFornecedor: ToolEntry<Input, Output> = {
  id: "fiscal_dfe_por_fornecedor",
  dominio: "fiscal",
  descricao:
    "DF-e (notas de fornecedores capturadas eletronicamente) agrupados por " +
    "fornecedor (CNPJ/CPF), ordenados por quantidade. Use para 'de quais " +
    "fornecedores chegaram DF-e' ou 'quantas notas do fornecedor X'. Passe " +
    "`documento` (CNPJ/CPF) para um fornecedor específico. Filtro de período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_dfe"], async () =>
      shape(await queryDfePorFornecedor(ctx.prisma, { ...input, limit, offset })),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // total = numero de fornecedores distintos (a lista cresce por grupo).
    const paginacao = montarPaginacaoMeta(d.totalFornecedoresDistintos, offset, limit, d.linhas.length);
    const top = d.linhas[0];
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: top
          ? `DF-e por fornecedor: ${d.totalAgregado.quantidade} notas em ${d.totalFornecedoresDistintos} fornecedores. Top: ${top.fornecedorNome ?? top.cnpjFornecedor ?? "(sem cnpj)"} com ${top.quantidade} notas.`
          : "Nenhum DF-e no período.",
        _DESTAQUE: {
          totalDfe: d.totalAgregado.quantidade,
          totalFornecedores: d.totalFornecedoresDistintos,
          topFornecedor: top?.fornecedorNome ?? top?.cnpjFornecedor ?? "",
          notasTopFornecedor: top?.quantidade ?? 0,
        },
        _agregado: { contagem: d.totalAgregado.quantidade, soma: d.totalAgregado.valorTotal },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
