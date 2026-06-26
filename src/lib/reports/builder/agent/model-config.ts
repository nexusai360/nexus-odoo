// src/lib/reports/builder/agent/model-config.ts
// E1a , Config de modelo do agente construtor (F6). NAO e um modelo Prisma
// proprio: sao apenas dois campos no singleton AgentSettings
// (builderModelProvider/builderModelId), no padrao dos campos de audio/imagem.
// A tela e a action vivem em agente/configuracao (card), nao numa tela propria.
import { prisma } from "@/lib/prisma";

/** Default no codigo quando o singleton ainda nao tem config gravada. */
export const DEFAULT_BUILDER_PROVIDER = "openai";
export const DEFAULT_BUILDER_MODEL = "gpt-5-mini";

export interface ConfigModeloConstrutor {
  provider: string;
  model: string;
}

/**
 * Le a config de modelo do construtor do singleton AgentSettings.
 * Cai no default (openai/gpt-5-mini) quando vazio.
 */
export async function obterConfigModeloConstrutor(): Promise<ConfigModeloConstrutor> {
  const settings = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { builderModelProvider: true, builderModelId: true },
  });
  return {
    provider: settings?.builderModelProvider || DEFAULT_BUILDER_PROVIDER,
    model: settings?.builderModelId || DEFAULT_BUILDER_MODEL,
  };
}

/** Grava provider+model do construtor no singleton AgentSettings. */
export async function definirConfigModeloConstrutor(
  config: ConfigModeloConstrutor,
): Promise<void> {
  await prisma.agentSettings.upsert({
    where: { id: "global" },
    update: {
      builderModelProvider: config.provider,
      builderModelId: config.model,
    },
    create: {
      id: "global",
      builderModelProvider: config.provider,
      builderModelId: config.model,
    },
  });
}
