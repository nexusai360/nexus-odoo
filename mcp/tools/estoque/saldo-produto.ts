// mcp/tools/estoque/saldo-produto.ts
// Tool MCP: estoque_saldo_produto
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { querySaldoProduto } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import { humanizeName } from "@/lib/agent/text-normalize.js";

const inputSchema = z.object({
  armazemId: z.number().int().positive().optional(),
  familiaId: z.number().int().positive().optional(),
  /** Filtra por nome do produto (busca parcial) , use para perguntas sobre
   * o saldo de um produto específico. Aceita o nome ou o código do produto. */
  termo: z.string().min(1).max(120).optional(),
  ...paginacaoInputShape,
});

const linha = z.object({
  produtoNome: z.string(),
  familiaNome: z.string().nullable(),
  marcaNome: z.string().nullable(),
  saldoTotal: z.number(),
  valorTotal: z.number(),
  numLocais: z.number().int(),
  /** true quando produto existe no cadastro mas sem linha de saldo. */
  semEstoqueCadastrado: z.boolean().optional(),
  /** Microcopy de contexto para o agente. */
  mensagemContexto: z.string().optional(),
});

/**
 * Sinal de ambiguidade: presente apenas quando a busca por `termo` retornou
 * mais de um produto. O agente deve usar isso para perguntar ao usuario qual
 * dos candidatos ele quer, em vez de escolher arbitrariamente. Veja regra
 * em identity-base.ts secao [DESAMBIGUACAO].
 *
 * A9 (Onda 1.D): quando `termo` e numerico com >=7 digitos e nao houve
 * match exato, o servidor seta `requiredExactMatch: true` para sinalizar
 * ao agente que o codigo digitado nao foi encontrado tal qual (evita
 * "Tem [1000362265]?" devolver outro produto similar).
 */
const ambiguidade = z
  .object({
    totalMatches: z.number().int(),
    layer: z.enum(["exact", "fuzzy", "none"]),
    topCandidates: z
      .array(
        z.object({
          id: z.number().int().optional(),
          nome: z.string(),
          context: z.string().optional(),
        }),
      )
      .max(5),
    requiredExactMatch: z.boolean().optional(),
  })
  .optional();

