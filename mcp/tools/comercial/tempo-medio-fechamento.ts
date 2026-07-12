// mcp/tools/comercial/tempo-medio-fechamento.ts
// Tool MCP: comercial_tempo_medio_fechamento
// Calcula data_aprovacao - data_orcamento em dias, sobre pedidos com etapa_finaliza=true.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { resolverPeriodoCorte, type PeriodoCorte } from "../../lib/periodo-corte.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
});

const dados = z.object({
  totalPedidos: z.number().int(),
  diasMedio: z.number(),
  diasMediano: z.number(),
  diasMinimo: z.number(),
  diasMaximo: z.number(),
  periodoDe: z.string().nullable(),
  periodoAte: z.string().nullable(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
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

interface Row {
  total: bigint;
  medio: string | number | null;
  mediano: string | number | null;
  minimo: string | number | null;
  maximo: string | number | null;
}

async function query(prisma: PrismaClient, input: Input, per: PeriodoCorte) {
  // Pedido e documento com data: o BETWEEN e SEMPRE emitido. Antes, sem o par completo de
  // datas o filtro sumia e a media/mediana/min/max saiam de TODOS os pedidos do cache ,
  // justamente o min/max e onde o outlier antigo (pre-corte) mais distorce.
  const filtroPer = `AND data_orcamento BETWEEN $1::timestamp AND $2::timestamp`;
  const params: unknown[] = [
    `${per.periodoDe}T00:00:00`,
    `${per.periodoAte}T23:59:59`,
  ];
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
       COUNT(*)::bigint AS total,
       AVG(EXTRACT(EPOCH FROM (data_aprovacao - data_orcamento))/86400)::numeric(10,2) AS medio,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (data_aprovacao - data_orcamento))/86400)::numeric(10,2) AS mediano,
       MIN(EXTRACT(EPOCH FROM (data_aprovacao - data_orcamento))/86400)::numeric(10,2) AS minimo,
       MAX(EXTRACT(EPOCH FROM (data_aprovacao - data_orcamento))/86400)::numeric(10,2) AS maximo
       FROM fato_pedido
       WHERE data_orcamento IS NOT NULL AND data_aprovacao IS NOT NULL AND etapa_finaliza = true
       ${filtroPer}`,
    ...params,
  );
  const r = rows[0];
  return {
    totalPedidos: Number(r?.total ?? 0),
    diasMedio: Number(r?.medio ?? 0),
    diasMediano: Number(r?.mediano ?? 0),
    diasMinimo: Number(r?.minimo ?? 0),
    diasMaximo: Number(r?.maximo ?? 0),
    periodoDe: per.periodoDe,
    periodoAte: per.periodoAte,
    periodoCoberto: per.label,
    ...(per.aviso ? { aviso: per.aviso } : {}),
  };
}

export const comercialTempoMedioFechamento: ToolEntry<Input, Output> = {
  id: "comercial_tempo_medio_fechamento",
  dominio: "comercial",
  descricao:
    "Tempo medio de fechamento dos pedidos (dataAprovacao - dataOrcamento em dias) " +
    "sobre pedidos concluidos (etapa_finaliza=true). Retorna media, mediana, " +
    "min e max. Use para 'tempo medio de fechamento', 'quanto tempo leva pra " +
    "fechar um pedido'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const per = resolverPeriodoCorte(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_pedido"], () =>
      query(ctx.prisma, input, per),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          (d.totalPedidos === 0
            ? `Nao ha pedidos concluidos com data de aprovacao no periodo ${per.label}.`
            : `Tempo medio de fechamento no periodo ${per.label}: ${d.diasMedio.toFixed(1)} dias (mediana ${d.diasMediano.toFixed(1)}, min ${d.diasMinimo.toFixed(1)}, max ${d.diasMaximo.toFixed(1)}). Amostra: ${d.totalPedidos} pedidos concluidos.`) +
          (per.aviso ? ` ${per.aviso}` : ""),
        _DESTAQUE: {
          totalPedidos: d.totalPedidos,
          periodoCoberto: per.label,
          diasMedio: d.diasMedio,
          diasMediano: d.diasMediano,
          diasMinimo: d.diasMinimo,
          diasMaximo: d.diasMaximo,
        },
        _agregado: { contagem: d.totalPedidos, media: d.diasMedio },
      },
    };
  },
};
