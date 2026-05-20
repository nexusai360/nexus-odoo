/**
 * Constantes de tipos de documento da KB — seguras para client e server.
 * (A extração de texto fica em extract.ts, que é server-only por usar pdf-parse.)
 */

/** Tipos de documento aceitos no upload de arquivo (URL é tratado à parte). */
export const FILE_KB_KINDS = ["PDF", "TXT", "MARKDOWN", "CSV", "XML"] as const;
export type FileKbKind = (typeof FILE_KB_KINDS)[number];

/** Extensões aceitas, para o atributo `accept` do input de arquivo. */
export const ACCEPTED_KB_EXTENSIONS = ".pdf,.txt,.md,.markdown,.csv,.xml";

/** Mapeia extensão de arquivo para o FileKbKind. */
export function kindFromFilename(filename: string): FileKbKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".txt")) return "TXT";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "MARKDOWN";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".xml")) return "XML";
  return null;
}
