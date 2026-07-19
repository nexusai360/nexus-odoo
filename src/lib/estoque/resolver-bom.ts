// Resolve a BOM de UM kit quando há mais de uma lista de material (Odoo permite variantes).
// A Fase 1 (necessidade de compra) somava TODAS as listas e duplicava componentes compartilhados
// nos kits multi-BOM. Aqui a escolha só age em multi-lista: kit de lista única passa reto
// (idêntico à Fase 1), nunca zera. Ver docs/superpowers/plans/2026-07-19-plan3-composicao-valor-kits.md.

export interface LinhaBom {
  componenteProdutoId: number;
  componenteNome: string | null;
  quantidade: number;
  listaId: number | null;
  listaDataAtivacao: Date | null;
  listaInativa: boolean;
}

export interface ComponenteResolvido {
  componenteProdutoId: number;
  componenteNome: string | null;
  quantidade: number;
}

export interface BomResolvida {
  componentes: ComponenteResolvido[];
  listaEscolhida: number | null;
  multiplasListas: boolean;
}

/** Agrega quantidade por componente (mesmo componente repetido soma). */
function agregar(linhas: LinhaBom[]): ComponenteResolvido[] {
  const acc = new Map<number, ComponenteResolvido>();
  for (const l of linhas) {
    const cur = acc.get(l.componenteProdutoId);
    if (cur) {
      cur.quantidade += l.quantidade;
      if (cur.componenteNome == null && l.componenteNome != null) cur.componenteNome = l.componenteNome;
    } else {
      acc.set(l.componenteProdutoId, {
        componenteProdutoId: l.componenteProdutoId,
        componenteNome: l.componenteNome,
        quantidade: l.quantidade,
      });
    }
  }
  return [...acc.values()];
}

export function resolverBom(linhas: LinhaBom[]): BomResolvida {
  if (linhas.length === 0) return { componentes: [], listaEscolhida: null, multiplasListas: false };

  const listasDistintas = [...new Set(linhas.map((l) => l.listaId))];
  // Lista única (ou sem listaId): passa reto, idêntico à Fase 1. NUNCA zera.
  if (listasDistintas.length <= 1) {
    return {
      componentes: agregar(linhas),
      listaEscolhida: listasDistintas[0] ?? null,
      multiplasListas: false,
    };
  }

  // Múltiplas listas: escolher UMA. Meta por lista (a ativação é a mesma em todas as linhas da lista).
  const metaPorLista = new Map<number, { dataAtivacao: Date | null; inativa: boolean }>();
  for (const l of linhas) {
    if (l.listaId == null) continue;
    if (!metaPorLista.has(l.listaId)) {
      metaPorLista.set(l.listaId, { dataAtivacao: l.listaDataAtivacao, inativa: l.listaInativa });
    }
  }
  let candidatas = [...metaPorLista.keys()].filter((id) => !metaPorLista.get(id)!.inativa);
  if (candidatas.length === 0) candidatas = [...metaPorLista.keys()]; // all-inactive: usa todas
  const ativadas = candidatas.filter((id) => metaPorLista.get(id)!.dataAtivacao != null);
  const pool = ativadas.length ? ativadas : candidatas; // nunca vazio
  const escolhida = pool.sort((a, b) => {
    const da = metaPorLista.get(a)!.dataAtivacao?.getTime() ?? 0;
    const db = metaPorLista.get(b)!.dataAtivacao?.getTime() ?? 0;
    return db - da || b - a; // maior data, desempate maior listaId (chute declarado)
  })[0];

  return {
    componentes: agregar(linhas.filter((l) => l.listaId === escolhida)),
    listaEscolhida: escolhida,
    multiplasListas: true,
  };
}
