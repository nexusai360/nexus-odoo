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

/** Le um rascunho; super_admin ve de qualquer dono, demais so o proprio. */
export async function obterRascunho(id: string, ctx: Ctx) {
  const r = await prisma.savedReport.findUnique({ where: { id } });
  if (!r) return null;
  if (r.criadoPor !== ctx.userId && ctx.role !== "super_admin") return null;
  return r;
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
