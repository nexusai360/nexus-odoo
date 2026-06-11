// mcp/tools/cadastros/parceiros-novos.ts
// Tool MCP: cadastro_parceiros_novos
//
// Resolve "parceiros novos cadastrados esta semana/mes", "clientes recentes",
// "quem cadastramos ontem". Usa fato_parceiro.data_criacao (T-42).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  periodoNome: z.enum([
    "hoje",
    "ontem",
    "essa_semana",
    "semana_passada",
    "mes_corrente",
    "mes_anterior",
    "ultimos_7_dias",
    "ultimos_30_dias",
    "ano_corrente",
  ]).optional().describe("Default: essa_semana"),
  periodoDe: z.string().optional().describe("Data inicial ISO (AAAA-MM-DD). Sobrepoe periodoNome."),
  periodoAte: z.string().optional().describe("Data final ISO (AAAA-MM-DD). Sobrepoe periodoNome."),
  tipo: z.enum(["clientes", "fornecedores", "todos"]).optional()
    .describe("Default: todos"),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  nome: z.string().nullable(),
  documento: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  ehCliente: z.boolean(),
  ehFornecedor: z.boolean(),
  dataCriacao: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalEncontrados: z.number().int(),
  linhasExibidas: z.number().int(),
  periodoUsado: z.object({
    de: z.string(),
    ate: z.string(),
    nome: z.string().nullable(),
  }),
  // Contrato de lista (Fase B): parceiros novos ordenados por data de criacao desc.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Resolve {de, ate} a partir do periodoNome ou periodoDe/Ate explicitos.
 * Default: essa_semana (segunda 00:00 a domingo 23:59:59).
 * Timezone: America/Sao_Paulo via offset numerico simples.
 */
function resolverPeriodo(input: Input): { de: Date; ate: Date; nome: string | null } {
  if (input.periodoDe && input.periodoAte) {
    return {
      de: new Date(`${input.periodoDe}T00:00:00-03:00`),
      ate: new Date(`${input.periodoAte}T23:59:59.999-03:00`),
      nome: null,
    };
  }
  const nome = input.periodoNome ?? "essa_semana";
  // referencia "agora" no fuso BR
  const now = new Date();
  // diferenca atual entre UTC e BR ignorada — usamos data calendario simples.
  // Para fins de janelas grandes (dia/semana/mes), o erro de ate 3h e irrelevante.
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  const startOfDay = (Y: number, M: number, D: number) =>
    new Date(Date.UTC(Y, M, D, 3, 0, 0)); // 03 UTC = 00 BR (UTC-3)
  const endOfDay = (Y: number, M: number, D: number) =>
    new Date(Date.UTC(Y, M, D + 1, 2, 59, 59, 999));

  switch (nome) {
    case "hoje":
      return { de: startOfDay(y, m, d), ate: endOfDay(y, m, d), nome };
    case "ontem":
      return { de: startOfDay(y, m, d - 1), ate: endOfDay(y, m, d - 1), nome };
    case "essa_semana": {
      // segunda da semana corrente
      const dow = now.getUTCDay() || 7; // dom=0->7
      const startDay = d - (dow - 1);
      return { de: startOfDay(y, m, startDay), ate: endOfDay(y, m, startDay + 6), nome };
    }
    case "semana_passada": {
      const dow = now.getUTCDay() || 7;
      const startDay = d - (dow - 1) - 7;
      return { de: startOfDay(y, m, startDay), ate: endOfDay(y, m, startDay + 6), nome };
    }
    case "mes_corrente":
      return { de: startOfDay(y, m, 1), ate: endOfDay(y, m + 1, 0), nome };
    case "mes_anterior":
      return { de: startOfDay(y, m - 1, 1), ate: endOfDay(y, m, 0), nome };
    case "ultimos_7_dias":
      return { de: startOfDay(y, m, d - 6), ate: endOfDay(y, m, d), nome };
    case "ultimos_30_dias":
      return { de: startOfDay(y, m, d - 29), ate: endOfDay(y, m, d), nome };
    case "ano_corrente":
      return { de: startOfDay(y, 0, 1), ate: endOfDay(y, 11, 31), nome };
    default:
      return { de: startOfDay(y, m, 1), ate: endOfDay(y, m + 1, 0), nome: "mes_corrente" };
  }
}

