// Normalização de layout do construtor (Onda 1). Função pura, testável.
// O POSICIONAMENTO em si é feito pelo CSS Grid (span de colunas/linhas), não aqui;
// esta camada só valida/clampa cada bloco às travas do seu tipo e ordena.
import {
  ALTURAS,
  LARGURAS,
  componentePorId,
  travasDoTipo,
} from "./catalogo";

export interface BlocoLayout {
  componenteId: string;
  ordem: number;
  largura: number; // quartos (1..4)
  altura: number; // unidades u
}

/** Converte largura em quartos para span de colunas no grid de 12. */
export function spanColunas(largura: number): number {
  return largura * 3;
}

/** Span de linhas no grid (1 u = 1 linha de auto-row). */
export function spanLinhas(altura: number): number {
  return altura;
}

function clampParaConjunto(valor: number, conjunto: readonly number[], min: number, max: number): number {
  // candidatos válidos dentro de [min,max] que pertencem ao conjunto permitido
  const validos = conjunto.filter((v) => v >= min && v <= max);
  const base = validos.length ? validos : [...conjunto];
  // escolhe o mais próximo do valor pedido
  return base.reduce((melhor, v) =>
    Math.abs(v - valor) < Math.abs(melhor - valor) ? v : melhor,
  base[0]);
}

/**
 * Normaliza uma lista de blocos: descarta componentes inexistentes no catálogo,
 * clampa largura/altura às travas do tipo (e aos conjuntos LARGURAS/ALTURAS) e
 * ordena por `ordem`. Não calcula posições (o CSS grid faz isso).
 */
export function normalizar(blocos: BlocoLayout[]): BlocoLayout[] {
  const out: BlocoLayout[] = [];
  for (const b of blocos) {
    const comp = componentePorId(b.componenteId);
    if (!comp) continue; // componente removido do catálogo: descarta
    const tr = travasDoTipo(comp.tipo);
    out.push({
      componenteId: b.componenteId,
      ordem: b.ordem,
      largura: clampParaConjunto(b.largura, LARGURAS, tr.larguraMin, tr.larguraMax),
      altura: clampParaConjunto(b.altura, ALTURAS, tr.alturaMin, tr.alturaMax),
    });
  }
  return out.sort((a, b) => a.ordem - b.ordem);
}
