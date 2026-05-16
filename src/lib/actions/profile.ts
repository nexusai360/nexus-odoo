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
  avatarUrl: z.string().max(262144).nullable().optional(),
  theme: z.enum(["dark", "light", "system"]).optional(),
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

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ProfileResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { error: "Não autenticado" };

    if (input.newPassword.length < 8) {
      return { error: "A nova senha precisa ter ao menos 8 caracteres." };
    }
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
