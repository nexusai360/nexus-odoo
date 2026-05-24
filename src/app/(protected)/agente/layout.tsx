/**
 * Layout das telas de administração do Agente (/agente/*).
 *
 * Gate de role: todas as sub-telas do Agente (Configuração, Chaves de API,
 * Prompt, Consumo, Playground) são exclusivas de super_admin. O chat do agente
 * em si é a bubble flutuante , não vive aqui.
 */
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function AgenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  return <>{children}</>;
}
