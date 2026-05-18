# Review — F4 Onda 4a (Fundação do servidor MCP)

**Data:** 2026-05-18
**Revisor:** Claude (revisão sênior — conformidade com spec/plano + qualidade de código)
**Escopo:** commits `3bd5a78`..`b6a4111` (19 tasks), arquivos em `mcp/`, schema Prisma F4
**Spec:** `docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md` (v3)
**Plano:** `docs/superpowers/plans/2026-05-17-f4-mcp-semantico.md` (Onda 4a)

**Veredito: REPROVADO** — 2 CRÍTICOS, 4 IMPORTANTES, 5 MENORES.

A maior parte da fundação está sólida e bem testada (423 testes verdes, `tsc`
limpo nos dois projetos). Porém há um **desvio crítico baseado em premissa
técnica falsa**: a camada 1 do RBAC (`tools/list` filtrado por usuário) foi
silenciosamente removida sob a alegação de que o SDK impede a sobrescrita do
handler — alegação **refutada empiricamente** nesta review. Como a spec §3.6
classifica as camadas 1/2/6 como "parte da definição de uma tool" e controles
**ativos** nesta fase, a onda não pode fechar como está.

---

## Verificação executada

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` (raiz) | PASS — sem erros |
| `npx tsc -p mcp/tsconfig.json` | PASS — sem erros |
| `npx jest` (suite completa) | PASS — 63 suites, 423 testes |

Verde confirmado. A verificação **funcional** não cobre o defeito da camada 1
porque o catálogo está vazio nesta onda — `tools/list` devolvendo `[]` passa
tanto na implementação correta quanto na incorreta. O defeito só apareceria com
tools reais (ondas 4c+), o que torna o achado mais perigoso, não menos.

---

## CRÍTICO

### C1 — Camada 1 do RBAC removida com base em premissa técnica FALSA
**Arquivo:** `mcp/server.ts:6-13`, `mcp/server.ts:117-138`; `mcp/SDK-NOTES.md:84-115`
**Tasks:** 4a.1, 4a.16
**Spec:** §3.6 camada 1 ("Catálogo filtrado por usuário (ativa)"); §3.3 (`userId`
conhecido desde a abertura da sessão); plano Task 4a.16 Step 1
("registro do `McpServer` com as tools de `visibleTools(catalogo, user)`").

**Problema.** O `server.ts` afirma, em comentário de arquitetura:

> "O McpServer do SDK não permite sobrescrever ListToolsRequestSchema/
> CallToolRequestSchema após McpServer inicializado (assertRequestHandlerCapability lança)."

e conclui que `tools/list` devolve **todas as tools** para qualquer usuário,
adiando o filtro por usuário para a F5. Isso **contradiz a própria SDK-NOTES.md**
(linhas 88-97), que dizia o oposto ("podemos interceptar `tools/list` e filtrar").
O implementador inverteu a conclusão no meio do caminho sem reexecutar o teste.

**A premissa é falsa.** Verificação empírica com `@modelcontextprotocol/sdk@1.29.0`:

```
TESTE1 (s.server.setRequestHandler(ListToolsRequestSchema) APÓS s.tool(...)):
  OK — não lançou
TESTE2 (setRequestHandler ANTES de qualquer tool, sem registerCapabilities):
  LANÇOU -> "Server does not support tools (required for tools/list)"
TESTE3 (registerCapabilities({tools:{}}) + setRequestHandler ListTools + CallTool):
  OK
