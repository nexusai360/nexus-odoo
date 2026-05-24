// mcp/tools/fiscal/certificados.ts
// Tool MCP: fiscal_certificados
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryCertificados } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

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
  handler: (_input, ctx) =>
    withFreshness(ctx.prisma, ["fato_certificado"], () =>
      queryCertificados(ctx.prisma),
    ),
};
