/**
 * /agente/inteligencia — painel admin de qualidade do Agente Nex.
 *
 * Gate: super_admin e admin. Server component que busca KPIs + recomendacoes
 * agrupadas + lista de conversas com baixa aderencia. Acoes server (aceitar/
 * rejeitar/precisa-mais-review) via revalidatePath.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §3.7
 */

import { redirect } from "next/navigation";
import { BrainCircuit } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  getQualityKpis,
  getTopRecommendations,
  getLowAdherenceConversations,
} from "@/lib/agent/intelligence/queries";
import { QualityKpisBlock } from "@/components/agent/inteligencia/kpis";
import { RecommendationsTable } from "@/components/agent/inteligencia/recommendations-table";
import { LowAdherenceList } from "@/components/agent/inteligencia/low-adherence";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = { title: "Inteligencia do Agente | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

export default async function InteligenciaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin" && user.platformRole !== "admin") {
    redirect("/dashboard");
  }

  const [kpis, recommendations, lowAdherence] = await Promise.all([
    getQualityKpis(),
    getTopRecommendations(20),
    getLowAdherenceConversations(15),
  ]);

  return (
    <PageShell variant="form">
      <PageHeader
        icon={BrainCircuit}
        title="Inteligencia do Agente Nex"
        subtitle="Qualidade das respostas, padroes de falha e recomendacoes de prompt."
      />

      {kpis.total === 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Ainda nao ha avaliacoes geradas. Rode{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
            pnpm tsx scripts/analyze-conversations.ts --sample 0.05
          </code>{" "}
          para iniciar a analise retrospectiva (gate: ao menos 100 turnos com{" "}
          <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">tool_results</code>{" "}
          gravados).
        </section>
      ) : (
        <QualityKpisBlock kpis={kpis} />
      )}

      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Recomendacoes de prompt
          </h2>
          <p className="text-xs text-zinc-500">
            Agrupadas por similaridade semantica (embeddings 1536-dim).
            Aceitar marca para revisao manual; nenhuma mudanca de prompt e
            automatica.
          </p>
        </header>
        <RecommendationsTable recommendations={recommendations} />
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Conversas com baixa aderencia (≤ 2)
          </h2>
          <p className="text-xs text-zinc-500">
            Turnos que o juiz pontuou com 1 ou 2 em aderencia ao que foi
            perguntado. Util para diagnosticar quebras especificas.
          </p>
        </header>
        <LowAdherenceList rows={lowAdherence} />
      </section>
    </PageShell>
  );
}
