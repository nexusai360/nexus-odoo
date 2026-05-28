// mcp/tools/comercial/contar-regras-preco.ts
// Tool MCP: preco_contar_regras
// dados só tem escalares , sem array; cai no ramo "ok" do withFreshness.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { queryContarRegrasPreco } from "@/lib/reports/queries/precos.js";
import { withFreshness } from "../../lib/freshness.js";

const inputSchema = z.object({});

const dados = z.object({
  total: z.number().int(),
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
    fonteStatus,
  }),
]);

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const comercialContarRegrasPreco: ToolEntry<Input, Output> = {
  id: "preco_contar_regras",
  dominio: "comercial",
  descricao:
    "Contagem total de regras de preço cadastradas (todas as tabelas). Use " +
    "para perguntas de quantidade absoluta ('quantas regras de preço " +
    "existem'): devolve só o número, sem amostra.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, ctx) => {
    const envelope = await withFreshness(ctx.prisma, ["fato_preco"], () =>
      queryContarRegrasPreco(ctx.prisma),
    );
    if (envelope.estado === "preparando") return envelope;
    const d = envelope.dados;
    return {
      ...envelope,
      dados: {
        ...d,
        _RESPOSTA: `${d.total} regras de preco cadastradas (todas as tabelas).`,
        _DESTAQUE: { totalRegras: d.total },
        _agregado: { contagem: d.total },
      },
    };
  },
};
