import { Cpu } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { Breadcrumb } from "@/components/integracoes/breadcrumb";
import { ServidorMcpNav } from "@/components/integracoes/servidor-mcp/servidor-mcp-nav";
import { McpVisaoGeral } from "@/components/integracoes/servidor-mcp/visao-geral";
import { getMcp24hMetrics } from "@/lib/actions/mcp-metrics";

export const metadata = { title: "Servidor MCP | Integrações | Nexus Odoo" };
export const dynamic = "force-dynamic";

async function pingMcp(mcpUrl: string): Promise<"healthy" | "degraded" | "unhealthy"> {
  if (!mcpUrl) return "unhealthy";
  try {
    const res = await fetch(`${mcpUrl}/health`, {
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

async function getMcpVersion(mcpUrl: string): Promise<{ version: string; commit: string } | null> {
  if (!mcpUrl) return null;
  try {
    const res = await fetch(`${mcpUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    return {
      version: typeof json.version === "string" ? json.version : "—",
      commit: typeof json.commit === "string" ? (json.commit as string).slice(0, 7) : "—",
    };
  } catch {
    return null;
  }
}

export default async function ServidorMcpPage() {
  const mcpUrl = process.env.MCP_URL ?? "";
  const mcpPublicUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/mcp`;

  const [healthStatus, versionInfo, metricsResult] = await Promise.all([
    pingMcp(mcpUrl),
    getMcpVersion(mcpUrl),
    getMcp24hMetrics(),
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
        subtitle="Endpoint semântico para agentes de IA — RBAC de 7 camadas, Streamable HTTP"
      />

      <ServidorMcpNav />
      <div className="mt-6">
        <McpVisaoGeral
          mcpPublicUrl={mcpPublicUrl}
          healthStatus={healthStatus}
          versionInfo={versionInfo}
          metrics={metrics}
        />
      </div>
    </PageShell>
  );
}
