// Catálogo de componentes do construtor de relatórios da Diretoria (Onda 1).
// Cada componente é um bloco posicionável. As TRAVAS de tamanho derivam do tipo
// (travasDoTipo), evitando inconsistência por componente. A capability é a do
// nível 1 (RBAC global por área); o nível 2 (fino) entra na Onda 5.
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";

export type TipoComponente = "kpi" | "tabela" | "grafico" | "mapa" | "widget";
export type FonteDado = "real" | "estimado" | "sem_fonte";
export type DominioComponente = "G" | "C" | "B" | "A" | "K";

/**
 * Grid: 8 colunas na horizontal; na vertical vai até 12 unidades (cada unidade =
 * 100px). Mínimo de qualquer bloco é nível 2 (nunca 1). A LARGURA máxima é 8 (a
 * própria grade); a ALTURA máxima depende do tipo (tabelas vão até 12 para caber
 * quase uma tela cheia, pedido do cliente 2026-07-21). Atualizado 2026-06-29 / 2026-07-21.
 */
export const GRID_COLS = 8;
export const LARGURAS = [2, 3, 4, 5, 6, 7, 8] as const;
export const ALTURAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

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
      // Tabelas podem crescer até 12 na vertical (quase tela cheia) , pedido do
      // cliente (2026-07-21) para a tabela de Entregas parciais ter mais espaço.
      return { larguraMin: 3, larguraMax: 8, alturaMin: 3, alturaMax: 12 };
    case "grafico":
      // Antes travava em 6×6 (cliente reclamou que a vertical não ia até 8).
      return { larguraMin: 3, larguraMax: 8, alturaMin: 3, alturaMax: 8 };
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
  comp({ id: "A-11", nome: "Distribuição dinâmica (rosca/barras)", dominio: "A", tipo: "widget", fonteDado: "real" }),
  comp({ id: "A-05", nome: "Catálogo de modelos", dominio: "A", tipo: "tabela", fonteDado: "real", consome: ["familia", "marca"] }),
  comp({ id: "A-06", nome: "Seriais em estoque", dominio: "A", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-12", nome: "Estoque disponível (a comprar)", dominio: "A", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-13", nome: "Estoque em demonstração", dominio: "A", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-14", nome: "Necessidade de compra", dominio: "A", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-15", nome: "Composição de valor dos kits", dominio: "A", tipo: "widget", fonteDado: "real" }),
  comp({ id: "A-07", nome: "Compras ativas", dominio: "K", tipo: "widget", fonteDado: "real" }),
  comp({ id: "A-08", nome: "Matriz por fornecedor", dominio: "K", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "A-10", nome: "Compras ao longo do tempo (NF entrada)", dominio: "K", tipo: "widget", fonteDado: "real" }),
  comp({ id: "K-01", nome: "Ranking de compras por fornecedor", dominio: "K", tipo: "widget", fonteDado: "real" }),
  // Vendas (C-*)
  comp({ id: "C-01", nome: "Indicadores de vendas", dominio: "C", tipo: "kpi", fonteDado: "real", consome: ["periodo"] }),
  comp({ id: "C-02", nome: "Vendas por estado (mapa)", dominio: "C", tipo: "mapa", fonteDado: "real", publica: ["uf"], consome: ["periodo"] }),
  comp({ id: "C-03", nome: "Vendas por marca", dominio: "C", tipo: "grafico", fonteDado: "real", consome: ["periodo"] }),
  comp({ id: "C-04", nome: "Ranking de estados", dominio: "C", tipo: "widget", fonteDado: "real", consome: ["periodo"] }),
  comp({ id: "C-05", nome: "Operações fiscais (pedidos)", dominio: "C", tipo: "grafico", fonteDado: "real", consome: ["periodo"] }),
  comp({ id: "C-07", nome: "Formas de pagamento (títulos)", dominio: "C", tipo: "grafico", fonteDado: "real", consome: ["periodo"] }),
  comp({ id: "C-09", nome: "Distribuição dinâmica (marca/estado/pagamento)", dominio: "C", tipo: "widget", fonteDado: "real", consome: ["periodo"] }),
  // Pedidos & Entregas (B-*)
  comp({ id: "B-01", nome: "Indicadores de demandas", dominio: "B", tipo: "kpi", fonteDado: "real" }),
  comp({ id: "B-02", nome: "Mapa de demandas por estado", dominio: "B", tipo: "mapa", fonteDado: "real", publica: ["uf"] }),
  comp({ id: "B-03", nome: "Mapa de demandas por estado", dominio: "B", tipo: "mapa", fonteDado: "real", publica: ["uf"] }),
  comp({ id: "B-04", nome: "Pedidos pendentes", dominio: "B", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "B-05", nome: "Ranking de estados (demandas)", dominio: "B", tipo: "widget", fonteDado: "real" }),
  comp({ id: "B-06", nome: "Demanda por etapa", dominio: "B", tipo: "grafico", fonteDado: "real" }),
  comp({ id: "B-07", nome: "Demandas mais paradas", dominio: "B", tipo: "tabela", fonteDado: "real" }),
  comp({ id: "B-08", nome: "Entregas parciais , indicadores", dominio: "B", tipo: "kpi", fonteDado: "real" }),
  comp({ id: "B-09", nome: "Entregas parciais , tabela", dominio: "B", tipo: "tabela", fonteDado: "real" }),
];

const PORID = new Map(CATALOGO.map((c) => [c.id, c]));

/** Busca um componente do catálogo por id (null se não existir). */
export function componentePorId(id: string): ComponenteCatalogo | null {
  return PORID.get(id) ?? null;
}
