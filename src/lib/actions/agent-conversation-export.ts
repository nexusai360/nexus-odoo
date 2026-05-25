"use server";

/**
 * Exporta o relatório completo de uma conversa do Agente Nex em texto.
 * Restrito a super_admin (gate no inicio da action). Conteudo:
 *   - cabecalho (id, usuario, canal, criada/atualizada)
 *   - cada mensagem em ordem (user/assistant/tool) com timestamp
 *   - para assistant: tool_calls (nome + args canonicos) ja registrados
 *   - para tool: resultado truncado em 4kB (conforme guardrail do agente)
 *   - sugestoes apresentadas pela IA quando registradas em
 *     assistant.toolCalls com sufixo "[[suggestions]]" no content original
 *   - se nao houve sugestao em uma mensagem, registra "(sem sugestoes)"
 */

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

function fmtDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", " UTC");
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function extractSuggestionsFromText(text: string): string[] {
  const m = text.match(/\[\[suggestions\]\]:([^\n]+?)(?:\n|$)/);
  if (!m) return [];
  return m[1]
    .split("|")
    .map((s) => s.trim().replace(/\*\*/g, "").replace(/`/g, "").trim())
    .filter((s) => s.length > 0);
}

export async function exportConversationReport(
  conversationId: string,
): Promise<{ ok: true; filename: string; content: string } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Não autenticado" };
  if (me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado: somente super_admin" };
  }
  if (!conversationId || typeof conversationId !== "string") {
    return { ok: false, error: "conversationId obrigatório" };
  }

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      user: { select: { id: true, name: true, email: true, platformRole: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conv) return { ok: false, error: "Conversa não encontrada" };

  const lines: string[] = [];
  lines.push("==================================================");
  lines.push("RELATÓRIO COMPLETO DA CONVERSA, AGENTE NEX");
  lines.push("==================================================");
  lines.push(`Conversa ID  : ${conv.id}`);
  lines.push(`Usuário      : ${conv.user.name} <${conv.user.email}> (${conv.user.platformRole})`);
  lines.push(`Canal        : ${conv.channel}`);
  lines.push(`Título       : ${conv.title ?? "(sem título)"}`);
  lines.push(`Criada em    : ${fmtDate(conv.createdAt)}`);
  lines.push(`Atualizada   : ${fmtDate(conv.updatedAt)}`);
  lines.push(`Mensagens    : ${conv.messages.length}`);
  lines.push("");
  lines.push("Exportado por: super_admin " + me.email);
  lines.push("Exportado em : " + fmtDate(new Date()));
  lines.push("");
  lines.push("==================================================");
  lines.push("HISTÓRICO DE MENSAGENS");
  lines.push("==================================================");
  lines.push("");

  conv.messages.forEach((msg, idx) => {
    const n = idx + 1;
    const stamp = fmtDate(msg.createdAt);
    const sep = `--- [${n}] ${msg.role.toUpperCase()} | ${stamp} ` + "-".repeat(20);
    lines.push(sep);
    lines.push("");

    if (msg.role === "user") {
      lines.push(msg.content);
    } else if (msg.role === "tool") {
      lines.push("(resultado de tool)");
      lines.push(msg.content);
    } else {
      // assistant
      lines.push(msg.content || "(sem texto, apenas tool_calls)");
      lines.push("");
      if (msg.toolCalls) {
        const tcs = Array.isArray(msg.toolCalls)
          ? (msg.toolCalls as Array<{
              id?: string;
              name?: string;
              arguments?: unknown;
            }>)
          : [];
        if (tcs.length > 0) {
          lines.push("Tool calls executadas (como o agente chegou na resposta):");
          tcs.forEach((tc, i) => {
            lines.push(`  [${i + 1}] ${tc.name ?? "(?)"} (id=${tc.id ?? "?"})`);
            const args = safeStringify(tc.arguments ?? {});
            args
              .split("\n")
              .forEach((argLine) => lines.push("      " + argLine));
          });
          lines.push("");
        } else {
          lines.push("Tool calls: (nenhuma)");
        }
      } else {
        lines.push("Tool calls: (nenhuma)");
      }
      // Sugestoes apresentadas. Estao no content original como sufixo
      // [[suggestions]] que o ChatPanel/extractSuggestions desmonta antes de
      // gravar (apaga do content). Como o content gravado nao tem mais o
      // sufixo, tentamos detectar via inspecao do raw e cair em "(sem
      // sugestoes registradas)" quando nao houver.
      const sug = extractSuggestionsFromText(msg.content);
      if (sug.length > 0) {
        lines.push("Sugestoes apresentadas:");
        sug.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
      } else {
        lines.push("Sugestoes apresentadas: (nao registradas)");
      }
    }
    lines.push("");
  });

  lines.push("==================================================");
  lines.push("FIM DO RELATÓRIO");
  lines.push("==================================================");

  const content = lines.join("\n");
  const filename =
    `nex-conversa-${conv.id.slice(0, 8)}-${conv.createdAt.toISOString().slice(0, 10)}.txt`;
  return { ok: true, filename, content };
}
