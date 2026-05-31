// mcp/tools/fiscal/mdfe-manifestos.ts
// Tool MCP: fiscal_mdfe_manifestos , manifestos de transporte (MDF-e) por período.
// Honesta data-driven: enquanto MDF-e não é operado (fato vazio) responde "não operado".
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryMdfeManifestos, fatoMdfeCount } from "@/lib/reports/queries/fiscal-complementar.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({
  periodoDe: z.string().optional().describe("Início, AAAA-MM-DD"),
  periodoAte: z.string().optional().describe("Fim, AAAA-MM-DD"),
  situacao: z.string().optional().describe("Situação do MDF-e (ex.: autorizado, cancelado, encerrado)"),
  limite: z.number().int().min(1).max(200).optional(),
});

const linhaSchema = z.object({
  odooId: z.number().int(),
  chave: z.string().nullable(),
  numero: z.string().nullable(),
  situacaoMdfe: z.string().nullable(),
  empresaCnpj: z.string().nullable(),
  dataEmissao: z.string().nullable(),
  municipioCarregamento: z.string().nullable(),
  municipioDescarregamento: z.string().nullable(),
  vrNf: z.number(),
});

const dados = z.object({
  linhas: z.array(linhaSchema),
  total: z.number().int(),
  truncado: z.boolean(),
  aviso: z.string(),
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

const NAO_OPERADO =
  "O MDF-e (manifesto de transporte) ainda não é operado no Odoo da Matrix (sem manifestos). " +
  "Esta consulta passa a responder quando os MDF-e forem emitidos no ERP.";

export const fiscalMdfeManifestos: ToolEntry<Input, Output> = {
  id: "fiscal_mdfe_manifestos",
  dominio: "fiscal",
  descricao:
    "Manifestos de transporte (MDF-e) no período: chave, número, situação, municípios de " +
    "carregamento/descarregamento e valor das notas. Filtre por período (periodoDe/periodoAte, " +
    "AAAA-MM-DD) e situação. Enquanto o MDF-e não for operado no Odoo, responde que não há manifesto.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const total = await fatoMdfeCount(ctx.prisma);
    const envelope = await withFreshness(ctx.prisma, ["fato_mdfe"], async () => {
      const r = await queryMdfeManifestos(ctx.prisma, input);
      return { linhas: r.linhas, total: r.total, truncado: r.truncado, aviso: "" };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const valorTotal = d.linhas.reduce((s, l) => s + l.vrNf, 0);
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA:
          total === 0
            ? NAO_OPERADO
            : d.total > 0
              ? `${d.total} MDF-e no período.`
              : "Sem MDF-e nesse recorte (período/situação).",
        _DESTAQUE: { totalMdfe: d.total, valorNotas: valorTotal },
        _agregado: { contagem: d.total, soma: valorTotal },
        _listaTruncada: d.truncado,
      },
    };
  },
};
