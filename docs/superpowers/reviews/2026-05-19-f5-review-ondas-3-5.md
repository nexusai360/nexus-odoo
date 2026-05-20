# Review F5 — Ondas 3 e 5 (chat in-app, consumo, playground)

**Data:** 2026-05-19
**Branch:** `feat/integracao-whatsapp`
**Revisor:** Opus 4.7 (review adversarial)
**Escopo:** rota SSE `/api/agent/stream`, rota `transcribe`, `(protected)/agente/**`,
`components/agent/**`, `agent-config.ts`, `usage-stats.ts`, adapter Anthropic.

**Contratos:** SPEC §8 (v3), PLANO ondas 3 e 5 (v3).

**Verificações:** `npx tsc --noEmit` ✓ · `npx eslint` (escopo) ✓ ·
`npx jest agent-config|usage-stats|anthropic|run-agent|agent/stream` → 46 testes ✓.
Os testes passam — mas verde não significa correto: os achados abaixo expõem
divergências de spec que os testes não cobrem.

---

## Resumo por severidade

| Severidade | Qtd |
|---|---|
| CRÍTICO | 3 |
| ALTO    | 4 |
| MÉDIO   | 5 |
| BAIXO   | 4 |

---

## CRÍTICO

### C1 — Streaming token-a-token do turno final NÃO existe (divergência de spec)

**Arquivos:** `src/lib/agent/run-agent.ts:208`, `src/app/api/agent/stream/route.ts:79-89`

A SPEC §8.1 é explícita: *"no turno final do assistente, streama o texto.
Streaming token-a-token do turno final exige `stream:true` nos adapters —
incluído no escopo para o provedor default (Anthropic)"*. A Task 3.1 foi
cumprida no adapter (`anthropic.ts` tem `stream:true` + `#parseStream` +
`onToken`), mas **a capacidade está morta**:

- `run-agent.ts:208` chama `client.chat({ messages: conversation, tools })` —
  **sem `stream`, sem `onToken`** — em todas as iterações, inclusive a final.
- `AgentEvent` (`run-agent.ts:84-88`) não tem variante `token`. O `runAgent`
  nunca emite progresso de texto.
- `route.ts` `onEvent` (linhas 79-89) trata `thinking`/`tool_call`/`tool_result`/
  `done` — **nenhum `case` para `token`**. O comentário do header da rota
  (linha 9) promete `data: {"type":"token",...}` que nunca é enviado.
- O teste `route.test.ts` só asserta `status → done` (linhas 99-133). A
  Task 3.2 Step 1 exigia assertar `status → text/token → done`; o `token`
  jamais foi testado porque nunca foi implementado.

Resultado: o turno final SEMPRE chega de uma vez no evento `done`. O
`ChatPanel` e o `PlaygroundContent` têm todo o código de consumo de `token`
(cursor piscante, append incremental) que **nunca dispara** — UI de streaming
puramente decorativa. A onda 3 não entregou o item central da SPEC §8.1.

**Recomendação:** ligar o streaming de verdade. Na última iteração (quando
não há tool calls esperados, ou após o loop), `runAgent` deve chamar
`client.chat({ ..., stream: true, onToken })` com `onToken` repassando para
um novo `AgentEvent` `{type:"token", delta}`; a rota mapeia para
`data:{"type":"token",...}`. Como o loop não sabe a priori se a iteração é
final, a abordagem usual é: streamar sempre (tokens são acumulados em
`messageText`) e só usar os tokens visualmente quando `stop_reason` não for
`tool_use`. Atualizar `route.test.ts` para assertar a sequência com `token`.
Alternativa honesta: se streaming token-a-token for descopado, **corrigir a
SPEC e remover o código morto** — não deixar a promessa quebrada nos dois lados.

---

### C2 — Histórico de conversa existente NUNCA é exibido na UI

**Arquivos:** `src/components/agent/chat-panel.tsx:79,90-92`,
`src/app/(protected)/agente/client.tsx:43-46,136-155`

A SPEC §8.1 exige: *"Histórico persistido em `Conversation`/`Message` (não
`localStorage`)"*. O backend persiste corretamente (`persistMessage`), mas a
UI **nunca lê esse histórico de volta**:

- `ChatPanel` inicializa `messages` com `[]` (linha 79) e o único `useEffect`
  que reage a `externalConvId` (linhas 90-92) apenas atualiza
  `conversationIdRef` — **não busca as mensagens**.
- Na página `/agente`, selecionar uma conversa da lista chama
  `handleSelect(id)` → `setActiveId(id)` → o `ChatPanel` recebe
  `conversationId` mas a tela de mensagens continua vazia.
