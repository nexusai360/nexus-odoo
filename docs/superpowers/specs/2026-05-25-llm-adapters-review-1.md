# Review Adversarial #1 - SPEC v1 (Modernização adapters LLM)

**Data:** 2026-05-25
**Spec revisada:** `2026-05-25-llm-adapters-modernization-design.md` (v1)
**Reviewer:** Claude (mesmo agente, auditoria adversarial)
**Postura:** caçar falha, não validar. Nenhum achado material = review falhou.

> Critério de saída desta revisão: aplicar todos os achados em uma
> **SPEC v2** no mesmo arquivo da v1, e então submeter v2 à Review #2.

---

## Sumário

Encontrados **20 achados** materiais (15 críticos, 5 menores). A spec
v1 está fundamentalmente correta na direção, mas tem **três** falhas
graves de premissa que poderiam quebrar a implementação inteira se
não fossem caçadas agora (A11, A14, A6). Nenhum achado pequeno o
suficiente para ignorar.

---

## Achados Críticos (CRIT)

### CRIT-A1: `ReasoningHistoryItem` vaza shape entre providers no contrato público

**Onde:** §5.1 (types.ts).

**Achado:** A discriminated union força `ChatRequest` a conhecer o
formato interno de raciocínio dos 4 providers. Um teste do adapter
OpenAI passa a importar tipos de `anthropic` por acidente. Pior: se
amanhã trocarmos o adapter Anthropic para SDK oficial, mudamos o
`blocks: unknown[]` e quebramos o contrato.

**Demanda:** `reasoningContext` precisa ser **opaco** do ponto de vista
do consumidor. Trocar para `ReasoningContext = { provider: LlmProvider;
data: unknown }`. Cada adapter faz cast interno. O `run-agent.ts`
trata como caixa preta: recebe num turno, devolve no próximo, sem
inspecionar.

---

### CRIT-A2: Capability table em §5.2 duplica `REASONING_LEVELS` do `catalog.ts`

**Onde:** §5.2 e §7.1.

**Achado:** O catálogo já tem `REASONING_LEVELS` map. A spec propõe
adicionar `supportsReasoningWithTools`, `openaiEndpoint`, etc, mas não
diz como esses campos novos se relacionam com o `REASONING_LEVELS`
existente. Risco: dois mapas inconsistentes em produção.

**Demanda:** unificar. `REASONING_LEVELS` vira `REASONING_CAPS` com
shape:
```ts
type ReasoningCap = {
  levels: ReasoningLevel[];
  supportsWithTools: boolean;
  endpoint?: "responses" | "chat-completions"; // OpenAI only
  anthropicThinking?: "adaptive" | "enabled" | "both";
  anthropicInterleavedAuto?: boolean;
  geminiShape?: "level" | "budget";
  openrouterShape?: "effort" | "max_tokens";
};
const REASONING_CAPS: Record<string, ReasoningCap> = { ... };
```
Único ponto de verdade. Helper `reasoningCapsOf(modelId): ReasoningCap | null`.

---

### CRIT-A3: Ordering de items no `input` multi-turn da OpenAI Responses não está pinned

**Onde:** §6.1, decisão 5.

**Achado:** A spec diz "passar back reasoning items + function_call +
function_call_output" mas não define ordem exata. A doc da OpenAI
exige ordem específica: `reasoning → function_call → function_call_output`
agrupado pelo `call_id`, depois `message` final.

**Demanda:** especificar literalmente no spec:
```
input = [
  user.message,
  ...iterações_anteriores.flatMap(iter => [
    ...iter.reasoning_items,
    iter.function_call,
    iter.function_call_output
  ])
]
```
E nos testes: caso de 2 iterações encadeadas.

---

### CRIT-A4: Mapeamento `minimal→low` é premissa não-verificada

**Onde:** §6.1, decisão 7.

**Achado:** A spec v1 diz "Não precisamos mais do mapeamento
minimal→low" baseado em inferência das docs do usuário. Mas a doc
oficial da OpenAI Responses lista `effort: low|medium|high|xhigh`
**sem** "minimal". O mapeamento é necessário em Responses também.

**Demanda:** confirmar que `minimal` não é aceito em
`/v1/responses` e manter o mapeamento `minimal→low` no adapter (já
existe na linha 224 do código atual; preservar). Adicionar teste:
`reasoningEffort:"minimal" envia reasoning.effort="low"`.

---

### CRIT-A5: `system` no Responses API deve usar `instructions`, não `message` item

**Onde:** §6.1, Schema final do request.

**Achado:** A doc da Responses API tem campo dedicado `instructions:
string` para system prompt. Mandar como `{type:"message",role:"system"}` é
ambíguo e quebra otimizações de cache de instruções.

**Demanda:** trocar:
```json
{
  "model": "...",
  "instructions": "<system prompt aqui>",
  "input": [ ...só user/assistant/function_call/function_call_output... ]
}
```
Atualizar `mapMessagesToResponsesInput` para extrair role:system do
array e devolver `{ instructions, input }`. Adicionar teste.

