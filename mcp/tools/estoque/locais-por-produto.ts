// mcp/tools/estoque/locais-por-produto.ts
// Tool MCP: estoque_locais_por_produto (Onda 3)
//
// Lista os locais/armazens onde um produto tem saldo. Resolve R12/R16
// "Quais armazens tem o produto 102?" onde estoque_saldo_produto trazia
// numLocais=5 mas nao listava os locais.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  termo: z.string().min(1).max(120),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  localId: z.number().int(),
  localNome: z.string().nullable(),
  saldo: z.number(),
});

const dados = z.object({
  produtoNome: z.string().nullable(),
  produtoId: z.number().int().nullable(),
  linhas: z.array(linhaSchema),
  saldoTotal: z.number(),
  totalLocais: z.number().int(),
  // Contrato de lista (Fase B): pagina ordenada por saldo desc (quantidade) na query.
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

export const estoqueLocaisPorProduto: ToolEntry<Input, Output> = {
  id: "estoque_locais_por_produto",
  dominio: "estoque",
  descricao:
    "Lista todos os armazens/locais onde um produto tem saldo, com saldo por " +
    "local. Use para 'quais armazens tem o produto X', 'onde esta o saldo de Y'. " +
    "Aceita termo (nome ou codigo).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo", "fato_produto"],
      async () => {
        // Busca produto pelo termo (codigo exato ou nome contendo)
        const isCodigoNumerico = /^\d+$/.test(input.termo);
        const produto = await ctx.prisma.fatoProduto.findFirst({
          where: isCodigoNumerico
            ? { codigo: input.termo }
            : { nome: { contains: input.termo, mode: "insensitive" } },
        });
        if (!produto) {
          return {
            produtoNome: null,
            produtoId: null,
            linhas: [],
            saldoTotal: 0,
            totalLocais: 0,
          };
        }
        // KPIs (saldoTotal, totalLocais) sobre o conjunto completo de locais;
        // a pagina de linhas vem limitada por take/skip no SQL. O where
        // exige localId nao-nulo para que count, pagina e agregado fiquem
        // sobre o mesmo conjunto (linhas sem local nao sao exibiveis).
        const where = { produtoId: produto.odooId, localId: { not: null } };
        const [rows, totalLocais, agg] = await Promise.all([
          ctx.prisma.fatoEstoqueSaldo.findMany({
            where,
            select: { localId: true, localNome: true, quantidade: true },
            // Ordenacao estavel + desempate por localId: "os proximos" nao
            // repetem nem pulam local entre paginas (alavanca 2b).
            orderBy: [{ quantidade: "desc" }, { localId: "asc" }],
            take: limit,
            skip: offset,
          }),
          ctx.prisma.fatoEstoqueSaldo.count({ where }),
          ctx.prisma.fatoEstoqueSaldo.aggregate({
            where,
            _sum: { quantidade: true },
          }),
        ]);
        const linhas = rows
          .filter((r): r is typeof r & { localId: number } => r.localId != null)
          .map((r) => ({
            localId: r.localId,
            localNome: r.localNome,
            saldo: Number(r.quantidade ?? 0),
          }));
        const saldoTotal = Number(agg._sum.quantidade ?? 0);
        return {
          produtoNome: produto.nome,
          produtoId: produto.odooId,
          linhas,
          saldoTotal,
          totalLocais,
          // Contrato de lista (Fase B): orderBy quantidade desc + desempate localId.
          ordenadoPor: "saldo desc",
        };
      },
      (d) => d.linhas.length === 0,
    );
    if (envelope.estado === "preparando") return envelope;
    const paginacao = montarPaginacaoMeta(
      envelope.dados.totalLocais,
      offset,
      limit,
      envelope.dados.linhas.length,
    );
    // Onda humanizacao 2026-06-12: agrupamento por categoria de local PRONTO
    // no destaque. Sem isso o modelo somava "proprio vs demonstracao" de
    // cabeca e errava (disse 8 em demo quando eram 11 , conversa a395702f).
    const porCategoria = { proprio: 0, demonstracao: 0, terceiros: 0, outros: 0 };
    for (const l of envelope.dados.linhas) {
      const nome = (l.localNome ?? "").toLowerCase();
      const saldo = Number(l.saldo ?? 0);
      if (nome.includes("demonstra")) porCategoria.demonstracao += saldo;
      else if (nome.includes("próprio") || nome.includes("proprio")) porCategoria.proprio += saldo;
      else if (nome.includes("terceiro")) porCategoria.terceiros += saldo;
      else porCategoria.outros += saldo;
    }
    return enriquecerEnvelope(envelope, "estoque_locais_por_produto", {
      destaque: {
        produtoNome: envelope.dados.produtoNome ?? "",
        saldoTotal: envelope.dados.saldoTotal,
        totalLocais: envelope.dados.totalLocais,
        saldoProprio: porCategoria.proprio,
        saldoDemonstracao: porCategoria.demonstracao,
        saldoTerceiros: porCategoria.terceiros,
        saldoOutros: porCategoria.outros,
      },
      agregado: {
        soma: envelope.dados.saldoTotal,
        contagem: envelope.dados.totalLocais,
      },
      paginacao,
    });
  },
};
