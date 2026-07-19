// mcp/tools/estoque/composicao-kit.ts
// Tool MCP: estoque_composicao_kit
// De que um kit é feito e como o valor se distribui entre os componentes (estrutura vs painel).
// Rateia o valor de referência (preço de tabela por padrão; venda real mediana com n>=5) pelo
// custo de cada componente. Fonte única: queryComposicaoKit (a mesma do painel da Diretoria).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import {
  queryComposicaoKit,
  queryListaKits,
  type ComposicaoKit,
} from "@/lib/reports/queries/composicao-kit.js";
import { withFreshness } from "../../lib/freshness.js";
import { humanizeName } from "@/lib/agent/text-normalize.js";

const inputSchema = z.object({
  /** Nome ou código do kit (busca parcial entre os kits com lista de material). */
  termo: z.string().min(1).max(120).optional(),
  /** Id do kit no Odoo (quando já se sabe qual é, evita a busca por nome). */
  kitId: z.number().int().positive().optional(),
  /** Base do valor: "tabela" (padrão, preço de tabela) ou "venda_real" (mediana, exige n>=5). */
  base: z.enum(["tabela", "venda_real"]).optional(),
});

const componente = z.object({
  nome: z.string(),
  ehMatrix: z.boolean(),
  quantidade: z.number(),
  precoCusto: z.number().nullable(),
  precoVendaTabela: z.number().nullable(),
  valorRateado: z.number(),
  percentual: z.number(),
  semPreco: z.boolean(),
});

const ambiguidade = z
  .object({
    totalMatches: z.number().int(),
    topCandidates: z.array(z.object({ kitId: z.number().int(), nome: z.string(), marca: z.string().nullable() })).max(8),
  })
  .optional();

