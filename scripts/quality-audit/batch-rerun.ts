#!/usr/bin/env tsx
/**
 * Batch da PERÍCIA: re-executa TODAS as toolCalls persistidas no dump contra o
 * dado REAL do cache (mesmo handler do agente), gravando o resultado verdadeiro
 * em /tmp/nex-rerun.json. É a base determinística do passo "refaça você mesmo a
 * consulta" do playbook, feito de uma vez para os 128 itens.
 *
 *   npx tsx scripts/quality-audit/batch-rerun.ts
 */
import "./load-env";
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const DUMP_PATH = "/tmp/nex-pendentes.json";
const OUT_PATH = "/tmp/nex-rerun.json";

async function main(): Promise<void> {
  let catalogo: Array<{
    id: string;
    inputSchema: { parse: (x: unknown) => unknown };
    handler: (input: unknown, ctx: unknown) => Promise<unknown>;
  }>;
  let resolveUserContext: (p: typeof prisma, userId: string) => Promise<unknown>;
  ({ catalogo } = (await import("../../mcp/catalog/index.js")) as never);
  ({ resolveUserContext } = (await import(
    "../../mcp/auth/user-context.js"
  )) as never);

  const su = await prisma.user.findFirst({
    where: { platformRole: "super_admin", isActive: true },
    select: { id: true },
  });
  if (!su) throw new Error("nenhum super_admin ativo");
  const user = await resolveUserContext(prisma, su.id);

  const data = JSON.parse(readFileSync(DUMP_PATH, "utf-8")) as Array<{
    id: string;
    toolCalls: Array<{ id?: string; name?: string; arguments?: unknown }>;
  }>;

  const out: Record<
    string,
    Array<{ name: string; args: unknown; ok: boolean; result: unknown }>
  > = {};

  for (const item of data) {
    const reruns: Array<{
      name: string;
      args: unknown;
      ok: boolean;
      result: unknown;
    }> = [];
    for (const tc of item.toolCalls ?? []) {
      const name = tc.name ?? "";
      const args = tc.arguments ?? {};
      const tool = catalogo.find((t) => t.id === name);
      if (!tool) {
        reruns.push({ name, args, ok: false, result: "TOOL_NAO_ENCONTRADA" });
        continue;
      }
      try {
        const input = tool.inputSchema.parse(args);
        const result = await tool.handler(input, { prisma, user });
        reruns.push({ name, args, ok: true, result });
      } catch (err) {
        reruns.push({
          name,
          args,
          ok: false,
          result: `ERRO: ${(err as Error).message}`,
        });
      }
    }
    out[item.id] = reruns;
  }

  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  const total = Object.values(out).reduce((a, r) => a + r.length, 0);
  console.log(`[batch-rerun] ${total} toolCalls re-executadas -> ${OUT_PATH}`);
}

main()
  .catch((e) => {
    console.error("[batch-rerun] ERRO:", e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
