/**
 * /agente , não há tela dedicada do agente. O chat do agente é a bubble
 * flutuante (super_admin + admin). Esta rota apenas redireciona para a
 * primeira sub-tela de administração do agente.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page(): never {
  redirect("/agente/configuracao");
}