async function queryParceirosNovos(prisma: PrismaClient, input: Input) {
  const { limit, offset } = resolverPaginacao(input);
  const { de, ate, nome } = resolverPeriodo(input);
  const tipo = input.tipo ?? "todos";

  const where: Record<string, unknown> = {
    ativo: true,
    dataCriacao: { gte: de, lte: ate },
  };
  if (tipo === "clientes") where.ehCliente = true;
  if (tipo === "fornecedores") where.ehFornecedor = true;

  const [linhas, total] = await Promise.all([
    prisma.fatoParceiro.findMany({
      where,
      select: {
        odooId: true,
        nome: true,
        documento: true,
        cidade: true,
        uf: true,
        ehCliente: true,
        ehFornecedor: true,
        dataCriacao: true,
      },
      // Ordenacao estavel + desempate por odooId: garante que "os proximos"
      // nao repitam nem pulem item entre paginas (alavanca 2b).
      orderBy: [{ dataCriacao: "desc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoParceiro.count({ where }),
  ]);

  return {
    linhas: linhas.map((l) => ({
      ...l,
      dataCriacao: l.dataCriacao ? l.dataCriacao.toISOString() : null,
    })),
    totalEncontrados: total,
    linhasExibidas: linhas.length,
    periodoUsado: {
      de: de.toISOString(),
      ate: ate.toISOString(),
      nome,
    },
    // Contrato de lista (Fase B): orderBy dataCriacao desc (desempate odooId).
    ordenadoPor: "data de criação desc",
  };
}

export const cadastroParceirosNovos: ToolEntry<Input, Output> = {
  id: "cadastro_parceiros_novos",
  dominio: "cadastros",
  descricao:
    "Lista parceiros novos cadastrados no periodo informado (data_criacao = " +
    "campo create_date do Odoo). Use para 'parceiros novos cadastrados esta " +
    "semana', 'clientes novos esse mes', 'quem cadastramos ontem'. Aceita " +
    "periodoNome (essa_semana default, mes_corrente, ontem, hoje, etc) ou " +
    "periodoDe/periodoAte explicitos, e tipo (clientes/fornecedores/todos).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_parceiro"], () =>
      queryParceirosNovos(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const { limit, offset } = resolverPaginacao(input);
    const paginacao = montarPaginacaoMeta(
      d.totalEncontrados,
      offset,
      limit,
      d.linhasExibidas,
    );
    const periodoLabel = d.periodoUsado.nome
      ? d.periodoUsado.nome.replace(/_/g, " ")
      : `${d.periodoUsado.de.slice(0, 10)} a ${d.periodoUsado.ate.slice(0, 10)}`;
    const tipoLabel =
      input.tipo === "clientes" ? "clientes" :
      input.tipo === "fornecedores" ? "fornecedores" : "parceiros";
    const top = d.linhas[0];
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: d.totalEncontrados === 0
          ? `Nao ha ${tipoLabel} novos cadastrados em ${periodoLabel}.`
          : `${d.totalEncontrados} ${tipoLabel} novos cadastrados em ${periodoLabel}. Mais recente: ${top?.nome ?? "(sem nome)"}${top?.dataCriacao ? ` (${top.dataCriacao.slice(0, 10)})` : ""}. Listando ${d.linhasExibidas}.`,
        _DESTAQUE: {
          totalEncontrados: d.totalEncontrados,
          linhasExibidas: d.linhasExibidas,
          periodoDe: d.periodoUsado.de.slice(0, 10),
          periodoAte: d.periodoUsado.ate.slice(0, 10),
          periodoNome: d.periodoUsado.nome ?? "",
          tipo: tipoLabel,
        },
        _agregado: { contagem: d.totalEncontrados },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
