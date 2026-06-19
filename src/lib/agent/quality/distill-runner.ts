/**
 * Runner HOST-SIDE da destilacao de perfil (Onda 2), via Claude Code headless. Espelha o
 * claude-judge-runner.ts. NAO e agendado (rotina DESLIGADA por decisao , escopo "infra agora,
 * destilacao gated em volume"); fica disponivel para disparo manual/futuro.
 *
 * SO funciona em runtime LOCAL (o container nao enxerga o CLI `claude`). Compartilha o conceito
 * de lock in-process do juiz: nunca dois `claude -p` ao mesmo tempo no processo do Next.
 */

import { spawn } from "node:child_process";
import { isLocalRuntime } from "@/lib/env-local";
import { resolveClaudeBin, isJudgeRunning } from "./claude-judge-runner";

export const DISTILL_PROMPT =
  "Destile o PERFIL DE INTERACAO por usuario (Onda 2), host-side. Passos: " +
  "1) `npx tsx --env-file=.env.local scripts/distill-user-profiles.ts --dump` e leia " +
  "/tmp/nex-distill.json + /tmp/nex-distill-instrucoes.txt; " +
  "2) para CADA usuario, seguindo as instrucoes A RISCA (derivado, SEM PII/verbatim, SEM verbos " +
  "de ocultacao, <=900 chars, JSON), escreva o interactionPrompt; " +
  "3) grave /tmp/nex-distill-applied.json [{userId, interactionPrompt, presentationPrefs}] e rode " +
  "`npx tsx --env-file=.env.local scripts/distill-user-profiles.ts --apply`. " +
  "O --apply revalida tudo (anti-PII/ocultacao) e rejeita o que violar. Nao pare ate aplicar.";

let running = false;

export function isDistillRunning(): boolean {
  return running;
}

/** Dispara a destilacao host-side (manual). Retorna {started} = false se nao puder rodar. */
export function runDistillHeadless(): { started: boolean; motivo?: string } {
  if (!isLocalRuntime()) return { started: false, motivo: "nao-local (prod nao tem o CLI claude)" };
  if (running || isJudgeRunning()) return { started: false, motivo: "ja ha um claude rodando" };
  running = true;
  const bin = resolveClaudeBin();
  const child = spawn(bin, ["--dangerously-skip-permissions", "-p", DISTILL_PROMPT], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });
  child.on("exit", () => {
    running = false;
  });
  child.on("error", () => {
    running = false;
  });
  child.unref();
  return { started: true };
}
