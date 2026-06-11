// mcp/tools/cadastros/parceiros-sem-documento.ts
// Tool MCP: cadastro_parceiros_sem_documento
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
  tipo: z.enum(["clientes", "fornecedores", "todos"]).optional().describe("Default: todos"),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  nome: z.string().nullable(),
  cidade: z.string().nullable(),
  uf: z.string().nullable(),
  ehCliente: z.boolean(),
  ehFornecedor: z.boolean(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalEncontrados: z.number().int(),
  linhasExibidas: z.number().int(),
  // Contrato de lista (Fase B): parceiros ordenados por nome asc na query.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
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
  const { limit, offset } = resolverPaginacao(input);
  const tipo = input.tipo ?? "todos";
  const where: Record<string, unknown> = {
    ativo: true,
    OR: [{ documento: null }, { documento: "" }],
  };
  if (tipo === "clientes") where.ehCliente = true;
  if (tipo === "fornecedores") where.ehFornecedor = true;
  const [linhas, total] = await Promise.all([
    prisma.fatoParceiro.findMany({
      where,
      select: { odooId: true, nome: true, cidade: true, uf: true, ehCliente: true, ehFornecedor: true },
      // Ordenacao estavel + desempate por odooId: garante que "os proximos"
      // nao repitam nem pulem item entre paginas (alavanca 2b).
      orderBy: [{ nome: "asc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoParceiro.count({ where }),
  ]);
  // Contrato de lista (Fase B): orderBy nome asc (desempate odooId).
  return { linhas, totalEncontrados: total, linhasExibidas: linhas.length, ordenadoPor: "nome asc" };
}

export const cadastroParceirosSemDocumento: ToolEntry<Input, Output> = {
  id: "cadastro_parceiros_sem_documento",
  dominio: "cadastros",
  descricao:
    "Lista parceiros ativos SEM documento (CNPJ/CPF) cadastrado. Use para " +
    "'parceiros sem documento', 'clientes sem CNPJ', 'cadastros incompletos'. " +
    "Filtra por tipo (clientes/fornecedores/todos).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_parceiro"], () => query(ctx.prisma, input));
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const { limit, offset } = resolverPaginacao(input);
    const paginacao = montarPaginacaoMeta(
      d.totalEncontrados,
      offset,
      limit,
      d.linhasExibidas,
    );
    const tipoLabel = input.tipo === "clientes" ? "clientes" : input.tipo === "fornecedores" ? "fornecedores" : "parceiros";
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: d.totalEncontrados === 0
          ? `Nao ha ${tipoLabel} ativos sem documento cadastrado.`
          : `${d.totalEncontrados} ${tipoLabel} ativos sem documento (CNPJ/CPF). Listando ${d.linhasExibidas}.`,
        _DESTAQUE: { totalEncontrados: d.totalEncontrados, linhasExibidas: d.linhasExibidas, tipo: tipoLabel },
        _agregado: { contagem: d.totalEncontrados },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
