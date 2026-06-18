"use server";

/**
 * Server Actions de gerenciamento de servidores MCP externos.
 *
 * "Plugar MCPs", registro de MCPs de terceiros que o Agente Nex consome como
 * cliente, para agregar capacidades (Slack, GitHub, etc.).
 *
 * Gate: super_admin em todas as operações (requireSuperAdmin).
 * O `authToken` é persistido cifrado (AES-256-GCM, src/lib/encryption.ts) e
 * jamais devolvido ao cliente, a UI só recebe `hasAuth: boolean`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { requireSuperAdmin } from "@/lib/actions/_helpers";
import { logAudit } from "@/lib/audit";
import type {
  DataResult,
  ExternalMcpServerListItem,
  McpServerStatus,
} from "@/lib/actions/external-mcp-servers-types";

// ──────────────────────────────────────────────────────────────────────────────
// Schemas Zod
// ──────────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  description: z.string().max(500).optional().nullable(),
  transport: z.enum(["http", "sse"]),
  url: z.string().url("URL inválida"),
  authHeader: z.string().max(100).optional().nullable(),
  authToken: z.string().max(2000).optional().nullable(),
});

const updateSchema = createSchema.partial();

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

type ServerRow = {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  url: string;
  authHeader: string | null;
  authToken: string | null;
  enabled: boolean;
  lastStatus: string;
  lastCheckAt: Date | null;
  createdAt: Date;
};

function toListItem(row: ServerRow): ExternalMcpServerListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    transport: row.transport,
    url: row.url,
    hasAuth: row.authToken != null && row.authToken.length > 0,
    authHeader: row.authHeader,
    enabled: row.enabled,
    lastStatus: (["ok", "error", "unknown"].includes(row.lastStatus)
      ? row.lastStatus
      : "unknown") as McpServerStatus,
    lastCheckAt: row.lastCheckAt,
    createdAt: row.createdAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// list
// ──────────────────────────────────────────────────────────────────────────────

export async function listExternalMcpServers(): Promise<
  DataResult<ExternalMcpServerListItem[]>
> {
  try {
    await requireSuperAdmin();
    const rows = await prisma.externalMcpServer.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: rows.map(toListItem) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao listar" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// create
// ──────────────────────────────────────────────────────────────────────────────

export async function createExternalMcpServer(input: {
  name: string;
  description?: string | null;
  transport: "http" | "sse";
  url: string;
  authHeader?: string | null;
  authToken?: string | null;
}): Promise<DataResult<ExternalMcpServerListItem>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }
    const d = parsed.data;
    const token = d.authToken?.trim();

    const row = await prisma.externalMcpServer.create({
      data: {
        name: d.name.trim(),
        description: d.description?.trim() || null,
        transport: d.transport,
        url: d.url.trim(),
        authHeader: d.authHeader?.trim() || null,
        authToken: token ? encrypt(token) : null,
      },
    });

    await logAudit({
      userId: admin.id,
      action: "external_mcp_server_created",
      targetType: "external_mcp_server",
      targetId: row.id,
      details: { name: row.name, url: row.url },
    });

    revalidatePath("/agente/plugar-mcps", "layout");
    return { success: true, data: toListItem(row) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao criar" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// update
// ──────────────────────────────────────────────────────────────────────────────

export async function updateExternalMcpServer(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    transport?: "http" | "sse";
    url?: string;
    authHeader?: string | null;
    authToken?: string | null;
  },
): Promise<DataResult<ExternalMcpServerListItem>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
    }
    const d = parsed.data;

    const data: Record<string, unknown> = {};
    if (d.name !== undefined) data.name = d.name.trim();
    if (d.description !== undefined) data.description = d.description?.trim() || null;
    if (d.transport !== undefined) data.transport = d.transport;
    if (d.url !== undefined) data.url = d.url.trim();
    if (d.authHeader !== undefined) data.authHeader = d.authHeader?.trim() || null;
    // authToken: ausente = mantém; string vazia = limpa; string preenchida = cifra
    if (d.authToken !== undefined) {
      const token = d.authToken?.trim();
      data.authToken = token ? encrypt(token) : null;
    }

    const row = await prisma.externalMcpServer.update({ where: { id }, data });

    await logAudit({
      userId: admin.id,
      action: "external_mcp_server_updated",
      targetType: "external_mcp_server",
      targetId: row.id,
      details: { name: row.name },
    });

    revalidatePath("/agente/plugar-mcps", "layout");
    return { success: true, data: toListItem(row) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao atualizar" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// toggle
// ──────────────────────────────────────────────────────────────────────────────

export async function toggleExternalMcpServer(
  id: string,
  enabled: boolean,
): Promise<DataResult<ExternalMcpServerListItem>> {
  try {
    const admin = await requireSuperAdmin();
    const row = await prisma.externalMcpServer.update({
      where: { id },
      data: { enabled },
    });
    await logAudit({
      userId: admin.id,
      action: "external_mcp_server_toggled",
      targetType: "external_mcp_server",
      targetId: row.id,
      details: { name: row.name, enabled },
    });
    revalidatePath("/agente/plugar-mcps", "layout");
    return { success: true, data: toListItem(row) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao alternar" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// delete
// ──────────────────────────────────────────────────────────────────────────────

export async function deleteExternalMcpServer(
  id: string,
): Promise<DataResult<{ id: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const existing = await prisma.externalMcpServer.findUnique({
      where: { id },
      select: { name: true },
    });
    await prisma.externalMcpServer.delete({ where: { id } });
    await logAudit({
      userId: admin.id,
      action: "external_mcp_server_deleted",
      targetType: "external_mcp_server",
      targetId: id,
      details: { name: existing?.name ?? null },
    });
    revalidatePath("/agente/plugar-mcps", "layout");
    return { success: true, data: { id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao remover" };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// test, alcançabilidade do MCP externo
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Testa a alcançabilidade de um endpoint MCP a partir de campos crus, antes de
 * o servidor ser criado/salvo. Usado pelo passo de revisão do wizard.
 * Quando `serverId` é informado e `authToken` vem vazio, usa o token cifrado já
 * salvo desse servidor (caso de edição que mantém o token).
 */
