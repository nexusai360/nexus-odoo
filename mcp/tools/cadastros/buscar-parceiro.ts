// mcp/tools/cadastros/buscar-parceiro.ts
// Tool MCP: cadastro_buscar_parceiro
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryBuscarParceiro } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  termo: z.string().min(1),
  ...paginacaoInputShape,
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
  total: z.number().int().optional(),
  // Contrato de lista (Fase B): conjunto unido ordenado por id asc (busca une ids
  // de varios caminhos, sem score de relevancia).
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  _PAGINACAO: z.any().optional(),
  _AVISO_TRUNCAMENTO: z.string().optional(),
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
    // T-26 (Ronda 1): validacao de termo de busca para evitar lixo.
    // Termo com menos de 2 caracteres uteis (apos strip de pontuacao/espaco)
    // retorna lista vazia com aviso claro, em vez de fazer LIKE %.% e
    // devolver 10 parceiros aleatorios.
    const termoLimpo = (input.termo ?? "").replace(/[^\p{L}\p{N}]/gu, "").trim();
    if (termoLimpo.length < 2) {
      const envelope = await withFreshness(
        ctx.prisma,
        ["fato_parceiro"],
        async () => ({ linhas: [] as Array<z.infer<typeof linhaSchema>> }),
      );
      if (envelope.estado === "preparando") return envelope;
      // Forcar estado=vazio para o LLM tratar como "nao ha" via §10b.
      const respostaVazia = `Termo de busca '${input.termo}' eh muito curto ou sem letras/numeros. Informe nome, CNPJ ou CPF (minimo 2 caracteres).`;
      return enriquecerEnvelope(
        { ...envelope, estado: "vazio" as const, dados: { linhas: [] } },
        "cadastro_buscar_parceiro",
        {
          destaque: {
            totalEncontrados: 0,
            termo: input.termo,
            avisoTermo: respostaVazia,
          },
        },
      );
    }
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_parceiro"],
      async () => {
        const result = await queryBuscarParceiro(ctx.prisma, {
          termo: input.termo,
          limit,
          offset,
        });
        return { linhas: result.linhas, total: result.total, ordenadoPor: result.ordenadoPor };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const linhas = envelope.dados.linhas;
    const total = envelope.dados.total;
    const paginacao = montarPaginacaoMeta(total, offset, limit, linhas.length);
    return enriquecerEnvelope(envelope, "cadastro_buscar_parceiro", {
      paginacao,
      // Caso Smartfit (pericia 2026-06-11): passar as linhas permite ao
      // formatador embutir os 5 primeiros candidatos COM documento no
      // _RESPOSTA (so a contagem nao responde "qual o CNPJ de X").
      titulos: linhas as unknown as Array<Record<string, unknown>>,
      destaque: {
        totalEncontrados: total,
        termo: input.termo,
        ...(total === 1
          ? {
              parceiroNome: linhas[0]?.nome ?? "",
              documento: linhas[0]?.documento ?? "",
            }
          : {}),
      },
    });
  },
};
