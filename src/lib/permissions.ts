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
  hierarchy: "Você só pode gerenciar usuários com nível inferior ao seu.",
  viewerNoAccess: "Visualizadores não têm acesso a esta ação.",
} as const;

/**
 * Quem pode CRIAR um usuário com determinado papel.
 * Regra: cada papel cria do seu nível para baixo (inclusive); o owner cria
 * qualquer papel; visualizador não cria ninguém.
 */
export function canCreateRole(
  creator: AuthUser,
  role: PlatformRole,
): boolean {
  if (creator.isOwner) return true;
  if (creator.platformRole === "viewer") return false;
  return (
    PLATFORM_ROLE_HIERARCHY[role] <=
    PLATFORM_ROLE_HIERARCHY[creator.platformRole]
  );
}

/**
 * Quem pode EDITAR um usuário.
 * Regras:
 * - O owner da plataforma gerencia qualquer usuário.
 * - O owner nunca é editável por outros (só via /perfil pelo próprio).
 * - Ninguém edita o próprio usuário pela tela de gestão (usar /perfil).
 * - Demais: gerencia quem tem papel estritamente inferior ao seu.
 * - Visualizador não gerencia ninguém.
 */
export function canEditUser(
  actor: AuthUser,
  target: MinimalTargetUser,
): PermissionResult {
  if (target.isOwner && actor.id !== target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.ownerImmutable };
  }
  if (actor.id === target.id) {
    return { allowed: false, reason: PERMISSION_REASONS.selfEdit };
  }
  if (actor.isOwner) {
    return { allowed: true };
  }
  if (actor.platformRole === "viewer") {
    return { allowed: false, reason: PERMISSION_REASONS.viewerNoAccess };
  }
  const actorRank = PLATFORM_ROLE_HIERARCHY[actor.platformRole];
  const targetRank = PLATFORM_ROLE_HIERARCHY[target.platformRole];
  if (targetRank < actorRank) {
    return { allowed: true };
  }
  return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
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

/**
 * Quem pode ALTERAR o papel de um usuário.
 * Além de poder editá-lo, não pode promovê-lo acima do próprio nível
 * (o owner pode atribuir qualquer papel).
 */
export function canChangeRole(
  actor: AuthUser,
  target: MinimalTargetUser,
  newRole: PlatformRole,
): PermissionResult {
  const editCheck = canEditUser(actor, target);
  if (!editCheck.allowed) return editCheck;
  if (actor.isOwner) return { allowed: true };
  if (
    PLATFORM_ROLE_HIERARCHY[newRole] >
    PLATFORM_ROLE_HIERARCHY[actor.platformRole]
  ) {
    return { allowed: false, reason: PERMISSION_REASONS.hierarchy };
  }
  return { allowed: true };
}
