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

/** Reposiciona uma secao: por direcao (cima/baixo) ou posicao (1-based). */
export function moverSecao(
  ficha: BuilderReportEntry,
  args: { secaoId: string; direcao?: "cima" | "baixo"; posicao?: number },
): MutResult {
  const idx = ficha.secoes.findIndex((s) => s.id === args.secaoId);
  if (idx < 0) return { erro: "secao_inexistente" };
  const n = ficha.secoes.length;
  let alvo: number;
  if (typeof args.posicao === "number") {
    alvo = Math.min(Math.max(args.posicao - 1, 0), n - 1);
  } else if (args.direcao === "cima") {
    alvo = Math.max(idx - 1, 0);
  } else if (args.direcao === "baixo") {
    alvo = Math.min(idx + 1, n - 1);
  } else {
    return { erro: "informe direcao (cima/baixo) ou posicao" };
  }
  if (alvo === idx) return { ficha };
  const secoes = [...ficha.secoes];
  const [s] = secoes.splice(idx, 1);
  secoes.splice(alvo, 0, s);
  return { ficha: { ...ficha, secoes } };
}

/** Renomeia o relatorio (titulo no topo). */
export function definirTitulo(
  ficha: BuilderReportEntry,
  args: { titulo: string },
): MutResult {
  const t = args.titulo.trim();
  if (!t) return { erro: "titulo_vazio" };
  return { ficha: { ...ficha, titulo: t } };
}

/** Define o titulo (config.titulo) de uma secao. */
export function definirTituloSecao(
  ficha: BuilderReportEntry,
  args: { secaoId: string; titulo: string },
): MutResult {
  const idx = ficha.secoes.findIndex((s) => s.id === args.secaoId);
  if (idx < 0) return { erro: "secao_inexistente" };
  const secoes = [...ficha.secoes];
  secoes[idx] = {
    ...secoes[idx],
    config: { ...secoes[idx].config, titulo: args.titulo.trim() },
  };
  return { ficha: { ...ficha, secoes } };
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
