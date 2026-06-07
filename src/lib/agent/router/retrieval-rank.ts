// F3 (cerebro, onda 3a): rank da tool escolhida pelo LLM dentro do ranking que o
// retrieval ofereceu. Usado no shadow-compare (chosenToolRank em AgentRouterDecision)
// para o gate de go-live: % de turnos com a tool usada dentro do top-K.

/** Indice 0-based de `toolName` em `offeredOrdered`, ou null se nao oferecida. */
export function rankOf(toolName: string, offeredOrdered: readonly string[]): number | null {
  const i = offeredOrdered.indexOf(toolName);
  return i === -1 ? null : i;
}
