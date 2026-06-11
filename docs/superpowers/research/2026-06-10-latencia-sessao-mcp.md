# Investigação , latência ~60s na sessão MCP (PENDENTE: confirmar fase + fix)

> Sintoma (print do usuário): pergunta "quanto faturamos no mês corrente?" levou **73,2s**
> na bubble. Próxima sessão deve FECHAR isso (confirmar a fase exata + implementar o fix).

## Evidência já levantada (sólida)
- **Não é o LLM.** No `llm_usage` da conversa (id `757ba0e6-...`, turno 21:47 UTC = 18:47 BRT):
  loop_principal 3,2s + loop_principal 7,9s + enhance ≈ **~13s** (do `user msg` 21:47:38 ao
  `assistant` 21:47:51). A UI marcou 73,2s → **~60s "escuros" fora das chamadas de LLM.**
- **Causa provável: timeout default do SDK MCP.** `src/lib/agent/mcp-client.ts`:
  - `createMcpSession` abre uma **sessão NOVA a cada turno** (handshake do zero toda vez).
  - `new StreamableHTTPClientTransport(url, { requestInit:{headers} })` , **SEM `timeout`
    explícito** → o SDK usa o default `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000` (**60s**).
  - O valor 60s bate exatamente com o tempo escuro. Hipótese: o handshake streamable-HTTP
    (connect/initialize ou o stream SSE) fica pendurado esperando até ~60s e então completa
    (o turno deu certo a 73s → completou perto dos 60s, não falhou).

## O que faltou (bloqueio do probe)
Tentei cronometrar `connect` vs `listTools` vs `callTool` com `scripts` (tsx) contra o mcp
local (`MCP_URL=http://localhost:3100/mcp`), mas o container rejeitou no `resolveUserContext`
("Usuário não encontrado ou inativo") mesmo com userId real/ativo , gotcha de auth/estado
do container de dev (mesma família da F6: mcp sobe sem DB-auth boa). O probe-host também tem
o limite conhecido (host→container streamable "other side closed", F6).

## PRÓXIMA SESSÃO , como fechar
1. **Probe autenticado:** descobrir por que `resolveUserContext` rejeita o probe (rodar como o
   app roda; ou conferir `MCP_DATABASE_URL`/role `nexus_mcp` do container mcp, força-recriar da
   raiz). Aí cronometrar cada fase (connect/listTools/callTool) , confirma se os 60s estão no
   `connect` (stream SSE) ou em outra chamada.
2. **Alternativa:** instrumentar `run-agent.ts` (logs de tempo antes/depois de `createMcpSession`,
   `listTools`, cada `callTool`) e reproduzir pela bubble (localhost:3000) , vê o tempo real.
3. **Fix (depende da fase, mas a direção):**
   - **Timeout explícito sano** no transport/`callTool` (ex.: 20-30s) , MAS o turno hoje
     COMPLETA perto dos 60s, então só baixar o timeout faria FALHAR em vez de demorar.
     Atacar o **stall** é o certo (por que o stream demora a estabilizar).
   - **Reusar a sessão MCP** entre turnos (hoje refaz handshake a cada pergunta) , elimina o
     custo recorrente; o 1º turno ainda paga o handshake.
   - Conferir se em PROD (app→mcp pela rede interna docker `mcp:3100`) o comportamento difere
     do dev (app-host→`localhost:3100`).

## Arquivos
- `src/lib/agent/mcp-client.ts` (transport sem timeout, sessão por turno).
- `src/lib/agent/run-agent.ts` (linha ~335 `createMcpSession`, ~487 `listTools`).
