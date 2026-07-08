// mcp/tools/comercial/demanda-em-aberta.ts
// Tool MCP: comercial_demanda_em_aberta
// Demanda em aberta = pedidos de venda a cliente externo, aprovados, ainda sem NF
// ao consumidor final (bucket_demanda='ABERTA', materializado pelo builder). Devolve
// total (pedidos + R$), quebra por etapa e a lista das mais paradas (default: por
// tempo parado na etapa atual).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryDemandaEmAberta } from "@/lib/reports/queries/comercial.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  empresaId: z.number().int().optional(),
  limite: z.number().int().min(1).max(100).optional(),
  ordenacao: z.enum(["tempo_parado", "valor", "data_criacao"]).optional(),
});

const etapaSchema = z.object({
  etapaNome: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const linhaSchema = z.object({
  numero: z.string().nullable(),
  etapaNome: z.string().nullable(),
  empresaNome: z.string().nullable(),
  participanteNome: z.string().nullable(),
  valorProdutos: z.number(),
  diasParado: z.number().int().nullable(),
});

const dados = z.object({
  totalPedidos: z.number().int(),
  valorTotal: z.number(),
  porEtapa: z.array(etapaSchema),
  lista: z.array(linhaSchema),
  ordenadoPor: z.string(),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const comercialDemandaEmAberta: ToolEntry<Input, Output> = {
  id: "comercial_demanda_em_aberta",
  dominio: "comercial",
  descricao:
    "Demanda em aberta (pedidos de venda a cliente externo, aprovados, ainda sem " +
    "nota fiscal ao consumidor final). Devolve o total em pedidos e em R$, a quebra " +
    "por etapa (etapa: quantidade) e a lista das demandas mais paradas. Use para " +
    "'quanto temos de demanda em aberto', 'pedidos parados', 'carteira a faturar'. " +
    "Aceita filtro por empresa e ordenacao (tempo_parado padrao, valor, data_criacao).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido", "fato_pedido_historico"],
      () => queryDemandaEmAberta(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;

    const resposta =
      d.totalPedidos === 0
        ? "Nao ha demanda em aberto no momento (nenhum pedido de venda externa aprovado sem nota)."
        : `${d.totalPedidos} pedidos em demanda aberta, somando ${brl(d.valorTotal)}. ` +
          `Mostrando ${d.lista.length} (ordenado por ${d.ordenadoPor}).`;

    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: resposta,
        _listaTruncada: d.lista.length < d.totalPedidos,
        _DESTAQUE: { totalPedidos: d.totalPedidos, valorTotal: d.valorTotal },
        _agregado: { contagem: d.totalPedidos, valor: d.valorTotal },
      },
    };
  },
};
