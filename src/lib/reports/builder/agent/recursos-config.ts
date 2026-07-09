// src/lib/reports/builder/agent/recursos-config.ts
// Recursos do agente construtor (F6): raciocinio, audio e anexo. Campos no
// singleton AgentSettings, no padrao dos recursos do Nex, porem com 2 estados
// na UI (OFF/PRODUCTION). PRODUCTION = recurso ligado para o construtor.
import { prisma } from "@/lib/prisma";

export type ConstrutorCheckpoint = "OFF" | "PRODUCTION";

export interface RecursosConstrutor {
  reasoningCheckpoint: ConstrutorCheckpoint;
  reasoningEffort: string | null;
  audioCheckpoint: ConstrutorCheckpoint;
  anexoCheckpoint: ConstrutorCheckpoint;
}

function norm(v: string | null | undefined): ConstrutorCheckpoint {
  return v === "PRODUCTION" ? "PRODUCTION" : "OFF";
}

export async function obterRecursosConstrutor(): Promise<RecursosConstrutor> {
  const s = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: {
      builderReasoningCheckpoint: true,
      builderReasoningEffort: true,
      builderAudioCheckpoint: true,
      builderAnexoCheckpoint: true,
    },
  });
  return {
    reasoningCheckpoint: norm(s?.builderReasoningCheckpoint),
    reasoningEffort: s?.builderReasoningEffort ?? null,
    audioCheckpoint: norm(s?.builderAudioCheckpoint),
    anexoCheckpoint: norm(s?.builderAnexoCheckpoint),
  };
}

export interface PatchRecursosConstrutor {
  reasoningCheckpoint?: ConstrutorCheckpoint;
  reasoningEffort?: string | null;
  audioCheckpoint?: ConstrutorCheckpoint;
  anexoCheckpoint?: ConstrutorCheckpoint;
}

/** Grava (parcialmente) os recursos do construtor no singleton AgentSettings. */
export async function definirRecursosConstrutor(
  patch: PatchRecursosConstrutor,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.reasoningCheckpoint !== undefined)
    data.builderReasoningCheckpoint = patch.reasoningCheckpoint;
  if (patch.reasoningEffort !== undefined)
    data.builderReasoningEffort = patch.reasoningEffort;
  if (patch.audioCheckpoint !== undefined)
    data.builderAudioCheckpoint = patch.audioCheckpoint;
  if (patch.anexoCheckpoint !== undefined)
    data.builderAnexoCheckpoint = patch.anexoCheckpoint;
  if (Object.keys(data).length === 0) return;
  await prisma.agentSettings.upsert({
    where: { id: "global" },
    update: data,
    create: { id: "global", ...data },
  });
}
