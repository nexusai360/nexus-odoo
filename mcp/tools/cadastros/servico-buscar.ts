// mcp/tools/cadastros/servico-buscar.ts
// Tool MCP: servico_buscar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryServicoBuscar } from "@/lib/reports/queries/servicos.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  termo: z.string().min(1).max(120),
  ...paginacaoInputShape,
});

const linha = z.object({
  odooId: z.number().int(),
  codigo: z.string(),
  codigoFormatado: z.string().nullable(),
  descricao: z.string(),
  codigoTributacao: z.string().nullable(),
  alInssRetido: z.number(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
  // Contrato de lista (Fase B): servicos ordenados por codigo asc na query.
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

export const cadastrosServicoBuscar: ToolEntry<Input, Output> = {
  id: "servico_buscar",
  dominio: "cadastros",
  descricao:
    "Busca serviços no catálogo fiscal por termo (código ou descrição). " +
    "Retorna código, descrição, código de tributação e alíquota de INSS retido.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_servico"], () =>
      queryServicoBuscar(ctx.prisma, { termo: input.termo, limit, offset }),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    // _RESPOSTA delegado ao formatador canonico (fmtServicoBuscar). `total` e
    // full-set (count(where) na query, independente da paginacao).
    return enriquecerEnvelope(envelope, "servico_buscar", {
      destaque: { total: d.total, termo: input.termo },
      agregado: { contagem: d.total },
      paginacao,
    });
  },
};
