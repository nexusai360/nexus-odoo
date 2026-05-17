"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { ReportPreset } from "@/generated/prisma/client";

export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

export type PresetItem = Pick<
  ReportPreset,
  "id" | "reportId" | "nome" | "searchParams" | "favorito" | "criadoEm"
>;

const NomeSchema = z
  .string()
  .trim()
  .min(1, "Nome obrigatório")
  .max(80, "Nome muito longo (máx. 80 caracteres)");

// ---------------------------------------------------------------------------
// listarPresets
// ---------------------------------------------------------------------------

export async function listarPresets(
  reportId: string,
): Promise<ActionResult<PresetItem[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const presets = await prisma.reportPreset.findMany({
      where: { userId: user.id, reportId },
      select: {
        id: true,
        reportId: true,
        nome: true,
        searchParams: true,
        favorito: true,
        criadoEm: true,
      },
      orderBy: [{ favorito: "desc" }, { criadoEm: "desc" }],
    });

    return { success: true, data: presets };
  } catch {
    return { success: false, error: "Erro ao carregar presets" };
  }
}

// ---------------------------------------------------------------------------
// criarPreset
// ---------------------------------------------------------------------------

export async function criarPreset(
  reportId: string,
  nome: string,
  searchParams: string,
): Promise<ActionResult<PresetItem>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const nomeResult = NomeSchema.safeParse(nome);
    if (!nomeResult.success) {
      return {
        success: false,
        error: nomeResult.error.issues[0]?.message ?? "Nome inválido",
      };
    }

    // Limite por usuário/relatório para evitar abuso
    const count = await prisma.reportPreset.count({
      where: { userId: user.id, reportId },
    });
    if (count >= 50) {
      return {
        success: false,
        error: "Limite de 50 presets por relatório atingido",
      };
    }

    const preset = await prisma.reportPreset.create({
      data: {
        userId: user.id,
        reportId,
        nome: nomeResult.data,
        searchParams,
        favorito: false,
      },
      select: {
        id: true,
        reportId: true,
        nome: true,
        searchParams: true,
        favorito: true,
        criadoEm: true,
      },
    });

    revalidatePath(`/relatorios/${reportId}`);
    return { success: true, data: preset };
  } catch {
    return { success: false, error: "Erro ao salvar preset" };
  }
}

// ---------------------------------------------------------------------------
// excluirPreset
// ---------------------------------------------------------------------------

export async function excluirPreset(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const preset = await prisma.reportPreset.findUnique({
      where: { id },
      select: { userId: true, reportId: true },
    });

    if (!preset) return { success: false, error: "Preset não encontrado" };
    if (preset.userId !== user.id)
      return { success: false, error: "Acesso negado" };

    await prisma.reportPreset.delete({ where: { id } });

    revalidatePath(`/relatorios/${preset.reportId}`);
    return { success: true };
  } catch {
    return { success: false, error: "Erro ao excluir preset" };
  }
}

// ---------------------------------------------------------------------------
// alternarFavorito
// ---------------------------------------------------------------------------

export async function alternarFavorito(
  id: string,
): Promise<ActionResult<{ favorito: boolean }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Não autenticado" };

    const preset = await prisma.reportPreset.findUnique({
      where: { id },
      select: { userId: true, favorito: true, reportId: true },
    });

    if (!preset) return { success: false, error: "Preset não encontrado" };
    if (preset.userId !== user.id)
      return { success: false, error: "Acesso negado" };

    const updated = await prisma.reportPreset.update({
      where: { id },
      data: { favorito: !preset.favorito },
      select: { favorito: true, reportId: true },
    });

    revalidatePath(`/relatorios/${updated.reportId}`);
    return { success: true, data: { favorito: updated.favorito } };
  } catch {
    return { success: false, error: "Erro ao atualizar favorito" };
  }
}
