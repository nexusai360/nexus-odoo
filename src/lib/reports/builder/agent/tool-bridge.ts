// src/lib/reports/builder/agent/tool-bridge.ts
// E1b , Ponte entre o catalogo BUILDER_TOOLS (Zod) e o ProviderClient.chat.
// - construirToolDefs(): converte cada inputSchema Zod -> JSON Schema (ToolDefinition).
// - despachar(toolCall, ficha): valida args com o inputSchema da tool e roteia
//   para executarTool (que confia que os args ja vieram validados).
import { z } from "zod";
import type { ToolCall, ToolDefinition } from "@/lib/agent/llm/types";
import type { BuilderReportEntry } from "../types";
import type { JourneyState } from "../journey/state";
import { BUILDER_TOOLS, executarTool, type ToolExec } from "../tools";

/** Converte o catalogo BUILDER_TOOLS para o formato `tools` do chat. */
export function construirToolDefs(): ToolDefinition[] {
  return BUILDER_TOOLS.map((t) => ({
    name: t.name,
    description: t.descricao,
    parameters: z.toJSONSchema(t.inputSchema) as object,
  }));
}

/**
 * Valida os args de uma tool call contra o inputSchema e despacha para o
 * handler. Args invalidos viram erro (vira feedback ao modelo no loop).
 */
export function despachar(
  toolCall: ToolCall,
  ficha: BuilderReportEntry | null,
  journeyState?: JourneyState,
): ToolExec {
  const meta = BUILDER_TOOLS.find((t) => t.name === toolCall.name);
  if (!meta) return { tipo: "erro", erro: "tool_desconhecida" };

  const parsed = meta.inputSchema.safeParse(toolCall.arguments);
  if (!parsed.success) {
    const detalhe = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("; ");
    return { tipo: "erro", erro: `args_invalidos: ${detalhe}` };
  }

  return executarTool(toolCall.name, parsed.data as Record<string, unknown>, ficha, journeyState);
}
