// F5 Evals , definicao de "read-tool operacional" reusando exatamente o set A
// do baseline F4 (read-tool com formatador real, menos tools de sistema).
import { catalogo } from "../../../../mcp/catalog/index";
import { isWriteToolEntry, type ToolEntry } from "../../../../mcp/catalog/types";
import { formatadorPorTool, ehFormatadorGenerico } from "../../../../mcp/lib/responder";

const EXCLUIR = new Set(["registrar_lacuna", "bi_consulta_avancada"]);

export function readToolsOperacionais(): string[] {
  return (catalogo as ToolEntry[])
    .filter((t) => !isWriteToolEntry(t))
    .filter((t) => !ehFormatadorGenerico(formatadorPorTool(t.id)))
    .filter((t) => !EXCLUIR.has(t.id))
    .map((t) => t.id)
    .sort();
}
