import { Cpu } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { ServidorMcpNav } from "@/components/integracoes/servidor-mcp/servidor-mcp-nav";
import { McpVisaoGeral } from "@/components/integracoes/servidor-mcp/visao-geral";
import { TourTriggerButton } from "@/components/tour/tour-trigger-button";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { servidorMcpTour } from "@/lib/tours/servidor-mcp-tour";
import { getMcp24hMetrics } from "@/lib/actions/mcp-metrics";
import { resolveMcpPublicUrl } from "@/lib/mcp-public-url";

export const metadata = { title: "Servidor MCP | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

/**
 * Resolve a URL de health do servidor MCP. `MCP_URL` aponta para o endpoint MCP
 * e pode incluir o path `/mcp` (ex.: `http://mcp:3001/mcp`); o health é servido
 * na raiz do servidor (`/health`). Concatenar `${MCP_URL}/health` ingenuamente
 * gerava `/mcp/health` — rota inexistente — e fazia o painel reportar o servidor
 * como inacessível mesmo no ar. Aqui extraímos a origem e apontamos para `/health`.
 */
function resolveHealthUrl(mcpUrl: string): string | null {
  if (!mcpUrl) return null;
  try {
    const u = new URL(mcpUrl);
    return `${u.protocol}//${u.host}/health`;
  } catch {
    return null;
  }
}

async function pingMcp(mcpUrl: string): Promise<"healthy" | "degraded" | "unhealthy"> {
  const healthUrl = resolveHealthUrl(mcpUrl);
  if (!healthUrl) return "unhealthy";
  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return "degraded";
    const json = (await res.json()) as Record<string, unknown>;
    // Se o health responde mas indica degraded explicitamente
    if (json.status === "degraded") return "degraded";
    return "healthy";
  } catch {
    return "unhealthy";
  }
}

export default async function ServidorMcpPage() {
  const mcpUrl = process.env.MCP_URL ?? "";

  const [healthStatus, metricsResult, mcpPublicUrl] = await Promise.all([
    pingMcp(mcpUrl),
    getMcp24hMetrics(),
    resolveMcpPublicUrl(),
  ]);

  const metrics = metricsResult.success ? metricsResult.data : null;

  return (
    <PageShell variant="narrow">
      <Breadcrumb
        items={[
          { label: "Integrações", href: "/integracoes" },
          { label: "Servidor MCP" },
        ]}
      />
      <PageHeader
        icon={Cpu}
        title="Servidor MCP"
        subtitle="Endpoint semântico para agentes de IA, RBAC de 7 camadas, Streamable HTTP"
        actions={<TourTriggerButton config={servidorMcpTour} />}
      />
      <TourAutoStart tour={servidorMcpTour} />

      <ServidorMcpNav />
      <div className="mt-6">
        <McpVisaoGeral
          mcpPublicUrl={mcpPublicUrl}
          healthStatus={healthStatus}
          metrics={metrics}
        />
      </div>
    </PageShell>
  );
}
