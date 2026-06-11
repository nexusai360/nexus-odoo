// mcp/tools/fiscal/certificados.ts
// Tool MCP: fiscal_certificados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryCertificados } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({ ...paginacaoInputShape });

const linha = z.object({
  odooId: z.number().int(),
  tipo: z.string().nullable(),
  numeroSerie: z.string().nullable(),
  proprietario: z.string().nullable(),
  cnpjCpf: z.string().nullable(),
  dataInicioValidade: z.string().nullable(),
  dataFimValidade: z.string().nullable(),
  dataVencimentoUtil: z.string().nullable(),
  nomeArquivo: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean().optional(),
  // Contrato de lista (Fase B): a query ordena do que vence primeiro para o
  // ultimo (dataFimValidade asc) com desempate por odooId.
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalCertificados: ToolEntry<Input, Output> = {
  id: "fiscal_certificados",
  dominio: "fiscal",
  descricao:
    "Certificados digitais (e-CNPJ) das empresas do grupo: tipo, número de " +
    "série, proprietário, CNPJ e datas de validade. Ordenado do que vence " +
    "primeiro para o último, útil para 'quais certificados estão perto de " +
    "vencer'. Não expõe a senha nem o arquivo do certificado.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_certificado"], async () => {
      const r = await queryCertificados(ctx.prisma, { limit, offset });
      // Contrato de lista (Fase B): declara a ordenacao real da query.
      return { ...r, ordenadoPor: "vencimento asc" };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    // KPIs FULL-SET: contagens sobre fato_certificado inteiro (nao a pagina).
    // vencidos/vence30 sao relativos a now() (podem variar com o tempo).
    const agora = new Date();
    const em30 = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [vencidos, vence30, prox] = await Promise.all([
      ctx.prisma.fatoCertificado.count({ where: { dataFimValidade: { lt: agora } } }),
      ctx.prisma.fatoCertificado.count({
        where: { dataFimValidade: { gte: agora, lte: em30 } },
      }),
      ctx.prisma.fatoCertificado.findFirst({
        where: { dataFimValidade: { gte: agora } },
        orderBy: { dataFimValidade: "asc" },
        select: { proprietario: true, dataFimValidade: true },
      }),
    ]);
    const destaque: Record<string, string | number> = {
      totalCertificados: d.total,
      vencidos,
      vence30Dias: vence30,
    };
    if (prox) {
      destaque.proximoProprietario = prox.proprietario ?? "";
      destaque.proximoVencimento = prox.dataFimValidade
        ? prox.dataFimValidade.toISOString().slice(0, 10)
        : "";
    }
    return enriquecerEnvelope(envelope, "fiscal_certificados", {
      destaque,
      agregado: { contagem: d.total },
      paginacao,
    });
  },
};
