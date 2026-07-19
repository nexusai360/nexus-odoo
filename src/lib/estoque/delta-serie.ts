// src/lib/estoque/delta-serie.ts
// Nucleo puro do append-por-mudanca de uma serie temporal (preco ou saldo).
//
// Recebe as linhas ATUAIS do fato (ja deduplicadas por chave, valores como string decimal ou
// null) e o VIGENTE anterior (a ultima linha de cada chave). Devolve so o que gravar:
// - chave nova ou com valor diferente -> 'mudanca';
// - chave que existia e sumiu -> 'baixa' (valores null);
// - chave cujo vigente ja era baixa e reaparece -> 'mudanca' (ressurreicao);
// - chave que ja estava baixada e continua ausente -> nada.
// Comparacao por string, exata: null so e igual a null. NUNCA tolerancia em number , o dado
// ja chega quantizado em Decimal e a subtracao em float perderia mudanca real.
export type EventoSerie = "mudanca" | "baixa";

export interface LinhaSerie {
  chave: string;
  valores: (string | null)[];
}

export interface LinhaDelta {
  chave: string;
  evento: EventoSerie;
  valores: (string | null)[];
}

function iguais(a: (string | null)[], b: (string | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function ehBaixa(valores: (string | null)[]): boolean {
  return valores.every((v) => v === null);
}

export function calcularDelta(
  atuais: LinhaSerie[],
  vigentes: LinhaSerie[],
): LinhaDelta[] {
  const vigentePorChave = new Map<string, (string | null)[]>();
  for (const v of vigentes) vigentePorChave.set(v.chave, v.valores);

  const out: LinhaDelta[] = [];
  const chavesAtuais = new Set<string>();

  for (const a of atuais) {
    chavesAtuais.add(a.chave);
    const anterior = vigentePorChave.get(a.chave);
    if (anterior === undefined || !iguais(anterior, a.valores)) {
      out.push({ chave: a.chave, evento: "mudanca", valores: a.valores });
    }
  }

  // Baixas: estava vigente (e nao era baixa) e sumiu dos atuais.
  for (const v of vigentes) {
    if (chavesAtuais.has(v.chave)) continue;
    if (ehBaixa(v.valores)) continue; // ja estava baixada
    out.push({ chave: v.chave, evento: "baixa", valores: v.valores.map(() => null) });
  }

  return out;
}
