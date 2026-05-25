# Review Adversarial #1 - PLAN v1 (Modernização adapters LLM)

**Data:** 2026-05-25
**Plan revisado:** `2026-05-25-llm-adapters-modernization-plan.md` (v1)
**Reviewer:** Claude (auditoria adversarial)
**Foco:** granularidade real, ambiguidade de step, dependências
implícitas, ferramenta certa por task.

> Critério de saída: aplicar achados em PLAN v2.

---

## Sumário

Encontrados **12 achados** materiais (6 críticos, 4 médios, 2 menores).
A v1 está coerente com a spec mas tem **3 furos sérios** de
dependência implícita que podem travar execução.

---

## Críticos

### P-CRIT-1: T2.5 exige `client.chat` mockável sem task de extração

**Onde:** Onda 2, T2.5.

**Achado:** O teste de matriz de checkpoint precisa interceptar
argumentos passados a `client.chat`. Hoje `runAgent` chama
`getClient(provider, apiKey, model)` e cria o client localmente. Sem
injeção, o spy é via `jest.mock("./llm/get-client")` global. Plan
não tem essa task explícita.

**Demanda:** adicionar **T2.0** antes de T2.5:

> **T2.0 - Setup de mock para `getClient`**
> Arquivo: `src/lib/agent/llm/__mocks__/get-client.ts` (se já não
> existe). Verificar como `run-agent.test.ts` mockou hoje (já temos
> jest verdes). Reaproveitar estratégia.

Done quando: estratégia documentada no plano + teste exemplo.

---

### P-CRIT-2: T2.1 referencia linhas frágeis ("linhas 374-385")

**Onde:** T2.1.

**Achado:** "substituir bloco atual (linhas 374-385)". Linhas mudam
toda vez que outras tasks editam o arquivo. Em execução com 8 tasks
no mesmo arquivo (`run-agent.ts`), as referências ficam stale.

**Demanda:** trocar referência por **trecho de código exato** ou
**nome de função**:

> Substituir o bloco que calcula `reasoningAllowed` (atualmente
> `const reasoningAllowed = agentSettings.reasoningCheckpoint === "PRODUCTION" || (agentSettings.reasoningCheckpoint === "PLAYGROUD" && args.isPlayground);`)
> por...

Plano deve incluir o `before` literal e o `after` literal para cada
task de edit, eliminando ambiguidade.

---

### P-CRIT-3: T5.5 conflita com `includeThoughts: false`

**Onde:** Onda 5, T5.5 + T5.2.

**Achado:** T5.2 define `includeThoughts: false` (default). T5.5 diz
"salvar todas as parts da resposta incluindo thought parts". Mas com
`includeThoughts: false`, partes com `thought:true` **não vêm** na
resposta da Gemini.

A spec diz "Gemini 2.5 models return thought signatures when thinking
is enabled and the request includes function calling" — signatures
sim, conteúdo das thoughts pode não vir. Multi-turn precisa de
**signatures**, não do texto das thoughts.

**Demanda:** revisar T5.5:

> Salvar todas as parts da resposta — text com `thoughtSignature`,
> functionCall com `thoughtSignature`. NÃO necessariamente parts
> com `thought:true` (a doc diz que com `includeThoughts:false`,
> essas parts ficam suprimidas mas as signatures permanecem nas
> demais parts).

E T5.2 mantém `includeThoughts: false` (não inflar output) mas
documenta que signatures vêm de qualquer forma.

Adicionar **T5.0** (spike paralelo a S0.2):

> **T5.0 - Spike thoughtSignature com includeThoughts:false**
> Fazer chamada Gemini com tools, includeThoughts:false. Confirmar
> que response parts trazem `thoughtSignature` em text/functionCall
> parts mesmo sem thought parts. Sem confirmação, a multi-turn quebra.

---

### P-CRIT-4: T4.7 não trata `content_block_stop`

**Onde:** Onda 4, T4.7.

**Achado:** A SSE Anthropic envia `content_block_stop` para fechar
blocos. Para `tool_use`, o `partial_json` final só pode ser parseado
após `stop` (concatena `jsonBuf` e faz `JSON.parse`). Para
`thinking`, `signature_delta` vem antes do stop.

Plan menciona handlers para `_delta` mas não para `_stop`. Risco:
último delta não é finalizado.

**Demanda:** acrescentar à T4.7:

> Handler `content_block_stop` → marca bloco como completo no
> map; trigger de parse final do tool_use.jsonBuf.

E adicionar teste em T4.10 cobrindo "tool_use com input_json_delta
em 3 chunks + stop fecha corretamente".

---

### P-CRIT-5: T6.1 sem critério claro de "se rejeitado pelo spike"

**Onde:** Onda 6, T6.1.

**Achado:** "Se spike confirmou aceitação de `reasoning_details` em
request, implementar reenvio. Se não, aceitar limitação". OK em
intenção mas não tem detalhe de **o que fica diferente** no código
em cada cenário.

