// src/lib/reports/builder/tools/mutators.ts
// Mutadores da ficha: cada um recebe a ficha atual + args e devolve a ficha
// nova (imutavel) ou um erro. Mutadores que criam/alteram secao re-checam a
// compatibilidade template x shape x fonte antes de aplicar.
import { checarCompatibilidade } from "../compat";
import type {
  BuilderReportEntry,
  BuilderSection,
  ShapeDerivado,
} from "../types";
import type { ReportTemplate } from "@/lib/reports/types";

export type MutResult =
  | { ficha: BuilderReportEntry }
  | { erro: string };

/** Cria uma ficha vazia valida (rascunho). */
export function criarRelatorio(args: {
  titulo: string;
  dominio?: string;
}): BuilderReportEntry {
  return {
    id: "rascunho",
    titulo: args.titulo,
    dominio: (args.dominio ?? "estoque") as BuilderReportEntry["dominio"],
    schemaVersion: 1,
    tipo: "tela_cheia",
    parametros: [],
    secoes: [],
  };
}

interface AdicionarArgs {
  template: ReportTemplate;
  fato: string;
  shapeDerivado: ShapeDerivado;
  config?: Record<string, unknown>;
  id?: string;
}

/** Adiciona uma secao, se compativel. */
export function adicionarSecao(
  ficha: BuilderReportEntry,
  args: AdicionarArgs,
): MutResult {
  const secao: BuilderSection = {
    id: args.id ?? `secao-${ficha.secoes.length + 1}`,
    template: args.template,
    fato: args.fato,
    shapeDerivado: args.shapeDerivado,
    config: args.config ?? {},
    filtros: [],
  };
  const compat = checarCompatibilidade(secao);
  if (!compat.ok) return { erro: compat.motivo };
  return { ficha: { ...ficha, secoes: [...ficha.secoes, secao] } };
}

interface PatchSecao {
  template?: ReportTemplate;
  shapeDerivado?: ShapeDerivado;
  config?: Record<string, unknown>;
}

/** Edita uma secao existente (re-checa compatibilidade). */
export function editarSecao(
  ficha: BuilderReportEntry,
  args: { secaoId: string; patch: PatchSecao },
): MutResult {
  const idx = ficha.secoes.findIndex((s) => s.id === args.secaoId);
  if (idx < 0) return { erro: "secao_inexistente" };
  const nova: BuilderSection = { ...ficha.secoes[idx], ...args.patch };
  const compat = checarCompatibilidade(nova);
  if (!compat.ok) return { erro: compat.motivo };
  const secoes = [...ficha.secoes];
  secoes[idx] = nova;
  return { ficha: { ...ficha, secoes } };
}

/** Remove uma secao pela id. */
export function removerSecao(
  ficha: BuilderReportEntry,
  args: { secaoId: string },
): { ficha: BuilderReportEntry } {
  return {
    ficha: {
      ...ficha,
      secoes: ficha.secoes.filter((s) => s.id !== args.secaoId),
    },
  };
}

interface FiltroArg {
  tipo: "armazem" | "familia" | "sentido" | "faixaDias";
  default?: string;
}

/** Define (acrescenta) um filtro numa secao. */
export function definirFiltro(
  ficha: BuilderReportEntry,
  args: { secaoId: string; filtro: FiltroArg },
): MutResult {
  const idx = ficha.secoes.findIndex((s) => s.id === args.secaoId);
  if (idx < 0) return { erro: "secao_inexistente" };
  const secoes = [...ficha.secoes];
  secoes[idx] = {
    ...secoes[idx],
    filtros: [...secoes[idx].filtros, args.filtro],
  };
  return { ficha: { ...ficha, secoes } };
}
