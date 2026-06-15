// src/lib/fiscal/grupo/participantes-grupo.ts
import type { PrismaClient } from "../../../generated/prisma/client";
import { RAIZES_GRUPO } from "./raizes-cnpj";
import { extrairRaizCnpj, extrairRaizCnpjDeTexto } from "./cnpj";
import { PARTICIPANTES_GRUPO_WHITELIST } from "./whitelist-grupo";

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
 * Marcacao intercompany em cascata de 3 camadas (Fase 2.5), da mais confiavel para a
 * ultima defesa:
 *   1. WHITELIST curada de participante_id (resiliente a cadastro corrompido e a nome
 *      sem CNPJ legivel , o caso dos pids 2/9/10/11/12/13 com documento_digits vazio);
 *   2. Set de cadastro (fato_parceiro.documentoDigits com raiz do grupo);
 *   3. raiz do CNPJ embutido no participanteNome ∈ RAIZES_GRUPO (tolera Unicode , B1).
 * A whitelist torna a marcacao independente do regex de nome; ver whitelist-grupo.ts e
 * RADAR R-intercompany-fallback-fragil.
 */
export function ehNotaIntragrupo(
  nota: { participanteId: number | null; participanteNome: string | null },
  participantesGrupo: Set<number>,
): boolean {
  if (nota.participanteId !== null && PARTICIPANTES_GRUPO_WHITELIST.has(nota.participanteId)) return true;
  if (nota.participanteId !== null && participantesGrupo.has(nota.participanteId)) return true;
  const raiz = extrairRaizCnpjDeTexto(nota.participanteNome);
  return raiz !== null && RAIZES_GRUPO.has(raiz);
}
