// src/lib/estoque/dedup-chave.ts
// Colapsa linhas de mesma chave antes do calcularDelta. O fato_preco tem regras identicas
// com odoo_id diferente (o par produto 15049); sem colapsar, as duas entram na captura e
// violam o indice unico parcial WHERE vigente, abortando o bootstrap.
import type { LinhaSerie } from "./delta-serie";

export interface DedupResultado {
  linhas: LinhaSerie[];
  conflitos: string[];
}

function valoresIguais(a: (string | null)[], b: (string | null)[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function dedupPorChave(
  itens: { id: number; linha: LinhaSerie }[],
): DedupResultado {
  // menor id primeiro: o primeiro a ocupar a chave e o vencedor deterministico.
  const ordenado = [...itens].sort((x, y) => x.id - y.id);
  const escolhida = new Map<string, LinhaSerie>();
  const conflitos = new Set<string>();

  for (const { linha } of ordenado) {
    const atual = escolhida.get(linha.chave);
    if (atual === undefined) {
      escolhida.set(linha.chave, linha);
    } else if (!valoresIguais(atual.valores, linha.valores)) {
      // mesma chave, valor diferente: mantem a de menor id (ja escolhida) e sinaliza.
      conflitos.add(linha.chave);
    }
    // valores iguais: colapsa (ignora a segunda), sem conflito.
  }

  return { linhas: [...escolhida.values()], conflitos: [...conflitos] };
}
