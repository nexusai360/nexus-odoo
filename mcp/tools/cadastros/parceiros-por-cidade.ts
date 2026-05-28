// mcp/tools/cadastros/parceiros-por-cidade.ts
// Tool MCP: cadastro_parceiros_por_cidade
//
// Resolve "parceiros do interior de SP", "parceiros da capital", "parceiros
// da cidade X". Filtra fato_parceiro por uf + cidade.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  uf: z.string().length(2).describe("UF (sigla 2 letras, ex: SP, RJ)").optional(),
  cidade: z.string().min(2).max(120).optional()
    .describe("Filtra por cidade especifica (LIKE case-insensitive)"),
  zona: z.enum(["capital", "interior", "todas"]).optional()
    .describe("Default: todas. 'capital' = somente capital da UF. 'interior' = todas exceto capital."),
  apenasClientes: z.boolean().optional(),
  limite: z.number().int().min(1).max(100).optional(),
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  nome: z.string().nullable(),
  documento: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  ehCliente: z.boolean(),
  ehFornecedor: z.boolean(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalEncontrados: z.number().int(),
  linhasExibidas: z.number().int(),
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

// Capitais brasileiras (uppercase pra match case-insensitive).
const CAPITAIS: Record<string, string> = {
  AC: "RIO BRANCO", AL: "MACEIO", AP: "MACAPA", AM: "MANAUS",
  BA: "SALVADOR", CE: "FORTALEZA", DF: "BRASILIA", ES: "VITORIA",
  GO: "GOIANIA", MA: "SAO LUIS", MT: "CUIABA", MS: "CAMPO GRANDE",
  MG: "BELO HORIZONTE", PA: "BELEM", PB: "JOAO PESSOA", PR: "CURITIBA",
  PE: "RECIFE", PI: "TERESINA", RJ: "RIO DE JANEIRO", RN: "NATAL",
  RS: "PORTO ALEGRE", RO: "PORTO VELHO", RR: "BOA VISTA", SC: "FLORIANOPOLIS",
  SP: "SAO PAULO", SE: "ARACAJU", TO: "PALMAS",
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

async function queryParceirosPorCidade(prisma: PrismaClient, input: Input) {
  const limite = input.limite ?? 30;
  const apenasClientes = input.apenasClientes ?? false;
  const where: Record<string, unknown> = { ativo: true };
  if (input.uf) where.uf = input.uf.toUpperCase();
  if (apenasClientes) where.ehCliente = true;
  if (input.cidade) {
    where.cidade = { contains: input.cidade, mode: "insensitive" };
  }

  // Aplicar filtro de zona (capital/interior) na query base e refinar no JS
  // pra comparar com unaccent. Quando uf esta setado, conseguimos saber a
  // capital. Sem uf, "zona" exige filtrar todas as capitais do pais.
  const todos = await prisma.fatoParceiro.findMany({
    where,
    select: {
      odooId: true,
      nome: true,
      documento: true,
      cidade: true,
      uf: true,
      ehCliente: true,
      ehFornecedor: true,
    },
    take: 5000, // cap defensivo
  });

  const zona = input.zona ?? "todas";
  let filtrados = todos;
  if (zona === "capital") {
    filtrados = todos.filter((p) => {
      if (!p.uf || !p.cidade) return false;
      const cap = CAPITAIS[p.uf.toUpperCase()];
      return cap && norm(p.cidade) === cap;
    });
  } else if (zona === "interior") {
    filtrados = todos.filter((p) => {
      if (!p.uf || !p.cidade) return false;
      const cap = CAPITAIS[p.uf.toUpperCase()];
      return !cap || norm(p.cidade) !== cap;
    });
  }

  const linhasCap = filtrados.slice(0, limite);
  return {
    linhas: linhasCap,
    totalEncontrados: filtrados.length,
    linhasExibidas: linhasCap.length,
  };
}

export const cadastroParceirosPorCidade: ToolEntry<Input, Output> = {
  id: "cadastro_parceiros_por_cidade",
  dominio: "cadastros",
  descricao:
    "Lista parceiros filtrando por UF + cidade + zona (capital/interior/todas). " +
    "Use para 'parceiros do interior de SP' (uf=SP, zona=interior), " +
    "'clientes da capital' (uf=SP, zona=capital, apenasClientes=true), " +
    "'parceiros de Brasilia' (cidade=Brasilia). Default: todas zonas, todos parceiros.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_parceiro"], () =>
      queryParceirosPorCidade(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const zona = input.zona ?? "todas";
    const ufLabel = input.uf ? input.uf.toUpperCase() : "todas as UFs";
    const zonaLabel = zona === "capital" ? "na capital" : zona === "interior" ? "no interior" : "";
    const cidadeLabel = input.cidade ? `em ${input.cidade}` : "";
    const ondeLabel = [zonaLabel, cidadeLabel, `de ${ufLabel}`].filter(Boolean).join(" ");
    const resposta = d.totalEncontrados === 0
      ? `Nao ha parceiros ${ondeLabel}.`
      : `${d.totalEncontrados} parceiros ${ondeLabel}. Listando ${d.linhasExibidas}.`;
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _DESTAQUE: {
          totalEncontrados: d.totalEncontrados,
          linhasExibidas: d.linhasExibidas,
          uf: input.uf ?? "",
          cidade: input.cidade ?? "",
          zona,
        },
        _agregado: { contagem: d.totalEncontrados },
        _listaTruncada: d.totalEncontrados > d.linhasExibidas,
      },
    };
  },
};
