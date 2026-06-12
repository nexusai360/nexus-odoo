// src/lib/agent/memoria/entidades.ts
// Onda M (Arquitetura 3.0) T4.2 , memoria de entidades da conversa.
//
// No fim de cada turno, as entidades citadas NESTE turno (produto, vendedor,
// empresa, cliente, familia, uf , extraidas por extrairEntidadesDoTurno) viram
// upsert em ConversationEntity com recencia (ultimoTurno) e contagem de
// mencoes. E a base da resolucao de anafora por recencia ("ela", "esse
// produto"). Entidades herdadas do foco anterior NAO renovam recencia.
import type { PrismaClient } from "@/generated/prisma/client";

/** Upsert idempotente das entidades do turno. Nunca lanca (best-effort). */
export async function upsertEntidadesDoTurno(
  prisma: PrismaClient,
  conversationId: string,
  entidades: { tipo: string; rotulo: string }[],
  turno: number,
): Promise<void> {
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
          ultimoTurno: turno,
        },
        update: {
          rotulo: e.rotulo,
          ultimoTurno: turno,
          mencoes: { increment: 1 },
        },
      });
    } catch {
      // best-effort: memoria de entidade nunca derruba o turno
    }
  }
}
