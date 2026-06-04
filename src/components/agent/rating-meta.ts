/**
 * B2. Metadados das classificações de feedback do usuário (eixo B1),
 * compartilhados entre o FeedbackControl (bubble) e o monitoramento.
 * Cores idênticas às do FeedbackControl.
 */

export type UserFeedbackRating = "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU";

export const RATING_META: Record<
  UserFeedbackRating,
  { label: string; color: string }
> = {
  CORRETO: { label: "Correto", color: "#10b981" },
  PARCIAL: { label: "Parcial", color: "#f59e0b" },
  ERRADO: { label: "Errado", color: "#ef4444" },
  ALUCINOU: { label: "Alucinou", color: "#8b5cf6" },
};
