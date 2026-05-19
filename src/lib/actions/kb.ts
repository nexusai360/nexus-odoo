/**
 * Server Actions para gestão da base de conhecimento (KB).
 *
 * Expõe ações acessíveis por admin/super_admin via componentes React (Next.js).
 * Delega a lógica de ingestão para src/lib/agent/rag/search.ts.
 */

"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ingestKbDocument } from "@/lib/agent/rag/search";
import type { KbKind } from "@/generated/prisma/client";

/** Roles que podem gerenciar a KB. */
const KB_ADMIN_ROLES = new Set(["admin", "super_admin"]);

/** Verifica se o usuário da sessão tem permissão de admin de KB. */
async function assertKbAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Não autenticado.");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { platformRole: true },
  });
  if (!user || !KB_ADMIN_ROLES.has(user.platformRole ?? "")) {
    throw new Error("Permissão negada.");
  }
  return session.user.id;
}

/** Resultado padronizado para Server Actions. */
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Ingere um documento de texto na KB.
 * Chamado pelo kb-upload-dialog.tsx (upload de arquivo) e kb-url-form.tsx (URL).
 */
export async function ingestKbDocumentAction(
  name: string,
  kind: KbKind,
  text: string,
  sourceUrl?: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await assertKbAdmin();

    if (!name.trim()) {
      return { ok: false, error: "Nome do documento é obrigatório." };
    }
    if (!text.trim()) {
      return { ok: false, error: "Conteúdo do documento não pode ser vazio." };
    }

    const doc = await ingestKbDocument(name.trim(), kind, text, sourceUrl);
    return { ok: true, data: { id: doc.id } };
  } catch (err) {
    console.error("[ingestKbDocumentAction]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao ingerir documento.",
    };
  }
}

/**
 * Lista todos os documentos da KB (para exibição na seção KB da configuração).
 */
export async function listKbDocumentsAction(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      kind: KbKind;
      sourceUrl: string | null;
      charCount: number;
      createdAt: Date;
      hasEmbedding: boolean;
    }>
  >
> {
  try {
    await assertKbAdmin();

    // Busca com flag de embedding via SQL raw (Prisma não conhece a coluna vector)
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        kind: KbKind;
        source_url: string | null;
        char_count: number;
        created_at: Date;
        has_embedding: boolean;
      }>
    >`
      SELECT
        id,
        name,
        kind,
        source_url,
        char_count,
        created_at,
        (embedding IS NOT NULL) AS has_embedding
      FROM kb_documents
      ORDER BY created_at DESC
    `;

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        sourceUrl: r.source_url,
        charCount: r.char_count,
        createdAt: r.created_at,
        hasEmbedding: r.has_embedding,
      })),
    };
  } catch (err) {
    console.error("[listKbDocumentsAction]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao listar documentos.",
    };
  }
}

/**
 * Remove um documento da KB pelo ID.
 */
export async function deleteKbDocumentAction(
  id: string,
): Promise<ActionResult> {
  try {
    await assertKbAdmin();

    await prisma.kbDocument.delete({ where: { id } });
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[deleteKbDocumentAction]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao remover documento.",
    };
  }
}
