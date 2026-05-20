/**
 * Tipos compartilhados das Server Actions da base de conhecimento.
 * Separado de kb.ts porque arquivos "use server" só podem exportar funções.
 */

import type { KbKind } from "@/generated/prisma/client";

export type KbCheckpoint = "OFF" | "PLAYGROUND" | "PRODUCTION";

export interface KbDocRow {
  id: string;
  name: string;
  kind: KbKind;
  sourceUrl: string | null;
  charCount: number;
  createdAt: Date;
  hasEmbedding: boolean;
  checkpoint: KbCheckpoint;
}
