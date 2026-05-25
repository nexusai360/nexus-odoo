# Spec — Bubble do Agente Nex: estado limpo e sugestões garantidas

> v3 inline (1 ciclo, sem rodada longa de review; pedido explícito do usuário)
> Data: 2026-05-24 23:00 (sessão de fechamento após feedback duro)

## Problema observado (screenshot 2026-05-24 22:59)
1. Aparece uma **bolha cinza órfã** entre a mensagem do usuário e a resposta do agente, contendo só o timestamp "22:59" e nada mais.
2. Sugestões pós-resposta ainda **não aparecem** apesar do fallback configurado (servidor e cliente).

## Causa raiz

### Bolha vazia
`persistMessage` grava a mensagem `assistant` com `content = ""` quando o turno tem `toolCalls` (a iteração intermediária do loop só registra que houve chamadas de tool; a resposta textual real vem na iteração final, persistida em segunda chamada). Quando o ChatPanel recebe `conversationId` no `done`, dispara `onConversationCreated` que muda `externalConvId`, e o `useEffect` recarrega o histórico do servidor via `getConversationMessages` — que retorna AS DUAS messages assistant. O filtro atual só tira `role === "tool"`, deixando passar assistants vazias.

### Sugestões sumindo
`safeSuggestions` do client cai em `welcomeSuggestionsForUi`. Mas se `personalizedWelcome` for `[]` E `WELCOME_SUGGESTIONS` slice resultar em algo cuja propagação falhou (race condition na composição via `useMemo`), o array final pode chegar vazio à `SuggestionsBar`. O componente filtra silenciosamente e não renderiza nada.

## Design

### A. Filtro robusto no loadHistory
No `useEffect` que carrega histórico:
```ts
.filter((m) => m.role !== "tool")
.filter((m) => !(m.role === "assistant" && m.content.trim().length === 0))
```
Esconde a mensagem intermediária do loop (assistant só com toolCalls) sem prejudicar a UI. Os dados continuam no banco para o `.txt` export ler como rastro de raciocínio.

### B. Fallback hardcoded final na SuggestionsBar
Helper estático `HARD_FALLBACK_SUGGESTIONS` dentro do próprio componente:
```ts
const HARD_FALLBACK = [
  "Quanto faturamos no mês corrente?",
  "Quanto temos em contas a receber em aberto?",
  "Qual o valor total do estoque em armazém?",
];
```
Se `suggestions.length === 0`, renderiza o HARD_FALLBACK fatiado por max=3. **Última camada de defesa** — garante que toda resposta do agente sempre tem chips.

### C. Filtro do safeSuggestions no client com 3 níveis
1. `evt.suggestions` se não vazio.
2. `welcomeSuggestionsForUi` se não vazio.
3. `HARD_FALLBACK` fatiado.

### D. Aceitar a bolha vazia no caso "first response no banco ainda"
Quando a primeira resposta entra:
- Estado local tem bolha placeholder finalizada com content da resposta.
- `onConversationCreated` é chamado.
- `useEffect` dispara reload e substitui messages pelo banco.
- Mas o banco tem 2 assistant (intermediária + final). Filtro B esconde a vazia.
- Resultado: visual mantém UMA bolha do assistant com a resposta + chips.

## Critério de saída
- `pnpm tsc --noEmit`: verde.
- `pnpm build`: verde.
- Manual: enviar pergunta, ver UMA bolha do agente (sem cinza órfã acima), com chips embaixo.