---

### CRIT-A6: `store:true` + Opção B stateless são inconsistentes

**Onde:** §6.1, decisões 5 e schema.

**Achado:** Spec v1 diz Opção B (stateless) é o default, mas o schema
inclui `"store": true`. `store:true` aciona persistência server-side
desnecessária (custa $$$ na cota e expõe dados a outra superfície).

**Demanda:** `store: false` quando stateless. Atualizar schema da §6.1
e justificar: "Não dependemos do state server-side. `store:false`
reduz custo e superfície de exposição. Reasoning context preservado
localmente via Opção B."

---

### CRIT-A7: Anthropic `max_tokens` calc pode estourar ceiling de Haiku 4.5

**Onde:** §6.2, decisão 3.

**Achado:** `max_tokens = budget_tokens + (request.maxTokens ?? 1024)`.
Com `effort=high` budget=24000 e maxTokens=64000, total=88000.
Haiku 4.5 e Sonnet 4.6 têm output cap 64k → API rejeita.

**Demanda:** clamp:
```
max_tokens = Math.min(
  budget_tokens + (request.maxTokens ?? 1024),
  modelOutputCap(modelId) // 64000 ou 128000 conforme modelo
)
```
Catálogo precisa de `outputCap` por modelo (Opus 4.7/4.6=128k,
Sonnet 4.6/Haiku 4.5=64k). Teste: cap respeitado.

---

### CRIT-A8: Comportamento quando `checkpoint=PRODUCTION` + Haiku 4.5

**Onde:** §6.2, decisão 4.

**Achado:** Haiku 4.5 tem `supportsReasoningWithTools=false`. Mas o
spec não define o que acontece se o admin liga `reasoning_checkpoint=PRODUCTION`
no banco enquanto Haiku é o modelo ativo. Drop silencioso? Erro? UI alerta?

**Demanda:** definir explicitamente: **drop silencioso no adapter**
(`if (!cap.supportsWithTools && hasTools) skip thinking`). UI mostra
banner (já planejado em §8) explicando. Log estruturado:
`console.info("[anthropic] reasoning desligado: modelo não suporta com tools")`.

---

### CRIT-A9: Gemini `thinkingBudget=512` mínimo não vale para todos

**Onde:** §6.3, decisão 1.

**Achado:** `minimal=512` mapeado universalmente. Mas 2.5 Flash aceita
**0** (desliga thinking). Forçar 512 num caso onde o admin quer
"raciocínio mínimo" pode acabar gastando tokens à toa. E 2.5 Flash
Lite **exige** mínimo 512 (range 512-24576).

**Demanda:** clamp por modelo. Catálogo carrega
`geminiBudgetRange: [min, max]` por modelo:
- 2.5 Pro: [128, 32768]
- 2.5 Flash: [0, 24576]
- 2.5 Flash Lite: [512, 24576]

Mapping `effort → budget` produz proporcional dentro do range:
- `minimal` → range[0] (mais conservador possível)
- `low` → 15% do range
- `medium` → 40% do range
- `high` → 80% do range

Para 3.x usa `thinkingLevel` direto, sem mapping.

---

### CRIT-A10: Gemini `streamGenerateContent` shape (SSE vs JSON array stream)

**Onde:** §6.3, decisão 3.

**Achado:** A doc do Gemini fala de "incremental thought summaries" mas
não foi confirmado se o endpoint retorna SSE puro (`text/event-stream`
com `data: ` prefix) ou um JSON Lines / array streamado. As duas
formas existem em versões diferentes da API.

**Demanda:** spec deve listar **explicitamente** os dois shapes
candidatos e a regra de detecção:

1. Se `Content-Type: text/event-stream`: parser SSE (linhas `data: <json>`).
2. Se `Content-Type: application/json` com array: parser JSON Lines
   ou array `[{candidate1},{candidate2},...]` lido em chunks.

Plan task de **prototipar contra a API real** antes de implementar
final. Adicionar caso de teste: shape detection.

---

### CRIT-A11: Multi-turn no Gemini exige persistir `parts` inteiras, mas hoje só persistimos texto

**Onde:** §6.3, decisão 2 + §7.3.

**Achado:** A doc do Gemini é explícita: para function calling com
thinking, "Return the entire response with all parts back to the
model in subsequent turns". Isso inclui `thoughtSignature` em cada
part. Hoje `persistMessage` em `conversation.ts` grava só
`content: string` no banco; perdemos as parts intermediárias.

**Consequência:** se o usuário voltar uma conversa antiga e mandar
nova pergunta, o histórico não vai ter os signatures e a próxima
chamada Gemini perde contexto. A spec **não cobre** esse caso.

**Demanda:** spec v2 deve decidir:

- **Opção 1:** persistir `parts` ou `reasoning_context` como JSONB
  numa coluna nova em `messages`. Mais trabalho, mais completo.
