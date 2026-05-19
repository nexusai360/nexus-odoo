/**
 * Tipos e constantes compartilhados das Server Actions de configuração do
 * agente. Separado de agent-config.ts porque arquivos "use server" só podem
 * exportar funções async.
 */

/** Os 3 estados de checkpoint de um recurso (espelha o enum Prisma). */
export const CHECKPOINT_VALUES = ["OFF", "PLAYGROUND", "PRODUCTION"] as const;
export type FeatureCheckpoint = (typeof CHECKPOINT_VALUES)[number];

export interface AgentSettingsData {
  id: string;
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
  terminology: Record<string, string>;
  advancedOverride: string | null;
  suggestionsEnabled: boolean;
  bubbleEnabled: boolean;
  audioCheckpoint: FeatureCheckpoint;
  imageCheckpoint: FeatureCheckpoint;
  kbCheckpoint: FeatureCheckpoint;
  audioProvider: string | null;
  audioModel: string | null;
  imageProvider: string | null;
  imageModel: string | null;
  updatedAt: Date;
}

export interface PublicAgentFlags {
  /** true se o áudio está ativo em produção (checkpoint PRODUCTION). */
  audioInputEnabled: boolean;
  /** true se o áudio está disponível no playground (PLAYGROUND ou PRODUCTION). */
  audioInPlayground: boolean;
  /** true se a entrada de imagem está ativa em produção. */
  imageInputEnabled: boolean;
  imageInPlayground: boolean;
  /** true se a base de conhecimento está ativa em produção. */
  kbEnabled: boolean;
  kbInPlayground: boolean;
  suggestionsEnabled: boolean;
  bubbleEnabled: boolean;
}
