import { headers } from "next/headers";

/**
 * Resolve a URL pública completa do endpoint MCP (`.../api/mcp`).
 *
 * Usa `NEXT_PUBLIC_APP_URL` quando definida; senão deriva do host da request.
 * Server-side apenas. Compartilhada entre a Visão Geral e a Documentação para
 * a URL exibida ser idêntica e real nas duas telas.
 */
export async function resolveMcpPublicUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.length > 0) {
    return `${envUrl.replace(/\/+$/, "")}/api/mcp`;
  }
  try {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto}://${host}/api/mcp`;
  } catch {
    // headers() indisponível fora de uma request; cai no fallback.
  }
  return "/api/mcp";
}