**Demanda:** plan v2 tem duas branches explícitas:

**T6.1.A (caso aceito):** implementar `mapMessages` que insere
`reasoning_details` no objeto da mensagem assistant intermediária.

**T6.1.B (caso rejeitado):** `mapMessages` ignora
`reasoningHistory`. Comentário inline e teste explícito de que a
ausência é intencional.

Spike S0.3 decide qual branch executar; a outra é deletada do plan.

---

### P-CRIT-6: T7.10 sem verificação de setup de testing-library

**Onde:** Onda 7, T7.10.

**Achado:** "Tests UI (...) se @testing-library disponível; senão
Playwright spec". Não tem task que verifica.

**Demanda:** adicionar **T7.0**:

> **T7.0 - Verificar infra de teste UI**
> Comandar `npm ls @testing-library/react` no repo. Se instalado:
> testes em Jest com testing-library. Se não: dois sub-caminhos:
> (a) instalar `@testing-library/react` + `@testing-library/jest-dom`
> + configurar `jsdom` no Jest, ou (b) escrever spec Playwright.
> Decidir e documentar.

T7.10 ganha resultado da decisão.

---

## Médios

### P-MED-7: T3.6 lista parcial de eventos SSE Responses

**Onde:** T3.6.

**Achado:** Lista só 4 tipos de evento. Doc OpenAI tem mais
(`response.content_part.added`, `response.refusal.delta`,
`response.in_progress`, etc).

**Demanda:** ampliar T3.6 a partir do **resultado do spike S0.1**:

> Após S0.1, listar **todos os tipos de evento observados** e
> decidir para cada: handle ou ignore explicitamente. Comentário
> no parser explica os ignores.

### P-MED-8: T1.3 e T1.4 sem instrução de nome de migration

**Onde:** T1.3, T1.4.

**Achado:** Migration timestamp não documentado. Prisma usa
`migrate dev --name <slug>` que gera timestamp.

**Demanda:** plan v2 adiciona instrução literal:

> Rodar `npx prisma migrate dev --name llm_usage_reasoning_tokens --create-only`.
> Editar `migration.sql` para usar `IF NOT EXISTS`. Aplicar com
> `npx prisma migrate dev`.

### P-MED-9: T8.7/T8.8 sem clareza sobre como rodar reviews

**Onde:** T8.7, T8.8.

**Achado:** `/gsd-code-review` e `/gsd-ui-review` são skills. Plan
não diz se é skill via Skill tool, comando slash, ou subagente.

**Demanda:** documentar:

> `/gsd-code-review` é invocado via comando `Skill skill="gsd-code-review"`.
> Resultado é arquivo `REVIEW.md` na branch. Iterar até zero
> findings High/Critical. Não usar subagente (regra CLAUDE.md
> §6/[8]: subagente é exceção).

### P-MED-10: T5.4 fallback codes muito restritivo

**Onde:** T5.4.

**Achado:** "Fallback em 404". Mas o erro pode ser 400 "model does
not support streaming" ou 503 momentâneo.

**Demanda:** ampliar:

> Fallback ativa em (a) 404, (b) 400 com texto contendo
> "streaming"/"not supported", (c) tipo de Content-Type não
> reconhecido após 3s. Em outros casos: lançar erro estruturado.

---

## Menores

### P-MIN-11: T3.9 razão histórica da trava

**Demanda:** comentário no código removendo a trava cita "remoção
porque o nano agora vai pela Responses API; chat completions fica
para modelos sem cap, que não usam reasoning."

### P-MIN-12: Estimativa 20h é aspiracional

**Demanda:** plan v2 ressalta "20h cobertura — pode dobrar se spike
S0.2 forçar mudança grande em Gemini".

---

## Validação positiva (sem achado)

- Decomposição em ondas com dependência clara.
- Spikes antes da implementação (S0.1-3) é a coisa certa.
- Cada task tem arquivo alvo específico.
- Tests agregados ao mesmo commit da implementação.
- Critério de done verificável por task.

---

## Decisão de saída

**Plan v1 reprovado** com 6 achados críticos. Aplicar todos em
**PLAN v2** (mesmo arquivo, substituindo). Plan v2 enfrenta Review #2.

Mudanças estruturais:

1. Adicionar T2.0 (mock setup).
2. T2.1 com `before/after` literal em vez de linhas.
3. Adicionar T5.0 (spike de thoughtSignature).
4. T4.7 expandida para `content_block_stop`.
5. T6.1 com branches A/B explícitas.
6. Adicionar T7.0 (verificar infra UI test).
7. T3.6 condicional a spike S0.1.
8. T1.3/T1.4 com comandos Prisma literais.
9. T8.7/T8.8 com instrução de invocação clara.
10. T5.4 com lista de fallback codes.
