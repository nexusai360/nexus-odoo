// mcp/tools/fiscal/dfe-pendentes-manifestacao.ts
// Tool MCP: fiscal_dfe_pendentes_manifestacao
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryDfePendentesManifestacao } from "@/lib/reports/queries/dfe.js";
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
  totalPendentes: z.number().int(),
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

function shape(d: Awaited<ReturnType<typeof queryDfePendentesManifestacao>>) {
  return {
    linhas: d.linhas,
    totalPendentes: d.totalPendentes,
    valorTotal: d.valorTotal,
    aviso:
      "DF-e sem manifestação do destinatário (campo manifestação vazio). São " +
      "notas de fornecedores que ainda aguardam ciência/confirmação. vrNf pode " +
      "estar 0 nesta base.",
  };
}

export const fiscalDfePendentesManifestacao: ToolEntry<Input, Output> = {
  id: "fiscal_dfe_pendentes_manifestacao",
  dominio: "fiscal",
  descricao:
    "DF-e (notas de fornecedores) pendentes de manifestação do destinatário " +
    "(sem ciência/confirmação registrada). Use para 'quais DF-e estão pendentes " +
    "de manifestação' ou 'notas de fornecedor a manifestar'. Filtro de período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_dfe"], async () =>
      shape(await queryDfePendentesManifestacao(ctx.prisma, { ...input, limit, offset })),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.totalPendentes, offset, limit, d.linhas.length);
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          d.totalPendentes > 0
            ? `${d.totalPendentes} DF-e pendentes de manifestação no período.`
            : "Nenhum DF-e pendente de manifestação no período.",
        _DESTAQUE: { pendentes: d.totalPendentes },
        _agregado: { contagem: d.totalPendentes },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
