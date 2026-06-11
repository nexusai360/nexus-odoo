// mcp/tools/fiscal/apuracao-fiscal.ts
// Tool MCP: fiscal_apuracao
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryApuracaoFiscal } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  tipo: z.enum(["ICMS-IPI", "PIS-COFINS"]).optional(),
  limite: z.number().int().min(1).max(200).optional(),
});

const linha = z.object({
  odooId: z.number().int(),
  empresaNome: z.string().nullable(),
  dataInicial: z.string().nullable(),
  dataFinal: z.string().nullable(),
  tipo: z.string().nullable(),
  entregue: z.boolean(),
  regimeTributario: z.string().nullable(),
  vrIcmsARecolher: z.number(),
  vrIcmsSaldoCredor: z.number(),
  vrIpiARecolher: z.number(),
  vrPisARecolher: z.number(),
  vrCofinsARecolher: z.number(),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  linhas: z.array(linha),
  total: z.number().int(),
  truncado: z.boolean(),
  // Contrato de lista (Fase B): a query ja ordena por dataInicial desc com
  // desempate por odooId; aqui apenas declaramos ao LLM.
  ordenadoPor: z.string().optional(),
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
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalApuracao: ToolEntry<Input, Output> = {
  id: "fiscal_apuracao",
  dominio: "fiscal",
  descricao:
    "Apurações fiscais da empresa (ICMS-IPI e PIS-COFINS): período, valores a " +
    "recolher de ICMS, IPI, PIS e COFINS, saldo credor de ICMS e se a apuração " +
    "foi entregue. Filtra por tipo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_apuracao"], async () => {
      const r = await queryApuracaoFiscal(ctx.prisma, input);
      // Contrato de lista (Fase B): declara a ordenacao real da query.
      return { ...r, ordenadoPor: "data desc" };
    });
    if (envelope.estado === "preparando") return envelope;
    const linhas = envelope.dados.linhas;
    // T-34 (Ronda 2): destaque com TODOS os tributos somados. Antes so ICMS
    // estava no _DESTAQUE, fazendo "PIS/COFINS do mes" virar recusa porque
    // _RESPOSTA ficava "a recolher R$ 0,00". Agora soma cada tributo entre
    // todas as linhas e o formatador escolhe o que mostrar.
    const totIcms = linhas.reduce((s, l) => s + Number(l.vrIcmsARecolher ?? 0), 0);
    const totIpi = linhas.reduce((s, l) => s + Number(l.vrIpiARecolher ?? 0), 0);
    const totPis = linhas.reduce((s, l) => s + Number(l.vrPisARecolher ?? 0), 0);
    const totCofins = linhas.reduce((s, l) => s + Number(l.vrCofinsARecolher ?? 0), 0);
    const totSaldoCredor = linhas.reduce((s, l) => s + Number(l.vrIcmsSaldoCredor ?? 0), 0);
    const linha0 = linhas[0];
    return enriquecerEnvelope(envelope, "fiscal_apuracao", {
      destaque: {
        tipo: String(input.tipo ?? linha0?.tipo ?? "tributo"),
        periodo: String(linha0?.dataFinal ?? ""),
        // Mantem campos legados para nao quebrar formatadores existentes.
        aRecolher: totIcms,
        saldoCredor: totSaldoCredor,
        // Novos campos com tributos discriminados.
        icmsARecolher: totIcms,
        ipiARecolher: totIpi,
        pisARecolher: totPis,
        cofinsARecolher: totCofins,
        pisCofinsARecolher: totPis + totCofins,
        totalGeralARecolher: totIcms + totIpi + totPis + totCofins,
        totalApuracoes: linhas.length,
      },
      listaTruncada: envelope.dados.truncado,
    });
  },
};
