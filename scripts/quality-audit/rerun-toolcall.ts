#!/usr/bin/env tsx
/**
 * Re-executa uma tool do MCP (o MESMO handler que o agente usa) contra o dado
 * REAL do cache, para a PERÍCIA conferir a verdade por conta própria. É a base
 * determinística do passo "refaça você mesmo a mesma requisição" do playbook.
 *
 * Uso:
 *   npx tsx scripts/quality-audit/rerun-toolcall.ts --name <toolId> --args '<json>'
 *
 * Roda com contexto de um super_admin (acesso de leitura total). Se a tool não
 * existir ou o import falhar, a perícia cai no fallback do playbook (consultar a
 * camada de queries / SQL direto).
 */
import "./load-env";
import { prisma } from "@/lib/prisma";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const name = arg("--name");
  const argsRaw = arg("--args") ?? "{}";
  if (!name) {
    console.error("uso: --name <toolId> [--args '<json>']");
    process.exit(1);
  }

  // Import dinâmico (isola erro de resolução do pacote mcp num fallback claro).
  let catalogo: Array<{
    id: string;
    inputSchema: { parse: (x: unknown) => unknown };
    handler: (input: unknown, ctx: unknown) => Promise<unknown>;
  }>;
  let resolveUserContext: (
    p: typeof prisma,
    userId: string,
  ) => Promise<unknown>;
  try {
    ({ catalogo } = (await import("../../mcp/catalog/index.js")) as never);
    ({ resolveUserContext } = (await import(
      "../../mcp/auth/user-context.js"
    )) as never);
  } catch (err) {
    console.error(
      "[rerun-toolcall] nao consegui importar o catalogo do MCP:",
      (err as Error).message,
      "\nFallback: consulte a camada src/lib/reports/queries ou SQL direto.",
    );
    process.exit(2);
  }

  const su = await prisma.user.findFirst({
    where: { platformRole: "super_admin", isActive: true },
    select: { id: true },
  });
  if (!su) {
    console.error("[rerun-toolcall] nenhum super_admin ativo no banco.");
    process.exit(1);
  }
  const user = await resolveUserContext(prisma, su.id);
  if (!user) {
    console.error("[rerun-toolcall] falha ao resolver contexto do usuario.");
    process.exit(1);
  }

  const tool = catalogo.find((t) => t.id === name);
  if (!tool) {
    console.error(
      `[rerun-toolcall] tool '${name}' nao encontrada no catalogo.`,
    );
    process.exit(1);
  }

  const input = tool.inputSchema.parse(JSON.parse(argsRaw));
  const out = await tool.handler(input, { prisma, user });
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error("[rerun-toolcall] ERRO:", e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
