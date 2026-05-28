// mcp/tools/fiscal/notas-emitidas-por-cliente.ts
// Tool MCP: fiscal_notas_emitidas_por_cliente
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  clienteTermo: z.string().min(2).max(120).describe("Filtra notas onde participanteNome contem o termo (insensitive)."),
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  situacaoNfe: z.string().optional().describe("Ex: 'autorizada'. Sem filtro = todas."),
  limite: z.number().int().min(1).max(50).optional(),
});

const linhaSchema = z.object({
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  participanteNome: z.string().nullable(),
  situacaoNfe: z.string().nullable(),
  vrNf: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalNotas: z.number().int(),
  valorTotal: z.number(),
  linhasExibidas: z.number().int(),
  _RESPOSTA: z.string().optional(),
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

async function query(prisma: PrismaClient, input: Input) {
  const limite = input.limite ?? 30;
  const where: Record<string, unknown> = {
    entradaSaida: "1",
    participanteNome: { contains: input.clienteTermo, mode: "insensitive" as const },
  };
  if (input.situacaoNfe) where.situacaoNfe = input.situacaoNfe;
  if (input.periodoDe || input.periodoAte) {
    where.dataEmissao = {
      ...(input.periodoDe ? { gte: new Date(`${input.periodoDe}T00:00:00`) } : {}),
      ...(input.periodoAte ? { lte: new Date(`${input.periodoAte}T23:59:59`) } : {}),
    };
  }
  const [linhas, total, agg] = await Promise.all([
    prisma.fatoNotaFiscal.findMany({
      where,
      select: { numero: true, serie: true, dataEmissao: true, participanteNome: true, situacaoNfe: true, vrNf: true },
      orderBy: { dataEmissao: "desc" },
      take: limite,
    }),
    prisma.fatoNotaFiscal.count({ where }),
    prisma.fatoNotaFiscal.aggregate({ where, _sum: { vrNf: true } }),
  ]);
  return {
    linhas: linhas.map((l) => ({
      numero: l.numero,
      serie: l.serie,
      dataEmissao: l.dataEmissao ? l.dataEmissao.toISOString() : null,
      participanteNome: l.participanteNome,
      situacaoNfe: l.situacaoNfe,
      vrNf: Number(l.vrNf),
    })),
    totalNotas: total,
    valorTotal: Number(agg._sum.vrNf ?? 0),
    linhasExibidas: linhas.length,
  };
}

export const fiscalNotasEmitidasPorCliente: ToolEntry<Input, Output> = {
  id: "fiscal_notas_emitidas_por_cliente",
  dominio: "fiscal",
  descricao:
    "Notas fiscais de saida emitidas para um cliente especifico (filtra " +
    "participanteNome via clienteTermo). Use para 'notas emitidas para Smartfit', " +
    "'NF do cliente X esse mes'. Aceita periodo e situacao.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], () => query(ctx.prisma, input));
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: d.totalNotas === 0
          ? `Nao ha notas emitidas para '${input.clienteTermo}' no periodo.`
          : `${d.totalNotas} notas emitidas para '${input.clienteTermo}', total ${fmt(d.valorTotal)}. Listando ${d.linhasExibidas}.`,
        _DESTAQUE: {
          clienteTermo: input.clienteTermo,
          totalNotas: d.totalNotas,
          valorTotal: d.valorTotal,
          linhasExibidas: d.linhasExibidas,
        },
        _agregado: { contagem: d.totalNotas, soma: d.valorTotal },
      },
    };
  },
};
