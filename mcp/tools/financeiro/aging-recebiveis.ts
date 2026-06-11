// mcp/tools/financeiro/aging-recebiveis.ts
// Tool MCP: financeiro_aging_recebiveis , backlog pos-review (item c).
//
// Aging da inadimplencia: titulos A RECEBER em aberto (vr_saldo>0, situacao
// viva) bucketizados por dias de atraso (a vencer / 0-30 / 31-60 / 61-90 /
// 90+), com valor e contagem por bucket e top devedor do bucket mais velho.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  tipo: z.enum(["a_receber", "a_pagar"]).optional()
    .describe("Default a_receber (inadimplencia de clientes); a_pagar inverte o lado."),
});

const linhaSchema = z.object({
  bucket: z.string(),
  valor: z.number(),
  titulos: z.number().int(),
});

const dados = z.object({
  tipo: z.string(),
  linhas: z.array(linhaSchema),
  valorTotal: z.number(),
  titulosTotal: z.number().int(),
  topDevedorMaisVelho: z.string().nullable(),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
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

const BUCKETS = ["a vencer", "0-30 dias", "31-60 dias", "61-90 dias", "90+ dias"] as const;

async function queryAging(prisma: PrismaClient, tipo: string) {
  const rows = await prisma.$queryRawUnsafe<
    { bucket: string; valor: string; titulos: bigint }[]
  >(
    `SELECT CASE
              WHEN data_vencimento IS NULL OR data_vencimento >= now() THEN 'a vencer'
              WHEN now()::date - data_vencimento::date <= 30 THEN '0-30 dias'
              WHEN now()::date - data_vencimento::date <= 60 THEN '31-60 dias'
              WHEN now()::date - data_vencimento::date <= 90 THEN '61-90 dias'
              ELSE '90+ dias'
            END AS bucket,
            COALESCE(SUM(vr_saldo),0)::text AS valor,
            COUNT(*)::bigint AS titulos
     FROM fato_financeiro_titulo
     WHERE tipo = $1 AND vr_saldo > 0 AND situacao_simples IN ('aberto','provisorio')
     GROUP BY 1`,
    tipo,
  );
  const porBucket = new Map(rows.map((r) => [r.bucket, r]));
  const linhas = BUCKETS.map((b) => ({
    bucket: b,
    valor: Number(porBucket.get(b)?.valor ?? 0),
    titulos: Number(porBucket.get(b)?.titulos ?? 0),
  }));
  const maisVelho = await prisma.$queryRawUnsafe<{ nome: string | null }[]>(
    `SELECT participante_nome AS nome FROM fato_financeiro_titulo
     WHERE tipo = $1 AND vr_saldo > 0 AND situacao_simples IN ('aberto','provisorio')
       AND data_vencimento IS NOT NULL AND now()::date - data_vencimento::date > 90
     ORDER BY vr_saldo DESC LIMIT 1`,
    tipo,
  );
  return {
    linhas,
    valorTotal: linhas.reduce((a, l) => a + l.valor, 0),
    titulosTotal: linhas.reduce((a, l) => a + l.titulos, 0),
    topDevedorMaisVelho: maisVelho[0]?.nome ?? null,
  };
}

export const financeiroAgingRecebiveis: ToolEntry<Input, Output> = {
  id: "financeiro_aging_recebiveis",
  dominio: "financeiro",
  descricao:
    "Aging da inadimplencia: titulos em aberto (a receber por default; aceita a_pagar) " +
    "bucketizados por dias de atraso (a vencer, 0-30, 31-60, 61-90, 90+), com valor e " +
    "numero de titulos por faixa e o maior devedor da faixa 90+. Use para 'aging da " +
    "inadimplencia', 'quanto esta vencido ha mais de 60 dias', 'faixas de atraso'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const tipo = input.tipo ?? "a_receber";
    const envelope = await withFreshness(ctx.prisma, ["fato_financeiro_titulo"], async () => ({
      tipo,
      ...(await queryAging(ctx.prisma, tipo)),
      ordenadoPor: "bucket (a vencer -> 90+)",
      aviso:
        "Aging sobre titulos vivos (aberto + provisorio) com saldo > 0; 'a vencer' " +
        "inclui vencimento futuro ou sem data. Valores de saldo, nao de documento.",
    }));
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const venc90 = d.linhas.find((l) => l.bucket === "90+ dias");
    return enriquecerEnvelope(envelope, "financeiro_aging_recebiveis", {
      destaque: {
        tipo: d.tipo,
        valorTotal: d.valorTotal,
        titulosTotal: d.titulosTotal,
        valor90mais: venc90?.valor ?? 0,
        titulos90mais: venc90?.titulos ?? 0,
        topDevedorMaisVelho: d.topDevedorMaisVelho ?? "",
        agingResumo: d.linhas
          .map((l) => `${l.bucket}: R$ ${l.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${l.titulos})`)
          .join("; "),
      },
      agregado: { soma: d.valorTotal, contagem: d.titulosTotal },
    });
  },
};
