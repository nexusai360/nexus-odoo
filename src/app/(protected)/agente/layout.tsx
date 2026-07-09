/**
 * Layout das telas de administração do Agente (/agente/*).
 *
 * Gate: o nível do menu "Agente Nex" configurado em Configuração (padrão
 * super_admin, o mesmo comportamento de antes da feature "Acesso aos menus").
 * Cobre todas as sub-telas (Configuração, Chaves de API, Prompt, Consumo,
 * Playground, Monitoramento, Router, Plugar MCPs). O chat do agente em si é a
 * bubble flutuante, não vive aqui.
 *
 * RBAC v2: defesa em profundidade. A sidebar esconde o grupo de quem não pode
 * ver; aqui bloqueamos o acesso por URL direta.
 */
import { requireMenuAccess } from "@/lib/nav/require-menu-access";

export default async function AgenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMenuAccess("agente");
  return <>{children}</>;
}
