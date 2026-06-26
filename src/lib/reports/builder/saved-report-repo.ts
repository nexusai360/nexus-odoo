// src/lib/reports/builder/saved-report-repo.ts
// Persistencia das fichas de relatorio dinamico (rascunho pessoal, onda 1).
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { validarReportEntry } from "./report-entry-schema";

/** Etag divergiu: a ficha foi alterada por outra operacao. */
export class EtagConflitoError extends Error {
  constructor() {
    super("etag divergente: a ficha foi alterada por outra operacao");
    this.name = "EtagConflitoError";
  }
}

/** Ficha nao passou na validacao do schema. */
export class FichaInvalidaError extends Error {
  constructor(public erros: string[]) {
    super("ficha invalida: " + erros.join("; "));
    this.name = "FichaInvalidaError";
  }
}

interface Ctx {
  userId: string;
  role: string;
}

/** Cria um rascunho pessoal a partir de uma ficha validada. */
export async function criarRascunho(criadoPor: string, entry: unknown) {
  const v = validarReportEntry(entry);
  if (!v.ok) throw new FichaInvalidaError(v.erros);
  return prisma.savedReport.create({
    data: {
      titulo: v.entry.titulo,
      tipo: v.entry.tipo,
      entry: v.entry as object,
      schemaVersion: v.entry.schemaVersion,
      criadoPor,
    },
  });
}

/**
 * Le um relatorio para CONSUMO. Ve quem: o criador, super_admin, ou um usuario
 * explicitamente liberado em `visibilidadeConsumo` (compartilhamento, P3).
 */
export async function obterRascunho(id: string, ctx: Ctx) {
  const r = await prisma.savedReport.findUnique({ where: { id } });
  if (!r) return null;
  const liberado =
    r.criadoPor === ctx.userId ||
    ctx.role === "super_admin" ||
    (r.visibilidadeConsumo ?? []).includes(ctx.userId);
  if (!liberado) return null;
  return r;
}

/** Quem pode GERENCIAR (renomear/compartilhar) um relatorio: criador ou super_admin. */
async function carregarSeGerenciavel(id: string, ctx: Ctx) {
  const r = await prisma.savedReport.findUnique({ where: { id } });
  if (!r) return null;
  if (r.criadoPor !== ctx.userId && ctx.role !== "super_admin") return null;
  return r;
}

/** Detalhe para o painel de gerenciar (so criador/super_admin). */
export async function obterDetalheGerenciavel(id: string, ctx: Ctx) {
  return carregarSeGerenciavel(id, ctx);
}

/**
 * Renomeia um relatorio (criador/super_admin). Atualiza o `titulo` do SavedReport
 * E o `entry.titulo` (renderizado dentro do relatorio), para nao divergirem.
 */
export async function renomear(id: string, ctx: Ctx, titulo: string) {
  const atual = await carregarSeGerenciavel(id, ctx);
  if (!atual) return null;
  const t = titulo.trim().slice(0, 120);
  if (!t) throw new Error("titulo_vazio");
  const entry = (atual.entry ?? {}) as Record<string, unknown>;
  const novoEntry = { ...entry, titulo: t };
  return prisma.savedReport.update({
    where: { id },
    data: { titulo: t, entry: novoEntry as object, etag: randomUUID() },
    select: { id: true, titulo: true, etag: true },
  });
}

/**
 * Define a visibilidade de CONSUMO. `compartilhar=false` -> privado (rascunho,
 * lista vazia). `compartilhar=true` -> publicado + lista final de userIds (o
 * criador e sempre removido da lista; ele ve sempre por ser dono).
 */
export async function definirVisibilidade(
  id: string,
  ctx: Ctx,
  opcoes: { compartilhar: boolean; userIds: string[] },
) {
  const atual = await carregarSeGerenciavel(id, ctx);
  if (!atual) return null;
  const lista = opcoes.compartilhar
    ? Array.from(new Set(opcoes.userIds.filter(Boolean))).filter(
        (uid) => uid !== atual.criadoPor,
      )
    : [];
  return prisma.savedReport.update({
    where: { id },
    data: {
      status: opcoes.compartilhar ? "publicado" : "rascunho",
      visibilidadeConsumo: lista,
    },
    select: { id: true, status: true, visibilidadeConsumo: true },
  });
}

/** Atualiza um rascunho do proprio usuario, com etag otimista. */
export async function atualizarRascunho(
  id: string,
  userId: string,
  entry: unknown,
  etag: string,
) {
  const v = validarReportEntry(entry);
  if (!v.ok) throw new FichaInvalidaError(v.erros);
  const atual = await prisma.savedReport.findUnique({ where: { id } });
  if (!atual) return null;
  if (atual.criadoPor !== userId) return null;
  if (atual.etag !== etag) throw new EtagConflitoError();
  return prisma.savedReport.update({
    where: { id },
    data: {
      titulo: v.entry.titulo,
      entry: v.entry as object,
      etag: randomUUID(),
    },
  });
}

/** Lista os rascunhos visiveis ao usuario (super_admin ve todos). */
export async function listarMeus(ctx: Ctx) {
  if (ctx.role === "super_admin") {
    return prisma.savedReport.findMany({ orderBy: { atualizadoEm: "desc" } });
  }
  return prisma.savedReport.findMany({
    where: { criadoPor: ctx.userId },
    orderBy: { atualizadoEm: "desc" },
  });
}
