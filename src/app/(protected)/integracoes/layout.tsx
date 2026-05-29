import type { ReactNode } from "react";
import { requireMinRole } from "@/lib/auth/require";

/**
 * Layout do menu Integrações.
 * Gate: apenas super_admin. Outros papéis recebem `?denied=super_admin` em
 * `/dashboard`, onde o banner explica.
 *
 * RBAC v2: padronizado via `requireMinRole`.
 */
export default async function IntegracoesLayout({ children }: { children: ReactNode }) {
  await requireMinRole("super_admin");
  return <>{children}</>;
}
