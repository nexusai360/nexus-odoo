/**
 * Layout do menu "Relatórios 2.0" (F6). Gate dinâmico: respeita o nível de
 * acesso do MENU configurado em Configuração (off = só o super_admin dono).
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { obterAcessoRelatorios2, podeAcessar } from "@/lib/reports/acesso-relatorios2";

export default async function Relatorios2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const acesso = await obterAcessoRelatorios2();
  if (!podeAcessar(acesso.menu, { platformRole: user.platformRole, isOwner: user.isOwner })) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
