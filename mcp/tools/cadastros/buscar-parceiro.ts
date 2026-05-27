// mcp/tools/cadastros/buscar-parceiro.ts
// Tool MCP: cadastro_buscar_parceiro
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryBuscarParceiro } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

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

// Onda 1.C: envelope canonico
const dados = z.object({
  linhas: z.array(linhaSchema),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
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

export const cadastroBuscarParceiro: ToolEntry<Input, Output> = {
  id: "cadastro_buscar_parceiro",
  dominio: "cadastros",
  descricao: "Busca parceiros (clientes, fornecedores ou contatos) por nome, nome completo ou documento (CNPJ/CPF) via busca textual.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_parceiro"],
      async () => {
        const result = await queryBuscarParceiro(ctx.prisma, input);
        return { linhas: result.linhas };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const linhas = envelope.dados.linhas;
    return enriquecerEnvelope(envelope, "cadastro_buscar_parceiro", {
      destaque: {
        totalEncontrados: linhas.length,
        termo: input.termo,
        ...(linhas.length === 1
          ? {
              parceiroNome: linhas[0]?.nome ?? "",
              documento: linhas[0]?.documento ?? "",
            }
          : {}),
      },
    });
  },
};
