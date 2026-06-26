/**
 * /relatorios-2/paineis , Painéis. Por enquanto em branco: será a tela onde o
 * usuário seleciona qual painel ver (widgets, dashboards montados). O conteúdo
 * (seleção de painel + grade de widgets) entra nas próximas ondas do F6.
 */
import { redirect } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  obterAcessoRelatorios2,
  podeAcessarSubmenu,
} from "@/lib/reports/acesso-relatorios2";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Painéis | Relatórios 2.0" };
export const dynamic = "force-dynamic";

export default async function PaineisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const acesso = await obterAcessoRelatorios2();
  if (!podeAcessarSubmenu(acesso, "paineis", { platformRole: user.platformRole, isOwner: user.isOwner }))
    redirect("/dashboard");

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutGrid}
        title="Painéis"
        subtitle="Selecione um painel para visualizar. Em breve."
      />
      <div className="mt-2 flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground/50 shadow-sm">
          <LayoutGrid className="h-8 w-8" aria-hidden />
        </div>
        <div className="max-w-sm space-y-1">
          <p className="text-sm font-medium text-foreground">Nenhum painel selecionado</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Esta é a tela de painéis. Aqui você vai escolher qual painel ver, com
            os widgets montados. Estamos construindo essa parte.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
