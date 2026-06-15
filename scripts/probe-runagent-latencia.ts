/**
 * scripts/probe-runagent-latencia.ts
 *
 * Cronometra o run-agent COMPLETO (inclui finally/close) contra a stack real,
 * marcando o tempo de cada AgentEvent e do retorno. Localiza os ~60s escuros.
 *
 * Uso: tsx --env-file=.env.local scripts/probe-runagent-latencia.ts "pergunta"
 */
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent/run-agent";
import { createConversation } from "@/lib/agent/conversation";

const T0 = performance.now();
const at = () => `+${((performance.now() - T0) / 1000).toFixed(2)}s`;

async function main() {
  const pergunta = process.argv[2] ?? "quanto faturamos no mês corrente?";
  const user = await prisma.user.findFirst({
    where: { isActive: true, platformRole: { in: ["super_admin", "admin"] } },
    select: { id: true, email: true },
  });
  if (!user) throw new Error("sem user admin ativo");
  const conv = await createConversation(user.id, "in_app");
  console.log(`[t] ${at()} START user=${user.email} pergunta="${pergunta}"`);

  const result = await runAgent({
    conversationId: conv.id,
    userId: user.id,
    userMessage: pergunta,
    channel: "in_app",
    isPlayground: false,
    source: "bubble",
    onEvent: (evt) => {
      const extra =
        evt.type === "tool_call" || evt.type === "tool_result"
          ? ` ${(evt as { toolName?: string }).toolName ?? ""}`
          : "";
      console.log(`[t] ${at()} event=${evt.type}${extra}`);
    },
  });
  console.log(`[t] ${at()} runAgent RETORNOU ok=${result.ok} len=${result.ok ? result.message?.length : "-"}`);

  await prisma.$disconnect();
  console.log(`[t] ${at()} FIM (apos disconnect)`);
  setTimeout(() => {
    console.log(`[t] ${at()} forçando exit (handles pendurados?)`);
    process.exit(0);
  }, 100);
}

main().catch((e) => {
  console.error(`[t] ${at()} FATAL:`, e);
  process.exit(1);
});
