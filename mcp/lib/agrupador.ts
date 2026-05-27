/**
 * Helpers de agrupamento usados pelos envelopes de tool.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §3.1 A2.
 *
 * topPorParticipante: agrega linhas de titulos (financeiro_contas_a_pagar,
 * financeiro_contas_a_receber, financeiro_titulos_vencidos) por
 * participanteNome, soma vrSaldo, ordena desc e aplica limite.
 */

export interface TopParticipante {
  nome: string;
  soma: number;
  n: number;
}

export interface LinhaAgregavel {
  participanteNome?: string | null;
  vrSaldo?: number | null;
}

export function topPorParticipante<T extends LinhaAgregavel>(
  linhas: T[],
  limite = 10,
): TopParticipante[] {
  const acc = new Map<string, { soma: number; n: number }>();

  for (const linha of linhas) {
    const nome = (linha.participanteNome ?? "").trim();
    if (!nome) continue;
    const saldo = Number(linha.vrSaldo ?? 0);
    const atual = acc.get(nome) ?? { soma: 0, n: 0 };
    atual.soma += saldo;
    atual.n += 1;
    acc.set(nome, atual);
  }

  return Array.from(acc.entries())
    .map(([nome, { soma, n }]) => ({ nome, soma, n }))
    .sort((a, b) => b.soma - a.soma)
    .slice(0, limite);
}