- Não existe rota nem action `getConversationMessages`. O componente
  `EmbeddedChat` não tem como popular o histórico.

Resultado: a lista de conversas da página dedicada é **inútil** — clicar numa
conversa antiga abre um painel em branco; o usuário só consegue continuar a
conversa "no escuro" (o servidor tem o contexto, mas o usuário não vê o que
foi dito). O Task 3.5 Step 2 ("painel de chat em tela cheia" com lista de
conversas) está funcionalmente quebrado.

**Recomendação:** criar uma Server Action `getConversationMessages(convId)`
(com `assertConversationOwned`) e fazer o `ChatPanel` carregá-la quando
`conversationId` muda (com estado de loading). Filtrar mensagens `role=tool`
ou renderizá-las como `ToolBubble`. Adicionar teste.

---

### C3 — "Ver prompt usado" do Playground está quebrado e dispara LLM real

**Arquivo:** `src/components/agent/playground-content.tsx:311-333`

`handleOpenPreview` faz `POST /api/agent/stream` com
`{message:"__preview_prompt__", isPlayground:true, previewOnly:true}`. Três
problemas graves:

1. **A rota não conhece `previewOnly`.** `route.ts` ignora o campo, valida
   `message` (presente) e **executa `runAgent` de verdade** — uma chamada
   paga ao LLM com a mensagem literal `__preview_prompt__`, que ainda é
   persistida como `Message` na conversa de playground.
2. **A resposta é `text/event-stream`, não JSON.** `handleOpenPreview` faz
   `res.json()` (linha 325) sobre um corpo SSE → o parse falha → cai no
   `catch` → mostra *"Erro ao carregar o prompt"*.
3. O campo `composedPrompt` que a UI espera nunca é retornado por lugar nenhum.

Resultado: o recurso "Ver prompt usado" (exigido pela SPEC §8.3) **nunca
funciona** — sempre exibe erro — e cada clique gera custo de LLM + lixo na
conversa. A Task 5.3 não foi cumprida nesse ponto.

**Recomendação:** criar um endpoint dedicado (ex.: `GET /api/agent/prompt-preview`,
gate admin) que chama `composeSystemPrompt` com a config ativa e retorna
`{composedPrompt}` em JSON, sem tocar o LLM. Ajustar `handleOpenPreview` para
consumir esse endpoint.

---

## ALTO

### A1 — `loadHistory` carrega as PRIMEIRAS mensagens, não as últimas

**Arquivo:** `src/lib/agent/conversation.ts:124-145`

A SPEC §4.3 diz: *"lê as **últimas** N mensagens da `Conversation`"*.
`loadHistory` faz `findMany({ orderBy: { createdAt: "asc" }, take: 20 })` —
isso pega as **20 primeiras** mensagens da conversa. Em qualquer conversa com
mais de 20 mensagens, o agente perde todo o contexto recente e raciocina
sobre o começo antigo do diálogo. Quanto mais longa a conversa, pior — e o
WhatsApp (onda 4) usa o mesmo `loadHistory`.

**Recomendação:** buscar com `orderBy: { createdAt: "desc" }, take: 20` e
depois `.reverse()` para devolver em ordem cronológica. Adicionar teste com
>20 mensagens.

### A2 — `runAgent` injeta o histórico DUPLICANDO a mensagem do usuário

**Arquivo:** `src/lib/agent/run-agent.ts:179-195`

A ordem é: (1) `loadHistory` lê o histórico; (2) `persistMessage(user)` grava
a mensagem nova; (3) monta `conversation = [system, ...history, {user, nova}]`.
Como o passo 2 grava ANTES de qualquer leitura subsequente, está ok nesta
invocação. **Mas** numa próxima invocação da mesma conversa, `loadHistory` já
vai trazer a mensagem do usuário anterior E a resposta — correto. O problema
real: a mensagem do usuário da invocação atual é persistida (passo 2) e também
empurrada manualmente no array (passo 3). Se `loadHistory` rodasse depois do
`persistMessage` (ou se houver corrida), a mensagem apareceria duas vezes.
Hoje funciona por sorte de ordem; é frágil. Além disso, mensagens `role=tool`
e os `assistant` com `toolCalls` são persistidos e relidos — o array de
histórico pode conter pares `tool_use`/`tool_result` órfãos se o budget de 20
cortar no meio de um par, o que **quebra a API da Anthropic** (`tool_use` sem
`tool_result` correspondente → erro 400).

**Recomendação:** garantir que `loadHistory` nunca corte no meio de um par
tool_use/tool_result (ou filtrar mensagens `tool`/`toolCalls` do histórico
recarregado, mantendo só `user`/`assistant` textual). Adicionar teste de
conversa com tool calls + budget pequeno.

