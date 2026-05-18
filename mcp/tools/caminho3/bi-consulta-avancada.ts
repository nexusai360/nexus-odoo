// mcp/tools/caminho3/bi-consulta-avancada.ts
// Tool MCP: bi_consulta_avancada (Caminho 3c — stub gated)
//
// Stub que sinaliza ao agente que o modo BI avançado (text-to-SQL via Postgres MCP)
// ainda não está disponível nesta fase, mas existe como ponto de extensão.
//
// Gate: só super_admin e admin veem e invocam esta tool.
// sempreVisivel: true — visibilidade não depende de domínio, apenas de role.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";

const inputSchema = z.object({
  pergunta: z.string().min(1),
});

const outputSchema = z.object({
  disponivel: z.literal(false),
  mensagem: z.string(),
  aviso: z.string(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const biConsultaAvancada: ToolEntry<Input, Output> = {
  id: "bi_consulta_avancada",
  // dominio ausente intencionalmente — tool de domínio-neutro (sempreVisivel: true).
  sempreVisivel: true,
  gatedRoles: ["super_admin", "admin"],
  descricao:
    "Modo BI avançado (Caminho 3c): consulta dinâmica via Postgres MCP para " +
    "perguntas fora do catálogo de tools semânticas. Restrito a admin/super_admin. " +
    "AVISO: consulta dinâmica, não auditada pelo pipeline padrão. " +
    "Disponível em fase futura.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (_input, _ctx): Promise<Output> => {
    const output = {
      disponivel: false as const,
      mensagem:
        "O modo BI avançado ainda não está disponível nesta fase. " +
        "Esta funcionalidade (consulta dinâmica via Postgres MCP) será habilitada " +
        "em uma próxima iteração do sistema.",
      aviso:
        "Esta tool executará consulta dinâmica não auditada pelo pipeline padrão. " +
        "Quando habilitada, seu uso será registrado com aviso explícito ao usuário.",
    };
    return outputSchema.parse(output);
  },
};
