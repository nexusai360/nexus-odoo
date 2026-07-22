// mcp/tools/estoque/evolucao-preco.ts
// Tool MCP: estoque_evolucao_preco , serie temporal de preco (fato_preco_historico) de um
// produto numa tabela. Embrulha serieDePreco (src/lib/estoque/serie-historico.ts), que ja trata
// corte de leitura, carry-forward (valor vigente ANTES da janela) e lacunas de observacao.
// Freshness usa o fato-BASE `fato_preco` (que grava FatoBuildState); o `*_historico` nunca grava
// build state, entao apontar para ele daria "preparando" eterno (INV-7).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { serieDePreco } from "@/lib/estoque/serie-historico.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  produtoId: z.number().int().describe("odoo_id do produto (product.product)."),
  tabelaId: z.number().int().describe("odoo_id da tabela de preco. Obrigatorio: a serie de preco e por tabela."),
  quantidadeMinima: z
    .number()
    .optional()
    .describe("Faixa de quantidade minima da regra de preco. Se omitido, devolve uma serie por faixa distinta."),
  de: z.string().optional().describe("Inicio da janela (ISO). Se omitido, ultimos 90 dias. Grampeado ao corte de leitura."),
  ate: z.string().optional().describe("Fim da janela (ISO). Se omitido, agora."),
});

const pontoSchema = z.object({
  capturadoEm: z.string(),
  valor: z.string().nullable(),
  evento: z.string(),
});
const lacunaSchema = z.object({
  de: z.string(),
  ate: z.string(),
  tipo: z.enum(["ausencia", "recusada"]),
});
const serieSchema = z.object({
  quantidadeMinima: z.number(),
  inicial: z.string().nullable(),
  pontos: z.array(pontoSchema),
  lacunas: z.array(lacunaSchema),
});

const dados = z.object({
  produtoId: z.number().int(),
  tabelaId: z.number().int(),
  de: z.string(),
  ate: z.string(),
  series: z.array(serieSchema),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
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

interface Serie {
  quantidadeMinima: number;
  inicial: string | null;
  pontos: { capturadoEm: string; valor: string | null; evento: string }[];
  lacunas: { de: string; ate: string; tipo: "ausencia" | "recusada" }[];
}

function shape(input: Input, de: string, ate: string, series: Serie[]) {
  return {
    produtoId: input.produtoId,
    tabelaId: input.tabelaId,
    de,
    ate,
    series,
    ordenadoPor: "pontos: capturadoEm asc",
    aviso:
      "Serie temporal de preco por faixa. `inicial` e o valor vigente ANTES da janela (carry-forward; " +
      "pode ser anterior ao corte, e ESTADO, nao fato analisado). `lacunas` marca onde nao houve " +
      "observacao (rodadas recusadas + ausencias inferidas): 'nao mudou' nao e 'nao observamos'.",
  };
}

export const estoqueEvolucaoPreco: ToolEntry<Input, Output> = {
  id: "estoque_evolucao_preco",
  dominio: "estoque",
  descricao:
    "Evolucao do preco de um produto numa tabela ao longo do tempo (serie historica de precos). " +
    "Use para 'como o preco do produto X evoluiu', 'historico de preco do item Y na tabela Z', " +
    "'o preco subiu ou caiu'. Requer `produtoId` e `tabelaId`; `quantidadeMinima` opcional (sem " +
    "ela, devolve uma serie por faixa). Janela default: ultimos 90 dias.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const ate = input.ate ?? new Date().toISOString();
    const de = input.de ?? new Date(Date.now() - 90 * 864e5).toISOString();

    const envelope = await withFreshness(ctx.prisma, ["fato_preco"], async () => {
      const faixas =
        input.quantidadeMinima !== undefined
          ? [input.quantidadeMinima]
          : (
              await ctx.prisma.fatoPrecoHistorico.findMany({
                where: { produtoId: input.produtoId, tabelaId: input.tabelaId },
                distinct: ["quantidadeMinima"],
                select: { quantidadeMinima: true },
              })
            ).map((r) => r.quantidadeMinima.toNumber());

      const series: Serie[] = [];
      for (const q of faixas) {
        const s = await serieDePreco(ctx.prisma, input.produtoId, input.tabelaId, q, de, ate);
        series.push({
          quantidadeMinima: q,
          inicial: s.inicial,
          pontos: s.pontos.map((p) => ({ capturadoEm: p.capturadoEm.toISOString(), valor: p.valor, evento: p.evento })),
          lacunas: s.lacunas.map((l) => ({ de: l.de.toISOString(), ate: l.ate.toISOString(), tipo: l.tipo })),
        });
      }
      return shape(input, de, ate, series);
    });

    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const principal = d.series[0];
    const totalPontos = d.series.reduce((n, s) => n + s.pontos.length, 0);
    const primeiro = principal?.inicial ?? principal?.pontos[0]?.valor ?? null;
    const ultimo = principal ? (principal.pontos.at(-1)?.valor ?? principal.inicial) : null;
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          totalPontos > 0 || d.series.length > 0
            ? `Produto ${d.produtoId}, tabela ${d.tabelaId}: ${d.series.length} faixa(s), ${totalPontos} mudanca(s) de preco na janela. ` +
              (primeiro != null || ultimo != null ? `Preco ${primeiro ?? "?"} -> ${ultimo ?? "?"}.` : "")
            : `Sem historico de preco para o produto ${d.produtoId} na tabela ${d.tabelaId}.`,
        _DESTAQUE: {
          produtoId: d.produtoId,
          tabelaId: d.tabelaId,
          faixas: d.series.length,
          mudancas: totalPontos,
        },
        _agregado: { contagem: totalPontos },
      },
    };
  },
};