### A3 — `isPlayground` na rota SSE não tem gate de role

**Arquivo:** `src/app/api/agent/stream/route.ts:35,97`

Qualquer usuário autenticado (incl. `viewer`/`manager`) pode `POST` em
`/api/agent/stream` com `{isPlayground:true}`. A rota repassa direto para
`runAgent` (linha 97). A SPEC §8.0/§8.3 diz que o **playground** é
`super_admin`/`admin` only. A página `/agente/playground` tem gate, mas o
endpoint que ela usa não — um `viewer` pode marcar uso como playground (e
poluir a tela de consumo) chamando a API direto. A rota também não distingue
`channel`: o `PlaygroundContent` envia `channel:"playground"` no body
(linha 181) mas `route.ts:96` **hardcoda `channel:"in_app"`** — ou seja, a
conversa do playground é gravada como `in_app`, não `playground`.

**Recomendação:** na rota, se `isPlayground===true`, exigir
`platformRole ∈ {admin, super_admin}` (403 caso contrário) e usar
`channel:"playground"` ao criar a conversa. Sem isso, o filtro de ambiente
da tela de consumo (C/abaixo) classifica errado.

### A4 — Filtro "ambiente" do consumo é incoerente entre iterações e conversas

**Arquivo:** `src/lib/agent/llm/usage-stats.ts:168-178`

`getUsageStats` filtra `LlmUsage` por `isPlayground` (campo direto) mas filtra
`Conversation` por `channel` (`playground` vs `not playground`). Por causa do
A3, conversas de playground são gravadas com `channel:"in_app"` →
`totalConversations` no filtro "Playground" virá **0 ou errado**, enquanto
`totalIterations` (que usa `isPlayground` de `LlmUsage`, gravado corretamente
pelo `runAgent`) virá certo. As duas métricas do BUG 8 ficam inconsistentes
entre si. O drill-down da tabela usa `isPlayground` — ok — mas o KPI de
conversas não bate.

**Recomendação:** depende de corrigir A3. Após A3, o `channel` será confiável
e a query fica coerente. Verificar e2e com dado real de playground.

---

## MÉDIO

### M1 — Bubble flutuante aparece sobreposta à própria página `/agente`

**Arquivos:** `src/app/(protected)/layout.tsx:42`, `agente/layout.tsx`

`AgentBubble` é montada no layout protegido e fica visível em TODAS as telas,
incluindo `/agente` (página dedicada de chat em tela cheia) e
`/agente/playground`. Ter o FAB do agente flutuando por cima da página de
chat do agente é redundante e visualmente confuso.

**Recomendação:** esconder a bubble nas rotas `/agente*` (checar `usePathname`
num client wrapper, ou mover a montagem da bubble para fora do escopo dessas
rotas).

### M2 — `consumo` e `playground` não têm link de navegação

**Arquivo:** `src/lib/constants/nav.ts:21-46`

`NAV_ITEMS` tem "Agente" → `/agente`, mas não há sub-itens nem links para
`/agente/consumo`, `/agente/playground`, `/agente/configuracao`. Essas
páginas só são alcançáveis digitando a URL. A SPEC §8 trata essas telas como
parte do produto F5c — devem ser descobríveis. O `NavItem` já suporta
`children`.

**Recomendação:** adicionar `children` ao item "Agente" (Consumo, Playground,
Configuração) com `visibleTo: ["super_admin","admin"]`, ou um sub-menu na
própria página `/agente`.

### M3 — Typo visível ao usuário: "cotação estale"

**Arquivo:** `src/components/agent/consumo/usage-table.tsx:332`

O indicador de `rateStale` renderiza o texto **"cotação estale"** — "estale"
não é palavra; é "stale" mal traduzido. Deveria ser "cotação desatualizada"
(o próprio cabeçalho do arquivo, linha 12, descreve corretamente como
"Cotação desatualizada").

**Recomendação:** trocar para "cotação desatualizada".

### M4 — Race condition de IDs ao enviar 2 mensagens no mesmo milissegundo

**Arquivo:** `src/components/agent/chat-panel.tsx:131-132`

`userMsgId = u_${Date.now()}` e `assistantMsgId = a_${Date.now()}`. IDs
baseados só em `Date.now()` colidem se duas mensagens forem disparadas no
mesmo ms (ex.: clicar uma sugestão logo após enviar, ou cliques rápidos). O
`PlaygroundContent` usa `genId()` com sufixo aleatório — correto; o
`ChatPanel` não. Colisão de `key` no React causa renderização errada.

