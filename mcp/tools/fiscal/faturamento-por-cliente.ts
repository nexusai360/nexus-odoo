// mcp/tools/fiscal/faturamento-por-cliente.ts
// Tool MCP: fiscal_faturamento_por_cliente
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryFaturamentoPorCliente } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape, resolverPaginacao, montarPaginacaoMeta } from "../../lib/paginacao.js";
import { montarEscopoEmpresa, type EscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  participanteNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  valorGeral: z.number(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryFaturamentoPorCliente>>, escopo: EscopoEmpresa) {
  return {
    linhas: d.linhas,
    total: d.total,
    valorGeral: d.valorGeral,
    escopoEmpresa: escopo as unknown as Record<string, unknown>,
    aviso: "Agrupa notas de saída autorizadas (venda) por cliente, ordenado por valor total descendente. " + escopo.aviso,
  };
}

export const fiscalFaturamentoPorCliente: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_cliente",
  dominio: "fiscal",
  descricao: "Faturamento agrupado por cliente (notas de saída autorizadas), ordenado por valor total decrescente.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(
        await queryFaturamentoPorCliente(ctx.prisma, {
          periodoDe: input.periodoDe,
          periodoAte: input.periodoAte,
          empresaId: escopo.empresaId,
          limit,
          offset,
        }),
        escopo.escopo,
      ),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // Alavanca 2b: paginacao em memoria por cliente (total = clientes distintos).
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    const top = d.linhas[0];
    return enriquecerEnvelope(
      envelope,
      "fiscal_faturamento_por_cliente",
      {
        destaque: {
          totalClientes: d.total,
          totalGeral: d.valorGeral,
          topCliente: top?.participanteNome ?? "",
          valorTopCliente: top?.valorTotal ?? 0,
          linhasExibidas: d.linhas.length,
        },
        agregado: { contagem: d.total, soma: d.valorGeral },
        paginacao,
      },
    );
  },
};
