/**
 * Server Actions para gestão da base de conhecimento (KB) do Agente Nex.
 *
 * Expõe ações acessíveis por admin/super_admin via componentes React.
 * A extração de texto (extract.ts → pdf-parse) é importada dinamicamente
 * dentro da função para não vazar o pacote Node-only ao bundle do client.
 */

"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ingestKbDocument } from "@/lib/agent/rag/search";
import { kindFromFilename } from "@/lib/agent/rag/kb-kinds";
import type { KbKind } from "@/generated/prisma/client";
import type { KbCheckpoint, KbDocRow } from "./kb-types";

/** Limite de tamanho do arquivo de upload da KB: 10 MB. */
const MAX_KB_FILE_BYTES = 10 * 1024 * 1024;

/** Roles que podem gerenciar a KB. */
const KB_ADMIN_ROLES = new Set(["admin", "super_admin"]);

/** Verifica se o usuário da sessão tem permissão de admin de KB. */
async function assertKbAdmin(): Promise<string> {
  const me = await getCurrentUser();
  if (!me) throw new Error("Não autenticado.");
  if (!KB_ADMIN_ROLES.has(me.platformRole ?? "")) {
    throw new Error("Permissão negada. Requer perfil admin ou super_admin.");
  }
  return me.id;
}

/** Resultado padronizado para Server Actions. */
type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Ingere um documento de texto na KB.
 * Chamado por kb-url-form.tsx (URL). Para arquivos, usar uploadKbFileAction.
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
 * Faz upload de um arquivo para a KB com extração de texto real no servidor.
 * Aceita PDF, TXT, Markdown, CSV, XML, YAML, XLSX e DOCX. O arquivo chega como FormData.
 */
export async function uploadKbFileAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    await assertKbAdmin();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "Arquivo não enviado." };
    }
    if (file.size === 0) {
      return { ok: false, error: "Arquivo vazio." };
    }
    if (file.size > MAX_KB_FILE_BYTES) {
      return { ok: false, error: "Arquivo excede 10 MB." };
    }

    const kind = kindFromFilename(file.name);
    if (!kind) {
      return {
        ok: false,
        error: "Formato inválido. Aceitos: PDF, TXT, Markdown, CSV, XML, YAML, XLSX, DOCX e JSON.",
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    try {
      // Import dinâmico , extract.ts importa pdf-parse (Node-only).
      const { extractKbText } = await import("@/lib/agent/rag/extract");
      text = await extractKbText(buffer, kind);
    } catch (err) {
      console.error("[uploadKbFileAction] extração falhou", err);
      return { ok: false, error: "Não foi possível extrair texto do arquivo." };
    }

    if (!text.trim()) {
      return { ok: false, error: "O arquivo não contém texto legível." };
    }

    const doc = await ingestKbDocument(file.name, kind, text);
    return { ok: true, data: { id: doc.id } };
  } catch (err) {
    console.error("[uploadKbFileAction]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao enviar arquivo.",
    };
  }
}

/** Lista todos os documentos da KB (para exibição na seção KB do Prompt). */
export async function listKbDocumentsAction(): Promise<ActionResult<KbDocRow[]>> {
  try {
    await assertKbAdmin();

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        kind: KbKind;
        source_url: string | null;
        char_count: number;
        created_at: Date;
        has_embedding: boolean;
        checkpoint: KbCheckpoint;
      }>
    >`
      SELECT
        id,
        name,
        kind,
        source_url,
        char_count,
        created_at,
        checkpoint,
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
        checkpoint: r.checkpoint,
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

/** Retorna o conteúdo extraído de um documento (para o modal de visualização). */
export async function getKbDocumentAction(
  id: string,
): Promise<ActionResult<{ name: string; kind: KbKind; text: string }>> {
  try {
    await assertKbAdmin();
    const doc = await prisma.kbDocument.findUnique({
      where: { id },
      select: { name: true, kind: true, extractedText: true },
    });
    if (!doc) return { ok: false, error: "Documento não encontrado." };
    return {
      ok: true,
      data: { name: doc.name, kind: doc.kind, text: doc.extractedText },
    };
  } catch (err) {
    console.error("[getKbDocumentAction]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao carregar documento.",
    };
  }
}

/** Atualiza o checkpoint (OFF/PLAYGROUND/PRODUCTION) de um documento da KB. */
export async function updateKbCheckpointAction(
  id: string,
  checkpoint: KbCheckpoint,
): Promise<ActionResult> {
  try {
    await assertKbAdmin();
    if (!["OFF", "PLAYGROUND", "PRODUCTION"].includes(checkpoint)) {
      return { ok: false, error: "Estado inválido." };
    }
    await prisma.kbDocument.update({
      where: { id },
      data: { checkpoint },
    });
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[updateKbCheckpointAction]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao atualizar documento.",
    };
  }
}

/** Remove um documento da KB pelo ID. */
/**
 * Conta os caracteres extraíveis de um arquivo SEM persistir.
 * Usado pelo modal de upload para validar o orçamento antes do save.
 */
export async function precountKbCharsAction(
  formData: FormData,
): Promise<ActionResult<{ charCount: number }>> {
  try {
    await assertKbAdmin();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "Arquivo não enviado." };
    }
    if (file.size === 0) {
      return { ok: false, error: "Arquivo vazio." };
    }
    if (file.size > MAX_KB_FILE_BYTES) {
      return { ok: false, error: "Arquivo excede 10 MB." };
    }
    const kind = kindFromFilename(file.name);
    if (!kind) {
      return { ok: false, error: "Formato inválido." };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const { extractKbText } = await import("@/lib/agent/rag/extract");
    try {
      const text = await extractKbText(buffer, kind);
      return { ok: true, data: { charCount: text.length } };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Falha ao processar arquivo.",
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao processar arquivo.",
    };
  }
}

/**
 * Lista apenas nomes (e id) dos documentos da KB para o modal de upload
 * detectar duplicidades antes do save. Não traz texto.
 */
export async function listKbDocumentNamesAction(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    await assertKbAdmin();
    const rows = await prisma.kbDocument.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    });
    return { ok: true, data: rows };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao listar documentos.",
    };
  }
}

export async function deleteKbDocumentAction(id: string): Promise<ActionResult> {
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
