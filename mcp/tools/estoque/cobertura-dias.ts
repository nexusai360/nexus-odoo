// mcp/tools/estoque/cobertura-dias.ts
// Tool MCP: estoque_cobertura_dias , backlog pos-review (item d).
//
// Idade do estoque em DIAS por produto, lendo o calculo pronto do Odoo
// (raw_estoque_saldo_hoje_duracao_dias: campo `dias` por saldo de hoje).
// Responde "ha quanto tempo o estoque esta parado", "itens mais antigos".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  minDias: z.number().int().min(0).optional()
    .describe("So itens com pelo menos N dias em estoque (default 0 = todos)."),
  limite: z.number().int().min(1).max(50).optional(),
});

const linhaSchema = z.object({
  produto: z.string().nullable(),
  local: z.string().nullable(),
  saldo: z.number(),
  dias: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalItens: z.number().int(),
  mediaDias: z.number(),
  itens180mais: z.number().int(),
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

async function queryCobertura(prisma: PrismaClient, minDias: number, limite: number) {
  const linhas = await prisma.$queryRawUnsafe<
    { produto: string | null; local: string | null; saldo: string; dias: number }[]
  >(
    `SELECT data->'produto_id'->>1 AS produto, data->'local_id'->>1 AS local,
            (data->>'saldo')::numeric::text AS saldo, (data->>'dias')::int AS dias
     FROM raw_estoque_saldo_hoje_duracao_dias
     WHERE (data->>'saldo')::numeric > 0 AND (data->>'dias')::int >= $1
     ORDER BY (data->>'dias')::int DESC
     LIMIT ${limite}`,
    minDias,
  );
  const tot = await prisma.$queryRawUnsafe<
    { n: bigint; media: string | null; antigos: bigint }[]
  >(
    `SELECT COUNT(*)::bigint n, AVG((data->>'dias')::int)::numeric(10,1)::text media,
            COUNT(*) FILTER (WHERE (data->>'dias')::int > 180)::bigint antigos
     FROM raw_estoque_saldo_hoje_duracao_dias
     WHERE (data->>'saldo')::numeric > 0 AND (data->>'dias')::int >= $1`,
    minDias,
  );
  return {
    linhas: linhas.map((l) => ({ produto: l.produto, local: l.local, saldo: Number(l.saldo), dias: l.dias })),
    totalItens: Number(tot[0]?.n ?? 0),
    mediaDias: Number(tot[0]?.media ?? 0),
    itens180mais: Number(tot[0]?.antigos ?? 0),
  };
}

export const estoqueCoberturaDias: ToolEntry<Input, Output> = {
  id: "estoque_cobertura_dias",
  dominio: "estoque",
  descricao:
    "Idade do estoque em DIAS por item (calculo pronto do sistema sobre o saldo de hoje): " +
    "itens mais antigos primeiro, media de dias e quantos passam de 180 dias. Use para " +
    "'ha quanto tempo o estoque esta parado', 'idade do estoque', 'itens parados ha mais " +
    "de N dias', 'cobertura de estoque em dias'. Aceita minDias.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const minDias = input.minDias ?? 0;
    const limite = input.limite ?? 15;
    const envelope = await withFreshness(ctx.prisma, ["fato_estoque_saldo"], async () => ({
      ...(await queryCobertura(ctx.prisma, minDias, limite)),
      ordenadoPor: "dias desc",
      aviso:
        "Idade em dias calculada pelo sistema para o saldo de HOJE por item/local. " +
        (minDias > 0 ? `Filtro: pelo menos ${minDias} dias.` : ""),
    }));
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.linhas[0];
    return enriquecerEnvelope(envelope, "estoque_cobertura_dias", {
      destaque: {
        totalItens: d.totalItens,
        mediaDias: d.mediaDias,
        itens180mais: d.itens180mais,
        topProduto: top?.produto ?? "",
        topDias: top?.dias ?? 0,
        linhasExibidas: d.linhas.length,
      },
      agregado: { contagem: d.totalItens },
    });
  },
};
