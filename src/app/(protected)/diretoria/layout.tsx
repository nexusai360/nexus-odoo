import type { ReactNode } from "react";
import { requireMenuAccess } from "@/lib/nav/require-menu-access";

/**
 * Layout do menu Diretoria.
 *
 * Gate do menu: nível salvo em `menu_access` (tela Configuração). O acesso fino
 * a cada sub-tela (Visão geral, Vendas, Pedidos, Estoque, Agenda) continua vindo
 * das capabilities da Diretoria, resolvidas em `diretoriaNavFor` e nos guards de
 * cada page.
 *
 * RBAC v2: defesa em profundidade, o sidebar já esconde o grupo.
 */
export default async function DiretoriaLayout({ children }: { children: ReactNode }) {
  await requireMenuAccess("diretoria");
  return <>{children}</>;
}
