// mcp/tools/estoque/produtos-saldo-zero.ts
// Tool MCP: estoque_produtos_saldo_zero
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  incluirNegativos: z
    .boolean()
    .optional()
    .describe("Quando true (default), inclui produtos com saldo negativo no count."),
  familiaId: z.number().int().positive().optional(),
  armazemId: z.number().int().positive().optional(),
  limite: z.number().int().min(1).max(100).optional(),
});

const linhaSchema = z.object({
  produtoId: z.number().int(),
  produtoNome: z.string(),
  familiaNome: z.string().nullable(),
  marcaNome: z.string().nullable(),
  saldoTotal: z.number(),
  numLocais: z.number().int(),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  totalProdutos: z.number().int(),
  totalZerados: z.number().int(),
  totalNegativos: z.number().int(),
  linhas: z.array(linhaSchema),
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

async function queryProdutosSaldoZero(
  prisma: PrismaClient,
  input: Input,
): Promise<{
  totalProdutos: number;
  totalZerados: number;
  totalNegativos: number;
  linhas: Array<z.infer<typeof linhaSchema>>;
}> {
  const incluirNegativos = input.incluirNegativos ?? true;
  const limite = input.limite ?? 10;

  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: {
      ...(input.armazemId ? { localId: input.armazemId } : {}),
      ...(input.familiaId ? { familiaId: input.familiaId } : {}),
      produtoId: { not: null },
    },
    select: {
      produtoId: true,
      produtoNome: true,
      familiaNome: true,
      marcaNome: true,
      localId: true,
      quantidade: true,
    },
  });

  const mapa = new Map<
    number,
    {
      produtoNome: string;
      familiaNome: string | null;
      marcaNome: string | null;
      saldoTotal: number;
      locais: Set<number>;
    }
  >();
  for (const r of rows) {
    if (r.produtoId == null) continue;
    const e = mapa.get(r.produtoId);
    if (!e) {
      mapa.set(r.produtoId, {
        produtoNome: r.produtoNome ?? "(sem nome)",
        familiaNome: r.familiaNome,
        marcaNome: r.marcaNome,
        saldoTotal: Number(r.quantidade ?? 0),
        locais: new Set<number>(r.localId != null ? [r.localId] : []),
      });
    } else {
      e.saldoTotal += Number(r.quantidade ?? 0);
      if (r.localId != null) e.locais.add(r.localId);
    }
  }

  let totalZerados = 0;
  let totalNegativos = 0;
  const candidatos: Array<{
    produtoId: number;
    produtoNome: string;
    familiaNome: string | null;
    marcaNome: string | null;
    saldoTotal: number;
    numLocais: number;
  }> = [];

  for (const [produtoId, e] of mapa) {
    if (e.saldoTotal === 0) totalZerados++;
    else if (e.saldoTotal < 0) totalNegativos++;
    const matches =
      e.saldoTotal === 0 || (incluirNegativos && e.saldoTotal < 0);
    if (matches) {
      candidatos.push({
        produtoId,
        produtoNome: e.produtoNome,
        familiaNome: e.familiaNome,
        marcaNome: e.marcaNome,
        saldoTotal: e.saldoTotal,
        numLocais: e.locais.size,
      });
    }
  }

  candidatos.sort((a, b) => b.numLocais - a.numLocais);
  const totalProdutos = incluirNegativos
    ? totalZerados + totalNegativos
    : totalZerados;

  return {
    totalProdutos,
    totalZerados,
    totalNegativos,
    linhas: candidatos.slice(0, limite),
  };
}

export const estoqueProdutosSaldoZero: ToolEntry<Input, Output> = {
  id: "estoque_produtos_saldo_zero",
  dominio: "estoque",
  descricao:
    "Conta produtos com saldo total zero (e opcionalmente negativos) " +
    "consolidado em todos os armazens. Retorna `totalProdutos`, " +
    "`totalZerados`, `totalNegativos` + amostra de produtos. " +
    "Use para perguntas tipo: 'quantos itens com saldo zero?', " +
    "'produtos sem estoque', 'itens negativos'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo"],
      () => queryProdutosSaldoZero(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    return enriquecerEnvelope(envelope, "estoque_produtos_saldo_zero", {
      destaque: {
        totalProdutos: envelope.dados.totalProdutos,
        totalZerados: envelope.dados.totalZerados,
        totalNegativos: envelope.dados.totalNegativos,
      },
    });
  },
};
