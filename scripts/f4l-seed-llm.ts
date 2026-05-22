// scripts/f4l-seed-llm.ts
// Semeia a credencial OpenAI cifrada e a LlmConfig ativa (modelo gpt-5.4-nano)
// para a fase L3 (validação do agente Nex). Idempotente.
// Uso: tsx --env-file=.env.local scripts/f4l-seed-llm.ts
import { prisma } from "../src/lib/prisma";
import { createCredential } from "../src/lib/agent/llm/credentials";

const MODELO_L3 = "gpt-5.4-nano";

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente — definir no .env.local");

  let credId: string;
  const existente = await prisma.llmCredential.findFirst({ where: { provider: "openai" } });
  if (existente) {
    credId = existente.id;
    console.log(`[seed-llm] credencial openai ja existe: ${credId}`);
  } else {
    const c = await createCredential({ provider: "openai", label: "L3 Teste OpenAI", apiKey });
    credId = c.id;
    console.log(`[seed-llm] credencial criada: ${credId} (last4 ${c.last4})`);
  }

  // Uma config ativa só: zera as demais e ativa a do gpt-5.4-nano.
  await prisma.llmConfig.updateMany({ data: { isActive: false } });
  const cfgExistente = await prisma.llmConfig.findFirst({
    where: { provider: "openai", model: MODELO_L3 },
  });
  if (cfgExistente) {
    await prisma.llmConfig.update({
      where: { id: cfgExistente.id },
      data: { isActive: true, credentialId: credId },
    });
    console.log(`[seed-llm] config ${MODELO_L3} reativada (${cfgExistente.id})`);
  } else {
    const cfg = await prisma.llmConfig.create({
      data: { provider: "openai", model: MODELO_L3, credentialId: credId, isActive: true },
    });
    console.log(`[seed-llm] config criada: ${cfg.id} (${MODELO_L3})`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed-llm] FALHA:", err);
  process.exit(1);
});
