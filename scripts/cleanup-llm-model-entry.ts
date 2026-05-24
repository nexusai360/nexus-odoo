/**
 * scripts/cleanup-llm-model-entry.ts
 *
 * Classifica cada LlmModelEntry em:
 *   - keep       (valida na whitelist atual; released >= 2024 ou sem data)
 *   - deprecate  (invalida MAS referenciada por LlmConfig/AgentSettings/PlaygroundSession)
 *   - delete     (invalida e sem referencias — remove)
 *
 * Default: --dry-run. Use --apply para executar de verdade.
 */
import { prisma } from "@/lib/prisma";
import { isAllowedByWhitelist } from "@/lib/agent/llm/sync-whitelist";
import type { LlmProvider } from "@/lib/agent/llm/types";

const APPLY = process.argv.includes("--apply");

async function collectReferencedIds(): Promise<Set<string>> {
  const refs = new Set<string>();
  const cfgs = await prisma.llmConfig.findMany({ select: { model: true } });
  for (const c of cfgs) if (c.model) refs.add(c.model);
  const settings = await prisma.agentSettings.findMany({
    select: { audioModel: true, imageModel: true },
  });
  for (const s of settings) {
    if (s.audioModel) refs.add(s.audioModel);
    if (s.imageModel) refs.add(s.imageModel);
  }
  const pls = await prisma.playgroundSession.findMany({ select: { model: true } });
  for (const p of pls) if (p.model) refs.add(p.model);
  return refs;
}

function isInvalid(entry: { id: string; provider: string; released?: string | null; pricingInput?: number | null; pricingOutput?: number | null }): boolean {
  // 1. Whitelist
  if (!isAllowedByWhitelist(entry.provider as LlmProvider, entry.id)) return true;
  // 2. Released < 2024-01 (se conhecido)
  if (entry.released && entry.released < "2024-01") return true;
  // 3. Sem pricing (somente para non-OpenRouter — OpenAI/Anthropic/Gemini sem pricing é "preço sob consulta")
  // Aceitamos pricing=null nas entries de Anthropic/Gemini (curadoria manual depois).
  return false;
}

async function main() {
  console.log(`[cleanup] modo: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  const entries = await prisma.llmModelEntry.findMany();
  const refs = await collectReferencedIds();
  console.log(`[cleanup] ${entries.length} entries totais; ${refs.size} ids referenciados`);

  const toDelete: typeof entries = [];
  const toDeprecate: typeof entries = [];
  const toKeep: typeof entries = [];

  for (const e of entries) {
    if (!isInvalid(e)) {
      toKeep.push(e);
      continue;
    }
    if (refs.has(e.id)) toDeprecate.push(e);
    else toDelete.push(e);
  }

  console.log(`\n[plan] keep=${toKeep.length} deprecate=${toDeprecate.length} delete=${toDelete.length}\n`);
  if (toDeprecate.length) {
    console.log("[deprecate]:");
    for (const e of toDeprecate) console.log(`  - ${e.provider}/${e.id}`);
  }
  if (toDelete.length) {
    console.log("\n[delete]:");
    for (const e of toDelete) console.log(`  - ${e.provider}/${e.id}`);
  }

  if (!APPLY) {
    console.log("\n[cleanup] DRY-RUN. Use --apply para executar.");
    await prisma.$disconnect();
    return;
  }

  if (toDeprecate.length) {
    await prisma.llmModelEntry.updateMany({
      where: { id: { in: toDeprecate.map((e) => e.id) } },
      data: { deprecatedAt: new Date() },
    });
    console.log(`[cleanup] ${toDeprecate.length} marcados como deprecated.`);
  }
  if (toDelete.length) {
    await prisma.llmModelEntry.deleteMany({
      where: { id: { in: toDelete.map((e) => e.id) } },
    });
    console.log(`[cleanup] ${toDelete.length} removidos.`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
