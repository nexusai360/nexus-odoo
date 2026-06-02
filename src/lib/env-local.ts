/**
 * Detecta se o app esta rodando localmente (dev), nao em producao.
 *
 * Producao roda via `next start` com NODE_ENV=production (container/Portainer).
 * Dev local roda via `next dev` (NODE_ENV=development) em localhost. Usado para
 * exibir/gatear ferramentas de operador que so fazem sentido na maquina local
 * (ex.: botao de avaliar pendentes via LLM-judge, que dispara um script).
 */
export function isLocalRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}
