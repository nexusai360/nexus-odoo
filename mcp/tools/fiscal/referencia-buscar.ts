// mcp/tools/fiscal/referencia-buscar.ts
// Tool MCP: referencia_buscar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryReferenciaBuscar } from "@/lib/reports/queries/referencia.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const TABELAS = [
  "ncm", "cfop", "cest", "cnae", "nbs", "natureza_operacao", "unidade",
  "cst_icms", "cst_icms_sn", "cst_ipi", "cst_pis_cofins", "cst_cibs",
  "municipio", "pais", "estado",
] as const;

const inputSchema = z.object({
  tabela: z.enum(TABELAS).describe("Tabela de referência a consultar."),
  termo: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("Código ou parte da descrição. Sem termo, lista a tabela."),
  ...paginacaoInputShape,
});

const linha = z.object({
  tabela: z.string(),
  codigo: z.string(),
  descricao: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
  // Contrato de lista (Fase B): a query ordena por codigo asc com desempate
  // por id; aqui apenas declaramos ao LLM.
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

export const fiscalReferenciaBuscar: ToolEntry<Input, Output> = {
  id: "referencia_buscar",
  dominio: "fiscal",
  descricao:
    "Consulta as tabelas de referência fiscais, cadastrais e geográficas " +
    "(NCM, CFOP, CEST, CNAE, NBS, naturezas de operação, unidades, CSTs, " +
    "municípios, países, estados). Informe `tabela` e um `termo` (código ou " +
    "parte da descrição) para resolver 'o que é o código X'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_referencia"], async () => {
      const r = await queryReferenciaBuscar(ctx.prisma, { ...input, limit, offset });
      // Contrato de lista (Fase B): declara a ordenacao real da query.
      return { ...r, ordenadoPor: "código asc" };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    // _RESPOSTA delegado ao formatador canonico (fmtReferenciaBuscar). `total`
    // e full-set (count(where) na query, independente da paginacao).
    return enriquecerEnvelope(envelope, "referencia_buscar", {
      destaque: {
        total: d.total,
        tabela: input.tabela,
        ...(input.termo ? { termo: input.termo } : {}),
      },
      agregado: { contagem: d.total },
      paginacao,
    });
  },
};
