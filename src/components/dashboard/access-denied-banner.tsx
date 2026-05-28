"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";
import type { PlatformRole } from "@/generated/prisma/client";

export type AccessDeniedKind = "denied" | "no_domains";

interface AccessDeniedBannerProps {
  kind: AccessDeniedKind;
  /** Em `kind="denied"`, o papel mínimo exigido (ex.: "super_admin"). */
  role?: string;
}

function denialMessage(role: string | undefined): string {
  if (role === "admin") {
    return "Você não tem permissão para acessar Usuários.";
  }
  if (role === "super_admin") {
    return "Você não tem permissão para acessar essa área.";
  }
  if (role && role in PLATFORM_ROLE_LABELS) {
    const label = PLATFORM_ROLE_LABELS[role as PlatformRole];
    return `Você não tem permissão (mínimo necessário: ${label}).`;
  }
  return "Você não tem permissão para acessar essa área.";
}

/**
 * Banner exibido em /dashboard quando um redirect server-side trouxe o
 * usuário com query param de denúncia. Sem o banner, o redirect parece
 * silencioso.
 *
 * RBAC v2: complementa os helpers de gate em src/lib/auth/require.ts.
 */
export function AccessDeniedBanner({ kind, role }: AccessDeniedBannerProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const message =
    kind === "no_domains"
      ? "Seu acesso aos relatórios ainda não foi configurado. Fale com seu administrador."
      : denialMessage(role);

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Fechar"
        className="flex-shrink-0 rounded p-0.5 transition hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default AccessDeniedBanner;
