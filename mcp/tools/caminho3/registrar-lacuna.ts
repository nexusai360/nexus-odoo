// mcp/tools/caminho3/registrar-lacuna.ts
// Tool MCP: registrar_lacuna (Caminho 3a)
// Registra uma pergunta não coberta pelo catálogo de tools.
// sempreVisivel: true — aparece para qualquer usuário independente de domínio.
// Sem gatedRoles — qualquer role pode sinalizar lacunas.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";

const inputSchema = z.object({
  perguntaResumo: z.string().min(1),
  dominio: z.string().optional(),
});

const outputSchema = z.object({ registrado: z.literal(true) });

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const registrarLacuna: ToolEntry<Input, Output> = {
  id: "registrar_lacuna",
  // dominio obrigatório no tipo; "estoque" como valor de campo mas sempreVisivel
  // garante visibilidade independente de domínio do usuário (achado N9).
  dominio: "estoque",
  sempreVisivel: true,
  descricao:
    "Registra uma pergunta que não foi coberta pelo catálogo de tools (Caminho 3a). " +
    "Use quando o usuário faz uma pergunta fora do escopo das tools disponíveis.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    await ctx.prisma.featureRequest.create({
      data: {
        userId: ctx.user.userId,
        perguntaResumo: input.perguntaResumo,
        dominio: input.dominio,
      },
    });
    return { registrado: true };
  },
};
