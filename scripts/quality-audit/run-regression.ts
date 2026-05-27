#!/usr/bin/env tsx
/**
 * Roda bateria de regressao do agente Nex contra cache real, com rebuild
 * dos containers afetados antes da execucao.
 *
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §6.3
 * Plan: docs/superpowers/plans/2026-05-27-agente-nex-90pct-plan.md Task 5
 *
 * Uso:
 *   pnpm tsx scripts/quality-audit/run-regression.ts --bateria R17
 *   pnpm tsx scripts/quality-audit/run-regression.ts --bateria regression-r11-r16 --skip-build
 *   pnpm tsx scripts/quality-audit/run-regression.ts --containers mcp,app
 *
 * PR1 entrega scaffold; bateria real chega no PR2.
 */

import "dotenv/config";
import { spawnSync } from "child_process";

interface Args {
  bateria: string;
  skipBuild: boolean;
  containers: string[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    bateria: "regression-r11-r16",
    skipBuild: false,
    containers: ["mcp", "app", "worker"],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bateria") args.bateria = argv[++i] ?? args.bateria;
    else if (a === "--skip-build") args.skipBuild = true;
    else if (a === "--containers") {
      args.containers = (argv[++i] ?? "").split(",").filter(Boolean);
    }
  }
  return args;
}

function exec(cmd: string, cmdArgs: string[]): number {
  console.log(`> ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  return r.status ?? 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log(`Bateria: ${args.bateria}`);
  console.log(`Containers: ${args.containers.join(", ")}`);

  if (!args.skipBuild) {
    console.log("\n=== Rebuild de containers ===");
    let code = exec("docker", ["compose", "build", ...args.containers]);
    if (code !== 0) {
      console.error(
        `\nFALHA: docker compose build retornou ${code}. Corrija erros de build antes de rodar regressao.`,
      );
      process.exit(code);
    }
    code = exec("docker", ["compose", "up", "-d", ...args.containers]);
    if (code !== 0) {
      console.error(`\nFALHA: docker compose up retornou ${code}.`);
      process.exit(code);
    }
  } else {
    console.log("(--skip-build informado, pulando rebuild)");
  }

  // PR2+: chamar bateria especifica.
  console.log("\n=== Bateria (a implementar no PR2+) ===");
  console.log(`Bateria '${args.bateria}' ainda nao implementada.`);
  console.log("PR1 = infraestrutura; bateria de regressao real chega no PR2.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
