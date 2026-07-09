import type { ReactNode } from "react";
import { requireVisibleDomainsOrRedirect } from "@/lib/auth/require";
import { requireMenuAccess } from "@/lib/nav/require-menu-access";

/**
 * Layout do menu Relatórios.
 *
 * Gate do menu: nível salvo em `menu_access` (tela Configuração).
 * Gate de dados: usuário precisa ter ao menos 1 domínio visível. Manager/viewer
 * sem domínio recebem redirect `?error=no_domains` para `/dashboard`.
 *
 * Para super_admin/admin, `seesAll` garante que sempre passam.
 *
 * O gate granular por relatório (/relatorios/[id]) segue em
 * src/lib/reports/guard.ts via `requireDomainAccess(reportDomain)`.
 *
 * RBAC v2: defesa em profundidade.
 */
export default async function RelatoriosLayout({ children }: { children: ReactNode }) {
  await requireMenuAccess("relatorios");
  await requireVisibleDomainsOrRedirect();
  return <>{children}</>;
}
