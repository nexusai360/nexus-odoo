/**
 * Clusterizacao das `recomendacaoPrompt` salvas em
 * ConversationQualityEvaluation via embeddings pgvector + KNN cosine.
 *
 * Estrategia (greedy):
 *  1. Para cada avaliacao com recomendacao e SEM embedding gravado:
 *     gera embedding via `embeddings-client.embed` e grava na coluna
 *     `recomendacao_embedding` (vector(1536)) via $queryRaw — Prisma client
 *     nao seleciona campos Unsupported.
 *  2. Itera avaliacoes com embedding. Para cada uma, busca os 10 vizinhos
 *     mais proximos (cosine < threshold). Agrupa em cluster com chave
 *     determinista (hash do texto consolidado do primeiro membro).
 *  3. Upsert em `PromptRecommendation` por `clusterKey`.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §3.8
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { embed, EmbeddingUnavailable } from "./embeddings-client";

const COSINE_THRESHOLD_SAME_CLUSTER = 0.15; // distancia: 1-cosine_similarity. ~ similaridade > 0.85
const KNN_NEIGHBORS = 10;

export interface Cluster {
  clusterKey: string;
  consolidatedText: string;
  members: Array<{ evaluationId: string; recomendacao: string }>;
}

export async function clusterRecommendations(): Promise<Cluster[]> {
  // 1. Backfill de embeddings ausentes.
  try {
    await backfillEmbeddings();
  } catch (err) {
    if (err instanceof EmbeddingUnavailable) {
      console.warn(
        "[recommendation-clusterer] embeddings indisponiveis — clusterizacao ignorada:",
        err.message,
      );
      return [];
    }
    throw err;
  }

  // 2. Lista avaliacoes COM embedding.
  const rows = await prisma.$queryRaw<
    Array<{ id: string; recomendacao_prompt: string }>
  >(Prisma.sql`
    SELECT id, recomendacao_prompt
    FROM conversation_quality_evaluations
    WHERE recomendacao_prompt IS NOT NULL
      AND recomendacao_embedding IS NOT NULL
    ORDER BY created_at DESC
  `);

  const visited = new Set<string>();
  const clusters: Cluster[] = [];

  for (const row of rows) {
    if (visited.has(row.id)) continue;

    // KNN para row.id.
    const neighbors = await prisma.$queryRaw<
      Array<{ id: string; recomendacao_prompt: string; distance: number }>
    >(Prisma.sql`
      SELECT id, recomendacao_prompt,
             (recomendacao_embedding <=> (
                SELECT recomendacao_embedding
                FROM conversation_quality_evaluations
                WHERE id = ${row.id}::uuid
             )) AS distance
      FROM conversation_quality_evaluations
      WHERE id <> ${row.id}::uuid
        AND recomendacao_embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${KNN_NEIGHBORS}
    `);

    const close = neighbors.filter((n) => n.distance <= COSINE_THRESHOLD_SAME_CLUSTER);
    const members = [{ evaluationId: row.id, recomendacao: row.recomendacao_prompt }];
    for (const n of close) {
      if (visited.has(n.id)) continue;
      visited.add(n.id);
      members.push({ evaluationId: n.id, recomendacao: n.recomendacao_prompt });
    }
    visited.add(row.id);

    const consolidatedText = members[0].recomendacao;
    const clusterKey = stableHash(consolidatedText);

    // Upsert no PromptRecommendation.
    await prisma.promptRecommendation.upsert({
      where: { clusterKey },
      create: {
        clusterKey,
        consolidatedText,
        occurrences: members.length,
        status: "pending",
      },
      update: {
        occurrences: members.length,
        // Mantemos status atual (admin pode ter aceito/rejeitado).
      },
    });

    clusters.push({ clusterKey, consolidatedText, members });
  }

  return clusters;
}

async function backfillEmbeddings(): Promise<void> {
  // Pega ate 100 por execucao (rate-friendly).
  const pending = await prisma.$queryRaw<
    Array<{ id: string; recomendacao_prompt: string }>
  >(Prisma.sql`
    SELECT id, recomendacao_prompt
    FROM conversation_quality_evaluations
    WHERE recomendacao_prompt IS NOT NULL
      AND recomendacao_embedding IS NULL
    LIMIT 100
  `);

  for (const row of pending) {
    const vec = await embed(row.recomendacao_prompt);
    const vecLiteral = `[${vec.join(",")}]`;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE conversation_quality_evaluations
      SET recomendacao_embedding = ${vecLiteral}::vector
      WHERE id = ${row.id}::uuid
    `);
  }
}

function stableHash(input: string): string {
  // Hash determinista simples — suficiente para idempotencia do upsert.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
