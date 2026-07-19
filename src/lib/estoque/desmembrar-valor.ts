export interface PesoComponente {
  componenteId: number;
  peso: number;
}
export interface ValorComponente {
  componenteId: number;
  valor: number;
}

/**
 * Rateia um total (em CENTAVOS, inteiro) entre componentes proporcional ao peso, com
 * fechamento por MAIOR RESTO: a soma dos rateados e exatamente o total (nenhum centavo
 * perdido). Peso = quantidade x preco_custo do componente (definido por quem chama). Se a
 * soma dos pesos for 0, divide igualmente (fallback honesto). Trabalha em inteiro para nao
 * vazar centavo. Quem chama converte reais->centavos (Math.round(reais*100)) e volta (/100).
 */
export function desmembrarValor(
  totalCentavos: number,
  pesos: PesoComponente[],
): ValorComponente[] {
  if (pesos.length === 0) return [];
  const total = Math.round(totalCentavos);
  const positivos = pesos.map((p) => Math.max(0, p.peso));
  const somaPesos = positivos.reduce((s, x) => s + x, 0);
  // Fallback: sem pesos validos, divide igualmente.
  const base = somaPesos > 0 ? positivos : pesos.map(() => 1);
  const somaBase = base.reduce((s, x) => s + x, 0);

  // Piso (floor) de cada parte + resto fracionario, para distribuir os centavos que sobram.
  const brutos = base.map((peso) => (total * peso) / somaBase);
  const piso = brutos.map((x) => Math.floor(x));
  const sobra = total - piso.reduce((s, x) => s + x, 0);
  // Maior resto primeiro (desempate por indice estavel).
  const ordem = brutos
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  const valor = [...piso];
  for (let k = 0; k < sobra; k++) valor[ordem[k].i] += 1;

  return pesos.map((p, i) => ({ componenteId: p.componenteId, valor: valor[i] }));
}