export async function testExternalMcpEndpoint(input: {
  url: string;
  authHeader?: string | null;
  authToken?: string | null;
  serverId?: string | null;
}): Promise<DataResult<{ status: "ok" | "error"; message: string }>> {
  try {
    await requireSuperAdmin();
    const parsedUrl = z.string().url("URL inválida").safeParse(input.url?.trim());
    if (!parsedUrl.success) {
      return { success: false, error: "URL inválida" };
    }

    let token = input.authToken?.trim() || null;
    const header = input.authHeader?.trim() || null;
    if (!token && input.serverId) {
      const row = await prisma.externalMcpServer.findUnique({
        where: { id: input.serverId },
      });
      if (row?.authToken) {
        try {
          token = decrypt(row.authToken);
        } catch {
          token = null;
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
    };
    if (header && token) headers[header] = token;

    try {
      const res = await fetch(parsedUrl.data, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      return {
        success: true,
        data: { status: "ok", message: `Servidor alcançável (HTTP ${res.status}).` },
      };
    } catch (err) {
      return {
        success: true,
        data: {
          status: "error",
          message:
            err instanceof Error && err.name === "TimeoutError"
              ? "Tempo esgotado, o servidor não respondeu em 5s."
              : "Não foi possível conectar ao servidor.",
        },
      };
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao testar" };
  }
}

export async function testExternalMcpServer(
  id: string,
): Promise<DataResult<{ status: "ok" | "error"; message: string }>> {
  try {
    await requireSuperAdmin();
    const row = await prisma.externalMcpServer.findUnique({ where: { id } });
    if (!row) return { success: false, error: "Servidor não encontrado" };

    const headers: Record<string, string> = { Accept: "application/json, text/event-stream" };
    if (row.authHeader && row.authToken) {
      try {
        headers[row.authHeader] = decrypt(row.authToken);
      } catch {
        // token corrompido, segue sem auth; o teste vai refletir
      }
    }

    let status: "ok" | "error";
    let message: string;
    try {
      const res = await fetch(row.url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      // Qualquer resposta HTTP significa que o host está alcançável.
      status = "ok";
      message = `Servidor alcançável (HTTP ${res.status}).`;
    } catch (err) {
      status = "error";
      message =
        err instanceof Error && err.name === "TimeoutError"
          ? "Tempo esgotado, servidor não respondeu em 5s."
          : "Não foi possível conectar ao servidor.";
    }

    await prisma.externalMcpServer.update({
      where: { id },
      data: { lastStatus: status, lastCheckAt: new Date() },
    });
    revalidatePath("/agente/plugar-mcps", "layout");
    return { success: true, data: { status, message } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao testar" };
  }
}
