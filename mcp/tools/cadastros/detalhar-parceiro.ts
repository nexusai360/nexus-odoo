// mcp/tools/cadastros/detalhar-parceiro.ts
// Tool MCP: cadastro_detalhar_parceiro (Onda 3)
//
// Retorna o cadastro completo de um parceiro (nome, doc, email, telefone,
// endereco, ativo). Resolve R15 "Cadastro completo do cliente Smartfit"
// onde o agente parou em listar 10 filiais sem detalhar.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  odooId: z.number().int().positive(),
});

const dados = z.object({
  encontrado: z.boolean(),
  parceiro: z
    .object({
      odooId: z.number().int(),
      nome: z.string().nullable(),
      nomeCompleto: z.string().nullable(),
      documento: z.string().nullable(),
      ehCliente: z.boolean(),
      ehFornecedor: z.boolean(),
      ehEmpresa: z.boolean(),
      email: z.string().nullable(),
      telefone: z.string().nullable(),
      cidade: z.string().nullable(),
      uf: z.string().nullable(),
      cep: z.string().nullable(),
      pais: z.string().nullable(),
      ativo: z.boolean(),
    })
    .nullable(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
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

export const cadastroDetalharParceiro: ToolEntry<Input, Output> = {
  id: "cadastro_detalhar_parceiro",
  dominio: "cadastros",
  descricao:
    "Retorna o cadastro completo de um parceiro a partir do odooId: nome, " +
    "documento, papel (cliente/fornecedor/empresa), email, telefone, " +
    "endereco, ativo. Use depois de cadastro_buscar_parceiro quando o " +
    "usuario pediu 'cadastro completo' de um cliente especifico.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_parceiro"],
      async () => {
        const row = await ctx.prisma.fatoParceiro.findFirst({
          where: { odooId: input.odooId },
        });
        if (!row) return { encontrado: false, parceiro: null };
        return {
          encontrado: true,
          parceiro: {
            odooId: row.odooId,
            nome: row.nome,
            nomeCompleto: row.nomeCompleto,
            documento: row.documento,
            ehCliente: row.ehCliente,
            ehFornecedor: row.ehFornecedor,
            ehEmpresa: row.ehEmpresa,
            email: row.email,
            telefone: row.telefone,
            cidade: row.cidade,
            uf: row.uf,
            cep: row.cep,
            pais: row.pais,
            ativo: row.ativo,
          },
        };
      },
      (d) => !d.encontrado,
    );
    if (envelope.estado === "preparando") return envelope;
    const p = envelope.dados.parceiro;
    return enriquecerEnvelope(envelope, "cadastro_detalhar_parceiro", {
      destaque: p
        ? {
            nome: p.nome ?? "",
            documento: p.documento ?? "",
            papel: [
              p.ehCliente ? "cliente" : "",
              p.ehFornecedor ? "fornecedor" : "",
            ]
              .filter(Boolean)
              .join("/") || "outro",
            uf: p.uf ?? "",
            ativo: p.ativo ? "sim" : "nao",
          }
        : { encontrado: "nao" },
    });
  },
};
