/**
 * Trava de número único (SPEC §3.4.1, decisão do usuário 2026-07-09).
 *
 * Um número de WhatsApp existe em UMA configuração, e só uma: ou no canal
 * direto (credenciais Meta globais, singleton `WhatsappChannel`) ou numa
 * Conexão por webhook (`WhatsappWebhook` receptora). A trava vale nos dois
 * sentidos e é verificada NAS AÇÕES (servidor), não só na tela.
 *
 * A comparação é pelo número normalizado (E.164), tolerando a ausência do
 * nono dígito de celular BR , `business_id` é gravado cru e o telefone do
 * canal direto vem formatado da Graph API, então comparar strings direto
 * deixaria a trava furada.
 */

import { prisma } from "@/lib/prisma";
import { normalizeE164 } from "./resolve";
import { phoneVariants } from "./countries";

export type VerificacaoNumero = { ok: true } | { ok: false; error: string };

/** Variantes E.164 comparáveis de um número cru; `null` quando não normaliza. */
function variantes(raw: string | null | undefined): Set<string> | null {
  if (!raw || !raw.trim()) return null;
  try {
    return new Set(phoneVariants(normalizeE164(raw)));
  } catch {
    return null;
  }
}

function mesmoNumero(a: Set<string>, b: Set<string> | null): boolean {
  if (!b) return false;
  for (const v of a) if (b.has(v)) return true;
  return false;
}

/** Conexões receptoras com número, para comparação. */
async function conexoesComNumero(): Promise<
  Array<{ name: string | null; businessId: string | null; connectionId: string | null }>
> {
  return prisma.whatsappWebhook.findMany({
    where: { direction: "inbound", isWhatsappReceiver: true, businessId: { not: null } },
    select: { name: true, businessId: true, connectionId: true },
  });
}

/**
 * Valida o número de uma Conexão por webhook (criação ou edição).
 *
 * Recusa quando o número já está no canal direto ou em OUTRA conexão
 * (`ignorarConnectionId` permite a própria conexão se reeditar). Número que
 * não normaliza é recusado (fail-closed: sem normalizar não há trava).
 */
export async function verificarNumeroParaConexao(
  numero: string,
  opts?: { ignorarConnectionId?: string | null },
): Promise<VerificacaoNumero> {
  const candidato = variantes(numero);
  if (!candidato) {
    return { ok: false, error: "Número da empresa inválido. Informe o número com DDI e DDD." };
  }

  const canal = await prisma.whatsappChannel.findUnique({
    where: { id: "global" },
    select: { phoneNumber: true },
  });
  if (mesmoNumero(candidato, variantes(canal?.phoneNumber))) {
    return {
      ok: false,
      error:
        "Este número já está configurado no envio direto pela Meta. " +
        "Remova de lá antes de criar a conexão, ou use outro número.",
    };
  }

  const conexoes = await conexoesComNumero();
  for (const c of conexoes) {
    if (opts?.ignorarConnectionId && c.connectionId === opts.ignorarConnectionId) continue;
    if (mesmoNumero(candidato, variantes(c.businessId))) {
      const nome = c.name ?? "sem nome";
      return {
        ok: false,
        error:
          `Já existe uma conexão de WhatsApp usando este número (${nome}). ` +
          "Edite essa conexão ou use outro número.",
      };
    }
  }

  return { ok: true };
}

/**
 * Valida o número do canal direto (tela de Canais).
 *
 * Recusa quando o número pertence a uma Conexão por webhook, nomeando-a.
 * Número que não normaliza é recusado (fail-closed).
 */
export async function verificarNumeroParaCanalDireto(
  numero: string,
): Promise<VerificacaoNumero> {
  const candidato = variantes(numero);
  if (!candidato) {
    return {
      ok: false,
      error:
        "Não foi possível validar o número deste canal. " +
        "Sem o número, a configuração não pode ser salva.",
    };
  }

  const conexoes = await conexoesComNumero();
  for (const c of conexoes) {
    if (mesmoNumero(candidato, variantes(c.businessId))) {
      const nome = c.name ?? "sem nome";
      return {
        ok: false,
        error:
          `Já existe uma conexão de WhatsApp usando este número (${nome}). ` +
          "Edite essa conexão ou use outro número.",
      };
    }
  }

  return { ok: true };
}
