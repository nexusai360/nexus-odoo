// Normalização de layout do construtor. Função pura, testável. Grid de OITAVOS
// (8 colunas). Cada bloco tem posição (x,y) e tamanho (largura,altura) em
// oitavos; esta camada clampa às travas do tipo, ao conjunto permitido e aos
// limites do grid, e ordena.
import {
  ALTURAS,
  GRID_COLS,
  LARGURAS,
  componentePorId,
  travasDoTipo,
} from "./catalogo";

export interface BlocoLayout {
  componenteId: string;
  ordem: number;
  largura: number; // oitavos (2..8)
  altura: number; // oitavos (2..8)
  x: number; // coluna inicial (0..GRID_COLS-largura)
  y: number; // linha inicial (>=0)
}

function clampParaConjunto(valor: number, conjunto: readonly number[], min: number, max: number): number {
  const validos = conjunto.filter((v) => v >= min && v <= max);
  const base = validos.length ? validos : [...conjunto];
  return base.reduce((melhor, v) =>
    Math.abs(v - valor) < Math.abs(melhor - valor) ? v : melhor,
  base[0]);
}

/**
 * Normaliza uma lista de blocos: descarta componentes inexistentes no catálogo,
 * clampa largura/altura às travas do tipo (e aos conjuntos LARGURAS/ALTURAS),
 * clampa a posição (x dentro do grid, y >= 0) e ordena por `ordem`.
 */
export function normalizar(blocos: BlocoLayout[]): BlocoLayout[] {
  const out: BlocoLayout[] = [];
  for (const b of blocos) {
    const comp = componentePorId(b.componenteId);
    if (!comp) continue; // componente removido do catálogo: descarta
    const tr = travasDoTipo(comp.tipo);
    const largura = clampParaConjunto(b.largura, LARGURAS, tr.larguraMin, tr.larguraMax);
    const altura = clampParaConjunto(b.altura, ALTURAS, tr.alturaMin, tr.alturaMax);
    const x = Math.max(0, Math.min(b.x ?? 0, GRID_COLS - largura));
    const y = Math.max(0, b.y ?? 0);
    out.push({ componenteId: b.componenteId, ordem: b.ordem, largura, altura, x, y });
  }
  return out.sort((a, b) => a.ordem - b.ordem);
}
