import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Layout da rota /integracoes/servidor-mcp.
 * Gate: super_admin — idêntico ao layout pai de Integrações.
 */
export default async function ServidorMcpLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  return <>{children}</>;
}
