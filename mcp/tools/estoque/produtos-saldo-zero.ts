// mcp/tools/estoque/produtos-saldo-zero.ts
// Tool MCP: estoque_produtos_saldo_zero
//
// Conta e lista produtos com saldo total zero ou negativo (consolidado em
// todos os armazens). Resolve um gap detectado na auditoria R12 mini
// (#27 "Quantos itens temos com saldo zero?") onde o agente registrava
// lacuna por nao ter tool dedicada.
//
// Filtros opcionais: incluirNegativos (default true), familiaId, armazemId.

import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
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

const dados = z.object({
  /** Total de produtos com saldo zero (e negativo se incluirNegativos=true). */
  totalProdutos: z.number().int(),
  /** Total apenas zero. */
  totalZerados: z.number().int(),
  /** Total apenas negativos. */
  totalNegativos: z.number().int(),
  /** Top N por número de localizações (ordem desc). */
  linhas: z.array(linhaSchema),
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
): Promise<z.infer<typeof dados>> {
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

  // Agrega por produtoId
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
    "'produtos sem estoque', 'itens negativos'. " +
    "Por default inclui negativos no count; passe `incluirNegativos=false` " +
    "para contar somente zero exato.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_estoque_saldo"], () =>
      queryProdutosSaldoZero(ctx.prisma, input),
    ),
};
