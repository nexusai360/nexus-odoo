import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { ConexaoEditForm } from "@/components/integracoes/conexao-edit-form";
import { listConnections } from "@/lib/actions/whatsapp-connection";
import { resolveWebhookInboundBase } from "@/lib/mcp-public-url";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Editar conexão | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

/** Edição da Conexão com WhatsApp (as duas pontas numa tela). Só super_admin. */
export default async function EditarConexaoPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/integracoes/webhooks");

  const { connectionId } = await params;
  const [dados, inboundBaseUrl] = await Promise.all([
    listConnections(),
    resolveWebhookInboundBase(),
  ]);
  if (!dados.success) notFound();

  const conexao = dados.data.conexoes.find((c) => c.connectionId === connectionId);
  if (!conexao) notFound();

  // Unicidade em tempo real, excluindo a própria conexão.
  const existingPaths = [
    ...dados.data.conexoes
      .filter((c) => c.connectionId !== connectionId && c.path)
      .map((c) => c.path as string),
    ...dados.data.avulsos
      .filter((w) => w.direction === "inbound" && w.path)
      .map((w) => w.path as string),
  ];
  const existingBusinessIds = dados.data.conexoes
    .filter((c) => c.connectionId !== connectionId && c.businessId)
    .map((c) => c.businessId as string);

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Webhooks", href: "/integracoes/webhooks" },
          { label: conexao.name ?? "Conexão com WhatsApp" },
        ]}
      />
      <PageHeader
        icon={MessageCircle}
        title="Editar conexão"
        subtitle="Nome e descrição valem para a conexão inteira; recebimento e envio têm os próprios campos e tokens."
      />
      <div className="mt-6">
        <ConexaoEditForm
          conexao={conexao}
          inboundBaseUrl={inboundBaseUrl}
          existingPaths={existingPaths}
          existingBusinessIds={existingBusinessIds}
        />
      </div>
    </PageShell>
  );
}
