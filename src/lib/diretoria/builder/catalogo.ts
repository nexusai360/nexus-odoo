// Catálogo de componentes do construtor de relatórios da Diretoria (Onda 1).
// Cada componente é um bloco posicionável. As TRAVAS de tamanho derivam do tipo
// (travasDoTipo), evitando inconsistência por componente. A capability é a do
// nível 1 (RBAC global por área); o nível 2 (fino) entra na Onda 5.
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";

export type TipoComponente = "kpi" | "tabela" | "grafico" | "mapa" | "widget";
export type FonteDado = "real" | "estimado" | "sem_fonte";
export type DominioComponente = "G" | "C" | "B" | "A" | "K";

/**
 * Grid de OITAVOS (8×8): 8 colunas na horizontal e 8 unidades na vertical.
 * Mínimo de qualquer bloco é nível 2 (nunca 1); máximo 8 (tela cheia). Vale para
 * largura E altura. Atualizado conforme o cliente (2026-06-29).
 */
export const GRID_COLS = 8;
export const LARGURAS = [2, 3, 4, 5, 6, 7, 8] as const;
export const ALTURAS = [2, 3, 4, 5, 6, 7, 8] as const;

export interface Travas {
  larguraMin: number;
  larguraMax: number;
  alturaMin: number;
  alturaMax: number;
}

/** Travas de tamanho por tipo de componente na escala 8×8 (mínimo nunca < 2). */
export function travasDoTipo(tipo: TipoComponente): Travas {
  switch (tipo) {
    case "kpi":
      // Faixa de KPIs (ex.: A-01 = 4 cards): pode ocupar de 2 a 8 colunas; baixa.
      return { larguraMin: 2, larguraMax: 8, alturaMin: 2, alturaMax: 3 };
    case "tabela":
      return { larguraMin: 3, larguraMax: 8, alturaMin: 3, alturaMax: 8 };
    case "grafico":
      return { larguraMin: 3, larguraMax: 6, alturaMin: 3, alturaMax: 6 };
    case "mapa":
      return { larguraMin: 4, larguraMax: 8, alturaMin: 4, alturaMax: 8 };
    case "widget":
      return { larguraMin: 4, larguraMax: 8, alturaMin: 3, alturaMax: 8 };
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
  // Estoque & Compras (domínios A e K) , Onda 1 completa
  comp({ id: "A-01", nome: "Indicadores de estoque", dominio: "A", tipo: "kpi", fonteDado: "real" }),
  comp({ id: "A-09", nome: "Indicadores avançados", dominio: "A", tipo: "kpi", fonteDado: "real" }),
  comp({ id: "A-02", nome: "Estoque por local", dominio: "A", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-03", nome: "Distribuição por família", dominio: "A", tipo: "grafico", fonteDado: "real", publica: ["familia"] }),
  comp({ id: "A-04", nome: "Distribuição por marca", dominio: "A", tipo: "grafico", fonteDado: "real", publica: ["marca"] }),
  comp({ id: "A-05", nome: "Catálogo de modelos", dominio: "A", tipo: "tabela", fonteDado: "real", consome: ["familia", "marca"] }),
  comp({ id: "A-06", nome: "Seriais em estoque", dominio: "A", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-07", nome: "Compras ativas", dominio: "K", tipo: "widget", fonteDado: "real" }),
  comp({ id: "A-08", nome: "Matriz por fornecedor", dominio: "K", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-10", nome: "Compras ao longo do tempo (NF entrada)", dominio: "K", tipo: "widget", fonteDado: "real" }),
  comp({ id: "K-01", nome: "Compras por fornecedor (NF entrada)", dominio: "K", tipo: "grafico", fonteDado: "real" }),
  // Vendas (loaders reusam queries/vendas.ts)
  comp({ id: "C-01", nome: "Indicadores de vendas", dominio: "C", tipo: "kpi", fonteDado: "estimado", consome: ["periodo"] }),
  comp({ id: "C-02", nome: "Vendas por estado", dominio: "C", tipo: "grafico", fonteDado: "real", publica: ["uf"], consome: ["periodo"] }),
  comp({ id: "C-03", nome: "Vendas por marca", dominio: "C", tipo: "grafico", fonteDado: "real", consome: ["periodo"] }),
  comp({ id: "C-05", nome: "Modalidades e maior pedido", dominio: "C", tipo: "grafico", fonteDado: "real", consome: ["periodo"] }),
  comp({ id: "C-07", nome: "Formas de pagamento", dominio: "C", tipo: "grafico", fonteDado: "real", consome: ["periodo"] }),
  // Demandas
  comp({ id: "B-03", nome: "Mapa de demandas por estado", dominio: "B", tipo: "mapa", fonteDado: "real", publica: ["uf"] }),
];

const PORID = new Map(CATALOGO.map((c) => [c.id, c]));

/** Busca um componente do catálogo por id (null se não existir). */
export function componentePorId(id: string): ComponenteCatalogo | null {
  return PORID.get(id) ?? null;
}
