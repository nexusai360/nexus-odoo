import { BarChart3, Construction } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";

export const metadata = { title: "BI | Integrações | Nexus Odoo" };

export default function BiPage() {
  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "BI" },
        ]}
      />
      <PageHeader
        icon={BarChart3}
        title="Business Intelligence"
        subtitle="Conectores para ferramentas de BI externas"
      />

      <div className="mt-12 flex flex-col items-center gap-4 text-center max-w-md mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
          <Construction className="h-8 w-8 text-violet-500" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Em construção</p>
          <p className="text-sm text-muted-foreground">
            Os conectores de BI — Power BI, Metabase e outros — serão disponibilizados
            em breve. Quando estiverem prontos, você poderá configurá-los aqui e
            conceder acesso read-only ao cache de dados do Nexus Odoo.
          </p>
        </div>
        <span className="text-xs font-medium px-3 py-1 rounded-full border border-border text-muted-foreground">
          Previsto para F6
        </span>
      </div>
    </PageShell>
  );
}
