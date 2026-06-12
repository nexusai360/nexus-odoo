// src/lib/agent/memoria/entidades.ts
// Onda M (Arquitetura 3.0) T4.2 , memoria de entidades da conversa.
//
// No fim de cada turno, as entidades citadas (produto, vendedor, empresa,
// cliente, familia, uf , as mesmas extraidas para o focoAtual) viram upsert
// em ConversationEntity com recencia (ultimoTurno) e contagem de mencoes.
// E a base da resolucao de anafora por recencia ("ela", "esse produto").
import type { PrismaClient } from "@/generated/prisma/client";
import type { FocoAtual } from "./foco-atual";

/** Upsert idempotente das entidades do turno. Nunca lanca (best-effort). */
export async function upsertEntidadesDoTurno(
  prisma: PrismaClient,
  conversationId: string,
  foco: FocoAtual,
): Promise<void> {
  const entidades = foco.entidades ?? [];
  for (const e of entidades) {
    const chave = e.rotulo.trim().toLowerCase();
    if (!chave) continue;
    try {
      await prisma.conversationEntity.upsert({
        where: {
          conversationId_tipo_chaveCanonica: {
            conversationId,
            tipo: e.tipo,
            chaveCanonica: chave,
          },
        },
        create: {
          conversationId,
          tipo: e.tipo,
          chaveCanonica: chave,
          rotulo: e.rotulo,
          ultimoTurno: foco.turnoAtualizado,
        },
        update: {
          rotulo: e.rotulo,
          ultimoTurno: foco.turnoAtualizado,
          mencoes: { increment: 1 },
        },
      });
    } catch {
      // best-effort: memoria de entidade nunca derruba o turno
    }
  }
}
