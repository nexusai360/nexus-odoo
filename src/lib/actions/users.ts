"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { generateTempPassword } from "@/lib/temp-password";
import {
  grantableDomains,
  REPORT_DOMAINS,
  type ReportDomainId,
} from "@/lib/reports/domains";
import { getUserDomains } from "@/lib/actions/domain-access";
import {
  canEditUser,
  canDeleteUser,
  canDeactivateUser,
  canCreateRole,
  canChangeRole,
} from "@/lib/permissions";
import type { PlatformRole, ReportDomain } from "@/generated/prisma/client";

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
    // Apenas visualizador não gerencia usuários — gerente/admin/super_admin sim.
    if (me.platformRole === "viewer") {
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
      orderBy: { createdAt: "asc" },
    });
    return { success: true, data: rows };
  } catch (err) {
    console.error("[users.list]", err);
    return { success: false, error: "Erro ao listar usuários" };
  }
}

// --- T13: createUser -------------------------------------------------------

// Derivado de REPORT_DOMAINS para cobrir todos os domínios (F4 completo: 9).
const DOMAIN_IDS = REPORT_DOMAINS.map((d) => d.id) as [
  ReportDomainId,
  ...ReportDomainId[],
];

const CreateUserInput = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  platformRole: z.enum(ROLE_VALUES),
  password: z.string().min(8).max(72).optional(),
  domains: z.array(z.enum(DOMAIN_IDS)).default([]),
});

export async function createUser(
  rawInput: unknown,
): Promise<ActionResult<{ id: string; tempPassword?: string }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    // Visualizador não cria usuários. Gerente/admin/super_admin podem —
    // `canCreateRole` (abaixo) restringe quais papéis cada um pode atribuir.
    if (me.platformRole === "viewer") {
      return { success: false, error: "Acesso negado" };
    }

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

    // Senha: se fornecida, usa-a; senão gera temporária e exige troca.
    const useGenerated = !input.password;
    const plainPassword = input.password ?? generateTempPassword();
    const hash = await bcrypt.hash(plainPassword, 10);

    // C1: a transação cobre user.create + userDomainAccess.createMany.
    // O logAudit (pgPool, fora do Prisma) segue pós-commit, fire-and-forget.
    // Domínios só fazem sentido para manager/viewer (§4.3); privilegiados ignoram.
    const domains =
      input.platformRole === "manager" || input.platformRole === "viewer"
        ? input.domains
        : [];

    // RBAC: o concedente só pode atribuir domínios que ele mesmo pode conceder.
    if (domains.length > 0) {
      const myGranted = await getUserDomains(me.id);
      const grantable = grantableDomains(me.platformRole, myGranted);
      if (domains.some((d) => !grantable.includes(d))) {
        return {
          success: false,
          error: "Sem permissão para conceder um destes domínios",
        };
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hash,
          platformRole: input.platformRole,
          mustChangePassword: useGenerated,
          isActive: true,
        },
        select: { id: true },
      });
      if (domains.length) {
        await tx.userDomainAccess.createMany({
          data: domains.map((domain) => ({
            userId: u.id,
            domain: domain as ReportDomain,
            grantedById: me.id,
          })),
        });
      }
      return u;
    });

    logAudit({
      userId: me.id,
      action: "user_created",
      targetType: "User",
      targetId: created.id,
      details: { email: input.email, platformRole: input.platformRole },
    });

    revalidatePath("/usuarios");
    return {
      success: true,
      data: {
        id: created.id,
        ...(useGenerated ? { tempPassword: plainPassword } : {}),
      },
    };
  } catch (err) {
    console.error("[users.create]", err);
    return { success: false, error: "Erro ao criar usuário" };
  }
}

// --- checkEmailAvailable ---------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Verifica se um e-mail ainda não está cadastrado. Usada para validação
 * antecipada no modal de criação de usuário (defesa em profundidade — o
 * `createUser` revalida no submit). Exige autenticação; se não autenticado
 * ou e-mail malformado, retorna `available: false`.
 */
export async function checkEmailAvailable(
  email: string,
): Promise<{ available: boolean }> {
  try {
    const me = await getCurrentUser();
    if (!me) return { available: false };

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) return { available: false };

    const existing = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    return { available: !existing };
  } catch (err) {
    console.error("[users.checkEmailAvailable]", err);
    return { available: false };
  }
}

// --- T14a: updateUser ------------------------------------------------------

const UpdateUserInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  platformRole: z.enum(ROLE_VALUES).optional(),
  password: z.string().min(8).max(72).optional(),
  isActive: z.boolean().optional(),
});

export async function updateUser(rawInput: unknown): Promise<ActionResult> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };

    const parsed = UpdateUserInput.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: "Dados inválidos" };
    const input = parsed.data;

    if (
      input.name === undefined &&
      input.platformRole === undefined &&
      input.password === undefined &&
      input.isActive === undefined
    ) {
      return { success: true };
    }

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

    if (input.isActive !== undefined) {
      const activeCheck = canDeactivateUser(me, target);
      if (!activeCheck.allowed) {
        return {
          success: false,
          error: activeCheck.reason ?? "Sem permissão",
        };
      }
    }

    const passwordHash = input.password
      ? await bcrypt.hash(input.password, 10)
      : undefined;

    await prisma.user.update({
      where: { id: input.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.platformRole ? { platformRole: input.platformRole } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(passwordHash
          ? { password: passwordHash, mustChangePassword: false }
          : {}),
      },
    });

    logAudit({
      userId: me.id,
      action: "user_updated",
      targetType: "User",
      targetId: input.id,
      details: {
        name: input.name,
        platformRole: input.platformRole,
        passwordChanged: !!passwordHash,
        isActive: input.isActive,
      },
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