- **Opção 2:** restringir Gemini a "uma conversa = uma sessão única".
  Quando o usuário reabre uma conversa antiga, ignora reasoning
  context (mantém só texto). Pode degradar qualidade.
- **Opção 3 (recomendada):** persistir só o **último**
  `reasoning_context` da conversa numa coluna na tabela `conversations`
  (não em `messages`). Custa 1 coluna JSONB nullable e cobre o caso
  típico (continuação sequencial).

Plano deve escolher e justificar. **Esse é um dos 3 furos mais sérios
da v1.**

---

### CRIT-A12: OpenRouter `usage: { include: true }` foi inventado

**Onde:** §6.4, Schema final.

**Achado:** A doc fetched do OpenRouter (reasoning-tokens guide) não
menciona `usage.include`. Foi assumido como análogo à OpenAI mas não
confirmado.

**Demanda:** remover o campo. OpenRouter retorna `usage` por padrão.

---

### CRIT-A13: Migration `reasoning_tokens` em `llm_usage` — não verificado se já existe

**Onde:** §7.4.

**Achado:** Não checei o schema atual da `llm_usage`. Se já há coluna
homônima (de uma migration antiga), `ALTER TABLE ADD COLUMN` falha.

**Demanda:** Plan deve incluir task "verificar schema atual de
`llm_usage` via `\d llm_usage` ANTES de gerar migration". Idempotência
da migration (`IF NOT EXISTS`).

---

### CRIT-A14: Credenciais Anthropic/Gemini/OpenRouter podem não existir

**Onde:** §10, verificação real.

**Achado:** Verificação real (M2, M3, M4) exige credenciais ativas para
cada provider. Se hoje só há credencial OpenAI, M2/M3/M4 não rodam e
a entrega trava no critério de aceitação.

**Demanda:** task **antes** da execução: verificar em `llm_credentials`
quais providers têm chave. Se faltar Anthropic/Gemini/OpenRouter,
solicitar ao usuário no início da execução ou marcar verificações
condicionais ("rodar quando credencial disponível, código entregue
mesmo sem"). Spec deve dizer: a entrega não bloqueia em M2/M3/M4 se
credencial faltar; bloqueia só em M1 (OpenAI, único garantido).

---

### CRIT-A15: Sem timeout no fetch — Responses com `effort=high` pode hangar

**Onde:** §6.1 (e similar nos outros adapters).

**Achado:** Hoje todas as chamadas `fetch(URL, {...})` são sem
`AbortSignal`. Com reasoning high, latências de 30-60s são comuns.
Cliente HTTP pode esperar indefinidamente.

**Demanda:** adicionar `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` em
todas as chamadas. Default 90s. Override por modelo no catálogo
(`requestTimeoutMs?`). Lançar erro estruturado quando timeout
estourar.

---

## Achados menores

### MIN-B1: "60 testes novos" é estimativa sem base

**Demanda:** Plan v1 decompõe em "X testes do adapter Y", validável.

### MIN-B2: Falta teste de regressão para modelos atuais sem reasoning

**Demanda:** adicionar uma seção "testes de não-regressão" que
exercem modelos como `gpt-4o` (se existir no catálogo) e confirmam
que nada muda.

### MIN-B3: Exemplo de body OpenRouter com tools + reasoning

**Demanda:** adicionar JSON literal completo em §6.4.

### MIN-B4: `mapToolsToResponses` usa `strict: false` — justificar

**Demanda:** comentário in-spec explicando: "Strict mode da Responses
exige schemas em formato JSON Schema rigoroso (sem `additionalProperties`,
type:"object" obrigatório). Nossas tools do MCP usam schemas mais
permissivos. Strict=false preserva compatibilidade. Endurecer depois
em escopo separado."

### MIN-B5: Sem plano de logging/observability

**Demanda:** seção §16 nova na v2:
- `console.info("[<provider>] reasoning=<level>, tools=<count>, modelo=<id>")` no início.
- `console.info("[<provider>] reasoning_tokens=<n>, output_tokens=<n>, ms=<n>")` no fim.
- Erros estruturados (sem credencial, timeout, schema inválido).
- Não logar conteúdo do thinking (PII risk).

---

## Itens **não** achados (validação positiva)

- §3 objetivos M1-M7 estão mensuráveis e proporcionais.
- §11 rollout é razoável (sem feature flag justificado, branch única).
- §12 riscos R1-R10 cobrem o esperado.
- §13 critérios de aceitação são objetivos (`tsc`, `eslint`, `jest`,
  verificação real, code review).
- §15 tabela inicial de capability é tabela, não prosa, e cobre os
  modelos relevantes.

---

## Decisão de saída

**Spec v1 reprovada.** 15 achados críticos. Aplicar TODOS na SPEC v2
(mesmo arquivo, substituindo). Itens menores (B1-B5) entram no apêndice
da v2.

A v2 enfrenta a Review #2 (ainda mais profunda).
