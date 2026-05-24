/**
 * Sincroniza o prompt-base do Agente Nex do código para o banco.
 *
 * O `composeSystemPrompt` usa `AgentSettings.identityBase`/`guardrails` do banco
 * quando preenchidos; o código (`IDENTITY_BASE`, `DEFAULT_GUARDRAILS`) é só a
 * semente de instalações novas. Para não haver divergência entre o que está no
 * código e o que a plataforma usa, este script grava o valor canônico do código
 * na linha `AgentSettings` (`id="global"`).
 *
 * Uso: `npx tsx scripts/sync-agent-prompt.ts`
 */
import { prisma } from "@/lib/prisma";
import { IDENTITY_BASE } from "@/lib/agent/prompt/identity-base";
import {
  DEFAULT_GUARDRAILS,
  DEFAULT_PERSONALITY,
  DEFAULT_TONE,
} from "@/lib/agent/prompt/defaults";

async function main() {
  const before = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { identityBase: true, guardrails: true },
  });
  if (!before) {
    throw new Error("AgentSettings id='global' não encontrado.");
  }

  const updated = await prisma.agentSettings.update({
    where: { id: "global" },
    data: {
      identityBase: IDENTITY_BASE,
      guardrails: DEFAULT_GUARDRAILS,
      // personality/tone permanecem como estão se já forem os defaults;
      // só repõe se estiverem vazios (instalação não inicializada).
      ...((before as { personality?: string }).personality
        ? {}
        : { personality: DEFAULT_PERSONALITY, tone: DEFAULT_TONE }),
    },
    select: { identityBase: true, guardrails: true },
  });

  console.log("[sync-agent-prompt] concluído.");
  console.log("  identity_base:", updated.identityBase?.length ?? 0, "chars");
  console.log(
    "  guardrails:",
    Array.isArray(updated.guardrails) ? updated.guardrails.length : 0,
    "itens",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[sync-agent-prompt] falhou:", err);
    process.exit(1);
  });
