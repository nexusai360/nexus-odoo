/**
 * /agente/qualidade , dashboard interno de qualidade do Agente Nex.
 *
 * Gate: super_admin (layout do grupo /agente).
 * Server Component: busca a data minima (1ª eval registrada) e passa pro
 * client. Toda interatividade vive no QualidadeContent.
 *
 * Spec: docs/superpowers/specs/2026-05-26-agente-qualidade-design.md
 */

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { QualidadeContent } from "@/components/agent/qualidade/qualidade-content";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Qualidade do Agente | Matrix Fitness Group" };
export const dynamic = "force-dynamic";

async function getFirstEvalDate(): Promise<Date> {
  const first = await prisma.conversationQualityEvaluation.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (first?.createdAt) return first.createdAt;
  // Fallback: 90 dias atrás.
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d;
}

export default async function QualidadePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const minDate = await getFirstEvalDate();

  return (
    <PageShell variant="form">
      <PageHeader
        icon={ShieldCheck}
        title="Qualidade do Agente Nex"
        subtitle="Desempenho semântico das respostas por modelo e período. Avaliação on-demand via Claude Code."
      />
      <QualidadeContent minDate={minDate.toISOString()} />
    </PageShell>
  );
}
