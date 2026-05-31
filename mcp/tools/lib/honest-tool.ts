// mcp/tools/lib/honest-tool.ts
// Factory de tools honestas data-driven (padrão Balde B): enquanto o fato está
// vazio (count==0), a tool responde uma mensagem de "não operado" e auto-ativa
// quando houver dado. Usada por B3+ para reduzir boilerplate dos schemas.
import { z, type ZodRawShape } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { withFreshness } from "../../lib/freshness.js";
import type { PrismaClient, ReportDomain } from "@/generated/prisma/client";

const fonteStatus = z.object({ status: z.string(), ultimaSyncEm: z.string().nullable() });
const dadosSchema = z.object({
  linhas: z.array(z.unknown()),
  total: z.number().int(),
  truncado: z.boolean(),
  _RESPOSTA: z.string().optional(),
  _listaTruncada: z.boolean().optional(),
  _agregado: z.record(z.string(), z.number().optional()).optional(),
});
export const honestOutputSchema = z.union([
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados: dadosSchema,
    atualizadoEm: z.string(),
    atualizadoHa: z.string(),
    fonteStatus,
  }),
]);
type Output = z.infer<typeof honestOutputSchema>;

interface QResult { linhas: unknown[]; total: number; truncado: boolean }

export function makeHonestTool<I extends Record<string, unknown>>(opts: {
  id: string;
  /** Domínio RBAC. Omitir junto com sempreVisivel para tools sem domínio. */
  dominio?: ReportDomain;
  /** Visível a todas as roles (uso: domínios fora do enum RBAC, ex. produção). */
  sempreVisivel?: boolean;
  descricao: string;
  /** Nome do fato (chave em FATO_FONTE) para o envelope de freshness. */
  fato: string;
  /** Mensagem quando o fato está totalmente vazio (módulo não operado). */
  naoOperado: string;
  inputShape: ZodRawShape;
  count: (p: PrismaClient) => Promise<number>;
  query: (p: PrismaClient, input: I) => Promise<QResult>;
  resumoOk: (total: number) => string;
}): ToolEntry<I, Output> {
  const zObject = z.object(opts.inputShape);
  return ({
    id: opts.id,
    ...(opts.dominio ? { dominio: opts.dominio } : {}),
    ...(opts.sempreVisivel ? { sempreVisivel: true } : {}),
    descricao: opts.descricao,
    inputSchemaShape: opts.inputShape,
    inputSchema: zObject as unknown as z.ZodType<I>,
    outputSchema: honestOutputSchema,
    handler: async (input: I, ctx: { prisma: PrismaClient }) => {
      const total = await opts.count(ctx.prisma);
      const envelope = await withFreshness(ctx.prisma, [opts.fato], async () => {
        const r = await opts.query(ctx.prisma, input);
        return { linhas: r.linhas, total: r.total, truncado: r.truncado };
      });
      if (envelope.estado === "preparando") return envelope;
      const d = envelope.dados;
      return {
        ...envelope,
        dados: {
          ...d,
          _RESPOSTA:
            total === 0
              ? opts.naoOperado
              : d.total > 0
                ? opts.resumoOk(d.total)
                : "Sem registros nesse recorte.",
          _agregado: { contagem: d.total },
          _listaTruncada: d.truncado,
        },
      };
    },
  }) as unknown as ToolEntry<I, Output>;
}
