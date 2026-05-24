/**
 * Constantes de tipos de documento da KB , seguras para client e server.
 * (A extração de texto fica em extract.ts, que é server-only por usar pdf-parse.)
 */

/** Tipos de documento aceitos no upload de arquivo (URL é tratado à parte). */
export const FILE_KB_KINDS = [
  "PDF",
  "TXT",
  "MARKDOWN",
  "CSV",
  "XML",
  "YAML",
  "XLSX",
  "DOCX",
  "JSON",
] as const;
export type FileKbKind = (typeof FILE_KB_KINDS)[number];

/** Limite de quantidade de arquivos por upload em lote. */
export const MAX_FILES_PER_UPLOAD = 10;

/** Extensões aceitas, para o atributo `accept` do input de arquivo. */
export const ACCEPTED_KB_EXTENSIONS =
  ".pdf,.txt,.md,.markdown,.csv,.xml,.yaml,.yml,.xlsx,.xls,.docx,.doc,.json";

/** Rótulo curto de cada formato, usado na microcopy da UI. */
export const FILE_KB_LABEL_SHORT: Record<FileKbKind, string> = {
  PDF: "PDF",
  TXT: "TXT",
  MARKDOWN: "Markdown",
  CSV: "CSV",
  XML: "XML",
  YAML: "YAML",
  XLSX: "Excel",
  DOCX: "Word",
  JSON: "JSON",
};

/** Mapeia extensão de arquivo para o FileKbKind. */
export function kindFromFilename(filename: string): FileKbKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".txt")) return "TXT";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "MARKDOWN";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".xml")) return "XML";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "YAML";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "XLSX";
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "DOCX";
  if (lower.endsWith(".json")) return "JSON";
  return null;
}
