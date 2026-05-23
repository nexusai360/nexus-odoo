/**
 * /agente/prompt — Prompt do agente: identidade, comportamento e base de
 * conhecimento.
 *
 * Rework F5-UI: a seção "Recursos" (entrada de áudio/anexo, sugestões, modo
 * raciocínio) saiu desta tela para a tela "Configuração" — recursos são
 * configuração, não prompt.
 *
 * Gate de role: super_admin (aplicado também no layout do grupo /agente).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, FlaskConical } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PromptConfigForm } from "@/components/agent/prompt-config-form";
import { IdentityBaseEditor } from "@/components/agent/identity-base-editor";
import { KbSection } from "@/components/agent/kb-section";
import { getCurrentUser } from "@/lib/auth";
import { getAgentSettings } from "@/lib/actions/agent-config";
import { listKbDocumentsAction } from "@/lib/actions/kb";
import type { KbDocSummary } from "@/components/agent/kb-section";

export const metadata = {
  title: "Prompt do Agente | Matrix Fitness Group",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [settingsResult, kbResult] = await Promise.all([
    getAgentSettings(),
    listKbDocumentsAction(),
  ]);

  const settings = settingsResult.success ? settingsResult.data : null;
  const kbDocs: KbDocSummary[] = kbResult.ok ? kbResult.data : [];

  const initialSettings = {
    personality: settings?.personality ?? "",
    tone: settings?.tone ?? "",
    guardrails: (settings?.guardrails as string[]) ?? [],
    advancedOverride: settings?.advancedOverride ?? null,
    terminology: (settings?.terminology as Record<string, string>) ?? {},
    identityBase: settings?.identityBase ?? null,
    suggestionsEnabled: settings?.suggestionsEnabled ?? true,
  };

  return (
    <PageShell variant="agent">
      <PageHeader
        icon={BookOpen}
        title="Prompt do Agente Nex"
        subtitle="Identidade, comportamento e base de conhecimento."
        actions={
          <Link
            href="/agente/playground"
            className={buttonVariants({
              className: "cursor-pointer min-h-[44px]",
            })}
          >
            <FlaskConical className="h-4 w-4 mr-1.5" />
            Abrir playground
          </Link>
        }
      />

      <div className="space-y-8">
        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader className="pb-3">
            <CardTitle>Identidade base</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <IdentityBaseEditor initial={initialSettings} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader className="pb-3">
            <CardTitle>Comportamento</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <PromptConfigForm initial={initialSettings} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border bg-muted/30 p-2">
          <CardHeader className="pb-3">
            <CardTitle>Base de conhecimento</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <KbSection initial={kbDocs} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
