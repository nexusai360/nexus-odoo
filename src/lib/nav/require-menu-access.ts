// src/lib/nav/require-menu-access.ts
// Guarda de rota server-side da feature "Acesso aos menus". O sidebar SO esconde;
// esta funcao BLOQUEIA acesso por URL direta , chamar no topo do layout/page de
// cada menu configuravel. Redireciona p/ /dashboard quem nao pode ver o menu (ou
// /login se nao autenticado). Padrao identico ao guard de Relatorios 2.0 / Diretoria.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MENU_CATALOG, podeVerMenu, type MenuKey } from "./menu-catalog";
import { obterMenuAccess } from "./menu-access";

export async function requireMenuAccess(menuKey: MenuKey): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const entry = MENU_CATALOG.find((e) => e.key === menuKey);
  if (!entry) return;
  const acesso = await obterMenuAccess();
  if (!podeVerMenu(entry, acesso[menuKey], user.platformRole)) {
    redirect("/dashboard");
  }
}
