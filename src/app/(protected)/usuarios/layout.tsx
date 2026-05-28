import type { ReactNode } from "react";
import { requireMinRole } from "@/lib/auth/require";

/**
 * Layout do menu Usuários.
 *
 * Gate: admin+ (super_admin e admin). Manager/viewer são redirecionados
 * com `?denied=admin` para `/dashboard`, onde o banner explica.
 *
 * RBAC v2: defesa em profundidade. A sidebar já oculta o item para os
 * papéis sem acesso, mas qualquer pessoa que digite `/usuarios` direto
 * cai nesse layout server-side.
 */
export default async function UsuariosLayout({ children }: { children: ReactNode }) {
  await requireMinRole("admin");
  return <>{children}</>;
}
