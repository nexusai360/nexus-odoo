import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";

/**
 * Layout do menu Integrações.
 * Gate: apenas super_admin tem acesso. Qualquer outro papel é redirecionado.
 */
export default async function IntegracoesLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  return <>{children}</>;
}
