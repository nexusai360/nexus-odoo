// mcp/tools/fiscal/notas-recebidas.ts
// Tool MCP: fiscal_notas_recebidas
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryNotasRecebidas } from "@/lib/reports/queries/fiscal.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { paginacaoInputShape, resolverPaginacao, montarPaginacaoMeta } from "../../lib/paginacao.js";
import { montarEscopoEmpresa, type EscopoEmpresa } from "./_escopo-empresa.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().trim().min(1).optional().describe("Empresa (id, CNPJ ou nome). Sem isso, considera o grupo todo."),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  numero: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  participanteNome: z.string().nullable(),
  vrNf: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalNotas: z.number().int(),
  valorTotal: z.number(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

function shape(d: Awaited<ReturnType<typeof queryNotasRecebidas>>, escopo: EscopoEmpresa) {
  return {
    linhas: d.linhas.map((l) => ({
      numero: l.numero,
      dataEmissao: l.dataEmissao ? l.dataEmissao.toISOString() : null,
      participanteNome: l.participanteNome,
      vrNf: l.vrNf,
    })),
    totalNotas: d.totalNotas,
    valorTotal: d.valorTotal,
    escopoEmpresa: escopo as unknown as Record<string, unknown>,
    aviso: "Notas de entrada (entradaSaida='0') representam compras e devoluções recebidas pela empresa. " + escopo.aviso,
  };
}

export const fiscalNotasRecebidas: ToolEntry<Input, Output> = {
  id: "fiscal_notas_recebidas",
  dominio: "fiscal",
  descricao: "Notas fiscais de entrada recebidas (compras/devoluções), opcionalmente filtradas por período.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () =>
      shape(
        await queryNotasRecebidas(ctx.prisma, {
          periodoDe: input.periodoDe,
          periodoAte: input.periodoAte,
          empresaId: escopo.empresaId,
          limit,
          offset,
        }),
        escopo.escopo,
      ),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // Alavanca 2b: paginacao via take/skip no SQL (substitui o cap em memoria).
    const paginacao = montarPaginacaoMeta(d.totalNotas, offset, limit, d.linhas.length);
    return enriquecerEnvelope(
      envelope,
      "fiscal_notas_recebidas",
      {
        destaque: {
          totalNotas: d.totalNotas,
          valorTotal: d.valorTotal,
          contagem: d.totalNotas,
          linhasExibidas: d.linhas.length,
        },
        agregado: { contagem: d.totalNotas, soma: d.valorTotal },
        paginacao,
      },
    );
  },
};
