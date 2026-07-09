import type { ReactNode } from "react";
import { requireMenuAccess } from "@/lib/nav/require-menu-access";

/**
 * Layout do menu Integrações.
 * Gate: o nível do menu "Integrações" configurado em Configuração (padrão
 * super_admin). Quem não pode ver volta para `/dashboard`.
 *
 * RBAC v2: defesa em profundidade, cobre as sub-rotas (Canais, Servidor MCP,
 * Webhooks, API, BI).
 */
export default async function IntegracoesLayout({ children }: { children: ReactNode }) {
  await requireMenuAccess("integracoes");
  return <>{children}</>;
}
