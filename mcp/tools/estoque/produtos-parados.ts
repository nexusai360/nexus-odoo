// mcp/tools/estoque/produtos-parados.ts
// Tool MCP: estoque_produtos_parados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryProdutosParados } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  faixaDias: z.number().int().nonnegative().optional(),
  armazemId: z.number().int().positive().optional(),
  ...paginacaoInputShape,
});

// Onda 1.C: envelope canonico
const dados = z.object({
  kpis: z.object({ totalParados: z.number().int(), valorImobilizado: z.number() }),
  total: z.number().int(),
  linhas: z.array(z.object({
    produtoNome: z.string().nullable(),
    localNome: z.string().nullable(),
    saldo: z.number(),
    dias: z.number().int(),
    vrSaldo: z.number(),
  })),
  // Contrato de lista (Fase B): pagina ordenada por dias parado desc na query.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  _PAGINACAO: z.any().optional(),
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

function shape(d: Awaited<ReturnType<typeof queryProdutosParados>>) {
  // Contrato de lista (Fase B): a query ordena por dias desc (desempate saldoHojeId).
  return { kpis: d.kpis, linhas: d.linhas, total: d.total, ordenadoPor: "dias parado desc" };
}

export const estoqueProdutosParados: ToolEntry<Input, Output> = {
  id: "estoque_produtos_parados",
  dominio: "estoque",
  descricao: "Produtos parados em estoque (saldo > 0, sem movimento).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_produto_parado"],
      async () =>
        shape(
          await queryProdutosParados(ctx.prisma, {
            faixaDias: input.faixaDias,
            armazemId: input.armazemId,
            limit,
            offset,
          }),
        ),
    );
    if (envelope.estado === "preparando") return envelope;
    const paginacao = montarPaginacaoMeta(
      envelope.dados.total,
      offset,
      limit,
      envelope.dados.linhas.length,
    );
    return enriquecerEnvelope(envelope, "estoque_produtos_parados", {
      destaque: {
        totalProdutos: envelope.dados.kpis.totalParados,
        valorImobilizado: envelope.dados.kpis.valorImobilizado,
      },
      agregado: {
        soma: envelope.dados.kpis.valorImobilizado,
        contagem: envelope.dados.kpis.totalParados,
      },
      paginacao,
    });
  },
};
