import { prisma } from "@/lib/prisma";

/**
 * Resultado da resolução de um número de WhatsApp.
 * - `unknown`: número não cadastrado em nenhum usuário.
 * - `inactive`: número de um usuário cuja conta está desativada.
 * - `ok`: número de um usuário ativo (acesso liberado).
 */
export type ResolvedWhatsappUser =
  | { status: "unknown" }
  | { status: "inactive" }
  | { status: "ok"; user: { id: string; name: string; isActive: boolean } };

/**
 * Normaliza um número de telefone para o formato E.164 (`+<DDI><número>`).
 *
 * Regras:
 * - Remove todo caractere que não seja dígito ou `+`.
 * - Sem prefixo internacional, assume Brasil (DDI 55) como default.
 * - Se já vier com `55` no início (sem `+`), assume que é o DDI brasileiro.
 *
 * Lança `Error` para entradas vazias, não numéricas ou curtas demais.
 */
export function normalizeE164(raw: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("Número de telefone vazio");
  }

  // Mantém apenas dígitos e um eventual + inicial.
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 0) {
    throw new Error("Número de telefone sem dígitos");
  }

  let normalized: string;
  if (hasPlus) {
    // Já internacional: confia no DDI informado.
    normalized = `+${digits}`;
  } else if (digits.startsWith("55") && digits.length >= 12) {
    // DDI 55 já presente, faltava só o +.
    normalized = `+${digits}`;
  } else {
    // Número nacional brasileiro: prefixa DDI 55.
    normalized = `+55${digits}`;
  }

  // E.164: entre 8 e 15 dígitos após o +. Um número BR válido tem
  // 12 (fixo) ou 13 (celular com 9) dígitos contando o DDI.
  const finalDigits = normalized.slice(1);
  if (finalDigits.length < 10 || finalDigits.length > 15) {
    throw new Error(`Número de telefone inválido: ${raw}`);
  }

  return normalized;
}

/**
 * Resolve um número de WhatsApp (cru) para o usuário da plataforma vinculado.
 *
 * Número malformado é tratado como `unknown` (a resolução nunca lança — é
 * chamada no caminho de ingestão de mensagens, onde lançar derrubaria o job).
 */
export async function resolveWhatsappUser(
  raw: string,
): Promise<ResolvedWhatsappUser> {
  let phoneE164: string;
  try {
    phoneE164 = normalizeE164(raw);
  } catch {
    return { status: "unknown" };
  }

  const row = await prisma.userWhatsappNumber.findUnique({
    where: { phoneE164 },
    select: {
      user: { select: { id: true, name: true, isActive: true } },
    },
  });

  if (!row || !row.user) {
    return { status: "unknown" };
  }

  if (!row.user.isActive) {
    return { status: "inactive" };
  }

  return { status: "ok", user: row.user };
}
