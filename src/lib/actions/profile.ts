"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type ProfileResult = { success?: boolean; error?: string };

// --- T18: updateProfile ----------------------------------------------------

const UpdateProfileInput = z.object({
  name: z.string().min(2).max(120).optional(),
  // Avatar é data-URL de imagem (webp gerado por canvas no client).
  // Limite de 256 KB e prefixo obrigatório `data:image/` — rejeita
  // payloads arbitrários numa coluna que é renderizada em <img>.
  avatarUrl: z
    .string()
    .max(262144)
    .regex(/^data:image\//)
    .nullable()
    .optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
});

const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
  confirmPassword: z.string().min(1).max(72),
});

export async function updateProfile(rawInput: unknown): Promise<ProfileResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { error: "Não autenticado" };

    const parsed = UpdateProfileInput.safeParse(rawInput);
    if (!parsed.success) return { error: "Dados inválidos" };
    const input = parsed.data;

    const data: {
      name?: string;
      avatarUrl?: string | null;
      theme?: "dark" | "light" | "system";
    } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
    if (input.theme !== undefined) data.theme = input.theme;

    await prisma.user.update({ where: { id: me.id }, data });

    logAudit({
      userId: me.id,
      action: "profile_updated",
      targetType: "User",
      targetId: me.id,
    });

    revalidatePath("/perfil");
    return { success: true };
  } catch (err) {
    console.error("[profile.update]", err);
    return { error: "Erro ao atualizar perfil" };
  }
}

// --- T19: changePassword ---------------------------------------------------

export async function changePassword(
  rawInput: unknown,
): Promise<ProfileResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { error: "Não autenticado" };

    const parsed = ChangePasswordInput.safeParse(rawInput);
    if (!parsed.success) {
      return {
        error: "A nova senha precisa ter entre 8 e 72 caracteres.",
      };
    }
    const input = parsed.data;

    if (input.newPassword !== input.confirmPassword) {
      return { error: "As senhas não coincidem." };
    }
    if (input.newPassword === input.currentPassword) {
      return { error: "A nova senha deve ser diferente da atual." };
    }

    const row = await prisma.user.findUnique({
      where: { id: me.id },
      select: { password: true },
    });
    if (!row) return { error: "Usuário não encontrado" };

    const ok = await bcrypt.compare(input.currentPassword, row.password);
    if (!ok) return { error: "Senha atual incorreta." };

    const hash = await bcrypt.hash(input.newPassword, 10);
    await prisma.user.update({
      where: { id: me.id },
      data: {
        password: hash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    logAudit({
      userId: me.id,
      action: "profile_password_changed",
      targetType: "User",
      targetId: me.id,
    });

    return { success: true };
  } catch (err) {
    console.error("[profile.changePassword]", err);
    return { error: "Erro ao alterar senha" };
  }
}

// --- T20: requestEmailChange (stub) + confirmEmailChange (stub) ------------

export async function requestEmailChange(_input: {
  newEmail: string;
  password: string;
}): Promise<ProfileResult> {
  return {
    error:
      "A troca de e-mail por confirmação será habilitada em versão futura.",
  };
}

export async function confirmEmailChange(
  _token: string,
): Promise<ProfileResult> {
  // TODO: implementar confirmação de troca de email — fase futura
  return { error: "Funcionalidade não implementada" };
}
