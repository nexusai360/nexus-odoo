/**
 * Ingestão de documentos na KB e busca por similaridade vetorial (pgvector).
 *
 * - ingestKbDocument: grava KbDocument + embedding vector(1536) via SQL raw.
 * - searchKb: busca os topK documentos mais similares à query usando
 *   operador <=> (distância cosseno do pgvector) via $queryRaw.
 * - Sem credencial de embedding → fallback "texto integral truncado"
 *   (retorna todos os documentos, sem ordenação semântica).
 */

import { prisma } from "@/lib/prisma";
import { embed, EmbeddingUnavailable } from "./embed";
import type { KbKind } from "@/generated/prisma/client";

/** Snippet retornado pela busca (compatível com KbDocSnippet do compose.ts). */
export interface KbSearchResult {
  id: string;
  name: string;
  extractedText: string;
}

/** Máximo de chars por documento no fallback de texto integral. */
const FALLBACK_MAX_CHARS = 50_000;

/**
 * Ingere um documento na base de conhecimento.
 * Tenta gerar embedding; se não houver credencial configurada, grava sem embedding.
 *
 * @param name      Nome/título do documento
 * @param kind      Tipo: TXT | PDF | URL
 * @param text      Texto extraído (já processado)
 * @param sourceUrl URL de origem (opcional, para kind=URL)
 */
export async function ingestKbDocument(
  name: string,
  kind: KbKind,
  text: string,
  sourceUrl?: string,
) {
  let embeddingVector: number[] | null = null;

  try {
    embeddingVector = await embed(text);
  } catch (err) {
    if (err instanceof EmbeddingUnavailable) {
      // Fallback: grava sem embedding; busca semântica não estará disponível
      console.info("[ingestKbDocument] Sem credencial de embedding — gravando sem vetor.");
    } else {
      throw err;
    }
  }

  // Gravar documento via Prisma (sem a coluna vector — Prisma não sabe do tipo)
  const doc = await prisma.kbDocument.create({
    data: {
      name,
      kind,
      sourceUrl: sourceUrl ?? null,
      extractedText: text,
      charCount: text.length,
    },
  });

  // Se temos embedding, gravar via SQL raw (Prisma não suporta tipo vector)
  if (embeddingVector) {
    const vectorLiteral = `[${embeddingVector.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE kb_documents
      SET embedding = ${vectorLiteral}::vector
      WHERE id = ${doc.id}::uuid
    `;
  }

  return doc;
}

/**
 * Busca os topK documentos mais similares à query por similaridade cosseno.
 *
 * Sem credencial de embedding → fallback: retorna todos os documentos
 * (sem ordenação semântica), truncados ao limite de FALLBACK_MAX_CHARS total.
 *
 * @param query Texto da pergunta do usuário
 * @param topK  Número máximo de resultados
 */
export async function searchKb(query: string, topK: number): Promise<KbSearchResult[]> {
  try {
    const queryVector = await embed(query);
    const vectorLiteral = `[${queryVector.join(",")}]`;

    // Busca por distância cosseno (<=> = menor = mais similar)
    const rows = await prisma.$queryRaw<KbSearchResult[]>`
      SELECT id, name, extracted_text AS "extractedText"
      FROM kb_documents
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${topK}
    `;

    return rows;
  } catch (err) {
    if (err instanceof EmbeddingUnavailable) {
      // Fallback: texto integral, sem semântica.
      // Sem `take: topK` — busca todos os documentos e deixa o budget de
      // FALLBACK_MAX_CHARS do composeSystemPrompt fazer o corte (MÉDIO-4 do review 1-2-7).
      console.info("[searchKb] Sem embedding — usando fallback de texto integral.");
      const docs = await prisma.kbDocument.findMany({
        select: { id: true, name: true, extractedText: true },
        orderBy: { createdAt: "desc" },
      });

      // Distribui o orçamento proporcional entre todos os docs
      const perDoc = Math.floor(FALLBACK_MAX_CHARS / Math.max(docs.length, 1));
      return docs.map((d) => ({
        id: d.id,
        name: d.name,
        extractedText:
          d.extractedText.length <= perDoc
            ? d.extractedText
            : d.extractedText.slice(0, perDoc) + "\n[...truncado...]",
      }));
    }
    throw err;
  }
}
