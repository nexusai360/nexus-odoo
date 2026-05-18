// mcp/tools/estoque/concentracao.ts
// Tool MCP: estoque_concentracao
// percentual é shaping — calculado aqui na tool (regra N8), não no núcleo.
// Sem agruparTopN — o agente recebe a lista completa (sem shaping de gráfico).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryConcentracao } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  familia: z.array(z.object({ familia: z.string(), valor: z.number(), percentual: z.number() })),
  marca: z.array(z.object({ marca: z.string(), valor: z.number(), percentual: z.number() })),
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
    // percentual calculado aqui na tool (regra N8 — shaping fora do núcleo)
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
    // sem agruparTopN — agente recebe lista completa
  };
}

export const estoqueConcentracao: ToolEntry<Input, Output> = {
  id: "estoque_concentracao",
  dominio: "estoque",
  descricao: "Concentração do estoque por família e marca (valor e percentual).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (_input, ctx) =>
    withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo"],
      async () => shape(await queryConcentracao(ctx.prisma)),
      // Paridade com dashboard F3 (getRelatorioConcentracao): "vazio" apenas
      // quando AMBOS os arrays estão vazios (regra conjuntiva). Se só famílias
      // estiverem vazias mas marcas preenchidas (ou vice-versa), o estado é "ok".
      (dados) => dados.familia.length === 0 && dados.marca.length === 0,
    ),
};
