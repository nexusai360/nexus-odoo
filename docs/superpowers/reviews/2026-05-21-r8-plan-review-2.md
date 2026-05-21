# Review #2 do Plano, F4 Onda 2 Rodada 8 (v2 -> v3)

> Review mais profunda, sobre o plano v2 (ja corrigido pela Review #1). Foco:
> performance, seguranca, integracao, qualidade de codigo, e o que a Review #1
> nao pegou. Cada achado conferido contra o codigo.

## Achados materiais

### D1. Latencia: sessoes externas abertas em serie travam todo run
`openExternalMcpSessions` abre uma sessao por servidor habilitado. Em serie,
cada `connect` + `listTools` soma latencia a **todo** run do agente, antes do
LLM comecar, mesmo quando a pergunta nao usa tool externa. 3 servidores a ~500ms
= +1,5s por mensagem. Pior: um servidor lento ou pendurado estola o run inteiro.
**Correcao v3:**
- Abrir todas as sessoes em paralelo (`Promise.allSettled`).
- Timeout por servidor no `connect`/`listTools` (ex.: 4s via `AbortSignal` ou
  corrida com timeout); estourou -> servidor pulado (isolamento ja previsto).
- T5.1 fixa isso explicitamente.

### D2. Nome de tool pode estourar o limite do provedor
`ext__<slug>__<toolName>`. Anthropic e OpenAI limitam nome de tool a ~64 chars.
`ext__` (5) + slug + `__` (2) + nome real (tools de MCP do GitHub passam de 20
chars). Slug longo estoura. **Correcao v3:** slug curto e limitado (<= 8 chars,
`[a-z0-9]`), e o nome prefixado final truncado para <= 60 chars; o router mapeia
o nome prefixado (unico) -> nome real, entao truncar o exposto e seguro desde
que o prefixado permaneca unico (garantir com fragmento do `id`).

### D3. `argsPreview` pode persistir segredo em texto puro
Tools externas tem schema arbitrario; uma tool pode receber token/senha como
argumento. Gravar `argsPreview` cru em `ExternalMcpCallLog` persiste segredo em
claro no nosso banco. As tools internas sao nossas e auditadas, as externas
nao. **Correcao v3:** antes de gravar, `argsPreview` passa por uma redacao: para
chaves que casem `/token|secret|senha|password|key|authorization|bearer/i`, o
valor vira `"[redacted]"`; o objeto inteiro e limitado em tamanho (ex.: 2 KB).
Helper `redactArgs()` em `external-mcp.ts`.

### D4. Duplicacao de ~200 linhas entre os dois timelines de log
v2 T4.4 diz "componente proprio reusando o padrao visual". `logs-timeline.tsx`
tem `formatMs`, `formatDatetime`, `JsonBlock`, `DetailField`, alem de
`getStatusConfig`, `FilterBar`/`rangeForPreset`. Construir `external-mcp-logs`
do zero duplica tudo. **Correcao v3:** extrair os helpers **puros e neutros de
dominio** (`formatMs`, `formatDatetime`, `JsonBlock`, `DetailField`) para um
modulo compartilhado (`src/components/integracoes/log-primitives.tsx`); ambos os
timelines passam a importar. O `getStatusConfig` e o `FilterBar` ficam
proprios de cada um (dominios diferentes: o externo so tem `ok`/`error`, mais
simples). Risco: mexer no `logs-timeline.tsx` recem-entregue; mitigar editando
so os imports, sem tocar a logica.

### D5. Trocar a rota raiz do Plugar MCP quebra links e `revalidatePath`
Hoje `/agente/plugar-mcps` mostra a lista de servidores. Apos o split, mostra a
Visao Geral; a lista vai para `/agente/plugar-mcps/servidores`. Dois efeitos:
- Links existentes para `/agente/plugar-mcps` que significam "a lista" (ex.:
  CTA da grade de Integracoes, textos da doc) passam a cair na Visao Geral.
- `external-mcp-servers.ts` faz `revalidatePath("/agente/plugar-mcps")` em
  create/update/toggle/delete; apos o split isso revalida a Visao Geral, nao a
  aba Servidores onde a mutacao aconteceu.
**Correcao v3:** task explicita para (a) grep dos links a `/agente/plugar-mcps`
e ajuste dos que querem dizer "a lista"; (b) trocar os `revalidatePath` das
actions para `/agente/plugar-mcps/servidores` (e adicionar a Visao Geral quando
fizer sentido). Sem isso, navegacao e cache ficam inconsistentes.

## Achados menores (aplicados no v3)
- d1. `run-agent.ts`: tool com prefixo `ext__` mas sem rota (servidor caiu)
  deve devolver um `tool_result` de erro claro, nao tentar no MCP interno.
- d2. `closeAll()` usa `Promise.allSettled`, nunca lanca (v2 ja dizia "engole
  erros"; v3 fixa o `allSettled`).
- d3. Visao Geral e aba Servidores ambas chamam `listExternalMcpServers`;
  aceitavel (query barata), so registrar.
- d4. Historico de conversa pode referenciar uma tool `ext__` de um servidor
  hoje desabilitado; `sanitizeHistoryPairs` ja cuida do pareamento, LLM tolera
  nome fora do catalogo atual. Sem acao, so anotado.

## Conclusao
5 achados materiais. D1 (latencia/timeout) e D3 (vazamento de segredo no log)
sao os mais graves: o primeiro degrada toda conversa do agente, o segundo e
risco de seguranca. D5 e uma quebra silenciosa de navegacao. v2 estava
funcional mas ingenuo em performance e seguranca da feature nova. v3 aplica os
5 e segue para execucao.
