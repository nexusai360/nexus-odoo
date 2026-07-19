// Desmembramento de kits para análise de compra.
//
// Quando um KIT é vendido, a demanda dele vira demanda dos seus componentes (via a Lista de
// Material). Assim a necessidade de compra é calculada no grão do que de fato se compra: o
// componente. Regras (todas medidas contra o cache real, 2026-07-18):
//   - Desmembramento é de 1 NÍVEL (nenhum componente é, por sua vez, um kit).
//   - Kit MONTADO em estoque abate a demanda antes de desmembrar (o kit pronto já atende como
//     kit; só o excedente vira demanda de componente).
//   - Kit SEM BOM (ou produto que não é kit) passa como ele mesmo (fallback honesto), sinalizado.
//   - A demanda é AGREGADA por componente (um componente pode vir de vários kits + venda avulsa).

export interface ItemDemanda {
  produtoId: number;
  nome: string | null;
  /** true quando a unidade de medida do produto é "kit". */
  ehKit: boolean;
  qtd: number;
}

export interface ComponenteBom {
  componenteProdutoId: number;
  componenteNome: string | null;
  /** Quantidade do componente por 1 unidade do kit. */
  quantidade: number;
}

export interface DemandaComponente {
  /** O componente (ou o próprio produto, quando não desmembrou). */
  produtoId: number;
  nome: string | null;
  qtd: number;
  /** true quando o produto era kit mas não tinha BOM (não desmembrou). */
  semBom: boolean;
}

export function desmembrarDemanda(
  itens: ItemDemanda[],
  /** produtoPaiId → componentes. */
  bomPorPai: Map<number, ComponenteBom[]>,
  /** produtoId do kit → saldo do kit MONTADO em estoque. */
  saldoKitMontado: Map<number, number>,
): DemandaComponente[] {
  // 1. Agrega a demanda por produto (kits e não-kits), para abater o kit montado uma vez só.
  const demandaPorProduto = new Map<
    number,
    { nome: string | null; qtd: number; ehKit: boolean }
  >();
  for (const it of itens) {
    const cur = demandaPorProduto.get(it.produtoId);
    if (cur) {
      cur.qtd += it.qtd;
      if (cur.nome == null && it.nome != null) cur.nome = it.nome;
    } else {
      demandaPorProduto.set(it.produtoId, { nome: it.nome, qtd: it.qtd, ehKit: it.ehKit });
    }
  }

  // 2. Desmembra e agrega por componente.
  const acc = new Map<number, { nome: string | null; qtd: number; semBom: boolean }>();
  const add = (id: number, nome: string | null, qtd: number, semBom: boolean) => {
    const cur = acc.get(id);
    if (cur) {
      cur.qtd += qtd;
      if (cur.nome == null && nome != null) cur.nome = nome;
      cur.semBom = cur.semBom || semBom;
    } else {
      acc.set(id, { nome, qtd, semBom });
    }
  };

  for (const [pid, d] of demandaPorProduto) {
    const bom = d.ehKit ? bomPorPai.get(pid) : undefined;
    if (bom && bom.length) {
      const qtdDesmembrar = Math.max(0, d.qtd - (saldoKitMontado.get(pid) ?? 0));
      for (const comp of bom) {
        add(comp.componenteProdutoId, comp.componenteNome, qtdDesmembrar * comp.quantidade, false);
      }
    } else {
      // não-kit, ou kit sem BOM (fallback honesto: passa o próprio produto, sinalizado).
      add(pid, d.nome, d.qtd, d.ehKit);
    }
  }

  return [...acc.entries()].map(([produtoId, v]) => ({
    produtoId,
    nome: v.nome,
    qtd: v.qtd,
    semBom: v.semBom,
  }));
}
