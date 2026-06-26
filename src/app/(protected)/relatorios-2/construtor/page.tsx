/**
 * /relatorios-2/construtor , Construtor de relatórios (F6). Gate admin/super_admin
 * (layout do grupo). Layout split: chat + preview ao vivo.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BuilderWorkspace } from "@/components/reports/builder/builder-workspace";

export const metadata = { title: "Construtor de relatórios | Relatórios 2.0" };
export const dynamic = "force-dynamic";

export default async function ConstrutorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "admin" && user.platformRole !== "super_admin") {
    redirect("/relatorios-2/paineis");
  }
  return <BuilderWorkspace />;
}
