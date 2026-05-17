import { redirect } from "next/navigation";
import { getMyDomains } from "@/lib/actions/domain-access";
import type { ReportDomainId } from "@/lib/reports/domains";

/**
 * Camada 2 do RBAC: bloqueia a página de relatório se o usuário logado
 * não tem o domínio. Chamada no server component da página.
 */
export async function requireDomainAccess(
  domain: ReportDomainId,
): Promise<void> {
  const mine = await getMyDomains();
  if (!mine.includes(domain)) {
    redirect("/relatorios");
  }
}
