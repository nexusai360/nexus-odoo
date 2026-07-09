/**
 * Layout do menu "Relatórios 2.0" (F6).
 *
 * Gate do menu de topo: nível salvo em `menu_access` (tela Configuração, card
 * de acesso aos menus). O acesso fino de cada submenu (painéis, meus, construtor)
 * continua no card de Relatórios 2.0 e é checado em cada page.
 */
import { requireMenuAccess } from "@/lib/nav/require-menu-access";

export default async function Relatorios2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMenuAccess("relatorios2");
  return <>{children}</>;
}
