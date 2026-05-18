// mcp/tools/cadastros/buscar-parceiro.ts
// Tool MCP: cadastro_buscar_parceiro
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryBuscarParceiro } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  termo: z.string().min(1),
  limite: z.number().int().positive().optional(),
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  nome: z.string().nullable(),
  documento: z.string().nullable(),
  ehCliente: z.boolean(),
  ehFornecedor: z.boolean(),
  uf: z.string().nullable(),
  cidade: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
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

export const cadastroBuscarParceiro: ToolEntry<Input, Output> = {
  id: "cadastro_buscar_parceiro",
  dominio: "cadastros",
  descricao: "Busca parceiros (clientes, fornecedores ou contatos) por nome, nome completo ou documento (CNPJ/CPF) via busca textual.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: (input, ctx) =>
    withFreshness(ctx.prisma, ["fato_parceiro"], async () => {
      const result = await queryBuscarParceiro(ctx.prisma, input);
      return { linhas: result.linhas };
    }),
};