**Recomendação:** usar `crypto.randomUUID()` ou o mesmo `genId()` do
playground no `ChatPanel`.

### M5 — `handleClear` do ChatPanel não chama `onConversationCreated`/atualiza a lista

**Arquivo:** `src/components/agent/chat-panel.tsx:286-291`,
`agente/client.tsx`

"Limpar histórico" zera `messages` e `conversationIdRef` localmente, mas na
página `/agente` o `AgentPageClient` continua com `activeId` apontando para a
conversa antiga; a lista lateral não reflete o estado. Reabrir a conversa
selecionada não recarrega nada (ver C2). Comportamento de estado inconsistente
entre painel e lista.

**Recomendação:** após corrigir C2, alinhar `handleClear` para também
notificar o pai (deselecionar / iniciar conversa nova de forma explícita).

---

## BAIXO

### B1 — `route.ts` SSE não envia heartbeat / pode ser cortada por proxy

`/api/agent/stream` abre o `ReadableStream` e só emite eventos quando o
`runAgent` produz algo. Um loop de tool calling longo (5 iterações, MCP lento)
pode passar 30-60s sem nenhum byte → proxies (Traefik/Nginx) podem encerrar a
conexão por idle timeout. Considerar um comentário SSE de keep-alive
(`: ping\n\n`) periódico. (`tool_call`/`tool_result` mitigam parcialmente,
mas a primeira iteração antes da 1ª tool fica silenciosa.)

### B2 — Eventos `status`/`tool_result` definidos mas subutilizados

A rota emite `tool_result` com `truncated`, mas nenhum componente de UI
(`ChatPanel`, `PlaygroundContent`) consome `tool_result` — o aviso de
truncagem (relevante para `bi_consulta_avancada`) nunca chega ao usuário. O
`status:"thinking"` também é noop nos dois consumidores. Não é bug, mas é
contrato emitido e ignorado — ou usa, ou remove.

### B3 — `KpiRow` "≈ X por USD" recalcula taxa de câmbio por divisão agregada

`kpi-row.tsx:166` mostra `costBrl/costUsd` como "taxa por USD". Isso é a taxa
**média ponderada** do período, não a cotação atual — pode confundir
(parece a cotação do dia). Rotular melhor (ex.: "taxa média do período") ou
remover.

### B4 — `agente/layout.tsx` usa margens negativas frágeis

`-mt-16 -mb-8 sm:-mt-8 h-screen` compensa o padding do layout pai por
subtração manual. Se o padding do `ProtectedLayout` mudar, a página `/agente`
quebra silenciosamente (scroll duplo ou corte). Acoplamento frágil; preferir
um mecanismo explícito (ex.: o layout pai expõe uma variante sem padding).

---

## Aderência ao plano — ondas 3 e 5

| Item | Status |
|---|---|
| Task 3.0a — actions de config | OK |
| Task 3.0e — `runAgent` lê `AgentSettings` | OK (`loadAgentSettings`) |
| Task 3.1 — streaming Anthropic no adapter | Implementado mas **não ligado** (C1) |
| Task 3.2 — endpoint SSE | Parcial — sem `token` (C1); sem gate playground (A3) |
| Task 3.2 — teste assertando `status→text/token→done` | **Não cumprido** — só `status→done` |
| Task 3.3b — chat-panel histórico do servidor | **Não cumprido** (C2) |
| Task 3.4 — bubble | OK (com M1) |
| Task 3.5 — página `/agente` + lista | Lista existe mas não funcional (C2) |
| Task 5.1 — usage-stats, BUG 8 | OK no código; coerência depende de A3/A4 |
| Task 5.2c — badge preço desconhecido (BUG 2) | OK |
| Task 5.2c — indicador rateStale (BUG 5) | OK (com typo M3) |
| Task 5.3 — playground como página | OK como página; "ver prompt" quebrado (C3) |
| RBAC consumo/playground/config | Páginas com gate; **rota SSE sem gate** (A3) |

---

## Conclusão

A camada visual das ondas 3 e 5 está polida e o `tsc`/`eslint`/`jest` passam,
mas **três funcionalidades centrais da SPEC §8 estão quebradas**: o streaming
token-a-token nunca dispara (C1), o histórico de conversas persistido nunca é
exibido na UI (C2), e o "Ver prompt usado" do playground sempre falha e ainda
queima LLM (C3). Os testes verdes não pegaram nada disso porque cobrem só o
caminho feliz mínimo. A onda 3 não pode ser considerada concluída sem corrigir
C1, C2, A1, A2 e A3 — todos com impacto funcional direto e, no caso de A1/A2,
risco de erro 400 da API Anthropic em conversas longas com tool calls.
