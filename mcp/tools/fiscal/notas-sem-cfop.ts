// mcp/tools/fiscal/notas-sem-cfop.ts
// Tool MCP: fiscal_notas_sem_cfop , lista NOTA A NOTA as notas de saida
// autorizadas que tem itens SEM CFOP (sem classificacao fiscal). Fecha o gap em
// que o agente so tinha o total agregado (R$/itens) e nao conseguia "listar as
// notas sem CFOP" (ex.: avaliacao da JHT SP, turno "Liste as notas sem CFOP").
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryNotasSemCfop } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape, resolverPaginacao, montarPaginacaoMeta } from "../../lib/paginacao.js";
import { montarEscopoEmpresa, type EscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  numero: z.string().nullable(),
  serie: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  participanteNome: z.string().nullable(),
  finalidadeNfe: z.string().nullable(),
  totalItens: z.number().int(),
  valorProdutos: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalNotas: z.number().int(),
  totalItens: z.number().int(),
  valorProdutos: z.number(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
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

function shape(d: Awaited<ReturnType<typeof queryNotasSemCfop>>, escopo: EscopoEmpresa, periodoLabel: string) {
  return {
    linhas: d.linhas.map((l) => ({
      numero: l.numero,
      serie: l.serie,
      dataEmissao: l.dataEmissao ? l.dataEmissao.toISOString() : null,
      participanteNome: l.participanteNome,
      finalidadeNfe: l.finalidadeNfe,
      totalItens: l.totalItens,
      valorProdutos: l.valorProdutos,
    })),
    totalNotas: d.totalNotas,
    totalItens: d.totalItens,
    valorProdutos: d.valorProdutos,
    escopoEmpresa: escopo as unknown as Record<string, unknown>,
    ordenadoPor: "valor desc",
    aviso:
      `Notas de saída AUTORIZADAS com itens SEM CFOP (sem classificação fiscal), nota a nota, ordenadas por valor de produtos. ` +
      `Total: ${d.totalNotas} nota(s), ${d.totalItens} item(ns), R$ ${d.valorProdutos.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. ` +
      `Período: ${periodoLabel}. ${escopo.aviso}`,
  };
}

export const fiscalNotasSemCfop: ToolEntry<Input, Output> = {
  id: "fiscal_notas_sem_cfop",
  dominio: "fiscal",
  descricao:
    "Lista NOTA A NOTA as notas fiscais de saída autorizadas que têm itens SEM CFOP (sem classificação fiscal), com número, participante, finalidade, quantidade de itens e valor de produtos. Use quando pedirem 'liste/quais as notas sem CFOP'. Aceita empresa e período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal", "fato_nota_fiscal_item"], async () =>
      shape(
        await queryNotasSemCfop(ctx.prisma, {
          periodoDe: per.periodoDe,
          periodoAte: per.periodoAte,
          empresaId: escopo.empresaId,
          limit,
          offset,
        }),
        escopo.escopo,
        per.label,
      ),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.totalNotas, offset, limit, d.linhas.length);
    return enriquecerEnvelope(envelope, "fiscal_notas_sem_cfop", {
      periodo: per,
      destaque: {
        totalNotas: d.totalNotas,
        totalItens: d.totalItens,
        valorProdutos: d.valorProdutos,
        linhasExibidas: d.linhas.length,
      },
      agregado: { contagem: d.totalNotas, soma: d.valorProdutos },
      paginacao,
    });
  },
};
