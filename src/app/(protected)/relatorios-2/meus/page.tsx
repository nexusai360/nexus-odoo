/**
 * /relatorios-2/meus , Meus relatórios (rascunhos que o usuário montou no
 * construtor). Lista os SavedReport visíveis + atalho para o construtor.
 */
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listarMeus } from "@/lib/reports/builder/saved-report-repo";
import {
  obterAcessoRelatorios2,
  podeAcessarSubmenu,
} from "@/lib/reports/acesso-relatorios2";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { RelatoriosMeus, type RelatorioMeuItem } from "../../relatorios/relatorios-meus";

export const metadata = { title: "Meus relatórios | Relatórios 2.0" };
export const dynamic = "force-dynamic";

export default async function MeusRelatoriosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const u = { platformRole: user.platformRole, isOwner: user.isOwner };
  const acesso = await obterAcessoRelatorios2();
  if (!podeAcessarSubmenu(acesso, "meus", u)) redirect("/dashboard");
  // Botao "Novo relatorio" so para quem pode acessar o Construtor.
  const podeConstruir = podeAcessarSubmenu(acesso, "construtor", u);
  const meus = await listarMeus({ userId: user.id, role: user.platformRole }).catch(
    () => [] as Awaited<ReturnType<typeof listarMeus>>,
  );
  const itens: RelatorioMeuItem[] = meus.map((m) => ({
    id: m.id,
    titulo: m.titulo,
    atualizadoEm: m.atualizadoEm.toISOString(),
  }));
  return (
    <PageShell variant="wide">
      <PageHeader
        icon={FileText}
        title="Meus relatórios"
        subtitle="Relatórios que você montou no construtor."
      />
      <RelatoriosMeus itens={itens} podeConstruir={podeConstruir} />
    </PageShell>
  );
}
