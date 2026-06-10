// src/lib/fiscal/grupo/participantes-grupo.ts
import type { PrismaClient } from "../../../generated/prisma/client";
import { RAIZES_GRUPO } from "./raizes-cnpj";
import { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "./cnpj";

/**
 * Carrega o conjunto de participantes (odoo_id) cujo CNPJ raiz pertence ao grupo,
 * via fato_parceiro.documentoDigits. NAO cachear por processo (o dado muda no sync);
 * chamar 1x por request de metrica.
 */
export async function carregarParticipantesGrupo(prisma: PrismaClient): Promise<Set<number>> {
  const parceiros = await prisma.fatoParceiro.findMany({ select: { odooId: true, documentoDigits: true } });
  const set = new Set<number>();
  for (const p of parceiros) {
    const raiz = extrairRaizCnpj(p.documentoDigits);
    if (raiz && RAIZES_GRUPO.has(raiz)) set.add(p.odooId);
  }
  return set;
}

/**
 * Marcacao intercompany em cascata: participante no Set (via documento) OU raiz do
 * CNPJ embutido no participanteNome ∈ RAIZES_GRUPO (defesa contra parceiro do grupo
 * cadastrado sem CNPJ no fato_parceiro, e contra CNPJ com Unicode no nome , B1).
 */
export function ehNotaIntragrupo(
  nota: { participanteId: number | null; participanteNome: string | null },
  participantesGrupo: Set<number>,
): boolean {
  if (nota.participanteId !== null && participantesGrupo.has(nota.participanteId)) return true;
  const raiz = extrairRaizCnpjDeTexto(nota.participanteNome);
  return raiz !== null && RAIZES_GRUPO.has(raiz);
}
