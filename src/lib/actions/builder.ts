"use server";

// src/lib/actions/builder.ts
// F1/F1b , Server actions do construtor de relatorios (F6, onda 1).
// - construirRelatorio: gate admin/super_admin -> runBuilder -> persiste
//   rascunho (cria ou atualiza) -> auditoria. Recusa/bloqueio nao persistem.
// - previsualizarSecoes: resolve as secoes de uma ficha (amostra ao vivo) sem
//   persistir, para o preview do construtor.
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runBuilder } from "@/lib/reports/builder/agent/run-builder";
import {
  criarRascunho,
  atualizarRascunho,
} from "@/lib/reports/builder/saved-report-repo";
import { validarReportEntry } from "@/lib/reports/builder/report-entry-schema";
import { resolveSecao, type SecaoResolvida } from "@/lib/reports/builder/resolve-source";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

async function gateAdmin(): Promise<
  { ok: true; userId: string; role: string } | { ok: false; error: string }
> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "Nao autenticado" };
  if (me.platformRole !== "admin" && me.platformRole !== "super_admin") {
    return { ok: false, error: "Acesso negado , requer perfil admin ou super_admin" };
  }
  return { ok: true, userId: me.id, role: me.platformRole };
}

export interface ConstruirRelatorioInput {
  prompt: string;
  fichaAtual?: BuilderReportEntry | null;
  savedId?: string | null;
  etag?: string | null;
}

export interface ConstruirRelatorioResult {
  ok: boolean;
  ficha: BuilderReportEntry | null;
  mensagem: string;
  savedId?: string;
  etag?: string;
  recusa?: boolean;
  bloqueado?: boolean;
  error?: string;
}

export async function construirRelatorio(
  input: ConstruirRelatorioInput,
): Promise<ConstruirRelatorioResult> {
  const gate = await gateAdmin();
  if (!gate.ok) {
    return { ok: false, ficha: null, mensagem: gate.error, error: gate.error };
  }

  const r = await runBuilder({
    prompt: input.prompt,
    fichaAtual: input.fichaAtual ?? null,
    user: { id: gate.userId },
  });

  if (r.bloqueado) {
    return { ok: false, ficha: r.ficha, mensagem: r.mensagem, bloqueado: true };
  }
  if (r.recusa) {
    return { ok: true, ficha: r.ficha, mensagem: r.mensagem, recusa: true };
  }
  if (r.erro || !r.ficha) {
    return { ok: false, ficha: r.ficha, mensagem: r.mensagem, error: r.mensagem };
  }

  // Persiste o rascunho: atualiza se veio savedId+etag, senao cria.
  let savedId = input.savedId ?? undefined;
  let etag: string | undefined;
  let acao: "created" | "updated" = "created";

  if (input.savedId && input.etag) {
    const upd = await atualizarRascunho(input.savedId, gate.userId, r.ficha, input.etag);
    if (upd) {
      savedId = upd.id;
      etag = upd.etag;
      acao = "updated";
    }
  }
  if (acao === "created") {
    const criado = await criarRascunho(gate.userId, r.ficha);
    savedId = criado.id;
    etag = criado.etag;
  }

  await logAudit({
    userId: gate.userId,
    action: "report_preset_created",
    targetType: "saved_report",
    targetId: savedId,
    details: { acao, titulo: r.ficha.titulo, secoes: r.ficha.secoes.length },
  });

  return { ok: true, ficha: r.ficha, mensagem: r.mensagem, savedId, etag };
}

export type PrevisualizacaoResult =
  | { tipo: "negado" }
  | { tipo: "invalida"; erros: string[] }
  | { tipo: "ok"; dados: Record<string, SecaoResolvida> };

export async function previsualizarSecoes(
  ficha: BuilderReportEntry,
): Promise<PrevisualizacaoResult> {
  const gate = await gateAdmin();
  if (!gate.ok) return { tipo: "negado" };

  const v = validarReportEntry(ficha);
  if (!v.ok) return { tipo: "invalida", erros: v.erros };

  const dados: Record<string, SecaoResolvida> = {};
  for (const secao of v.entry.secoes) {
    dados[secao.id] = await resolveSecao(secao, {});
  }
  return { tipo: "ok", dados };
}
