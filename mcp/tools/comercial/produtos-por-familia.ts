// mcp/tools/comercial/produtos-por-familia.ts
// Tool MCP: comercial_produtos_por_familia
//
// Lista produtos agrupados por familia, ou filtra produtos de uma familia
// especifica. 8 familias no cadastro (ACESSORIOS, LIFE FITNESS, ASTEC,
// JOHNSON, LONGLIFE, PADRAO, DIVERSOS, USO E CONSUMO).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  familiaTermo: z.string().min(1).max(60).optional().describe("Filtra por familia (case-insensitive). Sem filtro: agrupa todas."),
  limite: z.number().int().min(1).max(100).optional(),
});

const linhaFamiliaSchema = z.object({
  familia: z.string(),
  quantidadeProdutos: z.number().int(),
});

const linhaProdutoSchema = z.object({
  odooId: z.number().int(),
  nome: z.string(),
  familia: z.string().nullable(),
  marca: z.string().nullable(),
});

const dados = z.object({
  modo: z.enum(["agrupado", "filtrado"]),
  familias: z.array(linhaFamiliaSchema).optional(),
  produtos: z.array(linhaProdutoSchema).optional(),
  totalFamilias: z.number().int(),
  totalProdutosNoCadastro: z.number().int(),
  totalEncontrados: z.number().int(),
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
  const totalProdutosNoCadastro = await prisma.fatoProduto.count();

  if (input.familiaTermo) {
    // Modo filtrado: lista produtos da familia
    const where = {
      familiaNome: { contains: input.familiaTermo, mode: "insensitive" as const },
    };
    const [produtos, total] = await Promise.all([
      prisma.fatoProduto.findMany({
        where,
        select: { odooId: true, nome: true, familiaNome: true, marcaNome: true },
        take: limite,
        orderBy: { nome: "asc" },
      }),
      prisma.fatoProduto.count({ where }),
    ]);
    return {
      modo: "filtrado" as const,
      produtos: produtos.map((p) => ({
        odooId: p.odooId,
        nome: p.nome ?? "",
        familia: p.familiaNome,
        marca: p.marcaNome,
      })),
      totalFamilias: 0,
      totalProdutosNoCadastro,
      totalEncontrados: total,
    };
  }

  // Modo agrupado: count por familia
  const rows = await prisma.$queryRaw<Array<{ familia: string; n: bigint }>>`
    SELECT COALESCE(familia_nome, '(sem familia)') AS familia, COUNT(*)::bigint AS n
      FROM fato_produto
      GROUP BY familia_nome
      ORDER BY n DESC, familia_nome ASC
  `;
  const familias = rows.map((r) => ({
    familia: r.familia,
    quantidadeProdutos: Number(r.n),
  }));
  return {
    modo: "agrupado" as const,
    familias,
    totalFamilias: familias.filter((f) => f.familia !== "(sem familia)").length,
    totalProdutosNoCadastro,
    totalEncontrados: familias.reduce((s, f) => s + f.quantidadeProdutos, 0),
  };
}

export const comercialProdutosPorFamilia: ToolEntry<Input, Output> = {
  id: "comercial_produtos_por_familia",
  dominio: "comercial",
  descricao:
    "Lista produtos por familia. Sem 'familiaTermo': agrupa todas as familias com count. " +
    "Com 'familiaTermo' (ex: 'acessorios', 'life fitness'): lista produtos dessa familia. " +
    "Use para 'produtos da familia X', 'quais familias temos', 'produtos de acessorios'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_produto"], () => query(ctx.prisma, input));
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    let resposta = "";
    if (d.modo === "agrupado") {
      const top = d.familias?.[0];
      resposta = `${d.totalFamilias} familias no cadastro (${d.totalProdutosNoCadastro} produtos total).` +
        (top ? ` Top: ${top.familia} (${top.quantidadeProdutos} produtos).` : "");
    } else {
      resposta = d.totalEncontrados === 0
        ? `Nao ha produtos da familia '${input.familiaTermo}'.`
        : `${d.totalEncontrados} produtos da familia '${input.familiaTermo}'. Listando ${d.produtos?.length ?? 0}.`;
    }
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _DESTAQUE: {
          modo: d.modo,
          totalEncontrados: d.totalEncontrados,
          totalFamilias: d.totalFamilias,
          totalProdutosNoCadastro: d.totalProdutosNoCadastro,
          ...(input.familiaTermo ? { familiaTermo: input.familiaTermo } : {}),
        },
        _agregado: { contagem: d.totalEncontrados },
      },
    };
  },
};
