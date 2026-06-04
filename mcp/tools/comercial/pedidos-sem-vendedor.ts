// mcp/tools/comercial/pedidos-sem-vendedor.ts
// Tool MCP: comercial_pedidos_sem_vendedor (Onda 3)
//
// Lista pedidos sem vendedor atribuido (vendedor_id IS NULL).
// Resolve R11/R13/R15/R16 "Pedidos sem vendedor atribuido" onde o agente
// registrava lacuna por nao ter tool com esse filtro.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  numero: z.string().nullable(),
  participanteNome: z.string().nullable(),
  etapaNome: z.string().nullable(),
  dataOrcamento: z.string().nullable(),
  valor: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalPedidos: z.number().int(),
  valorTotal: z.number(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
  _PAGINACAO: z.any().optional(),
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

export const comercialPedidosSemVendedor: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_sem_vendedor",
  dominio: "comercial",
  descricao:
    "Lista pedidos sem vendedor atribuido (vendedor_id IS NULL). " +
    "Aceita filtro de periodo. Use para 'pedidos sem vendedor', " +
    "'pedidos órfãos', 'pedidos sem responsável'.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido"],
      async () => {
        const where: Record<string, unknown> = { vendedorId: null };
        if (input.periodoDe || input.periodoAte) {
          const dataOrcamento: Record<string, Date> = {};
          if (input.periodoDe) dataOrcamento.gte = new Date(input.periodoDe);
          if (input.periodoAte) dataOrcamento.lte = new Date(input.periodoAte);
          where.dataOrcamento = dataOrcamento;
        }
        // Alavanca 2b: paginacao via take/skip + orderBy estavel (dataOrcamento
        // desc + desempate por odooId). valorTotal e a soma de TODO o recorte
        // (aggregate), nao so da pagina.
        const [rows, total, somaAgg] = await Promise.all([
          ctx.prisma.fatoPedido.findMany({
            where,
            take: limit,
            skip: offset,
            orderBy: [{ dataOrcamento: "desc" }, { odooId: "asc" }],
            select: {
              odooId: true,
              numero: true,
              participanteNome: true,
              etapaNome: true,
              dataOrcamento: true,
              vrNf: true,
            },
          }),
          ctx.prisma.fatoPedido.count({ where }),
          ctx.prisma.fatoPedido.aggregate({ where, _sum: { vrNf: true } }),
        ]);
        const linhas = rows.map((r) => ({
          odooId: r.odooId,
          numero: r.numero,
          participanteNome: r.participanteNome,
          etapaNome: r.etapaNome,
          dataOrcamento: r.dataOrcamento ? r.dataOrcamento.toISOString() : null,
          valor: Number(r.vrNf ?? 0),
        }));
        const valorTotal = Number(somaAgg._sum.vrNf ?? 0);
        return { linhas, totalPedidos: total, valorTotal };
      },
      (d) => d.totalPedidos === 0,
    );
    if (envelope.estado === "preparando") return envelope;
    const paginacao = montarPaginacaoMeta(
      envelope.dados.totalPedidos,
      offset,
      limit,
      envelope.dados.linhas.length,
    );
    return enriquecerEnvelope(envelope, "comercial_pedidos_sem_vendedor", {
      destaque: {
        totalPedidos: envelope.dados.totalPedidos,
        valorTotal: envelope.dados.valorTotal,
      },
      agregado: {
        soma: envelope.dados.valorTotal,
        contagem: envelope.dados.totalPedidos,
      },
      paginacao,
    });
  },
};
