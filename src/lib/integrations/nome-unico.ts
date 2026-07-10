/**
 * Trava de NOME único entre webhooks (decisão do usuário 2026-07-10).
 *
 * O nome identifica o webhook para quem opera a plataforma: dois "teste" na
 * lista, mesmo de tipos diferentes, tornam impossível saber qual é qual. A
 * comparação ignora maiúsculas/minúsculas e espaços nas pontas.
 *
 * Vale para os TRÊS tipos (Conexão com WhatsApp, receber eventos, enviar
 * eventos) e para as duas linhas de uma Conexão, que compartilham o nome.
 */

import { prisma } from "@/lib/prisma";

export interface OpcoesNomeUnico {
  /** Id da linha que está sendo editada (não conflita consigo mesma). */
  ignorarId?: string | null;
  /** Conexão que está sendo editada (as duas linhas dela são ignoradas). */
  ignorarConnectionId?: string | null;
}

/**
 * `null` quando o nome está livre; a mensagem de erro quando já existe.
 * Fail-closed: erro de banco recusa (não deixa passar duplicata em silêncio).
 */
export async function verificarNomeDeWebhook(
  nome: string,
  opts: OpcoesNomeUnico = {},
): Promise<string | null> {
  const alvo = nome.trim();
  if (!alvo) return "Nome obrigatório";

  const filtros: Record<string, unknown> = {
    name: { equals: alvo, mode: "insensitive" },
  };
  if (opts.ignorarId) filtros.id = { not: opts.ignorarId };
  if (opts.ignorarConnectionId) filtros.connectionId = { not: opts.ignorarConnectionId };

  try {
    const existente = await prisma.whatsappWebhook.findFirst({
      where: filtros,
      select: { id: true },
    });
    if (existente) {
      return `Já existe um webhook com o nome "${alvo}". Escolha outro nome.`;
    }
    return null;
  } catch (err) {
    console.error("[nome-unico] verificarNomeDeWebhook:", err);
    return "Não foi possível verificar o nome agora. Tente novamente.";
  }
}
