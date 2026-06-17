"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { normalizeE164 } from "@/lib/whatsapp/resolve";
import { phoneVariants } from "@/lib/whatsapp/countries";
import type { ActionResult } from "@/lib/actions/users";

export interface WhatsappNumberItem {
  id: string;
  phoneE164: string;
  label: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

/** Papéis autorizados a gerir números de WhatsApp de usuários. */
function canManageWhatsapp(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

// --- listWhatsappNumbers ---------------------------------------------------

export async function listWhatsappNumbers(
  userId: string,
): Promise<ActionResult<WhatsappNumberItem[]>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (!canManageWhatsapp(me.platformRole)) {
      return { success: false, error: "Acesso negado" };
    }

    const parsed = z.string().uuid().safeParse(userId);
    if (!parsed.success) return { success: false, error: "Dados inválidos" };

    const rows = await prisma.userWhatsappNumber.findMany({
      where: { userId: parsed.data },
      select: {
        id: true,
        phoneE164: true,
        label: true,
        verifiedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return { success: true, data: rows };
  } catch (err) {
    console.error("[user-whatsapp.list]", err);
    return { success: false, error: "Erro ao listar números" };
  }
}

// --- addWhatsappNumber -----------------------------------------------------

const AddInput = z.object({
  userId: z.string().uuid(),
  raw: z.string().min(1).max(40),
  label: z.string().max(60).optional(),
});

export async function addWhatsappNumber(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; phoneE164: string }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (!canManageWhatsapp(me.platformRole)) {
      return { success: false, error: "Acesso negado" };
    }

    const parsed = AddInput.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: "Dados inválidos" };
    const input = parsed.data;

    let phoneE164: string;
    try {
      phoneE164 = normalizeE164(input.raw);
    } catch {
      return { success: false, error: "Número de WhatsApp inválido" };
    }

    // Unicidade global, tratando a equivalência do nono dígito (celular BR com
    // e sem o 9 é a mesma linha): o número não pode já existir em nenhuma das
    // suas formas equivalentes.
    const existing = await prisma.userWhatsappNumber.findFirst({
      where: { phoneE164: { in: phoneVariants(phoneE164) } },
      select: { id: true, userId: true },
    });
    if (existing) {
      if (existing.userId === input.userId) {
        return {
          success: false,
          error: "Este número já está vinculado a este usuário",
        };
      }
      return {
        success: false,
        error: "Este número já está em uso por outro usuário",
      };
    }

    const target = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const created = await prisma.userWhatsappNumber.create({
      data: {
        userId: input.userId,
        phoneE164,
        label: input.label ?? null,
      },
      select: { id: true, phoneE164: true },
    });

    logAudit({
      userId: me.id,
      action: "user_whatsapp_added",
      targetType: "User",
      targetId: input.userId,
      details: { phoneE164, label: input.label ?? null },
    });

    revalidatePath("/usuarios");
    return { success: true, data: created };
  } catch (err) {
    console.error("[user-whatsapp.add]", err);
    return { success: false, error: "Erro ao adicionar número" };
  }
}

// --- updateWhatsappNumber --------------------------------------------------

const UpdateInput = z.object({
  id: z.string().uuid(),
  raw: z.string().min(1).max(40),
});

export async function updateWhatsappNumber(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; phoneE164: string }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (!canManageWhatsapp(me.platformRole)) {
      return { success: false, error: "Acesso negado" };
    }

    const parsed = UpdateInput.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: "Dados inválidos" };
    const input = parsed.data;

    let phoneE164: string;
    try {
      phoneE164 = normalizeE164(input.raw);
    } catch {
      return { success: false, error: "Número de WhatsApp inválido" };
    }

    const current = await prisma.userWhatsappNumber.findUnique({
      where: { id: input.id },
      select: { id: true, userId: true, phoneE164: true },
    });
    if (!current) return { success: false, error: "Número não encontrado" };

    // Nada mudou: sai sem tocar o banco.
    if (current.phoneE164 === phoneE164) {
      return { success: true, data: { id: current.id, phoneE164 } };
    }

    // Unicidade global (com equivalência do nono dígito), ignorando o próprio
    // registro: o novo número não pode colidir com outro já cadastrado.
    const clash = await prisma.userWhatsappNumber.findFirst({
      where: {
        phoneE164: { in: phoneVariants(phoneE164) },
        id: { not: current.id },
      },
      select: { id: true, userId: true },
    });
    if (clash && clash.id !== current.id) {
      return {
        success: false,
        error:
          clash.userId === current.userId
            ? "Este número já está vinculado a este usuário"
            : "Este número já está em uso por outro usuário",
      };
    }

    const updated = await prisma.userWhatsappNumber.update({
      where: { id: current.id },
      data: { phoneE164 },
      select: { id: true, phoneE164: true },
    });

    // Não há ação de auditoria "updated" no enum; uma edição é registrada como
    // a substituição do número antigo (removido) pelo novo (adicionado).
    logAudit({
      userId: me.id,
      action: "user_whatsapp_removed",
      targetType: "User",
      targetId: current.userId,
      details: { phoneE164: current.phoneE164, motivo: "edicao" },
    });
    logAudit({
      userId: me.id,
      action: "user_whatsapp_added",
      targetType: "User",
      targetId: current.userId,
      details: { phoneE164, motivo: "edicao", anterior: current.phoneE164 },
    });

    revalidatePath("/usuarios");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[user-whatsapp.update]", err);
    return { success: false, error: "Erro ao atualizar número" };
  }
}

// --- removeWhatsappNumber --------------------------------------------------

export async function removeWhatsappNumber(
  id: string,
): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (!canManageWhatsapp(me.platformRole)) {
      return { success: false, error: "Acesso negado" };
    }

    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return { success: false, error: "Dados inválidos" };

    const row = await prisma.userWhatsappNumber.findUnique({
      where: { id: parsed.data },
      select: { id: true, userId: true, phoneE164: true },
    });
    if (!row) return { success: false, error: "Número não encontrado" };

    await prisma.userWhatsappNumber.delete({ where: { id: parsed.data } });

    logAudit({
      userId: me.id,
      action: "user_whatsapp_removed",
      targetType: "User",
      targetId: row.userId,
      details: { phoneE164: row.phoneE164 },
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    console.error("[user-whatsapp.remove]", err);
    return { success: false, error: "Erro ao remover número" };
  }
}
