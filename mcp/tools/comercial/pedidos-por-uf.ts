// mcp/tools/comercial/pedidos-por-uf.ts
// Tool MCP: comercial_pedidos_por_uf
//
// Resolve "Pedidos por estado / por UF" agrupando fato_pedido pela UF do
// cliente.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  status: z.enum(["aberto", "fechado", "todos"]).optional().describe("Default: todos"),
  limite: z.number().int().min(1).max(50).optional(),
});

const linhaSchema = z.object({
  uf: z.string().nullable(),
  quantidade: z.number().int(),
  valorTotal: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  totalGeral: z.number(),
  totalPedidos: z.number().int(),
  totalUfs: z.number().int(),
  _RESPOSTA: z.string().optional(),
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

interface Row {
  uf: string | null;
  quantidade: bigint;
  valor: string | number;
}

async function queryPedidosPorUf(prisma: PrismaClient, input: Input) {
  const limite = input.limite ?? 30;
  const status = input.status ?? "todos";

  const filtroStatus =
    status === "aberto" ? `AND pe.etapa_finaliza = false` :
    status === "fechado" ? `AND pe.etapa_finaliza = true` : ``;
  const filtroPer =
    input.periodoDe && input.periodoAte
      ? `AND pe.data_orcamento >= $1::timestamp AND pe.data_orcamento <= $2::timestamp`
      : ``;
  const params: unknown[] = [];
  if (input.periodoDe && input.periodoAte) {
    params.push(`${input.periodoDe}T00:00:00`, `${input.periodoAte}T23:59:59`);
  }

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COALESCE(p.uf, '(sem UF)') AS uf,
            COUNT(*)::bigint AS quantidade,
            COALESCE(SUM(pe.vr_produtos), 0)::text AS valor
     FROM fato_pedido pe
     LEFT JOIN fato_parceiro p ON p.odoo_id = pe.participante_id
     WHERE 1=1 ${filtroStatus} ${filtroPer}
     GROUP BY p.uf
     ORDER BY SUM(pe.vr_produtos) DESC NULLS LAST
     LIMIT ${limite}`,
    ...params,
  );

  const linhas = rows.map((r) => ({
    uf: r.uf === "(sem UF)" ? null : r.uf,
    quantidade: Number(r.quantidade),
    valorTotal: Number(r.valor),
  }));
  // KPIs FULL-SET: agregados sobre TODO o recorte filtrado, independentes do
  // LIMIT da pagina (a soma de `linhas` so cobriria a pagina e subcontaria
  // quando limite < numero de UFs , classe do bug d987060). COUNT(DISTINCT
  // p.uf) ignora NULL, batendo com a contagem de UFs reais.
  const totalRows = await prisma.$queryRawUnsafe<
    Array<{ pedidos: bigint; geral: string | number; ufs: bigint }>
  >(
    `SELECT COUNT(*)::bigint AS pedidos,
            COALESCE(SUM(pe.vr_produtos), 0)::text AS geral,
            COUNT(DISTINCT p.uf)::bigint AS ufs
     FROM fato_pedido pe
     LEFT JOIN fato_parceiro p ON p.odoo_id = pe.participante_id
     WHERE 1=1 ${filtroStatus} ${filtroPer}`,
    ...params,
  );
  const totalGeral = Number(totalRows[0]?.geral ?? 0);
  const totalPedidos = Number(totalRows[0]?.pedidos ?? 0);
  const totalUfs = Number(totalRows[0]?.ufs ?? 0);
  return { linhas, totalGeral, totalPedidos, totalUfs };
}

export const comercialPedidosPorUf: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_por_uf",
  dominio: "comercial",
  descricao:
    "Pedidos agrupados por UF do cliente. Use para 'pedidos por estado', " +
    "'pedidos por UF', 'qual estado mais compra'. Aceita status (aberto/fechado/todos) " +
    "e periodo. Default: todos os pedidos cadastrados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido", "fato_parceiro"],
      () => queryPedidosPorUf(ctx.prisma, input),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // T-40: top REAL = primeira linha com uf preenchida
    const topReal = d.linhas.find((l) => l.uf !== null) ?? d.linhas[0];
    const semUfLinha = d.linhas.find((l) => l.uf === null);
    const semUfNota = semUfLinha
      ? ` + ${semUfLinha.quantidade} sem UF`
      : "";
    const fmt = (n: number) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: topReal
          ? `Pedidos por UF: ${d.totalPedidos} pedidos (${fmt(d.totalGeral)}) em ${d.totalUfs} UFs${semUfNota}. Top: ${topReal.uf ?? "(sem UF)"} com ${topReal.quantidade} pedidos (${fmt(topReal.valorTotal)}).`
          : "Nao ha pedidos no periodo.",
        _DESTAQUE: {
          totalPedidos: d.totalPedidos,
          totalGeral: d.totalGeral,
          totalUfs: d.totalUfs,
          topUf: topReal?.uf ?? "",
          quantidadeTopUf: topReal?.quantidade ?? 0,
          valorTopUf: topReal?.valorTotal ?? 0,
        },
        _agregado: { contagem: d.totalPedidos, soma: d.totalGeral },
      },
    };
  },
};
