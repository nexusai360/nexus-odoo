/**
 * Layout das telas de administração do Agente (/agente/*).
 *
 * Gate de role: todas as sub-telas do Agente (Configuração, Chaves de API,
 * Prompt, Consumo, Playground, Monitoramento, Router, Plugar MCPs) são
 * exclusivas de super_admin. O chat do agente em si é a bubble flutuante,
 * não vive aqui.
 *
 * RBAC v2: padronizado via `requireMinRole`. Helpers em src/lib/auth/require.ts.
 */
import { requireMinRole } from "@/lib/auth/require";

export default async function AgenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMinRole("super_admin");
  return <>{children}</>;
}
