// mcp/tools/cadastros/detalhar-produto.ts
// Tool MCP: cadastro_detalhar_produto
//
// Retorna o detalhe completo de um produto a partir do odooId (nome, codigos,
// marca, familia, unidade, ncm, precos, ativo). Usar depois de uma busca de
// produto quando o usuario pediu o cadastro/detalhe de um item especifico.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

// Fase C (caso NCM, pericia 2026-06-11): a tool exigia odooId, forcando 2
// passos (buscar -> detalhar) que o agente nao completava. Agora aceita
// `termo` (codigo exato ou parte do nome) e resolve internamente; ambiguidade
// devolve ate 5 candidatos para o agente listar.
const inputSchema = z
  .object({
    odooId: z.number().int().positive().optional(),
    termo: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .optional()
      .describe("Codigo exato ou parte do nome do produto (ex: 'esteira T5', '1464')."),
  })
  .refine((v) => v.odooId !== undefined || v.termo !== undefined, {
    message: "Informe odooId ou termo.",
  });

const dados = z.object({
  encontrado: z.boolean(),
  produto: z
    .object({
      odooId: z.number().int(),
      nome: z.string(),
      codigo: z.string().nullable(),
      codigoUnico: z.string().nullable(),
      codigoBarras: z.string().nullable(),
      marcaNome: z.string().nullable(),
      familiaNome: z.string().nullable(),
      unidadeNome: z.string().nullable(),
      ncmCodigo: z.string().nullable(),
      precoVenda: z.number().nullable(),
      precoCusto: z.number().nullable(),
      ativo: z.boolean(),
    })
    .nullable(),
  /** Ambiguidade: termo casou com varios produtos; agente lista e pede escolha. */
  ambiguidade: z.boolean().optional(),
  candidatos: z
    .array(
      z.object({
        odooId: z.number().int(),
        nome: z.string(),
        codigo: z.string().nullable(),
      }),
    )
    .optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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

export const cadastroDetalharProduto: ToolEntry<Input, Output> = {
  id: "cadastro_detalhar_produto",
  dominio: "cadastros",
  descricao:
    "Detalhe COMPLETO do CADASTRO de um produto: NCM, codigo de barras (EAN), " +
    "codigo, codigo unico, marca, familia, unidade, preco de venda, preco de " +
    "custo e se esta ativo. Aceita odooId OU termo (codigo exato ou parte do " +
    "nome, ex: 'esteira T5'). Use para 'qual o NCM do produto X', 'codigo de " +
    "barras do item Y', 'ficha cadastral do produto'. NAO e' saldo de estoque.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_produto"],
      async () => {
        // Resolucao por termo (caso NCM): codigo exato primeiro, depois nome.
        // Nome casa por PALAVRAS (AND de contains): "esteira T5" precisa achar
        // "T5-XR ESTEIRA ERGOMETRICA" (ordem das palavras varia no cadastro).
        let alvoId = input.odooId ?? null;
        if (alvoId === null && input.termo) {
          const palavras = input.termo.split(/\s+/).filter((p) => p.length > 0);
          const candidatos = await ctx.prisma.fatoProduto.findMany({
            where: {
              OR: [
                { codigo: input.termo },
                {
                  AND: palavras.map((p) => ({
                    nome: { contains: p, mode: "insensitive" as const },
                  })),
                },
              ],
            },
            select: { odooId: true, nome: true, codigo: true },
            orderBy: [{ ativo: "desc" }, { nome: "asc" }],
            take: 6,
          });
          if (candidatos.length === 0) return { encontrado: false, produto: null };
          if (candidatos.length > 1) {
            return {
              encontrado: false,
              produto: null,
              ambiguidade: true,
              candidatos: candidatos.slice(0, 5),
            };
          }
          alvoId = candidatos[0].odooId;
        }
        const row = await ctx.prisma.fatoProduto.findFirst({
          where: { odooId: alvoId ?? -1 },
        });
        if (!row) return { encontrado: false, produto: null };
        return {
          encontrado: true,
          produto: {
            odooId: row.odooId,
            nome: row.nome,
            codigo: row.codigo,
            codigoUnico: row.codigoUnico,
            codigoBarras: row.codigoBarras,
            marcaNome: row.marcaNome,
            familiaNome: row.familiaNome,
            unidadeNome: row.unidadeNome,
            ncmCodigo: row.ncmCodigo,
            precoVenda: row.precoVenda === null ? null : Number(row.precoVenda),
            precoCusto: row.precoCusto === null ? null : Number(row.precoCusto),
            ativo: row.ativo,
          },
        };
      },
      (d) => !d.encontrado,
    );
    if (envelope.estado === "preparando") return envelope;
    const p = envelope.dados.produto;
    const cand = envelope.dados.candidatos;
    return enriquecerEnvelope(envelope, "cadastro_detalhar_produto", {
      destaque: p
        ? {
            nome: p.nome,
            codigo: p.codigo ?? "",
            marca: p.marcaNome ?? "",
            ncm: p.ncmCodigo ?? "",
            codigoBarras: p.codigoBarras ?? "",
            precoVenda: p.precoVenda ?? 0,
            ativo: p.ativo ? "sim" : "nao",
          }
        : cand?.length
          ? {
              ambiguidade: 1,
              candidatos: cand.map((c) => `[${c.codigo ?? "?"}] ${c.nome}`).join(" | "),
            }
          : { encontrado: "nao" },
    });
  },
};
