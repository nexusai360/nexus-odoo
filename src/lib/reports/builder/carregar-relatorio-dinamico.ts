// src/lib/reports/builder/carregar-relatorio-dinamico.ts
// Logica (testavel, sem JSX) de carregar uma ficha salva, validar contra o
// catalogo atual e resolver as secoes. A page server-component so consome isto.
import { obterRascunho } from "./saved-report-repo";
import { validarReportEntry } from "./report-entry-schema";
import { resolveSecao, type SecaoResolvida } from "./resolve-source";
import type { BuilderReportEntry } from "./types";

export interface RelatorioMeta {
  titulo: string;
  criadoPor: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

export type CarregamentoRelatorio =
  | { tipo: "notfound" }
  | { tipo: "invalida"; erros: string[]; meta: RelatorioMeta }
  | {
      tipo: "ok";
      entry: BuilderReportEntry;
      dados: Record<string, SecaoResolvida>;
      meta: RelatorioMeta;
    };

/** Carrega, valida e resolve um relatorio dinamico para render. */
export async function carregarRelatorioDinamico(
  savedId: string,
  user: { userId: string; role: string },
): Promise<CarregamentoRelatorio> {
  const saved = await obterRascunho(savedId, user);
  if (!saved) return { tipo: "notfound" };

  const meta: RelatorioMeta = {
    titulo: saved.titulo,
    criadoPor: saved.criadoPor,
    criadoEm: saved.criadoEm,
    atualizadoEm: saved.atualizadoEm,
  };

  // Valida a ficha contra o catalogo ATUAL: fonte/template orfao (renomeado
  // ou removido) gera erro explicito, nunca quebra silenciosa (spec 10).
  const v = validarReportEntry(saved.entry);
  if (!v.ok) return { tipo: "invalida", erros: v.erros, meta };

  const dados: Record<string, SecaoResolvida> = {};
  for (const secao of v.entry.secoes) {
    dados[secao.id] = await resolveSecao(secao, {});
  }
  return { tipo: "ok", entry: v.entry, dados, meta };
}
