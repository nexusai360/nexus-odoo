// Histórico de preço , append-por-mudança.
//
// O dono pediu (reunião 2026-07-19) guardar a variação de preço no tempo, com data/hora, a cada
// ciclo de sync, para consultar no cache sem ir ao Odoo. Snapshot CHEIO por ciclo seria desperdício
// (~2,9 mil preços de venda x 144 ciclos/dia = ~425 mil linhas/dia); então gravamos só o que MUDOU
// desde o último registro de cada (tabela, produto). Esta função é o núcleo puro dessa decisão.

export interface PrecoAtual {
  tabelaId: number;
  produtoId: number;
  valor: number;
  tabelaNome?: string | null;
  produtoNome?: string | null;
}

export interface UltimoPreco {
  tabelaId: number;
  produtoId: number;
  valor: number;
}

/** Chave estável de um preço: (tabela, produto). */
function chave(tabelaId: number, produtoId: number): string {
  return `${tabelaId}:${produtoId}`;
}

/**
 * Dado o conjunto de preços ATUAIS (do cache/Odoo) e o ÚLTIMO valor já registrado no histórico por
 * (tabela, produto), retorna só os preços a GRAVAR: os novos (nunca vistos) e os que mudaram de
 * valor. Nunca regrava um valor igual ao último (append-por-mudança). Compara com tolerância de
 * centavo para não gravar ruído de arredondamento.
 */
export function precosQueMudaram(
  atuais: PrecoAtual[],
  ultimos: UltimoPreco[],
): PrecoAtual[] {
  const ultimoPorChave = new Map<string, number>();
  for (const u of ultimos) ultimoPorChave.set(chave(u.tabelaId, u.produtoId), u.valor);

  const out: PrecoAtual[] = [];
  for (const a of atuais) {
    const anterior = ultimoPorChave.get(chave(a.tabelaId, a.produtoId));
    // Novo (nunca registrado) ou valor diferente do último (tolerância de 1 centavo).
    if (anterior === undefined || Math.abs(anterior - a.valor) >= 0.01) {
      out.push(a);
    }
  }
  return out;
}
