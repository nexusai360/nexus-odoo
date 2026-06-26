/**
 * Layout do menu "Relatórios 2.0" (F6) , área nova: painéis, meus relatórios e
 * o construtor. Gate: admin ou super_admin (área administrativa em construção).
 */
import { requireMinRole } from "@/lib/auth/require";

export default async function Relatorios2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMinRole("admin");
  return <>{children}</>;
}
