// mcp/tools/contabil/saldo-conta.ts
// Tool MCP: contabil_saldo_conta
//
// Saldo (Σdébito − Σcrédito) por conta no período , balancete. Lê de
// fato_contabil_lancamento_item. Enquanto a contabilidade não é operada no
// Odoo (0 lançamentos), responde honestamente "não operado" via _RESPOSTA
// (auto-ativa quando os lançamentos chegarem , SPEC §2.3).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import {
  querySaldoConta,
  fatoContabilItemCount,
  mensagemContabilGestaoVazia,
} from "@/lib/reports/queries/contabil.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { resolverPeriodoCorte } from "../../lib/periodo-corte.js";

const inputSchema = z.object({
  termo: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  limite: z.number().int().positive().optional(),
});

const linhaSchema = z.object({
  contaId: z.number().int().nullable(),
  contaCodigo: z.string().nullable(),
  contaNome: z.string().nullable(),
  contaNatureza: z.string().nullable(),
  debito: z.number(),
  credito: z.number(),
  saldo: z.number(),
});

const dados = z.object({
  // Contrato de lista (Fase B): ordenacao declarada.
  ordenadoPor: z.string().optional(),
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  /** Periodo EFETIVAMENTE coberto (ja grampeado a data de inicio das analises). */
  periodoCoberto: z.string().optional(),
  aviso: z.string().optional(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
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

export const contabilSaldoConta: ToolEntry<Input, Output> = {
  id: "contabil_saldo_conta",
  dominio: "contabil",
  descricao:
    "Saldo contábil por conta no período (balancete): para cada conta, soma de débitos, soma de créditos e saldo (débito menos crédito). " +
    "Filtre por termo (código/nome da conta) e por período (dataInicio/dataFim, formato AAAA-MM-DD). " +
    "NOTA: a contabilidade ainda não é operada no Odoo da Matrix (sem lançamentos); responde automaticamente quando os lançamentos forem lançados.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    // Lancamento contabil e HISTORICO (dataLancamento). O helper de periodo da query so monta
    // o range quando recebe data, entao sem periodo a tool varria todo o razao. Aqui o periodo
    // e SEMPRE resolvido, com o inicio grampeado a data de inicio das analises.
    // O "saldo" aqui e a SOMA dos lancamentos do recorte (nao uma foto), entao o piso vale.
    const per = resolverPeriodoCorte(input.dataInicio, input.dataFim);
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_contabil_lancamento_item"],
      async () => {
        const result = await querySaldoConta(ctx.prisma, {
          ...input,
          dataInicio: per.periodoDe,
          dataFim: per.periodoAte,
        });
        return {
          linhas: result.linhas,
          total: result.total,
          ordenadoPor: "codigo da conta asc",
          periodoCoberto: per.label,
          ...(per.aviso ? { aviso: per.aviso } : {}),
        };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const out = enriquecerEnvelope(envelope, "contabil_saldo_conta", {
      periodo: per,
      destaque: { contagem: envelope.dados.total, periodoCoberto: per.label },
      listaTruncada: false,
    });
    if (out.estado === "vazio") {
      const n = await fatoContabilItemCount(ctx.prisma);
      out.dados._RESPOSTA = mensagemContabilGestaoVazia(n);
    }
    return out;
  },
};
