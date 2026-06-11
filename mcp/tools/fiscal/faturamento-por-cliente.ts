// mcp/tools/fiscal/faturamento-por-cliente.ts
// Tool MCP: fiscal_faturamento_por_cliente
// Fase 2.5: ranking de clientes EXTERNOS via camada canonica (base vrProdutos + ehReceita
// por CFOP). Vendas intragrupo nao sao cliente: somadas a parte em totalIntragrupo.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { faturamentoPorClienteCanon } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape, resolverPaginacao, montarPaginacaoMeta } from "../../lib/paginacao.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  participanteId: z.number().int().nullable(),
  participanteNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  totalExterno: z.number(),
  totalIntragrupo: z.number(),
  topClienteExterno: z.string().nullable(),
  periodoLabel: z.string(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  // Contrato de lista (Fase B): ranking de clientes por valor total desc.
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalFaturamentoPorCliente: ToolEntry<Input, Output> = {
  id: "fiscal_faturamento_por_cliente",
  dominio: "fiscal",
  descricao: "Faturamento agrupado por cliente (notas de saída autorizadas), ordenado por valor total decrescente.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await faturamentoPorClienteCanon(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
        limit,
        offset,
      });
      return {
        linhas: r.linhas,
        total: r.total,
        totalExterno: r.totalExterno,
        totalIntragrupo: r.totalIntragrupo,
        topClienteExterno: r.topClienteExterno,
        periodoLabel: per.label,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        ordenadoPor: "valor desc",
        aviso:
          "Ranking de clientes externos por valor de venda (base produtos por CFOP). " +
          "Vendas entre empresas do grupo nao sao cliente e ficam fora do ranking. " +
          `Período: ${per.label}. ${escopo.escopo.aviso}`,
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    const top = d.linhas[0];
    return enriquecerEnvelope(envelope, "fiscal_faturamento_por_cliente", {
      periodo: per,
      destaque: {
        totalClientes: d.total,
        totalExterno: d.totalExterno,
        totalIntragrupo: d.totalIntragrupo,
        topCliente: top?.participanteNome ?? "",
        valorTopCliente: top?.valorTotal ?? 0,
        linhasExibidas: d.linhas.length,
        periodoLabel: d.periodoLabel,
      },
      agregado: { contagem: d.total, soma: d.totalExterno },
      paginacao,
    });
  },
};
