// src/lib/reports/builder/dimensoes-filtro.ts
// F6 , dimensoes filtraveis (armazem/familia) derivadas do fato de saldo. O par
// (id, nome) vem direto do dado: o usuario escolhe um NOME no dropdown e o filtro
// viaja como ID (localId/familiaId), entao o produtor filtra no banco sem fuzzy.
import { limparNomeLocal } from "@/lib/reports/local-nome";

/** Opcao de dimensao para o dropdown de filtro: id que filtra + nome que mostra. */
export interface DimOpcao {
  id: number;
  nome: string;
}

export interface DimensoesFiltro {
  armazens: DimOpcao[];
  familias: DimOpcao[];
}

/** Linha minima do fato de saldo lida para montar as dimensoes. */
export interface LinhaDimensao {
  localId: number | null;
  localNome: string | null;
  familiaId: number | null;
  familiaNome: string | null;
}

/**
 * Extrai as dimensoes distintas (armazem/familia) das linhas do fato de saldo.
 * Mantem so id+nome utilizaveis (ambos presentes), deduplica por id e ordena
 * por nome (pt-BR). O rotulo do armazem passa por `limparNomeLocal` para casar
 * com o que o resto do relatorio mostra.
 */
export function extrairDimensoes(linhas: LinhaDimensao[]): DimensoesFiltro {
  const arm = new Map<number, string>();
  const fam = new Map<number, string>();
  for (const l of linhas) {
    if (l.localId != null && l.localNome && !arm.has(l.localId)) {
      arm.set(l.localId, limparNomeLocal(l.localNome).rotulo);
    }
    if (l.familiaId != null && l.familiaNome && !fam.has(l.familiaId)) {
      fam.set(l.familiaId, l.familiaNome.trim());
    }
  }
  const ordenar = (m: Map<number, string>): DimOpcao[] =>
    [...m.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { armazens: ordenar(arm), familias: ordenar(fam) };
}

/** Fatos cujas secoes aceitam recorte por armazem (localId). */
const FATOS_COM_ARMAZEM = new Set([
  "fato_estoque_saldo",
  "fato_estoque_local_produto",
  "fato_estoque_parados",
  "fato_estoque_movimento",
]);

/** Fatos cujas secoes aceitam recorte por familia (familiaId). */
const FATOS_COM_FAMILIA = new Set(["fato_estoque_saldo"]);

/** Quais dimensoes a barra de filtros deve oferecer para um conjunto de fatos. */
export function dimensoesDisponiveis(fatos: Iterable<string>): {
  armazem: boolean;
  familia: boolean;
} {
  const set = new Set(fatos);
  let armazem = false;
  let familia = false;
  for (const f of set) {
    if (FATOS_COM_ARMAZEM.has(f)) armazem = true;
    if (FATOS_COM_FAMILIA.has(f)) familia = true;
  }
  return { armazem, familia };
}
