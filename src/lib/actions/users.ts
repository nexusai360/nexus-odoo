"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { generateTempPassword } from "@/lib/temp-password";
import {
  canEditUser,
  canDeleteUser,
  canDeactivateUser,
  canCreateRole,
  canChangeRole,
} from "@/lib/permissions";
import type { PlatformRole } from "@/generated/prisma/client";

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  isOwner: boolean;
  isActive: boolean;
  createdAt: Date;
}

const ROLE_VALUES = ["super_admin", "admin", "manager", "viewer"] as const;

// --- T12: listUsers --------------------------------------------------------

export async function listUsers(): Promise<ActionResult<UserListItem[]>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (me.platformRole === "viewer" || me.platformRole === "manager") {
      return { success: false, error: "Acesso negado" };
    }
    const rows = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        isOwner: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: rows };
  } catch (err) {
    console.error("[users.list]", err);
    return { success: false, error: "Erro ao listar usuários" };
  }
}

// --- T13: createUser -------------------------------------------------------

const CreateUserInput = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  platformRole: z.enum(ROLE_VALUES),
});

export async function createUser(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; tempPassword: string }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const parsed = CreateUserInput.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: "Dados inválidos" };
    const input = parsed.data;

    if (!canCreateRole(me, input.platformRole)) {
      return {
        success: false,
        error: "Sem permissão para criar usuário com este papel",
      };
    }

    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) return { success: false, error: "E-mail já cadastrado" };

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);

    const created = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: hash,
        platformRole: input.platformRole,
        mustChangePassword: true,
        isActive: true,
      },
      select: { id: true },
    });

    logAudit({
      userId: me.id,
      action: "user_created",
      targetType: "User",
      targetId: created.id,
      details: { email: input.email, platformRole: input.platformRole },
    });

    revalidatePath("/usuarios");
    return { success: true, data: { id: created.id, tempPassword } };
  } catch (err) {
    console.error("[users.create]", err);
    return { success: false, error: "Erro ao criar usuário" };
  }
}

// --- T14a: updateUser ------------------------------------------------------

const UpdateUserInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  platformRole: z.enum(ROLE_VALUES).optional(),
});

export async function updateUser(rawInput: unknown): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const parsed = UpdateUserInput.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: "Dados inválidos" };
    const input = parsed.data;

    const target = await prisma.user.findUnique({
      where: { id: input.id },
      select: { id: true, platformRole: true, isOwner: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const editCheck = canEditUser(me, target);
    if (!editCheck.allowed) {
      return { success: false, error: editCheck.reason ?? "Sem permissão" };
    }

    if (input.platformRole && input.platformRole !== target.platformRole) {
      const roleCheck = canChangeRole(me, target, input.platformRole);
      if (!roleCheck.allowed) {
        return { success: false, error: roleCheck.reason ?? "Sem permissão" };
      }
    }

    await prisma.user.update({
      where: { id: input.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.platformRole ? { platformRole: input.platformRole } : {}),
      },
    });

    logAudit({
      userId: me.id,
      action: "user_updated",
      targetType: "User",
      targetId: input.id,
      details: { name: input.name, platformRole: input.platformRole },
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    console.error("[users.update]", err);
    return { success: false, error: "Erro ao atualizar usuário" };
  }
}

// --- T14b: setUserActive ---------------------------------------------------

export async function setUserActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, platformRole: true, isOwner: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const check = canDeactivateUser(me, target);
    if (!check.allowed) {
      return { success: false, error: check.reason ?? "Sem permissão" };
    }

    await prisma.user.update({ where: { id }, data: { isActive: active } });

    logAudit({
      userId: me.id,
      action: active ? "user_activated" : "user_deactivated",
      targetType: "User",
      targetId: id,
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    console.error("[users.setActive]", err);
    return { success: false, error: "Erro ao alterar status" };
  }
}

// --- T14c: deleteUser ------------------------------------------------------

export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, platformRole: true, isOwner: true },
    });
    if (!target) return { success: false, error: "Usuário não encontrado" };

    const check = canDeleteUser(me, target);
    if (!check.allowed) {
      return { success: false, error: check.reason ?? "Sem permissão" };
    }

    await prisma.user.delete({ where: { id } });

    logAudit({
      userId: me.id,
      action: "user_deleted",
      targetType: "User",
      targetId: id,
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    console.error("[users.delete]", err);
    return { success: false, error: "Erro ao excluir usuário" };
  }
}
