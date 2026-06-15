import type { ReactNode } from "react";
import { requireMinRole } from "@/lib/auth/require";
import { USUARIOS_SUPER_ADMIN_ONLY } from "@/lib/constants/temp-rules";

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
  // Regra temporária (ver temp-rules.ts): quando ligada, só super_admin acessa.
  await requireMinRole(USUARIOS_SUPER_ADMIN_ONLY ? "super_admin" : "admin");
  return <>{children}</>;
}
