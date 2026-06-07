// mcp/tools/cadastros/servico-listar.ts
// Tool MCP: servico_listar
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryServicoListar } from "@/lib/reports/queries/servicos.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
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

export const cadastrosServicoListar: ToolEntry<Input, Output> = {
  id: "servico_listar",
  dominio: "cadastros",
  descricao:
    "Lista o catálogo de serviços fiscais ordenado por código. Útil para " +
    "panorama dos serviços cadastrados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_servico"], () =>
      queryServicoListar(ctx.prisma, { limit, offset }),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    // _RESPOSTA delegado ao formatador canonico (fmtServicoListar). `total` e
    // full-set (count na query, independente da paginacao).
    return enriquecerEnvelope(envelope, "servico_listar", {
      destaque: { total: d.total },
      agregado: { contagem: d.total },
      paginacao,
    });
  },
};
