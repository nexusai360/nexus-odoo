// Catálogo de componentes do construtor de relatórios da Diretoria (Onda 1).
// Cada componente é um bloco posicionável. As TRAVAS de tamanho derivam do tipo
// (travasDoTipo), evitando inconsistência por componente. A capability é a do
// nível 1 (RBAC global por área); o nível 2 (fino) entra na Onda 5.
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";

export type TipoComponente = "kpi" | "tabela" | "grafico" | "mapa" | "widget";
export type FonteDado = "real" | "estimado" | "sem_fonte";
export type DominioComponente = "G" | "C" | "B" | "A" | "K";

/** Larguras (em quartos) e alturas (em unidades u ≈ 132px) permitidas no grid. */
export const LARGURAS = [1, 2, 3, 4] as const;
export const ALTURAS = [1, 2, 3, 4, 6] as const;

export interface Travas {
  larguraMin: number;
  larguraMax: number;
  alturaMin: number;
  alturaMax: number;
}

/** Travas de tamanho por tipo de componente (SPEC §3). */
export function travasDoTipo(tipo: TipoComponente): Travas {
  switch (tipo) {
    case "kpi":
      return { larguraMin: 1, larguraMax: 2, alturaMin: 1, alturaMax: 2 };
    case "tabela":
      return { larguraMin: 1, larguraMax: 4, alturaMin: 2, alturaMax: 6 };
    case "grafico":
      return { larguraMin: 2, larguraMax: 4, alturaMin: 2, alturaMax: 4 };
    case "mapa":
      return { larguraMin: 2, larguraMax: 4, alturaMin: 3, alturaMax: 6 };
    case "widget":
      return { larguraMin: 2, larguraMax: 4, alturaMin: 2, alturaMax: 6 };
  }
}

/** Mapeia o domínio do componente para a área de RBAC (capability nível 1). */
export function areaDoDominio(dominio: DominioComponente): DiretoriaArea {
  switch (dominio) {
    case "G":
      return "visao_geral";
    case "C":
      return "vendas";
    case "B":
      return "pedidos";
    case "A":
      return "estoque";
    case "K":
      return "estoque"; // Compras vive dentro de Estoque & Compras.
  }
}

export interface ComponenteCatalogo {
  id: string;
  nome: string;
  dominio: DominioComponente;
  tipo: TipoComponente;
  fonteDado: FonteDado;
  /** Capability de nível 1 necessária para ver o componente. */
  capability: string;
  /** Chaves de contexto que publica (ex.: "uf", "item"). */
  publica?: string[];
  /** Chaves de contexto que consome (ex.: "periodo", "uf"). */
  consome?: string[];
}

/** Helper de construção: deriva a capability da área do domínio. */
function comp(
  c: Omit<ComponenteCatalogo, "capability">,
): ComponenteCatalogo {
  return { ...c, capability: `diretoria.${areaDoDominio(c.dominio)}.view` };
}

/**
 * Catálogo. Onda 1 declara o conjunto inicial; ondas seguintes preenchem o
 * restante da SPEC §5. Ter um componente aqui não exige loader (ver loaders.ts);
 * sem loader, o bloco aparece como "em breve".
 */
export const CATALOGO: ComponenteCatalogo[] = [
  // Visão Geral
  comp({ id: "G-01", nome: "Indicadores executivos", dominio: "G", tipo: "kpi", fonteDado: "real" }),
  comp({ id: "G-03", nome: "Mapa de demandas por estado", dominio: "G", tipo: "mapa", fonteDado: "real", publica: ["uf"] }),
  // Estoque (com loader pronto na Onda 1)
  comp({ id: "A-01", nome: "Indicadores de estoque", dominio: "A", tipo: "kpi", fonteDado: "real" }),
  comp({ id: "A-02", nome: "Estoque por local", dominio: "A", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-03", nome: "Distribuição por família", dominio: "A", tipo: "grafico", fonteDado: "real" }),
  comp({ id: "A-04", nome: "Distribuição por marca", dominio: "A", tipo: "grafico", fonteDado: "real" }),
];

const PORID = new Map(CATALOGO.map((c) => [c.id, c]));

/** Busca um componente do catálogo por id (null se não existir). */
export function componentePorId(id: string): ComponenteCatalogo | null {
  return PORID.get(id) ?? null;
}
