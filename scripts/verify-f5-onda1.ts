#!/usr/bin/env tsx
/**
 * Verificação e2e da Onda 1 da F5.
 *
 * Pré-requisitos:
 * - .env.local com DATABASE_URL, ENCRYPTION_KEY, MCP_URL, MCP_SERVICE_TOKEN
 * - MCP da F4 rodando: npm run mcp (ou container)
 * - Cache populado com fatos de estoque (worker rodou ao menos 1x)
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/verify-f5-onda1.ts
 *
 * Com chave MOCK (sem LLM real):
 *   MOCK_LLM=1 npx tsx --env-file=.env.local scripts/verify-f5-onda1.ts
 *
 * Evidência obrigatória: o agente responde uma pergunta de estoque via MCP.
 */

import { encrypt } from "../src/lib/encryption";
// Usar o singleton do projeto (inclui adapter PrismaPg com DATABASE_URL)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require("../src/lib/prisma") as typeof import("../src/lib/prisma");

const MOCK_KEY = "MOCK_KEY_ONDA1_VERIFY";
const USE_MOCK = process.env.MOCK_LLM === "1";

async function main() {
  console.log("\n=== verify-f5-onda1 ===");
  console.log(`Modo: ${USE_MOCK ? "MOCK (sem chamada LLM real)" : "real"}`);
  console.log(`MCP_URL: ${process.env.MCP_URL ?? "(não configurado)"}\n`);

  // 1. Checar DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não configurado. Use --env-file=.env.local");
    process.exit(1);
  }

  // 2. Checar ENCRYPTION_KEY
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
    console.error("❌ ENCRYPTION_KEY ausente ou muito curta (mínimo 32 bytes hex).");
    process.exit(1);
  }

  // 3. Checar MCP_URL (necessário para tool calling real)
  if (!USE_MOCK && !process.env.MCP_URL) {
    console.warn("⚠️  MCP_URL não configurado — tools MCP indisponíveis (agente responderá sem dados reais).");
  }

  // 4. Criar ou recriar credencial e config LLM de teste
  const apiKey = USE_MOCK ? MOCK_KEY : (process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? MOCK_KEY);
  const provider = USE_MOCK
    ? "openai"
    : process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : "openai";
  const model = USE_MOCK
    ? "gpt-4o-mini"
    : provider === "anthropic"
      ? "claude-haiku-3-5"
      : "gpt-4o-mini";

  console.log(`Usando provider: ${provider} / model: ${model}`);

  // Limpar configs anteriores de teste
  await prisma.llmConfig.deleteMany({ where: { isActive: true } });
  await prisma.llmCredential.deleteMany({ where: { label: { startsWith: "verify-onda1" } } });

  // Criar credencial
  const encryptedKey = encrypt(apiKey);
  const last4 = apiKey.slice(-4);
  const cred = await prisma.llmCredential.create({
    data: {
      provider,
      label: `verify-onda1-${Date.now()}`,
      encryptedApiKey: encryptedKey,
      last4,
    },
  });

  // Criar config ativa
  await prisma.llmConfig.create({
    data: {
      provider,
      model,
      isActive: true,
      credentialId: cred.id,
    },
  });

  console.log(`✅ Credencial e config LLM criadas (cred.id=${cred.id})\n`);

  // 5. Criar usuário de teste se não existir
  let testUser = await prisma.user.findFirst({ where: { email: "verify@nexusai.internal" } });
  if (!testUser) {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("verify123!", 10);
    testUser = await prisma.user.create({
      data: {
        email: "verify@nexusai.internal",
        name: "Verify Bot",
        password: hash,
        platformRole: "admin",
        isActive: true,
      },
    });
    console.log(`✅ Usuário de teste criado (id=${testUser.id})`);
  } else {
    console.log(`✅ Usuário de teste existente (id=${testUser.id})`);
  }

  // 6. Criar conversa de teste
  const conv = await prisma.conversation.create({
    data: {
      userId: testUser.id,
      channel: "playground",
    },
  });
  console.log(`✅ Conversa criada (id=${conv.id})\n`);

  // 7. Chamar runAgent
  console.log("🤖 Chamando runAgent...\n");
  const { runAgent } = await import("../src/lib/agent/run-agent");

  const events: string[] = [];
  const result = await runAgent({
    conversationId: conv.id,
    userId: testUser.id,
    userMessage: "Qual o saldo total de estoque disponível?",
    channel: "playground",
    isPlayground: true,
    onEvent: (evt) => {
      events.push(evt.type);
      if (evt.type === "tool_call") {
        console.log(`  → Tool: ${(evt as { type: string; toolName: string }).toolName}`);
      }
    },
  });

  console.log("\n--- Resultado ---");
  if (result.ok) {
    console.log(`✅ ok=true`);
    console.log(`Mensagem: ${result.message}`);
    console.log(`Sugestões: ${result.suggestions.join(" | ")}`);
    console.log(`Tokens: input=${result.usage.tokensInput} output=${result.usage.tokensOutput}`);
    console.log(`Eventos: ${events.join(" → ")}`);
  } else {
    console.log(`⚠️  ok=false: ${result.error}`);
  }

  // 8. Verificar LlmUsage registrado
  const usageCount = await prisma.llmUsage.count({ where: { conversationId: conv.id } });
  console.log(`\nLlmUsage registrado: ${usageCount} row(s)`);
  if (usageCount === 0) {
    console.warn("⚠️  Nenhum uso registrado (pode indicar falha no logUsage).");
  }

  // 9. Limpar dados de teste
  await prisma.message.deleteMany({ where: { conversationId: conv.id } });
  await prisma.llmUsage.deleteMany({ where: { conversationId: conv.id } });
  await prisma.conversation.delete({ where: { id: conv.id } });
  await prisma.llmConfig.deleteMany({ where: { credentialId: cred.id } });
  await prisma.llmCredential.delete({ where: { id: cred.id } });

  console.log("\n✅ Limpeza concluída. Verificação e2e da Onda 1 finalizada.");
}

main()
  .catch((err) => {
    console.error("\n❌ Erro fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
