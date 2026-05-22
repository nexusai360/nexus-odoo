// mcp/tools/fiscal/referencia-buscar.ts
// Tool MCP: referencia_buscar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryReferenciaBuscar } from "@/lib/reports/queries/referencia.js";
import { withFreshness } from "../../lib/freshness.js";

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
  limite: z.number().int().min(1).max(200).optional(),
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
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_referencia"], () =>
      queryReferenciaBuscar(ctx.prisma, input),
    ),
};
