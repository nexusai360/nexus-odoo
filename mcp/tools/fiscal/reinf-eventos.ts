// mcp/tools/fiscal/reinf-eventos.ts
// Tool MCP: fiscal_reinf_eventos , eventos REINF (obrigação acessória) por período.
// Honesta data-driven: enquanto REINF não é operado (fato vazio) responde "não operado".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryReinfEventos, fatoReinfCount } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";
import {
  paginacaoInputShape,
  resolverPaginacao,
  montarPaginacaoMeta,
} from "../../lib/paginacao.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional().describe("Início, AAAA-MM-DD"),
  periodoAte: z.string().optional().describe("Fim, AAAA-MM-DD"),
  tipo: z.string().optional().describe("Tipo do evento REINF (ex.: R-4020, R-2010)"),
  situacao: z.string().optional().describe("Situação (ex.: enviado, rejeitado, a_enviar)"),
  ...paginacaoInputShape,
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  chave: z.string().nullable(),
  tipo: z.string().nullable(),
  situacao: z.string().nullable(),
  protocoloTransmissao: z.string().nullable(),
  empresaCnpjRaiz: z.string().nullable(),
  dataEvento: z.string().nullable(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  truncado: z.boolean(),
  aviso: z.string(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  // Contrato de lista (Fase B): a query ordena por dataEvento desc com
  // desempate por odooId; aqui apenas declaramos ao LLM.
  ordenadoPor: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _PAGINACAO: z.any().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
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

const NAO_OPERADO =
  "O REINF (eventos de obrigação acessória) ainda não é operado no Odoo da Matrix (sem eventos). " +
  "Esta consulta passa a responder quando os eventos REINF forem gerados no ERP.";

export const fiscalReinfEventos: ToolEntry<Input, Output> = {
  id: "fiscal_reinf_eventos",
  dominio: "fiscal",
  descricao:
    "Eventos REINF (obrigação acessória da Receita) no período: tipo (R-4020, R-2010...), " +
    "situação, protocolo de transmissão e datas. Filtre por período (periodoDe/periodoAte, " +
    "AAAA-MM-DD), tipo e situação. Enquanto o REINF não for operado no Odoo, responde que não há evento.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const { limit, offset } = resolverPaginacao(input);
    // fatoReinfCount é proposital SEM filtro: detecta "módulo não operado".
    const total = await fatoReinfCount(ctx.prisma);
    // Evento REINF é transmissão datada (histórico): início grampeado ao corte e piso do
    // corte quando o período não vem.
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_reinf_evento"], async () => {
      const r = await queryReinfEventos(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        tipo: input.tipo,
        situacao: input.situacao,
        limit,
        offset,
      });
      return {
        linhas: r.linhas,
        total: r.total,
        truncado: r.truncado,
        periodoCoberto: per.label,
        aviso: `Período coberto: ${per.label}.${per.aviso ? ` ${per.aviso}` : ""}`,
        ordenadoPor: "data desc",
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const paginacao = montarPaginacaoMeta(d.total, offset, limit, d.linhas.length);
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          total === 0
            ? NAO_OPERADO
            : (d.total > 0
                ? `${d.total} eventos REINF no período ${per.label}.`
                : `Sem eventos REINF nesse recorte (período ${per.label}/tipo/situação).`) +
              (per.aviso ? ` ${per.aviso}` : ""),
        _DESTAQUE: { totalEventos: d.total, periodoCoberto: per.label },
        _agregado: { contagem: d.total },
        _listaTruncada: paginacao.temMais,
        _PAGINACAO: paginacao,
      },
    };
  },
};
