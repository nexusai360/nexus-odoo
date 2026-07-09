import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { diretoriaNavFor } from "@/lib/diretoria/access";

export const dynamic = "force-dynamic";

/**
 * Índice do menu Diretoria: redireciona para a primeira área permitida ao
 * usuário (Visão geral por padrão; senão a primeira que ele tiver acesso). Se
 * nenhuma, cai no /dashboard.
 */
export default async function DiretoriaIndex() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nav = await diretoriaNavFor(user);
  redirect(nav[0]?.href ?? "/dashboard");
}
