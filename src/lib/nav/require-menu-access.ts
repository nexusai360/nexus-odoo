// src/lib/nav/require-menu-access.ts
// Guarda de rota server-side da feature "Acesso aos menus". O sidebar SO esconde;
// esta funcao BLOQUEIA acesso por URL direta , chamar no topo do layout de cada
// menu configuravel (o layout cobre as sub-rotas).
//
// Destino do redirect: /dashboard quando o usuario pode ve-lo; senao /perfil, que
// nao tem guarda de menu. Isso evita jogar alguem numa tela que ele nao pode ver
// e evita loop (Relatorios sem dominio ja redireciona pro Dashboard).
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MENU_CATALOG, podeVerMenu, destinoQuandoBloqueado, type MenuKey } from "./menu-catalog";
import { obterMenuAccess } from "./menu-access";

export async function requireMenuAccess(menuKey: MenuKey): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const entry = MENU_CATALOG.find((e) => e.key === menuKey);
  if (!entry) return;
  const acesso = await obterMenuAccess();
  if (!podeVerMenu(entry, acesso[menuKey], user.platformRole)) {
    redirect(destinoQuandoBloqueado(acesso, user.platformRole));
  }
}
