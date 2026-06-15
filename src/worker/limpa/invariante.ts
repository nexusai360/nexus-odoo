// src/worker/limpa/invariante.ts , T5 do plan Limpa 2026+.
//
// Invariante de aceite do purge (spec §2.2/§6): saldo e contagem de a_pagar e
// a_receber EM ABERTO identicos antes/depois (R$ 0,00 de diferenca), celula a
// celula (tipo x situacao), NUNCA soma liquida. Quitado/baixado podem cair
// (e o proposito do purge) , viram informativo, nao violacao.

export const SITUACOES_VIVAS = new Set(["aberto", "provisorio"]);

export interface CelulaInvariante {
  tipo: string;
  situacao: string;
  n: number;
  /** somas como string decimal exata (numeric do PG), nunca float. */
  saldo: string;
  documento: string;
}

export interface ResultadoInvariante {
  ok: boolean;
  violacoes: string[];
  informativos: string[];
}

const chave = (c: CelulaInvariante) => `${c.tipo}/${c.situacao}`;

export function compararInvariante(
  antes: CelulaInvariante[],
  depois: CelulaInvariante[],
): ResultadoInvariante {
  const mapDepois = new Map(depois.map((c) => [chave(c), c]));
  const violacoes: string[] = [];
  const informativos: string[] = [];
  for (const a of antes) {
    const d = mapDepois.get(chave(a));
    const viva = SITUACOES_VIVAS.has(a.situacao);
    if (!d) {
      const msg = `${chave(a)}: celula sumiu (antes n=${a.n} saldo=${a.saldo})`;
      (viva ? violacoes : informativos).push(msg);
      continue;
    }
    if (d.n !== a.n || d.saldo !== a.saldo || d.documento !== a.documento) {
      const msg =
        `${chave(a)}: n ${a.n}->${d.n}, saldo ${a.saldo}->${d.saldo}, ` +
        `documento ${a.documento}->${d.documento}`;
      (viva ? violacoes : informativos).push(msg);
    }
  }
  // celula viva NOVA depois do purge tambem e anomalia (purge nao cria linha)
  const mapAntes = new Set(antes.map(chave));
  for (const d of depois) {
    if (!mapAntes.has(chave(d)) && SITUACOES_VIVAS.has(d.situacao)) {
      violacoes.push(`${chave(d)}: celula viva NOVA depois (n=${d.n} saldo=${d.saldo})`);
    }
  }
  return { ok: violacoes.length === 0, violacoes, informativos };
}
