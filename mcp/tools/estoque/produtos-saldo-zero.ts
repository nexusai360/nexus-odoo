// mcp/tools/estoque/produtos-saldo-zero.ts
// Tool MCP: estoque_produtos_saldo_zero
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import type { PrismaClient } from "@/generated/prisma/client.js";
import { classificacaoInputShape, rotuloClassificacao } from "../../lib/classificacao.js";
import { whereLocalDoEscopo } from "@/lib/estoque/locais-por-classificacao.js";

const inputSchema = z.object({
  incluirNegativos: z
    .boolean()
    .optional()
    .describe("Quando true (default), inclui produtos com saldo negativo no count."),
  familiaId: z.number().int().positive().optional(),
  armazemId: z.number().int().positive().optional(),
  ...classificacaoInputShape,
  ...paginacaoInputShape,
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
  totalCandidatos: z.number().int(),
  linhas: z.array(linhaSchema),
  // Contrato de lista (Fase B): candidatos ordenados por numero de locais desc.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  _PAGINACAO: z.any().optional(),
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
  totalCandidatos: number;
  linhas: Array<z.infer<typeof linhaSchema>>;
  ordenadoPor: string;
}> {
  const incluirNegativos = input.incluirNegativos ?? true;
  // Excecao documentada: a agregacao "saldo total por produto" e feita em JS
  // (a partir das linhas por local), entao limit/offset nao podem ir ao SQL.
  // Ordenamos os candidatos de forma estavel e fatiamos [offset, offset+limit);
  // total = numero de candidatos encontrados (alavanca 2b).
  const { limit, offset } = resolverPaginacao(input);

  // Um armazem pedido explicitamente manda sobre o escopo da arvore: quem pergunta pelo
  // armazem X quer o X, seja qual for a classificacao dele.
  const escopo = input.armazemId
    ? { localId: input.armazemId }
    : await whereLocalDoEscopo(prisma, input.classificacao ?? "fisico");

  const rows = await prisma.fatoEstoqueSaldo.findMany({
    where: {
      ...escopo,
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

  // Ordenacao estavel + desempate por produtoId: garante paginas consistentes.
  candidatos.sort((a, b) =>
    b.numLocais !== a.numLocais
      ? b.numLocais - a.numLocais
      : a.produtoId - b.produtoId,
  );
  const totalProdutos = incluirNegativos
    ? totalZerados + totalNegativos
    : totalZerados;

  return {
    totalProdutos,
    totalZerados,
    totalNegativos,
    totalCandidatos: candidatos.length,
    linhas: candidatos.slice(offset, offset + limit),
    // Contrato de lista (Fase B): sort por numLocais desc (desempate produtoId).
    ordenadoPor: "número de locais desc",
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
    "'produtos sem estoque', 'itens negativos'. Por padrão olha só o estoque próprio; " +
    "use `classificacao` para 'demonstracao' ou 'todos' os locais.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo"],
      () => queryProdutosSaldoZero(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const paginacao = montarPaginacaoMeta(
      envelope.dados.totalCandidatos,
      offset,
      limit,
      envelope.dados.linhas.length,
    );
    return enriquecerEnvelope(envelope, "estoque_produtos_saldo_zero", {
      destaque: {
        totalProdutos: envelope.dados.totalProdutos,
        totalZerados: envelope.dados.totalZerados,
        totalNegativos: envelope.dados.totalNegativos,
        escopoLocais: rotuloClassificacao(input.classificacao ?? "fisico"),
      },
      paginacao,
    });
  },
};
