import type { ReactNode } from "react";
import { requireMenuAccess } from "@/lib/nav/require-menu-access";

/**
 * Layout do menu Usuários.
 *
 * Gate: o nível do menu "Usuários" configurado em Configuração. O padrão é
 * super_admin, que reproduz a regra temporária que existia antes desta feature
 * (só o super_admin via o menu). Agora isso se muda pela tela, sem tocar código.
 *
 * RBAC v2: defesa em profundidade. A sidebar já oculta o item para os
 * papéis sem acesso, mas qualquer pessoa que digite `/usuarios` direto
 * cai nesse layout server-side.
 */
export default async function UsuariosLayout({ children }: { children: ReactNode }) {
  await requireMenuAccess("usuarios");
  return <>{children}</>;
}
