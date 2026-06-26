// mcp/tools/estoque/comparativo.ts
// Tool MCP: estoque_comparativo , compara o valor/quantidade do estoque entre
// DUAS datas, com PRECISÃO (somas feitas no SQL por data_ref, agente nunca soma)
// e ENTRADA FLEXÍVEL (datas explícitas OU período relativo resolvido pela tool).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryEstoqueComparativo } from "@/lib/reports/queries/estoque.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  // Datas explícitas (YYYY-MM-DD). Têm prioridade sobre `periodo`.
  dataInicial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Atalho relativo (a tool resolve as datas de forma determinística). Default:
  // mes_anterior (hoje x fim do mês passado).
  periodo: z.enum(["ontem", "semana_anterior", "mes_anterior", "ano_anterior"]).optional(),
});

const ponto = z.object({
  dataAlvo: z.string(),
  dataUsada: z.string().nullable(),
  fonte: z.enum(["snapshot", "reconstrucao"]),
  valor: z.number().nullable(),
  quantidade: z.number(),
  aviso: z.string().optional(),
});

const dados = z.object({
  inicial: ponto,
  final: ponto,
  deltaValor: z.number().nullable(),
  deltaValorPct: z.number().nullable(),
  deltaQuantidade: z.number(),
  comparavelEmValor: z.boolean(),
  primeiraFoto: z.string().nullable(),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
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

/** Data de hoje em BRT (UTC-3), como YYYY-MM-DD. */
function hojeBRT(): Date {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
}
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolve dataInicial/dataFinal a partir de datas explícitas ou período. */
function resolverDatas(input: Input): { dataInicial: string; dataFinal: string; rotulo: string } {
  const hoje = hojeBRT();
  if (input.dataInicial && input.dataFinal) {
    return { dataInicial: input.dataInicial, dataFinal: input.dataFinal, rotulo: "intervalo informado" };
  }
  const dataFinal = input.dataFinal ?? iso(hoje);
  const fim = input.dataFinal ? new Date(`${input.dataFinal}T00:00:00.000Z`) : hoje;
  const periodo = input.periodo ?? "mes_anterior";
  let inicio: Date;
  let rotulo: string;
  if (periodo === "ontem") {
    inicio = new Date(fim.getTime() - 24 * 60 * 60 * 1000);
    rotulo = "vs. ontem";
  } else if (periodo === "semana_anterior") {
    inicio = new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
    rotulo = "vs. 7 dias atrás";
  } else if (periodo === "ano_anterior") {
    inicio = new Date(Date.UTC(fim.getUTCFullYear() - 1, fim.getUTCMonth(), fim.getUTCDate()));
    rotulo = "vs. mesmo dia do ano passado";
  } else {
    // mes_anterior: último dia do mês anterior ao `fim`.
    inicio = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 0));
    rotulo = "vs. fim do mês passado";
  }
  return { dataInicial: input.dataInicial ?? iso(inicio), dataFinal, rotulo };
}

export const estoqueComparativo: ToolEntry<Input, Output> = {
  id: "estoque_comparativo",
  dominio: "estoque",
  descricao:
    "Compara o estoque (valor e quantidade) entre DUAS datas , ex.: hoje vs fim do mês passado, vs ontem, vs 7 dias atrás, vs ano passado, ou um intervalo de datas que você informar. Use para 'como o estoque variou', 'compare o estoque atual com o mês/semana/ano passado', 'evolução do estoque'. A soma é feita por data; o valor exato vem das fotos diárias (a partir do início do histórico) e, para datas anteriores, a quantidade é reconstruída (exata) sem inventar valor. Aceita dataInicial+dataFinal (YYYY-MM-DD) ou periodo (ontem|semana_anterior|mes_anterior|ano_anterior).",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { dataInicial, dataFinal, rotulo } = resolverDatas(input);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_estoque_saldo", "fato_estoque_saldo_snapshot", "fato_estoque_movimento"],
      async () => {
        const r = await queryEstoqueComparativo(ctx.prisma, { dataInicial, dataFinal });
        const avisos: string[] = [`Comparação: ${dataFinal} ${rotulo} (${dataInicial}).`];
        if (r.inicial.aviso) avisos.push(r.inicial.aviso);
        if (r.final.aviso) avisos.push(r.final.aviso);
        if (!r.comparavelEmValor) {
          avisos.push(
            r.primeiraFoto
              ? `O VALOR exato comparável existe a partir de ${r.primeiraFoto} (início das fotos diárias). Para datas anteriores, comparo a QUANTIDADE (exata) e mostro o valor atual.`
              : "Ainda não há fotos diárias suficientes para comparar VALOR; comparo a QUANTIDADE (exata).",
          );
        }
        return { ...r, aviso: avisos.join(" ") };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return enriquecerEnvelope(envelope, "estoque_comparativo", {
      destaque: {
        dataInicial: d.inicial.dataUsada ?? d.inicial.dataAlvo,
        dataFinal: d.final.dataUsada ?? d.final.dataAlvo,
        valorInicial: d.inicial.valor ?? 0,
        valorFinal: d.final.valor ?? 0,
        deltaValor: d.deltaValor ?? 0,
        deltaQuantidade: d.deltaQuantidade,
        comparavelEmValor: d.comparavelEmValor ? 1 : 0,
        primeiraFoto: d.primeiraFoto ?? "",
      },
    });
  },
};
