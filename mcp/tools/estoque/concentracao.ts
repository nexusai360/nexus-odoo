// mcp/tools/estoque/concentracao.ts
// Tool MCP: estoque_concentracao
// percentual é shaping , calculado aqui na tool (regra N8), não no núcleo.
// Sem agruparTopN , o agente recebe a lista completa (sem shaping de gráfico).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryConcentracao } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { classificacaoInputShape, rotuloClassificacao } from "../../lib/classificacao.js";

const inputSchema = z.object({ ...classificacaoInputShape });

const dados = z.object({
  familia: z.array(z.object({ familia: z.string(), valor: z.number(), percentual: z.number() })),
  marca: z.array(z.object({ marca: z.string(), valor: z.number(), percentual: z.number() })),
  // Contrato de lista (Fase B): familia e marca ja vem ordenadas por valor desc
  // na query (queryConcentracao). A ordenacao e declarada para o agente.
  ordenadoPor: z.string().optional(),
  // F4 Onda 4: campos de apresentacao injetados por enriquecerEnvelope.
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryConcentracao>>) {
  const totalFamilia = d.familiasBruto.reduce((acc, r) => acc + r.valor, 0);
  const totalMarca = d.marcasBruto.reduce((acc, r) => acc + r.valor, 0);
  return {
    // percentual calculado aqui na tool (regra N8 , shaping fora do núcleo)
    familia: d.familiasBruto.map((r) => ({
      familia: r.rotulo,
      valor: r.valor,
      percentual: totalFamilia > 0 ? (r.valor / totalFamilia) * 100 : 0,
    })),
    marca: d.marcasBruto.map((r) => ({
      marca: r.rotulo,
      valor: r.valor,
      percentual: totalMarca > 0 ? (r.valor / totalMarca) * 100 : 0,
    })),
    // sem agruparTopN , agente recebe lista completa
    // Contrato de lista (Fase B): ambas as listas vem por valor desc da query.
    ordenadoPor: "valor desc",
  };
}

export const estoqueConcentracao: ToolEntry<Input, Output> = {
  id: "estoque_concentracao",
  dominio: "estoque",
  descricao:
    "Concentração do estoque por família e marca (valor e percentual). Por padrão só o " +
    "estoque próprio; use `classificacao` para 'demonstracao' ou 'todos' os locais.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const classificacao = input.classificacao ?? "fisico";
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo"],
      async () => shape(await queryConcentracao(ctx.prisma, { classificacao })),
      // Paridade com dashboard F3 (getRelatorioConcentracao): "vazio" apenas
      // quando AMBOS os arrays estão vazios (regra conjuntiva). Se só famílias
      // estiverem vazias mas marcas preenchidas (ou vice-versa), o estado é "ok".
      (dados) => dados.familia.length === 0 && dados.marca.length === 0,
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // Agregados FULL-SET (os arrays ja cobrem o conjunto inteiro, sem paginacao).
    const valorTotalFamilia = d.familia.reduce((a, b) => a + b.valor, 0);
    const topFamilia = d.familia[0]; // queryConcentracao ja ordena por valor desc
    const topMarca = d.marca[0];
    const destaque: Record<string, string | number> = {
      totalFamilias: d.familia.length,
      totalMarcas: d.marca.length,
      valorTotal: valorTotalFamilia,
      escopoLocais: rotuloClassificacao(classificacao),
    };
    if (topFamilia) {
      destaque.topFamilia = topFamilia.familia;
      destaque.valorTopFamilia = topFamilia.valor;
      destaque.pctTopFamilia = Math.round(topFamilia.percentual * 10) / 10;
    }
    if (topMarca) {
      destaque.topMarca = topMarca.marca;
      destaque.valorTopMarca = topMarca.valor;
      destaque.pctTopMarca = Math.round(topMarca.percentual * 10) / 10;
    }
    return enriquecerEnvelope(envelope, "estoque_concentracao", {
      destaque,
      agregado: { contagem: d.familia.length, soma: valorTotalFamilia },
    });
  },
};
