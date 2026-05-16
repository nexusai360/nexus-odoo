import type { PlatformRole } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth-helpers";
import { PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface MinimalTargetUser {
  id: string;
  platformRole: PlatformRole;
  isOwner: boolean;
}

export const PERMISSION_REASONS = {
  ownerImmutable: "Não é possível editar o owner da plataforma.",
  ownerUndeletable: "Não é possível excluir o owner da plataforma.",
  selfEdit:
    "Você não pode editar seu próprio usuário aqui. Use a página /perfil.",
  selfDelete: "Você não pode excluir seu próprio usuário.",
  superAdminOnly: "Apenas super admins podem editar outros super admins.",
  hierarchy: "Você só pode editar usuários com nível inferior ao seu.",
  viewerNoAccess: "Visualizadores não têm acesso a esta ação.",
  managerNoAccess: "Gerentes não têm acesso a esta ação.",
} as const;

export function canCreateRole(
  creator: AuthUser,
  role: PlatformRole,
): boolean {
  if (creator.platformRole === "viewer") return false;
  return (
    PLATFORM_ROLE_HIERARCHY[role] <=
    PLATFORM_ROLE_HIERARCHY[creator.platformRole]
  );
}

export function canEditUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: PERMISSION_REASONS.ownerImmutable };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.selfEdit };
  }
  if (target.platformRole === "super_admin") {
    if (actor.platformRole !== "super_admin") {
      return { allowed: false, reason: PERMISSION_REASONS.superAdminOnly };
    }
    return { allowed: true };
  }
  if (actor.platformRole === "super_admin") {
    return { allowed: true };
  }
  if (actor.platformRole === "admin") {
    if (
      target.platformRole === "manager" ||
      target.platformRole === "viewer"
    ) {
      return { allowed: true };
    }
    return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
  }
  if (actor.platformRole === "manager") {
    return { allowed: false, reason: PERMISSION_REASONS.managerNoAccess };
  }
  return { allowed: false, reason: PERMISSION_REASONS.viewerNoAccess };
}

export function canDeleteUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: PERMISSION_REASONS.ownerUndeletable };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.selfDelete };
  }
  return canEditUser(actor, target);
}

export function canDeactivateUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner) {
    return { allowed: false, reason: PERMISSION_REASONS.ownerImmutable };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.selfEdit };
  }
  return canEditUser(actor, target);
}

export const canActivate = canDeactivateUser;

export function canChangeRole(
  actor: AuthUser,
  target: MinimalTargetUser,
  newRole: PlatformRole,
): PermissionResult {
  const editCheck = canEditUser(actor, target);
  if (!editCheck.allowed) return editCheck;
  if (actor.platformRole === "super_admin") return { allowed: true };
  if (actor.platformRole === "admin") {
    if (newRole === "manager" || newRole === "viewer") {
      return { allowed: true };
    }
    return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
  }
  return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
}
