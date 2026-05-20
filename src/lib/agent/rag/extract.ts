/**
 * Extração de texto de documentos da base de conhecimento — SERVER-ONLY.
 *
 * Importa `pdf-parse`, que é Node-only; nunca importar este arquivo de um
 * client component. As constantes/tipos puros estão em `kb-kinds.ts`.
 *
 * - PDF: extração real via pdf-parse.
 * - TXT / Markdown: texto direto (o agente entende sintaxe Markdown).
 * - CSV: normalizado para texto tabular legível.
 * - XML: tags preservadas como texto.
 */

import type { KbKind } from "@/generated/prisma/client";
import { FILE_KB_KINDS, type FileKbKind } from "./kb-kinds";

export { FILE_KB_KINDS, kindFromFilename } from "./kb-kinds";
export type { FileKbKind } from "./kb-kinds";

/**
 * Extrai texto puro de um arquivo da KB.
 * @param buffer  Conteúdo binário do arquivo.
 * @param kind    Tipo declarado (derivado da extensão).
 */
export async function extractKbText(
  buffer: Buffer,
  kind: FileKbKind,
): Promise<string> {
  if (kind === "PDF") {
    // Importa o módulo interno (lib/pdf-parse.js) e não o entry index.js do
    // pacote — o index.js de pdf-parse v1 roda um auto-teste de debug no
    // top-level que quebra em ambiente de bundle.
    const mod = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as {
      default: (data: Buffer) => Promise<{ text: string }>;
    };
    const result = await mod.default(buffer);
    return result.text.trim();
  }

  const raw = buffer.toString("utf-8");

  if (kind === "CSV") {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");
  }

  // TXT, MARKDOWN, XML — texto cru já é legível para o modelo.
  return raw.trim();
}

/** Converte o KbKind do Prisma para o subconjunto de arquivo (ou null). */
export function asFileKind(kind: KbKind): FileKbKind | null {
  return (FILE_KB_KINDS as readonly string[]).includes(kind)
    ? (kind as FileKbKind)
    : null;
}
