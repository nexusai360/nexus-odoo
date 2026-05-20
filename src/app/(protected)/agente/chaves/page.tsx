/**
 * /agente/chaves — Chaves de API do agente.
 *
 * Rework F5-UI: espelha agente-nex/chaves do nexus-insights. CRUD de chaves
 * de API agrupadas por provedor.
 *
 * Gate de role: super_admin (aplicado também no layout do grupo /agente).
 */
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { CredentialsSection } from "@/components/agent/credentials-section";
import { getCurrentUser } from "@/lib/auth";
import { listCredentials } from "@/lib/agent/llm/credentials";

export const metadata = {
  title: "Chaves de API do Agente | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const credentials = await listCredentials().catch(
    () => [] as Awaited<ReturnType<typeof listCredentials>>,
  );

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={KeyRound}
        title="Chaves de API"
        subtitle="Gerencie as chaves de API por provedor de IA."
      />
      <div className="mt-2">
        <CredentialsSection initialCredentials={credentials} />
      </div>
    </PageShell>
  );
}
