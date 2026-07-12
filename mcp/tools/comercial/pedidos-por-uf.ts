// mcp/tools/comercial/pedidos-por-uf.ts
// Tool MCP: comercial_pedidos_por_uf
//
// Resolve "Pedidos por estado / por UF" agrupando fato_pedido pela UF do
// cliente.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import { resolverPeriodoCorte, type PeriodoCorte } from "../../lib/periodo-corte.js";
import type { PrismaClient } from "@/generated/prisma/client.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  status: z.enum(["aberto", "fechado", "todos"]).optional().describe("Default: todos"),
  // B5 Cobertura Cliente: o modulo de pedidos mistura venda, producao,
  // inventario, romaneio, transferencia e compra. O filtro usa o SUFIXO
  // "(venda)" do nome da operacao (nunca o prefixo , "Venda JDS Matriz" e
  // transferencia).
  operacao: z.enum(["venda", "todas"]).optional()
    .describe("venda = apenas pedidos de operacao de venda. Default: todas."),
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
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
  // Contrato de lista (Fase B): UFs ordenadas por valor total desc na query SQL.
  ordenadoPor: z.string().optional(),
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

async function queryPedidosPorUf(prisma: PrismaClient, input: Input, per: PeriodoCorte) {
  const limite = input.limite ?? 30;
  const status = input.status ?? "todos";

  const filtroStatus =
    status === "aberto" ? `AND pe.etapa_finaliza = false` :
    status === "fechado" ? `AND pe.etapa_finaliza = true` : ``;
  // Base: só pedidos de VENDA (exclui transferência/remessa/anomalia intragrupo),
  // via a coluna materializada categoria_operacao. Ver perícia 08 (P0.2).
  const filtroVenda = `AND pe.categoria_operacao = 'venda'`;
  // B5: sufixo "(venda)" no fim do nome da operacao.
  const filtroOperacao =
    input.operacao === "venda" ? `AND pe.operacao_nome ~* '\\(venda\\)\\s*$'` : ``;
  // Pedido e documento com data: o recorte de data e SEMPRE emitido. Antes, sem o par
  // completo, o filtro sumia do SQL e o agrupamento por UF (e os KPIs full-set) somavam o
  // historico inteiro. `per` ja chega grampeado a data de inicio das analises, e as datas
  // entram como PARAMETRO (nunca interpoladas).
  const filtroPer = `AND pe.data_orcamento >= $1::timestamp AND pe.data_orcamento <= $2::timestamp`;
  const params: unknown[] = [
    `${per.periodoDe}T00:00:00`,
    `${per.periodoAte}T23:59:59`,
  ];

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COALESCE(p.uf, '(sem UF)') AS uf,
            COUNT(*)::bigint AS quantidade,
            COALESCE(SUM(pe.vr_produtos), 0)::text AS valor
     FROM fato_pedido pe
     LEFT JOIN fato_parceiro p ON p.odoo_id = pe.participante_id
     WHERE 1=1 ${filtroVenda} ${filtroStatus} ${filtroOperacao} ${filtroPer}
     GROUP BY p.uf
     ORDER BY SUM(pe.vr_produtos) DESC NULLS LAST, p.uf ASC
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
     WHERE 1=1 ${filtroVenda} ${filtroStatus} ${filtroOperacao} ${filtroPer}`,
    ...params,
  );
  const totalGeral = Number(totalRows[0]?.geral ?? 0);
  const totalPedidos = Number(totalRows[0]?.pedidos ?? 0);
  const totalUfs = Number(totalRows[0]?.ufs ?? 0);
  // Contrato de lista (Fase B): SQL ordena por SUM(vr_produtos) DESC, uf ASC.
  return {
    linhas,
    totalGeral,
    totalPedidos,
    totalUfs,
    ordenadoPor: "valor desc",
    periodoCoberto: per.label,
    ...(per.aviso ? { aviso: per.aviso } : {}),
  };
}

export const comercialPedidosPorUf: ToolEntry<Input, Output> = {
  id: "comercial_pedidos_por_uf",
  dominio: "comercial",
  descricao:
    "Pedidos agrupados por UF do cliente. Use para 'pedidos por estado', " +
    "'pedidos por UF', 'qual estado mais compra', 'quantidade de pedidos de operacao " +
    "de venda por UF' (passe operacao: 'venda' , o modulo mistura venda, producao, " +
    "inventario, romaneio e transferencia). Aceita status (aberto/fechado/todos) " +
    "e periodo. Default: todos os pedidos cadastrados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const per = resolverPeriodoCorte(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_pedido", "fato_parceiro"],
      () => queryPedidosPorUf(ctx.prisma, input, per),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    // T-40: top REAL = primeira linha com uf preenchida
    const topReal = d.linhas.find((l) => l.uf !== null) ?? d.linhas[0];
    const semUfLinha = d.linhas.find((l) => l.uf === null);
    const pedidosSemUf = semUfLinha?.quantidade ?? 0;
    const pedidosComUf = d.totalPedidos - pedidosSemUf;
    // Frase sem ambiguidade: o total GERAL inclui os sem-UF; dizer a quebra
    // explicita evita o "121 em 15 UFs + 21 sem UF" que soa como 142.
    const semUfNota = pedidosSemUf > 0
      ? `: ${pedidosComUf} com UF informada (${d.totalUfs} estados) e ${pedidosSemUf} sem UF`
      : ` em ${d.totalUfs} estados`;
    const fmt = (n: number) =>
      n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          (topReal
            ? `${d.totalPedidos} pedidos no periodo ${per.label} (${fmt(d.totalGeral)})${semUfNota}. Estado que mais compra: ${topReal.uf ?? "(sem UF)"}, ${topReal.quantidade} pedidos (${fmt(topReal.valorTotal)}).`
            : `Nao ha pedidos no periodo ${per.label}.`) + (per.aviso ? ` ${per.aviso}` : ""),
        _DESTAQUE: {
          totalPedidos: d.totalPedidos,
          periodoCoberto: per.label,
          pedidosComUf,
          pedidosSemUf,
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
