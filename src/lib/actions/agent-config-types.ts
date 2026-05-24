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
  /** @deprecated use suggestionsCheckpoint */
  suggestionsEnabled: boolean;
  /** Checkpoint de 3 estados das sugestões clicáveis (G7). */
  suggestionsCheckpoint: FeatureCheckpoint;
  bubbleEnabled: boolean;
  /** Disponibilidade do Agente Nex no canal WhatsApp (F5). */
  whatsappEnabled: boolean;
  audioCheckpoint: FeatureCheckpoint;
  imageCheckpoint: FeatureCheckpoint;
  kbCheckpoint: FeatureCheckpoint;
  audioProvider: string | null;
  audioModel: string | null;
  /** Credencial (chave de API) usada pelo modelo dedicado de áudio (G6). */
  audioCredentialId: string | null;
  imageProvider: string | null;
  imageModel: string | null;
  /** Credencial (chave de API) usada pelo modelo dedicado de imagem (G6). */
  imageCredentialId: string | null;
  /** Profundidade de raciocínio dos modelos reasoning (null = default do provider). */
  reasoningEffort: string | null;
  /** Checkpoint de 3 estados do modo raciocínio (OFF/PLAYGROUND/PRODUCTION). */
  reasoningCheckpoint: FeatureCheckpoint;
  /** Máximo de sugestões clicáveis (default 3, hard cap em 5). */
  maxSuggestions: number;
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
  /** true se sugestões clicáveis estão ativas em produção (G7). */
  suggestionsEnabled: boolean;
  /** true se sugestões clicáveis aparecem ao menos no playground (G7). */
  suggestionsInPlayground: boolean;
  bubbleEnabled: boolean;
  whatsappEnabled: boolean;
  /** Máximo de sugestões clicáveis na bubble. Vale tanto para as iniciais
   *  (welcome) quanto para as de continuidade no fim de cada resposta.
   *  Default 3, hard cap em 5. */
  maxSuggestions: number;
}