const dados = z.object({
  kit: z.object({ kitId: z.number().int(), nome: z.string(), marca: z.string().nullable(), ehMatrix: z.boolean() }).nullable(),
  base: z.string(),
  baseLabel: z.string(),
  valorReferencia: z.number(),
  nVendas: z.number().int(),
  multiplasListas: z.boolean(),
  coberturaCompleta: z.boolean(),
  componentes: z.array(componente),
  /** Contrato de lista: os componentes vêm por maior participação (estrutura antes do painel). */
  ordenadoPor: z.string(),
  ambiguidade,
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
type Dados = z.infer<typeof dados>;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function baseLabel(c: ComposicaoKit): string {
  switch (c.baseValor) {
    case "preco_tabela_padrao":
      return "preço de tabela (Venda Padrão)";
    case "preco_tabela_smart":
      return "preço de tabela (Venda Smart)";
    case "venda_real_mediana":
      return `mediana de ${c.nVendas} ${c.nVendas === 1 ? "venda real" : "vendas reais"}`;
    case "sem_referencia":
      return "sem preço de referência";
  }
}

/** Monta a resposta humanizada para o agente citar textualmente. */
function respostaComposicao(nome: string, c: ComposicaoKit): string {
  if (c.coberturaCompleta && c.valorReferencia > 0) {
    const partes = c.componentes
      .map((comp) => `${humanizeName(comp.nome ?? "sem nome")} ${brl.format(comp.valorRateado)} (${pct(comp.percentual)})`)
      .join(", ");
    return `O kit ${nome} vale ${brl.format(c.valorReferencia)} (${baseLabel(c)}). A distribuição por componente é: ${partes}.`;
  }
  if (c.baseValor === "sem_referencia") {
    return `O kit ${nome} não tem preço de tabela nem vendas suficientes para ratear o valor; mostro o custo e o preço de tabela de cada componente.`;
  }
  const semPreco = c.componentes.filter((comp) => comp.semPreco).length;
  return `O kit ${nome} tem ${semPreco} ${semPreco === 1 ? "componente sem preço" : "componentes sem preço"}, então não rateio o valor (inflaria os demais); mostro o custo e o preço de tabela diretos.`;
}

function shapeComposicao(c: ComposicaoKit): Dados {
  const nome = humanizeName(c.kitNome ?? `Kit ${c.kitId}`);
  return {
    kit: { kitId: c.kitId, nome, marca: c.marcaNome, ehMatrix: c.ehMatrix },
    base: c.baseValor,
    baseLabel: baseLabel(c),
    valorReferencia: c.valorReferencia,
    nVendas: c.nVendas,
    multiplasListas: c.multiplasListas,
    coberturaCompleta: c.coberturaCompleta,
    ordenadoPor: "maior participação (estrutura antes do painel)",
    componentes: c.componentes.map((comp) => ({
      nome: humanizeName(comp.nome ?? "Sem nome"),
      ehMatrix: comp.ehMatrix,
      quantidade: comp.quantidade,
      precoCusto: comp.precoCusto,
      precoVendaTabela: comp.precoVendaPadrao ?? comp.precoVendaSmart,
      valorRateado: comp.valorRateado,
      percentual: comp.percentual,
      semPreco: comp.semPreco,
    })),
    _RESPOSTA: respostaComposicao(nome, c),
  };
}

export const estoqueComposicaoKit: ToolEntry<Input, Output> = {
  id: "estoque_composicao_kit",
  dominio: "estoque",
  descricao:
    "Composição de valor de um kit: de que ele é feito (lista de material) e como o valor se " +
    "distribui entre os componentes (estrutura vs painel), rateado pelo custo. Passe `termo` com o " +
    "nome do kit (ou `kitId`). Use para 'do que é feito o kit X', 'composição do kit', 'quanto vale " +
    "a estrutura/o painel do kit', 'quanto do valor do kit é a estrutura'. A base é o preço de " +
    "tabela; peça `base: 'venda_real'` para usar a mediana das vendas reais (quando houver 5+).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_lista_material_item", "fato_produto", "fato_preco", "fato_pedido_item"],
      async (): Promise<Dados> => {
        const vazio: Dados = {
          kit: null,
          base: "sem_referencia",
          baseLabel: "sem preço de referência",
          valorReferencia: 0,
          nVendas: 0,
          multiplasListas: false,
          coberturaCompleta: false,
          ordenadoPor: "maior participação (estrutura antes do painel)",
          componentes: [],
        };

        // Resolve o kit: kitId direto, ou busca por termo entre os kits com BOM.
        let kitId = input.kitId ?? null;
        if (kitId == null && input.termo) {
          const kits = await queryListaKits(ctx.prisma);
          const termo = input.termo.trim().toLowerCase();
          const exatos = kits.filter((k) => (k.nome ?? "").toLowerCase() === termo);
          const contendo = exatos.length ? exatos : kits.filter((k) => (k.nome ?? "").toLowerCase().includes(termo));
          if (contendo.length === 0) {
            return { ...vazio, _RESPOSTA: `Nenhum kit encontrado para "${input.termo}".` };
          }
          if (contendo.length > 1) {
            return {
              ...vazio,
              ambiguidade: {
                totalMatches: contendo.length,
                topCandidates: contendo.slice(0, 8).map((k) => ({ kitId: k.kitId, nome: humanizeName(k.nome ?? `Kit ${k.kitId}`), marca: k.marcaNome })),
              },
              _RESPOSTA: `Há ${contendo.length} kits com "${input.termo}" no nome. Qual deles?`,
            };
          }
          kitId = contendo[0].kitId;
        }
        if (kitId == null) {
          return { ...vazio, _RESPOSTA: "Informe o nome (termo) ou o kitId do kit." };
        }

        const composicao = await queryComposicaoKit(ctx.prisma, kitId, input.base ? { base: input.base } : {});
        if (!composicao) {
          return { ...vazio, _RESPOSTA: `Kit ${kitId} não encontrado no cache.` };
        }
        return shapeComposicao(composicao);
      },
      (d) => d.kit == null && d.componentes.length === 0 && !d.ambiguidade,
    );
    if (envelope.estado === "preparando") return envelope;
    // Auto-formatada: o handler ja montou _RESPOSTA (padrao sancionado; a tool consta em
    // TOOLS_SEM_FORMATADOR_REAL). Aqui so completa _DESTAQUE/_agregado estruturados.
    const d = envelope.dados;
    return {
      ...envelope,
      dados: {
        ...d,
        _DESTAQUE: {
          kit: d.kit?.nome ?? "",
          valorReferencia: d.valorReferencia,
          base: d.baseLabel,
          coberturaCompleta: d.coberturaCompleta ? 1 : 0,
        },
        _agregado: { soma: d.valorReferencia, contagem: d.componentes.length },
      },
    };
  },
};
