/**
 * Tipos compartilhados das Server Actions de sessão de playground.
 * Separado de playground.ts porque arquivos "use server" só exportam funções.
 *
 * Bloco 6 , F5 UI rework v2.
 */

/** Snapshot editável do prompt de uma sessão de playground (sem KB). */
export interface PlaygroundPromptSnapshot {
  identityBase: string | null;
  personality: string;
  tone: string;
  guardrails: string[];
}

/** Resumo de uma sessão de playground (item da sidebar de histórico). */
export interface PlaygroundSessionSummary {
  id: string;
  title: string | null;
  provider: string;
  model: string;
  credentialId: string | null;
  costUsd: number;
  costBrl: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

/** Uma mensagem persistida de uma sessão de playground. */
export interface PlaygroundMessageData {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  /** Provedor que gerou esta mensagem (D5). */
  provider: string | null;
  /** Modelo que gerou esta mensagem (D5). */
  model: string | null;
  /** Tipo da requisição: texto | audio | imagem | arquivo (D5/G11). */
  requestKind: string | null;
  createdAt: string;
}

/** Sessão de playground completa (config + prompt + mensagens). */
export interface PlaygroundSessionDetail {
  id: string;
  title: string | null;
  provider: string;
  model: string;
  /** Chave de API usada pela sessão (D2). */
  credentialId: string | null;
  promptSnapshot: PlaygroundPromptSnapshot;
  costUsd: number;
  costBrl: number;
  archivedAt: string | null;
  messages: PlaygroundMessageData[];
}
