// src/lib/reports/builder/builder-conversa-export.ts
// F6 , formata a conversa do construtor em texto puro para download (.txt).
// Funcao pura (sem IO) para ser testavel; a action faz o fetch e chama aqui.
import type { BuilderMessageDto } from "./builder-conversation-repo";

export interface BuilderConversaMeta {
  titulo: string | null;
  criadoEm: string | Date;
}

function dataBr(v: string | Date): string {
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Monta o conteudo .txt da conversa do construtor. */
export function formatarBuilderConversaTxt(
  mensagens: BuilderMessageDto[],
  meta: BuilderConversaMeta,
): string {
  const linhas: string[] = [];
  linhas.push("Construtor de relatorios , conversa");
  if (meta.titulo) linhas.push(`Relatorio: ${meta.titulo}`);
  linhas.push(`Iniciada em: ${dataBr(meta.criadoEm)}`);
  linhas.push("");
  linhas.push("=".repeat(48));
  linhas.push("");

  for (const m of mensagens) {
    const quem = m.role === "user" ? "Voce" : "Agente Nex";
    linhas.push(`[${dataBr(m.createdAt)}] ${quem}:`);
    if (m.steps && m.steps.length > 0) {
      const resumo = m.steps.map((s) => s.label).join(", ");
      linhas.push(`  (ferramentas: ${resumo})`);
    }
    linhas.push(m.content.trim() || "(sem texto)");
    linhas.push("");
  }
  return linhas.join("\n");
}

/** Nome do arquivo .txt da conversa. */
export function nomeArquivoBuilderConversa(meta: BuilderConversaMeta): string {
  const base = (meta.titulo ?? "relatorio")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "relatorio";
  return `construtor-${base}.txt`;
}