// Onda 1.B: envelope canonico aplicado.
const dados = z.object({
  kpis: z.object({
    totalProdutos: z.number().int(),
    produtosNegativos: z.number().int(),
    valorTotal: z.number(),
  }),
  linhas: z.array(linha),
  ambiguidade,
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

/**
 * A9 (Onda 1.D): codigos numericos longos (>=7 digitos) exigem match exato.
 * Limiar definido por research R-1 sobre distribuicao em fato_produto:
 *   codigos 1-5 digitos: 3327 SKUs curtos (aceitam fuzzy)
 *   codigos 10-18 digitos: 384 codigos longos (rejeitam fuzzy)
 * Limiar 7 isola os longos sem afetar os curtos.
 */
function exigeMatchExato(termo: string | undefined): boolean {
  if (!termo) return false;
  return /^\d{7,}$/.test(termo);
}

function shape(d: Awaited<ReturnType<typeof querySaldoProduto>>) {
  // Onda C v3: normaliza nomes vindos do Odoo (CAIXA ALTA) para Title Case
  // antes de devolver ao agente. Preserva codigos/modelos (ver helper).
  // O agente recebe ja humanizado e cita textualmente; nao precisa instrucao
  // extra no prompt para "deixar bonito".
  const linhas = d.linhas.map((l) => ({
    produtoNome: humanizeName(l.produtoNome),
    familiaNome: l.familiaNome ? humanizeName(l.familiaNome) : l.familiaNome,
    marcaNome: l.marcaNome ? humanizeName(l.marcaNome) : l.marcaNome,
    saldoTotal: l.saldoTotal,
    valorTotal: l.valorTotal,
    numLocais: l.numLocais,
    ...(l.semEstoqueCadastrado ? { semEstoqueCadastrado: true } : {}),
    ...(l.mensagemContexto ? { mensagemContexto: l.mensagemContexto } : {}),
  }));

  // Preenche o sinal de ambiguidade quando a busca por termo casou com mais
  // de um produto. O top de candidatos vem das primeiras 5 linhas (ja
  // ordenadas por valorTotal desc), com contexto compacto (familia, saldo).
  let ambiguidade:
    | {
        totalMatches: number;
        layer: "exact" | "fuzzy" | "none";
        topCandidates: { nome: string; context?: string }[];
        requiredExactMatch?: boolean;
      }
    | undefined;
  if (d.buscaMeta && d.buscaMeta.totalMatches > 1) {
    ambiguidade = {
      totalMatches: d.buscaMeta.totalMatches,
      layer: d.buscaMeta.layer,
      topCandidates: linhas.slice(0, 5).map((l) => ({
        nome: l.produtoNome,
        context:
          l.familiaNome != null
            ? `${l.familiaNome} · saldo ${l.saldoTotal}`
            : `saldo ${l.saldoTotal}`,
      })),
    };
  }

  return { kpis: d.kpis, linhas, ambiguidade };
}

export const estoqueSaldoProduto: ToolEntry<Input, Output> = {
  id: "estoque_saldo_produto",
  dominio: "estoque",
  descricao:
    "Saldo de estoque por produto: unidades e valor a custo, com nº de " +
    "localizações. Para o saldo de um produto específico, passe `termo` com " +
    "o nome ou o código do produto.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo", "fato_produto"],
      async () => shape(await querySaldoProduto(ctx.prisma, input)),
    );
    if (envelope.estado === "preparando") return envelope;

    // A9: quando termo numerico longo nao bateu exato, marca requiredExactMatch.
    if (exigeMatchExato(input.termo) && envelope.dados.ambiguidade) {
      const layer = envelope.dados.ambiguidade.layer;
      if (layer !== "exact") {
        envelope.dados.ambiguidade = {
          ...envelope.dados.ambiguidade,
          requiredExactMatch: true,
        };
      }
    }

    const k = envelope.dados.kpis;
    // T-27 (Ronda 1): topMaiores por saldo (unidades) e topMaioresValor (R$).
    // Resolve "10 produtos com maior saldo em estoque hoje" sem precisar
    // de tool nova. Linhas vem ordenadas por valor desc; aqui geramos uma
    // segunda visao por saldo desc para perguntas de unidade. Calculado
    // sobre o conjunto COMPLETO, antes de fatiar a pagina (alavanca 2b).
    const topMaiores = [...envelope.dados.linhas]
      .sort((a, b) => b.saldoTotal - a.saldoTotal)
      .slice(0, 10)
      .map((l) => ({
        nome: l.produtoNome,
        saldo: l.saldoTotal,
        valor: l.valorTotal,
      }));

    // Alavanca 2b: a lista de produtos pode ser grande (consulta sem termo).
    // Excecao documentada: as linhas ja vem agregadas/ordenadas em memoria
    // (querySaldoProduto), entao fatiamos [offset, offset+limit) aqui; total
    // = total de produtos do recorte (kpis.totalProdutos). KPIs, ambiguidade
    // e topMaiores permanecem sobre o conjunto completo.
    const totalLinhas = envelope.dados.linhas.length;
    const paginacao = montarPaginacaoMeta(
      totalLinhas,
      offset,
      limit,
      Math.max(0, Math.min(limit, totalLinhas - offset)),
    );
    envelope.dados.linhas = envelope.dados.linhas.slice(offset, offset + limit);

    const enriched = enriquecerEnvelope(envelope, "estoque_saldo_produto", {
      destaque: {
        totalProdutos: k.totalProdutos,
        valorTotal: k.valorTotal,
        produtosNegativos: k.produtosNegativos,
      },
      agregado: {
        contagem: k.totalProdutos,
        soma: k.valorTotal,
      },
      paginacao,
    });
    if (enriched.estado !== "preparando") {
      (enriched.dados as unknown as Record<string, unknown>)["topMaiores"] = topMaiores;
    }
    return enriched;
  },
};
