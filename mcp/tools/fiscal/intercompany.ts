// mcp/tools/fiscal/intercompany.ts
// Tool MCP: fiscal_intercompany , matriz de vendas entre empresas do grupo
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { matrizIntercompany } from "@/lib/metrics/fiscal/index.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";
import { montarEscopoEmpresa } from "./_escopo-empresa.js";
import { resolverPeriodoFiscal } from "./_periodo-padrao.js";

const inputSchema = z.object({
  periodoDe: z.string().optional(),
  periodoAte: z.string().optional(),
  empresaRef: z.string().optional(),
});

const linha = z.object({
  vendedorId: z.number().int().nullable(),
  vendedorNome: z.string(),
  compradorChave: z.string(),
  compradorNome: z.string(),
  valor: z.number(),
  totalNotas: z.number().int(),
});

const dados = z.object({
  linhas: z.array(linha),
  total: z.number(),
  totalPares: z.number().int(),
  escopoEmpresa: z.record(z.string(), z.unknown()),
  aviso: z.string(),
  _RESPOSTA: z.string().optional(),
  _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });

const outputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({ estado: z.enum(["ok", "vazio"]), dados, atualizadoEm: z.string(), atualizadoHa: z.string(), fonteStatus }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const fiscalIntercompany: ToolEntry<Input, Output> = {
  id: "fiscal_intercompany",
  dominio: "fiscal",
  descricao:
    "Matriz de vendas entre empresas do mesmo grupo (intercompany): quem vendeu para quem dentro do grupo, com valor e contagem de notas. Aceita empresa e periodo.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const escopo = await montarEscopoEmpresa(ctx.prisma, input.empresaRef);
    const per = resolverPeriodoFiscal(input.periodoDe, input.periodoAte);
    const envelope = await withFreshness(ctx.prisma, ["fato_nota_fiscal"], async () => {
      const r = await matrizIntercompany(ctx.prisma, {
        periodoDe: per.periodoDe,
        periodoAte: per.periodoAte,
        empresaId: escopo.empresaId,
      });
      return {
        linhas: r.linhas,
        total: r.total,
        totalPares: r.totalPares,
        escopoEmpresa: escopo.escopo as unknown as Record<string, unknown>,
        aviso:
          escopo.escopo.aviso +
          ` Periodo: ${per.label}.` +
          (per.assumido ? " (Nenhum periodo foi informado, entao considerei o ano corrente.)" : ""),
      };
    });
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    const top = d.linhas.slice(0, 10).map((l) => ({ vendedor: l.vendedorNome, comprador: l.compradorNome, valor: l.valor }));
    return enriquecerEnvelope(envelope, "fiscal_intercompany", {
      destaque: { total: d.total, totalPares: d.totalPares, topLinhasJson: JSON.stringify(top) },
      agregado: { soma: d.total, contagem: d.totalPares },
    });
  },
};
