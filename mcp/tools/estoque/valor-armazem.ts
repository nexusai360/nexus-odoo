// mcp/tools/estoque/valor-armazem.ts
// Tool MCP: estoque_valor_armazem
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryValorArmazem } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  // Cobertura Cliente A6: filtro pela arvore de locais (prefixo do
  // nome_completo). Fisico = subarvore "Próprio"; demonstracao =
  // "Terceiros / Demonstração".
  locais: z.array(z.string().trim().min(2)).optional()
    .describe("Prefixos da arvore de locais, ex.: ['Terceiros / Demonstração'] ou ['Vendas']."),
  apenasFisicos: z.boolean().optional()
    .describe("true = apenas estoque fisico (subarvore 'Próprio')."),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  kpis: z.object({ valorTotal: z.number(), numArmazens: z.number().int() }),
  linhas: z.array(z.object({
    armazem: z.string(),
    valor: z.number(),
    numProdutos: z.number().int(),
    percentual: z.number(),
  })),
  // Contrato de lista (Fase B): armazens ordenados por valor desc na query.
  ordenadoPor: z.string().optional(),
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

function shape(d: Awaited<ReturnType<typeof queryValorArmazem>>) {
  return {
    kpis: d.kpis,
    linhas: d.linhasBruto.map((l) => ({
      armazem: l.armazem,
      valor: l.valor,
      numProdutos: l.numProdutos,
      percentual: d.kpis.valorTotal > 0 ? (l.valor / d.kpis.valorTotal) * 100 : 0,
    })),
    // Contrato de lista (Fase B): linhasBruto ja vem por valor desc da query.
    ordenadoPor: "valor desc",
  };
}

export const estoqueValorArmazem: ToolEntry<Input, Output> = {
  id: "estoque_valor_armazem",
  dominio: "estoque",
  descricao:
    "Valor de estoque a preço de custo por armazém. Filtre por `locais` (prefixos da " +
    "árvore de locais, ex.: 'Terceiros / Demonstração') ou `apenasFisicos` (subárvore " +
    "Próprio). Use para 'valor total de estoque', 'valor de estoque físico', 'estoque " +
    "em demonstração', 'estoque em poder de terceiros', 'estoque no local X'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const prefixos = [
      ...(input.apenasFisicos ? ["Próprio"] : []),
      ...(input.locais ?? []),
    ];
    const escopoLocais =
      prefixos.length > 0 ? prefixos.join("; ") : "todos os locais";
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo"],
      async () =>
        shape(
          await queryValorArmazem(
            ctx.prisma,
            prefixos.length > 0 ? { prefixosArvore: prefixos } : undefined,
          ),
        ),
    );
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "estoque_valor_armazem", {
      destaque: {
        valorTotal: envelope.dados.kpis.valorTotal,
        contagemArmazens: envelope.dados.kpis.numArmazens,
        escopoLocais,
      },
      agregado: {
        soma: envelope.dados.kpis.valorTotal,
        contagem: envelope.dados.kpis.numArmazens,
      },
    });
  },
};