```

`assertRequestHandlerCapability` **não lança** por "handler já registrado" — lança
por **capability `tools` ausente**. Registrar ao menos uma tool com `registerTool`
(ou chamar `registerCapabilities({tools:{}})`) habilita a capability, e a partir
daí `setRequestHandler(ListToolsRequestSchema, ...)` é aceito e **sobrescreve** o
handler interno do `McpServer`. Ou seja: o caminho que a SDK-NOTES.md original
descreveu **funciona**. O desvio é uma solução preguiçosa, não uma limitação do SDK.

**Por que isto é CRÍTICO e não pode ir para F5.** A spec §3.6 é explícita:
"as camadas 1, 2 e 6 fazem parte da definição de 'uma tool' e são exercidas por
toda tool desde a onda 4c-2". A camada 1 não é endurecimento opcional — é
controle **ativo** da fase. Adiá-la significa que, a partir da onda 4c, o
`tools/list` exporá a um `viewer` de estoque a existência e a descrição de
`bi_consulta_avancada` (tool `gated` admin), de tools de financeiro e de todos os
domínios futuros. É vazamento de superfície de ataque e quebra direta do
contrato. O comentário "aceitável para F4 (catálogo pequeno, cliente único)"
não procede: a spec não condiciona a camada 1 ao tamanho do catálogo.

**Recomendação (correção obrigatória nesta onda).** A abordagem stateless atual
(`X-Mcp-User-Id` por request, sem `McpServer` por sessão) é incompatível com um
único handler `ListTools` global filtrado — o handler global não sabe qual
usuário pediu. Duas saídas corretas, ambas viáveis com o SDK 1.29.0:

- **Opção A — `McpServer` + transport por sessão (recomendada).** Na requisição
  `initialize`, criar uma instância de `McpServer` cujo `setRequestHandler(ListToolsRequestSchema)`
  devolve `visibleTools(catalogo, userCtx)` daquela sessão, e um
  `StreamableHTTPServerTransport` próprio, indexados pelo `sessionId`. O custo de
  memória é o catálogo (14 tools, estático) por sessão ativa — desprezível para
  o cliente único da F4, e a própria SDK-NOTES.md §"Registro de tools" cita essa
  opção. O `_meta`/`sessionId` deixa de ser necessário no callback de tool.
- **Opção B — handler `ListTools` global que lê o `UserContext` da sessão
  corrente.** Manter um `McpServer` único, sobrescrever `ListTools` via
  `server.setRequestHandler` (comprovadamente possível), e dentro do handler
  recuperar o `sessionId` (o SDK passa `extra.sessionId` ao handler, como o
  próprio callback de tool já faz na linha 130) → `sessionStore.get` → `UserContext`
  → `visibleTools`. Menos isolamento que A, mas resolve a camada 1 sem instância
  por sessão.

Em ambos os casos, o `visibleTools` (já implementado e testado em `registry.ts`)
passa a ser **chamado** — hoje ele é exportado mas **nenhum caminho do servidor o
invoca**. Adicionar ao `server.test.ts` um teste: `viewer` de estoque chamando
`tools/list` recebe só tools de estoque; tool `gated`/de outro domínio não
aparece.

### C2 — `tools/call` aceita input não validado por Zod do lado do McpServer
**Arquivo:** `mcp/server.ts:123-137`
**Task:** 4a.16 / 4a.17
**Spec:** §3.6 camada 7 ("todo input passa pelo `inputSchema` antes do handler").

**Problema.** As tools são registradas com `mcpServer.tool(tool.id, descricao, {}, cb)`.
O 3º argumento `{}` é o `inputSchema` apresentado ao SDK — um shape **vazio**.
Consequência: o SDK anuncia ao cliente que a tool não tem parâmetros, e **não
valida nada**. O `args` cru chega ao callback e só então é passado a
`handleToolCall`, que faz `tool.inputSchema.parse(rawInput)` (linha 62). Isso
"funciona" para o gate de validação, mas com dois defeitos:

1. **O cliente/agente não recebe o schema real da tool.** `tools/list` (e o
   `inputSchema` que o SDK anexa a cada tool) anuncia `{}`. Um agente de IA que
   monta a chamada a partir do schema MCP não terá os parâmetros — quebra a
   usabilidade da tool pelo agente, que é o consumidor único do MCP (F5).
2. O comentário na linha 121-122 ("o input real é validado pelo handleToolCall
   via Zod") confunde *validação interna* com *contrato publicado*. A camada 7
   está coberta, mas o **schema de interface** está vazio — a tool é, da
   perspectiva do protocolo MCP, uma tool sem parâmetros.

**Recomendação.** Registrar a tool com o `inputSchema` real. O `ToolEntry`
guarda um `z.ZodType<I>`; o `registerTool` do SDK aceita `ZodRawShape`. A
SDK-NOTES.md §3.3.1 já registrou que `ZodType` genérico não encaixa direto —
então o `ToolEntry` deveria ter exposto o **raw shape** (ex.: o objeto passado a
`z.object(...)`), ou o catálogo deve derivar o shape. Resolver junto com C1 ao
reescrever o registro: o handler de `tools/list` (Opção A/B de C1) e o de
`tools/call` precisam expor `inputSchema` consistente com o que o handler de
fato valida. Não deixar para 4c — todas as tasks de tool de 4c/4d dependem deste
contrato.

---

## IMPORTANTE

### I1 — `tools/call` não passa pela camada 1; depende só do gate da camada 2
**Arquivo:** `mcp/server.ts:127-135`
**Task:** 4a.17

Como decorrência de C1, a única defesa contra um `viewer` invocar uma tool de
outro domínio é o `assertToolAllowed` (camada 2) dentro de `handleToolCall`. Isso
está implementado e testado — mas a spec desenha defesa em profundidade: a
camada 1 deveria impedir que a tool sequer apareça. Com C1 corrigido, este
achado se resolve junto. Registro aqui para deixar explícito que **hoje a única
barreira é a camada 2** — se um futuro refactor quebrar o `assertToolAllowed`,
não há rede de segurança. Aceitável só temporariamente; some quando C1 for
corrigido.

### I2 — `void mcpServer.connect(transport)` engole erro de conexão
**Arquivo:** `mcp/server.ts:141`

`mcpServer.connect` é `async`; o `void` descarta a Promise. Se a conexão do
transport falhar (ex.: `start()` rejeitando), a rejeição vira um
`unhandledRejection` silencioso e o servidor sobe num estado meio-inicializado —
`createHttpServer()` retorna um `http.Server` aparentemente ok, mas o transport
não está conectado. O entrypoint (`index.ts`) faz `listen` imediatamente.

**Recomendação.** Tornar `createHttpServer` assíncrona (`await mcpServer.connect(transport)`)
e `index.ts` aguardar antes do `listen`; ou registrar um `.catch` explícito que
faça `process.exit(1)`. Não deixar `void` em inicialização crítica.

### I3 — Sessão sem TTL nem limpeza — vazamento de memória e identidade obsoleta
**Arquivo:** `mcp/auth/session-store.ts`; `mcp/server.ts:174-176`
**Task:** 4a.8 / 4a.15

O `sessionStore` é um `Map` que só cresce: `set` em toda request, `delete` nunca
chamado por ninguém (o método existe, mas nenhum caminho o invoca). Dois
problemas:

1. **Vazamento.** Cada `sessionId` novo (e a linha 175 gera um `randomUUID()`
   sempre que `mcp-session-id` está ausente — ver M1) adiciona uma entrada
   permanente. Processo de longa duração acumula `UserContext` indefinidamente.
2. **Identidade.** O `UserContext` da sessão é sobrescrito a cada request
   (`set` na linha 176), o que de fato mantém o dado fresco para o caminho HTTP —
   mas `handleToolCall` recarrega o usuário do banco de qualquer forma (camada 6),
   então o `UserContext` no store serve apenas para o callback de tool obter o
   `userId`. Está funcional, mas a ausência de expurgo é dívida real.

A SDK-NOTES.md e o comentário do arquivo reconhecem "escalar exige Redis — F5".
O vazamento de memória, porém, não é questão de escala — é um bug de instância
única também. **Recomendação:** registrar o `delete` no evento de fechamento do
transport (`transport.onclose` / `onsessionclosed`), ou ao menos um TTL simples.
No mínimo, registrar como gap explícito no plano da onda 4f se ficar para depois.

### I4 — Mensagem de erro de tool não usa o canal de erro do protocolo MCP
**Arquivo:** `mcp/server.ts:70, 95-97, 133`
**Task:** 4a.17

`errorResult` devolve `{ content: [{ type: "text", text: <mensagem de erro> }] }`
— o **mesmo formato** de uma resposta de sucesso. O protocolo MCP tem
`isError: true` no `CallToolResult` exatamente para distinguir falha de sucesso.
Como está, o agente recebe "Acesso negado: ..." como se fosse o **dado** pedido —
não há sinal estrutural de que a chamada falhou. Um agente de IA pode tratar a
string de erro como resultado de negócio e responder ao usuário com ela como se
fosse um fato.

**Recomendação.** Em `errorResult`, adicionar `isError: true` ao retorno (o
`CallToolResult` do SDK suporta). Ajustar o tipo de retorno de `handleToolCall`.

---

## MENOR

### M1 — `randomUUID()` como fallback de `sessionId` cria sessão fantasma
**Arquivo:** `mcp/server.ts:175`

Quando `mcp-session-id` está ausente (toda primeira request, e qualquer request
malformada), gera-se um `sessionId` aleatório que **nunca** será o que o
transport emite — o `set` grava sob uma chave que nenhum `get` futuro vai
acertar. Combinado com I3, é mais lixo no `Map`. O `sessionId` real deveria vir
do transport pós-`handleRequest`. Revisar junto com C1/I3.

### M2 — `safeErrorMessage("ok")` retornando `"ok"` é caminho morto perigoso
**Arquivo:** `mcp/lib/failure.ts:31-32`

`safeErrorMessage` só é chamada nos ramos de erro (`server.ts:54,74`), mas o
`switch` cobre `"ok"` devolvendo a string `"ok"`. Se um refactor futuro chamar
essa função num caminho de sucesso por engano, o agente recebe literalmente
`"ok"` como conteúdo. O tipo de entrada deveria ser
`Exclude<AuditOutcome, "ok">`, eliminando o ramo morto em tempo de compilação.

### M3 — `extractRowCount` com lista fixa de chaves é frágil
**Arquivo:** `mcp/lib/audit.ts:34-42`

`ARRAY_KEYS` é uma allowlist hardcoded (`linhas`, `titulos`, `serie`, ...). Uma
tool futura cujo envelope use outra chave de array (ex.: `itens`, `registros`)
terá `rowCount=0` gravado silenciosamente — métrica de auditoria errada, sem
erro. A regra é "determinística" como o plano pediu (achado N13), mas acopla o
helper de infra ao vocabulário das tools de domínio. **Recomendação:** quando as
ondas 4c/4d definirem o envelope, padronizar a chave do array (ex.: sempre
`dados.linhas`) e reduzir `ARRAY_KEYS` a ela; ou o `ToolEntry` declarar de onde
sai o `rowCount`. Registrar como item a revisitar em 4c.

### M4 — `service-token.ts`: constant-time correto, mas teste não cobre o caso de comprimento diferente
**Arquivo:** `mcp/auth/service-token.ts:26-29`; `mcp/auth/service-token.test.ts`

A implementação está **correta**: comparar `sha256` de ambos os lados garante
buffers de 32 bytes, então `timingSafeEqual` nunca lança por comprimento
divergente, e o hash do token esperado não vaza seu tamanho. Bom. Porém o teste
só usa tokens de comprimento parecido; falta um caso com token fornecido de
comprimento muito diferente do esperado, para travar a garantia de que o
`createHash` neutraliza o vazamento de comprimento. Adicionar um caso. Menor —
não é bug, é cobertura.

### M5 — Comentário desatualizado / contraditório entre `SDK-NOTES.md` e `server.ts`
**Arquivo:** `mcp/SDK-NOTES.md:84-115` vs `mcp/server.ts:6-13`

A SDK-NOTES.md afirma que `setRequestHandler` filtra `tools/list`; o `server.ts`
afirma o contrário. Documentos de arquitetura que se contradizem confundem quem
retomar a F4. Após corrigir C1, reescrever a SDK-NOTES.md §"tools/list filtrado"
e §"Divergências" com a conclusão correta e o teste empírico que a sustenta.

---

## Conformidade — itens verificados OK

- **Schema Prisma (4a.3) vs spec §3.4/§4.** Os 3 fatos de financeiro + `McpAuditLog`
  + `FeatureRequest` batem com a spec. **Todos os campos monetários são
  `Decimal @db.Decimal(18,2)`** (achado I2 do plano) — confirmado em
  `fato_financeiro_saldo/movimento/titulo`. PKs corretas: `bancoId` como `@id`
  (decisão I1, `banco_id` único no snapshot — coerente com o research doc),
  `odooId` como `@id` nos outros dois. `atualizadoEm @default(now())` (decisão
  N5) presente. Índices: `movimento(data)`, `titulo(dataVencimento)`,
  `titulo(tipo)`, `mcp_audit_log(userId, criadoEm)` — todos na migration. OK.
- **`McpAuditLog`** — `params Json`, sem índice de leitura além do
  `(userId, criadoEm)`; a proteção "INSERT sem SELECT" é da camada 4 (role
  Postgres, onda 4f) — coerente.
- **Contrato de identidade (`mcp/auth/`) vs spec §3.3/§3.3.1.** `UserContext =
  { userId, role, domains }` exatamente como a spec. `resolveUserContext` checa
  `isActive` e devolve `null` (espelha `src/auth.ts`, achado I8). `handleToolCall`
  recarrega o `UserContext` a cada chamada (camada 6, decisão I7) — confirmado
  nas linhas 51-52. Service token validado em middleware HTTP antes do transport,
  constant-time — conforme §3.3.1. OK.
- **Camada 2 (`assertToolAllowed`) e camada 7 (Zod).** Implementadas e testadas.
  `toOutcome`/`safeErrorMessage` mapeiam exceção→outcome sem vazar stack (§3.9). OK.
- **`tsconfig.json` autônomo (4a.4, achado N1).** Resolve `@/` sem trazer `.tsx`
  de `src/` para o build — `tsc -p mcp/tsconfig.json` passa limpo. OK.
- **`mcp/lib/prisma.ts`** — lê `MCP_DATABASE_URL` com fallback para `DATABASE_URL`
  e nota de que o role dedicado vem em 4f. OK.

---

## Avaliação dos 4 desvios relatados pelo implementador

1. **`jest.config.ts` expandido** (`roots` + `mcp`, `moduleNameMapper` para
   reescrever `.js`→`.ts` no estilo nodenext). **Aceitável e necessário.** Sem
   isso os testes de `mcp/` não rodam. Mudança mínima e correta; os 423 testes
   passam, sem regressão na suite de `src/`.

2. **Tasks 4a.14–4a.17 num único commit** (`6032d38`). **Desvio menor,
   tolerável.** O plano previa um commit por task. O `server.ts` é um arquivo só
   construído incrementalmente; agrupar é defensável. Não compromete a revisão —
   mas reduz a granularidade do histórico que o próprio CLAUDE.md §11 valoriza.
   Sem ação.

3. **`setRequestHandler` / `tools/list` não filtrado.** **NÃO é um desvio
   aceitável — é o achado C1.** Ver acima: a justificativa técnica é falsa.
   Correção obrigatória nesta onda.

4. **`prisma generate` manual.** Aceitável — o `build` script já roda
   `prisma generate`; rodar manualmente em dev é normal. Sem ação. Confirmar
   só que o cliente gerado está no `.gitignore` e não foi commitado.

---

## Conclusão sobre o desvio do `tools/list` (resposta direta)

**O desvio NÃO é aceitável e precisa ser corrigido nesta onda — não pode ser
adiado para F5.**

A alegação de que o `@modelcontextprotocol/sdk@1.29.0` lança ao sobrescrever o
handler de `ListTools` é **falsa**, comprovada por teste empírico nesta review:
`setRequestHandler(ListToolsRequestSchema, ...)` é aceito normalmente desde que a
capability `tools` esteja registrada (o que `registerTool`/`McpServer.tool` já
faz). O erro `assertRequestHandlerCapability` que o implementador citou ocorre
por capability ausente, não por handler duplicado. O caminho correto que a
própria `SDK-NOTES.md` havia descrito funciona.

A camada 1 do RBAC ("catálogo filtrado por usuário") é, pela spec §3.6, um
controle **ativo desta fase** e parte da definição de "uma tool" — não
endurecimento opcional. Deixá-la de fora faz com que, a partir da onda 4c,
qualquer usuário (incluindo `viewer`) veja em `tools/list` a existência e a
descrição de tools de domínios a que não tem acesso e da tool `gated`
`bi_consulta_avancada`. É vazamento estrutural de superfície e quebra de
contrato. A solução correta — `McpServer`/transport por sessão (Opção A) ou
handler `ListTools` global lendo o `UserContext` da sessão (Opção B) — é viável
com o SDK instalado e de baixo custo dado o cliente único da F4. O `visibleTools`
já existe, está testado e só precisa ser **chamado**.

Recomendação final: **reabrir a Task 4a.16**, implementar a camada 1 de fato
(C1), corrigir o `inputSchema` publicado (C2) e tratar I2/I3/I4 antes de iniciar
a onda 4c, pois 4c/4d dependem do contrato de registro de tools.
