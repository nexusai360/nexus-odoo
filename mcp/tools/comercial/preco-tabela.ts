// mcp/tools/comercial/preco-tabela.ts
// Tool MCP: preco_tabela
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPrecoTabela } from "@/lib/reports/queries/precos.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z
  .object({
    tabelaId: z.number().int().positive().optional(),
    tabelaNome: z
      .string()
      .trim()
      .min(2)
      .optional()
      .describe("Nome (ou parte do nome) da tabela de preco, ex.: 'Venda Smart'."),
    ...paginacaoInputShape,
  })
  .refine((v) => v.tabelaId !== undefined || v.tabelaNome !== undefined, {
    message: "Informe tabelaId ou tabelaNome.",
  });

const linha = z.object({
  odooId: z.number().int(),
  tabelaNome: z.string().nullable(),
  dimensao: z.string(),
  produtoNome: z.string().nullable(),
  familiaNome: z.string().nullable(),
  participanteNome: z.string().nullable(),
  operacao: z.string().nullable(),
  precoBase: z.string().nullable(),
  valor: z.number().nullable(),
  aliquota: z.number().nullable(),
  quantidadeMinima: z.number(),
  dataInicial: z.string().nullable(),
  dataFinal: z.string().nullable(),
});

const dados = z.object({
  tabelaNome: z.string().nullable(),
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
  // Contrato de lista (Fase B): regras ordenadas por nome do produto asc na query.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
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

export const comercialPrecoTabela: ToolEntry<Input, Output> = {
  id: "preco_tabela",
  dominio: "comercial",
  descricao:
    "Regras de UMA TABELA DE PREÇO específica, identificada por `tabelaId` " +
    "OU por `tabelaNome` (nome ou parte dele, ex.: 'Venda Smart'). " +
    "Lista todas as regras da tabela (por produto, família ou participante) " +
    "com valor, operação e vigência. " +
    "NÃO use para: preço de um produto específico (use `preco_produto`).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    // Resolucao por nome (golden cov-60): o usuario conhece o NOME da tabela,
    // nao o id. Ambiguidade ate 5 candidatos vira resposta de escolha.
    let tabelaId = input.tabelaId;
    if (tabelaId === undefined && input.tabelaNome) {
      const grupos = await ctx.prisma.fatoPreco.groupBy({
        by: ["tabelaId", "tabelaNome"],
        where: { tabelaNome: { contains: input.tabelaNome, mode: "insensitive" } },
        orderBy: { tabelaId: "asc" },
        take: 6,
      });
      const candidatos = grupos.filter(
        (c): c is typeof c & { tabelaId: number } => c.tabelaId !== null,
      );
      if (candidatos.length === 0) {
        return {
          estado: "vazio" as const,
          dados: {
            tabelaNome: input.tabelaNome,
            linhas: [],
            total: 0,
            truncado: false,
            _RESPOSTA:
              `Nao encontrei tabela de preco com nome parecido com "${input.tabelaNome}". ` +
              "Confira o nome ou peca a lista de tabelas.",
          },
          atualizadoEm: new Date().toISOString(),
          fonteStatus: { status: "ok", ultimaSyncEm: null },
        };
      }
      if (candidatos.length > 1) {
        const nomes = candidatos
          .slice(0, 5)
          .map((c) => `${c.tabelaNome ?? "(sem nome)"} (id ${c.tabelaId})`)
          .join("; ");
        return {
          estado: "ok" as const,
          dados: {
            tabelaNome: input.tabelaNome,
            linhas: [],
            total: 0,
            truncado: false,
            _RESPOSTA:
              `Encontrei ${candidatos.length} tabelas de preco com "${input.tabelaNome}": ${nomes}. ` +
              "Qual delas voce quer?",
          },
          atualizadoEm: new Date().toISOString(),
          fonteStatus: { status: "ok", ultimaSyncEm: null },
        };
      }
      tabelaId = candidatos[0]!.tabelaId;
    }
    const envelope = await withFreshness(ctx.prisma, ["fato_preco"], () =>
      queryPrecoTabela(ctx.prisma, { tabelaId: tabelaId!, limit, offset }),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    // _RESPOSTA delegado ao formatador canonico (fmtPrecoTabela). `total` e
    // full-set (count(where) na query, independente da paginacao).
    return enriquecerEnvelope(envelope, "preco_tabela", {
      destaque: { total: d.total, tabelaNome: d.tabelaNome ?? "" },
      agregado: { contagem: d.total },
      paginacao,
    });
  },
};
