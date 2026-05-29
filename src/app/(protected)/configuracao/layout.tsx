import type { ReactNode } from "react";
import { requireMinRole } from "@/lib/auth/require";

/**
 * Layout da tela de Configuração da plataforma.
 * Gate: apenas super_admin. Demais papéis caem em `/dashboard?denied=super_admin`.
 *
 * RBAC v2: defesa em profundidade.
 */
export default async function ConfiguracaoLayout({ children }: { children: ReactNode }) {
  await requireMinRole("super_admin");
  return <>{children}</>;
}
