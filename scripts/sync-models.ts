// scripts/sync-models.ts
// Sincroniza o catálogo de modelos LLM consultando a API do provedor.
// Uso:
//   tsx --env-file=.env.local scripts/sync-models.ts --provider openai
//   tsx --env-file=.env.local scripts/sync-models.ts --provider openrouter
//   tsx --env-file=.env.local scripts/sync-models.ts            (todos)
import { prisma } from "../src/lib/prisma";
import { syncProvider } from "../src/lib/agent/llm/sync-catalog";
import { getDecryptedKey } from "../src/lib/agent/llm/credentials";
import type { LlmProvider } from "../src/lib/agent/llm/types";

const ALL_PROVIDERS: LlmProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
];

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--provider="));
  const single = arg ? (arg.split("=")[1] as LlmProvider) : null;
  const flagIdx = process.argv.indexOf("--provider");
  const positional =
    flagIdx > -1 ? (process.argv[flagIdx + 1] as LlmProvider) : null;
  const target = single ?? positional;
  const providers = target ? [target] : ALL_PROVIDERS;

  for (const p of providers) {
    const cred = await prisma.llmCredential.findFirst({
      where: { provider: p },
      orderBy: { createdAt: "asc" },
    });
    if (!cred) {
      console.log(`[sync] ${p}: sem chave de API cadastrada — pulando.`);
      continue;
    }
    const apiKey = await getDecryptedKey(cred.id);
    if (!apiKey) {
      console.log(`[sync] ${p}: falha ao decifrar a chave — pulando.`);
      continue;
    }
    const r = await syncProvider(p, apiKey);
    if (r.erro) console.log(`[sync] ${p}: ERRO — ${r.erro}`);
    else
      console.log(
        `[sync] ${p}: ${r.novos.length} novo(s), ${r.atualizados.length} atualizado(s).`,
      );
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[sync] FALHA:", err);
  process.exit(1);
});
