/**
 * /agente/consumo — Tela de consumo de tokens e custo de LLM.
 *
 * Gate: super_admin | admin (consumo é informação sensível de custo — SPEC §8.2).
 * Server Component: busca a data mínima de uso e passa para o Client.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFirstUsageDate } from "@/lib/agent/llm/usage-stats";
import { ConsumoContent } from "@/components/agent/consumo/consumo-content";

export const metadata = { title: "Consumo de LLM | Nexus Odoo" };

export default async function ConsumoPage() {
  const user = await getCurrentUser();
  if (!user || (user.platformRole !== "super_admin" && user.platformRole !== "admin")) {
    redirect("/dashboard");
  }

  const minDate = await getFirstUsageDate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consumo de LLM</h1>
        <p className="text-sm text-muted-foreground">
          Custo e uso de tokens por modelo, provider e período.
        </p>
      </div>
      <ConsumoContent minDate={minDate.toISOString()} />
    </div>
  );
}
