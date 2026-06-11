// mcp/tools/cadastros/parceiros-por-uf.ts
// Tool MCP: cadastro_parceiros_por_uf
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryParceirosPorUf } from "@/lib/reports/queries/cadastros.js";
import { withFreshness } from "../../lib/freshness.js";
import { enriquecerEnvelope } from "../../lib/with-responder.js";

const inputSchema = z.object({
  apenasClientes: z.boolean().optional(),
});

const linhaSchema = z.object({
  uf: z.string().nullable(),
  quantidade: z.number().int(),
});

// Onda 1.C: envelope canonico
const dados = z.object({
  linhas: z.array(linhaSchema),
  // Contrato de lista (Fase B): UFs ordenadas por quantidade de parceiros desc.
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

export const cadastroParceirosPorUf: ToolEntry<Input, Output> = {
  id: "cadastro_parceiros_por_uf",
  dominio: "cadastros",
  descricao: "Distribuição geográfica de parceiros por UF (estado), ordenado por quantidade decrescente. Pode filtrar apenas clientes.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    const envelope = await withFreshness(
      ctx.prisma,
      ["fato_parceiro"],
      async () => {
        const result = await queryParceirosPorUf(ctx.prisma, input);
        // Contrato de lista (Fase B): query ordena por quantidade desc.
        return { linhas: result.linhas, ordenadoPor: "quantidade desc" };
      },
    );
    if (envelope.estado === "preparando") return envelope;
    const linhas = envelope.dados.linhas;
    const totalComUF = linhas
      .filter((l) => l.uf)
      .reduce((s, l) => s + (l.quantidade ?? 0), 0);
    const totalSemUF = linhas
      .filter((l) => !l.uf)
      .reduce((s, l) => s + (l.quantidade ?? 0), 0);
    return enriquecerEnvelope(envelope, "cadastro_parceiros_por_uf", {
      destaque: {
        totalComUF,
        totalSemUF,
        topUF: linhas[0]?.uf ?? "",
      },
    });
  },
};
