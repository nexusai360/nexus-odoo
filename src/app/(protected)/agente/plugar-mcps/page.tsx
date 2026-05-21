import { Cable } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { PlugarMcpsContent } from "@/components/agent/plugar-mcps-content";

export const metadata = { title: "Plugar MCPs | Agente Nex | Nexus Odoo" };
export const dynamic = "force-dynamic";

/**
 * Mascara o token: mantém os últimos 4 caracteres visíveis, substitui o resto por "•".
 * O token nunca é exposto ao cliente — só a versão mascarada server-side.
 */
function maskToken(token: string | undefined): string {
  if (!token) return "";
  const visible = token.slice(-4);
  const masked = "•".repeat(Math.min(token.length - 4, 20));
  return `${masked}${visible}`;
}

async function pingMcp(mcpUrl: string): Promise<"ok" | "error" | "unknown"> {
  if (!mcpUrl) return "unknown";
  try {
    const res = await fetch(`${mcpUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export default async function PlugarMcpsPage() {
  const mcpUrl = process.env.MCP_URL ?? "";
  const serviceToken = process.env.MCP_SERVICE_TOKEN;
  const maskedToken = maskToken(serviceToken);

  const healthStatus = await pingMcp(mcpUrl);

  return (
    <PageShell variant="narrow">
      <PageHeader
        icon={Cable}
        title="Plugar MCPs"
        subtitle="Endpoint do servidor MCP semântico e configuração de conexão para agentes externos"
      />

      <div className="mt-6">
        <PlugarMcpsContent
          mcpUrl={mcpUrl}
          maskedToken={maskedToken}
          healthStatus={healthStatus}
        />
      </div>
    </PageShell>
  );
}
