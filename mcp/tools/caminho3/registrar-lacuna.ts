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
  // dominio ausente intencionalmente — tool de domínio-neutro (sempreVisivel: true).
  // Nenhum domínio falso: visibilidade é garantida pelo predicado sempreVisivel.
  sempreVisivel: true,
  descricao:
    "Registra uma pergunta que não foi coberta pelo catálogo de tools (Caminho 3a). " +
    "Use quando o usuário faz uma pergunta fora do escopo das tools disponíveis.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, ctx) => {
    // Usa createMany() para suprimir o RETURNING implícito do create().
    // O role nexus_mcp tem GRANT INSERT mas não SELECT em feature_requests.
    // createMany() emite apenas INSERT sem RETURNING — preserva o menor privilégio.
    await ctx.prisma.featureRequest.createMany({
      data: [
        {
          userId: ctx.user.userId,
          perguntaResumo: input.perguntaResumo,
          dominio: input.dominio,
        },
      ],
    });
    return { registrado: true };
  },
};
