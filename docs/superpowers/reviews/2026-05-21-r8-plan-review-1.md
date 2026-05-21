# Review #1 do Plano, F4 Onda 2 Rodada 8 (v1 -> v2)

> Auditoria adversarial do plano v1
> (`docs/superpowers/plans/2026-05-21-f4-onda2-r8.md`). Objetivo: achar erro,
> dependencia quebrada, premissa nao verificada, escopo ambiguo. Cada achado foi
> conferido contra o codigo real, nao suposto.

## Achados materiais

### M1. Dependencia de ordem entre blocos quebrada
O Bloco 3 (`callExternalTool` grava em `ExternalMcpCallLog`) e a T2.3 (Visao
Geral consome `externalMcpCallStats`) dependem do **modelo Prisma** criado no
Bloco 4 (T4.1). A ordem do v1 (5 -> 1 -> 2 -> 3 -> 4 -> 6) faz os Blocos 2 e 3
referenciarem codigo que ainda nao existe. Plano nao executavel na ordem dada.
**Correcao v2:** mover a criacao do modelo + migration (T4.1) e a Server Action
de consulta/stats (T4.2) para **antes** do Bloco 2. Nova ordem:
5 -> 1 -> 4(model+action) -> 2 -> 3 -> 4(UI da aba Logs) -> 6. Renumerar.

### M2. `run-agent.test.ts` quebra ao integrar o MCP externo
Verificado: `run-agent.test.ts` faz `jest.mock("./mcp-client")` e `jest.mock`
de `@/lib/prisma` sem o delegate `externalMcpServer`. Ao adicionar
`import { openExternalMcpSessions } from "./external-mcp"` no `run-agent.ts`, o
modulo real roda no teste, chama `prisma.externalMcpServer.findMany` e estoura
(`externalMcpServer` indefinido no mock). "jest verde" e impossivel sem tratar
isso. **Correcao v2:** task explicita no Bloco 3 para adicionar
`jest.mock("./external-mcp", ...)` em `run-agent.test.ts`, e revisar
`mcp-client.test.ts`.

### M3. Transporte SSE assumido sem verificacao
O campo `ExternalMcpServer.transport` aceita `"sse"` (Zod enum em
`external-mcp-servers.ts`). O v1 dizia "sse -> SSEClientTransport" sem
confirmar. **Verificado:** o SDK exporta
`@modelcontextprotocol/sdk/client/sse` (`SSEClientTransport`).
**Correcao v2:** T3.1 fixa as duas importacoes reais; servidor cuja conexao
falha (ou transporte invalido) cai no isolamento de falha (skip + warn).

### M4. Construcao do header de auth nao especificada
O v1 dizia "auth por servidor" vago. **Verificado** em `external-mcp-servers.ts`
(`testExternalMcpServer`): o padrao e `headers[authHeader] = decrypt(authToken)`
— valor cru do token, sem o codigo prefixar "Bearer" (o usuario guarda o valor
completo). **Correcao v2:** T3.1 fixa esse padrao exato e o reuso de `decrypt`
de `@/lib/encryption`; nao reimplementar cripto nem inventar prefixo.

### M5. Escopo das tools externas nao decidido
O agente roda para qualquer usuario (chat in-app, WhatsApp, playground).
`ExternalMcpServer` nao tem escopo por usuario. O v1 nao dizia se as tools
externas entram em todos os runs. **Decisao v2 (explicita):** sim, todo servidor
externo habilitado municia o agente em todos os contextos, como o MCP interno
— e capacidade de plataforma, gerida por super_admin. Sem scoping por usuario.

### M6. Tour do Plugar MCP com a pagina quebrada em rotas
T2.2 dizia "mover o tour" sem concretude. O `plugarMcpsTour` hoje auto-inicia na
pagina unica e seus alvos (`plugar-mcps-novo`, `plugar-mcps-lista`) ficam na
futura aba Servidores. **Correcao v2:** `TourTriggerButton` + `TourAutoStart` do
Plugar MCP vao para a aba Servidores (`servidores/page.tsx`). Visao Geral e Logs
ficam sem tour proprio nesta rodada (fora de escopo).

### M7. "Conectado" nao garante MCP valido
**Verificado:** `testExternalMcpEndpoint`/`testExternalMcpServer` so fazem um
`GET` de alcancabilidade, nao um handshake MCP. Um servidor marca
`lastStatus=ok` sem ser um MCP valido; so `client.connect` + `listTools` valida.
**Correcao v2:** registrar que `lastStatus` e "alcancabilidade", a integracao
NAO o sobrescreve (evita escrita-surpresa no path do agente), e a Visao Geral
mede a saude real pelo `ExternalMcpCallLog` (sucesso/erro de chamada), nao so
pelo `lastStatus`.

## Achados menores (anotados, aplicados no v2)
- m1. T2.3 deve ter estado vazio honesto distinto para "sem servidores" vs "sem
  chamadas" (ja estava no v1, manter explicito).
- m2. As novas rotas de pagina precisam de `export const dynamic = "force-dynamic"`
  (a pagina atual ja usa), por lerem dados a cada request.

## Conclusao
7 achados materiais, sendo M1 (ordem) e M2 (testes) bloqueadores de execucao.
O v1 nao era executavel na ordem proposta. v2 reordena os blocos, adiciona a
task de mock de teste, e fixa as 4 premissas tecnicas (M3-M7) contra o codigo
real. Segue para o v2.
