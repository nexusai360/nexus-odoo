import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Layout da rota /agente/plugar-mcps. Gate super_admin, igual ao layout do
 * painel Servidor MCP. As abas (Visao Geral, Servidores, Logs) sao rotas
 * filhas, cada uma com seu proprio cabecalho e o `PlugarMcpsNav`.
 */
export default async function PlugarMcpsLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  return <>{children}</>;
}
