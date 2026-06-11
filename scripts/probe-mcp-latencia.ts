/**
 * scripts/probe-mcp-latencia.ts
 *
 * Cronometra cada fase de uma sessão MCP interna (connect / listTools /
 * callTool / close) contra o servidor MCP rodando, para localizar onde estão
 * os ~60s escuros do turno (investigação #3 de latência).
 *
 * Uso: tsx --env-file=.env.local scripts/probe-mcp-latencia.ts
 */
import { prisma } from "@/lib/prisma";
import { createMcpSession } from "@/lib/agent/mcp-client";

function ms(t: number): string {
  return `${(performance.now() - t).toFixed(0)}ms`;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { isActive: true, platformRole: { in: ["super_admin", "admin"] } },
    select: { id: true, email: true, platformRole: true },
  });
  if (!user) throw new Error("nenhum user ativo admin/super_admin");
  console.log(`[probe] user=${user.email} role=${user.platformRole} id=${user.id}`);
  console.log(`[probe] MCP_URL=${process.env.MCP_URL}`);

  let t = performance.now();
  const session = await createMcpSession(user.id);
  console.log(`[probe] connect (createMcpSession): ${ms(t)}`);

  t = performance.now();
  const tools = await session.listTools();
  console.log(`[probe] listTools (${tools.length} tools): ${ms(t)}`);

  // Uma tool barata e segura: estado da ingestão / health-ish. Usa a 1ª que existir.
  const alvo =
    tools.find((x) => x.name === "fiscal_faturamento_periodo") ?? tools[0];
  if (alvo) {
    t = performance.now();
    try {
      const r = await session.callTool(alvo.name, { periodo: "mes_corrente" });
      console.log(`[probe] callTool(${alvo.name}): ${ms(t)} (len=${r.length})`);
    } catch (e) {
      console.log(`[probe] callTool(${alvo.name}) ERRO: ${ms(t)} :: ${(e as Error).message}`);
    }
  }

  t = performance.now();
  await session.close();
  console.log(`[probe] close: ${ms(t)}`);

  await prisma.$disconnect();
  console.log(`[probe] FIM`);
  // força saída caso algum handle (SSE) fique pendurado
  setTimeout(() => process.exit(0), 200);
}

main().catch((e) => {
  console.error("[probe] FATAL:", e);
  process.exit(1);
});
