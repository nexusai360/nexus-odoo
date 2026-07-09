// src/lib/reports/builder/compartilhamento.ts
// F6 (P3) , logica pura do compartilhamento de relatorio, sem IO (testavel).
import type { PlatformRole } from "@/generated/prisma/client";

export interface UsuarioCompartilhavel {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  platformRole: PlatformRole;
}

/**
 * "Marcar todos do nivel": devolve os ids dos usuarios EXATAMENTE daquele nivel
 * (sem heranca , decisao do plano). O atalho de UI usa isto para pre-marcar a
 * lista; o que persiste e sempre a lista final de ids.
 */
export function usuariosDoNivel(
  usuarios: UsuarioCompartilhavel[],
  nivel: PlatformRole,
): string[] {
  return usuarios.filter((u) => u.platformRole === nivel).map((u) => u.id);
}

/** Filtra usuarios por termo de busca (nome ou email), case-insensitive. */
export function filtrarUsuarios(
  usuarios: UsuarioCompartilhavel[],
  termo: string,
): UsuarioCompartilhavel[] {
  const q = termo.trim().toLowerCase();
  if (!q) return usuarios;
  return usuarios.filter(
    (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  );
}
