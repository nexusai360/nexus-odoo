import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
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

/**
 * Camada 3 do RBAC: guard das queries de leitura, parametrizado pelo
 * domínio do relatório (não mais hardcoded em "estoque"). Exige auth e
 * posse do domínio; lança erro caso contrário. Defesa-em-profundidade da
 * spec §4.2 — vale para qualquer domínio futuro (CR-03).
 */
export async function guardDominio(dominio: ReportDomainId): Promise<void> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Não autenticado");
  const mine = await getMyDomains();
  if (!mine.includes(dominio)) throw new Error("Sem acesso ao domínio");
}
