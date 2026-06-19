/**
 * scripts/distill-user-profiles.ts , IO da destilacao de perfil (Onda 2, HOST-SIDE).
 *
 * NAO roda em producao sozinho (igual ao juiz: o container nao tem o CLI `claude`). E disparado
 * na MANUTENCAO, host-side. Fluxo:
 *   --dump  : seleciona usuarios elegiveis (selectEligible), monta o dump por usuario em
 *             /tmp/nex-distill.json e escreve as instrucoes em /tmp/nex-distill-instrucoes.txt.
 *   (entre os dois, o Claude headless le o dump+instrucoes e escreve /tmp/nex-distill-applied.json
 *    com [{userId, interactionPrompt, presentationPrefs}])
 *   --apply : para cada item, RECARREGA do banco as mensagens originais do usuario (anti-verbatim),
 *             roda parseDistilled e, se passar, applyDistilled. Loga aceitos/rejeitados.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/distill-user-profiles.ts --dump
 *   npx tsx --env-file=.env.local scripts/distill-user-profiles.ts --apply
 */
import { writeFileSync, readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { selectEligible, type CandidateStat } from "@/lib/agent/user-profile/candidates";
import { buildDistillInstrucoes, montarDumpUsuario } from "@/lib/agent/user-profile/distill-prompt";
import { parseDistilled } from "@/lib/agent/user-profile/distill-parse";
import { applyDistilled } from "@/lib/agent/user-profile/store";

const DUMP_PATH = "/tmp/nex-distill.json";
const INSTR_PATH = "/tmp/nex-distill-instrucoes.txt";
const APPLIED_PATH = "/tmp/nex-distill-applied.json";

function toMs(v: unknown): number {
  const n = Number(v as number);
  return Number.isFinite(n) ? n : 0;
}

async function candidatos(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<
    { userId: string; conversations: number; messages: number; lastMessageMs: unknown; profileBuiltMs: unknown }[]
  >(`
    SELECT c.user_id AS "userId", COUNT(DISTINCT c.id)::int AS "conversations", COUNT(m.id)::int AS "messages",
           EXTRACT(EPOCH FROM MAX(m.created_at)) * 1000 AS "lastMessageMs",
           EXTRACT(EPOCH FROM uap.profile_applied_at) * 1000 AS "profileBuiltMs"
    FROM conversations c JOIN messages m ON m.conversation_id = c.id
    LEFT JOIN user_agent_profiles uap ON uap.user_id = c.user_id
    WHERE c.user_id IS NOT NULL GROUP BY c.user_id, uap.profile_applied_at
  `);
  return selectEligible(
    rows.map((r) => ({
      userId: r.userId,
      conversations: Number(r.conversations),
      messages: Number(r.messages),
      lastMessageMs: toMs(r.lastMessageMs),
      profileBuiltMs: r.profileBuiltMs == null ? null : toMs(r.profileBuiltMs),
    })) as CandidateStat[],
  );
}

async function mensagensUsuario(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ content: string }[]>(
    `
    SELECT m.content AS "content" FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1::uuid AND m.role::text = 'user' AND m.content <> ''
    ORDER BY m.created_at DESC LIMIT 500
    `,
    userId,
  );
  return rows.map((r) => r.content);
}

async function dump() {
  const ids = await candidatos();
  const dumps = [];
  for (const userId of ids) {
    const msgs = await prisma.$queryRawUnsafe<{ role: string; content: string }[]>(
      `
      SELECT m.role::text AS "role", m.content AS "content" FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1::uuid AND m.content <> '' ORDER BY m.created_at ASC LIMIT 200
      `,
      userId,
    );
    const conversas: { pergunta: string; resposta: string }[] = [];
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].role === "user" && msgs[i + 1].role === "assistant") {
        conversas.push({ pergunta: msgs[i].content, resposta: msgs[i + 1].content });
      }
    }
    dumps.push(montarDumpUsuario({ userId, conversas, avaliacoes: [] }));
  }
  writeFileSync(DUMP_PATH, JSON.stringify(dumps, null, 2));
  writeFileSync(INSTR_PATH, buildDistillInstrucoes());
  console.log(`[distill] ${dumps.length} usuarios elegiveis -> ${DUMP_PATH}`);
  console.log(`[distill] instrucoes -> ${INSTR_PATH}`);
}

async function apply() {
  const items = JSON.parse(readFileSync(APPLIED_PATH, "utf8")) as {
    userId: string;
    interactionPrompt?: string;
    presentationPrefs?: unknown;
  }[];
  let aceitos = 0;
  let rejeitados = 0;
  for (const item of items) {
    const originais = await mensagensUsuario(item.userId); // B4: anti-verbatim precisa das originais
    if (originais.length === 0) {
      console.warn(`[distill] ${item.userId}: sem mensagens originais , REJEITADO (fail-closed)`);
      rejeitados++;
      continue;
    }
    const r = parseDistilled(JSON.stringify(item), originais);
    if (!r.ok) {
      console.warn(`[distill] ${item.userId}: REJEITADO , ${r.motivo}`);
      rejeitados++;
      continue;
    }
    await applyDistilled(item.userId, { interactionPrompt: r.value.interactionPrompt });
    aceitos++;
    console.log(`[distill] ${item.userId}: aplicado (${r.value.interactionPrompt.length} chars)`);
  }
  console.log(`[distill] aplicados=${aceitos} rejeitados=${rejeitados}`);
}

async function main() {
  const mode = process.argv[2];
  if (mode === "--dump") await dump();
  else if (mode === "--apply") await apply();
  else {
    console.error("uso: --dump | --apply");
    process.exit(1);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
