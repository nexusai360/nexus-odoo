// mcp/tools/comercial/preco-produto.ts
// Tool MCP: preco_produto
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryPrecoProduto } from "@/lib/reports/queries/precos.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  // Busca por termo no nome do produto (aceita o nome ou o código que aparece
  // entre colchetes no nome). NÃO existe parâmetro de id interno: o código
  // visível do produto não é o id interno e usá-lo como id retorna vazio.
  termo: z.string().min(1).max(120).optional(),
  ...paginacaoInputShape,
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
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
  _listaTruncada: z.boolean().optional(),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const comercialPrecoProduto: ToolEntry<Input, Output> = {
  id: "preco_produto",
  dominio: "comercial",
  descricao:
    "Regras de preço de um PRODUTO específico. Retorna as regras em todas " +
    "as tabelas onde o produto aparece: valor, operação (fixo, valor, margem, " +
    "markup, desconto), preço-base, vigência e quantidade mínima. " +
    "Use quando perguntam o PREÇO ou REGRA DE PREÇO de um produto. " +
    "Parâmetro `termo` aceita nome OU código entre colchetes. " +
    "NÃO use para: listar uma tabela inteira (use `preco_tabela`), pedidos " +
    "(use `comercial_pedidos_periodo`), saldo em estoque (use `estoque_saldo_produto`).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_preco"], () =>
      queryPrecoProduto(ctx.prisma, { ...input, limit, offset }),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    return {
      ...envelope,
      dados: { ...d, _listaTruncada: paginacao.temMais, _PAGINACAO: paginacao },
    };
  },
};
