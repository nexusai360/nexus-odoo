// mcp/tools/fiscal/carta-correcao.ts
// Tool MCP: fiscal_carta_correcao
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryCartaCorrecao } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  documentoId: z.number().int().positive().optional(),
  ...paginacaoInputShape,
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
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
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
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_carta_correcao"], () =>
      queryCartaCorrecao(ctx.prisma, { ...input, limit, offset }),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    // totalDocumentos FULL-SET: contagem de documentos distintos no mesmo
    // recorte (sem LIMIT), nao a pagina.
    const whereCarta = input.documentoId != null ? { documentoId: input.documentoId } : {};
    const distintos = await ctx.prisma.fatoCartaCorrecao.findMany({
      where: whereCarta,
      select: { documentoId: true },
      distinct: ["documentoId"],
    });
    const destaque: Record<string, string | number> = {
      totalCartas: d.total,
      totalDocumentos: distintos.length,
      ...(input.documentoId != null ? { documentoId: input.documentoId } : {}),
    };
    return enriquecerEnvelope(envelope, "fiscal_carta_correcao", {
      destaque,
      agregado: { contagem: d.total },
      paginacao,
    });
  },
};
