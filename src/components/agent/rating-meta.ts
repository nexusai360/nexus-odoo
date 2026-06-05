/**
 * B2. Metadados das classificações de feedback do usuário (eixo B1),
 * compartilhados entre o FeedbackControl (bubble) e o monitoramento.
 * Cores e ícones idênticos aos do FeedbackControl.
 */

import type { ElementType } from "react";
import { Check, X, Ghost } from "lucide-react";
import { PartialIcon } from "./partial-icon";

export type UserFeedbackRating = "CORRETO" | "PARCIAL" | "ERRADO" | "ALUCINOU";

export const RATING_META: Record<
  UserFeedbackRating,
  { label: string; color: string; Icon: ElementType }
> = {
  CORRETO: { label: "Correto", color: "#10b981", Icon: Check },
  // Parcial usa o ícone validado em feedback-v4 (meia-lua preenchida).
  PARCIAL: { label: "Parcial", color: "#f59e0b", Icon: PartialIcon },
  ERRADO: { label: "Errado", color: "#ef4444", Icon: X },
  ALUCINOU: { label: "Alucinou", color: "#8b5cf6", Icon: Ghost },
};
