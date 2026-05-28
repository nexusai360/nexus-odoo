import type { ReactNode } from "react";
import { requireVisibleDomainsOrRedirect } from "@/lib/auth/require";

/**
 * Layout do menu Relatórios.
 *
 * Gate: usuário precisa ter ao menos 1 domínio visível. Manager/viewer sem
 * domínio concedido recebem redirect `?error=no_domains` para `/dashboard`,
 * onde o banner explica que o acesso ainda não foi configurado.
 *
 * Para super_admin/admin, `seesAll` garante que sempre passam.
 *
 * O gate granular por relatório (/relatorios/[id]) segue em
 * src/lib/reports/guard.ts via `requireDomainAccess(reportDomain)`.
 *
 * RBAC v2: defesa em profundidade.
 */
export default async function RelatoriosLayout({ children }: { children: ReactNode }) {
  await requireVisibleDomainsOrRedirect();
  return <>{children}</>;
}
