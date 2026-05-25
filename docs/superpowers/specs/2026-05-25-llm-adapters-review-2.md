# Review Adversarial #2 - SPEC v2 (Modernização adapters LLM)

**Data:** 2026-05-25
**Spec revisada:** `2026-05-25-llm-adapters-modernization-design.md` (v2)
**Reviewer:** Claude (auditoria adversarial mais profunda em cima da v2)
**Postura:** caçar furos finos. A v2 já cobriu o grosso; review #2 mira
no que sobrou: ambiguidade semântica, falha de contrato, edge case
crítico, fricção de UX.

> Critério de saída: aplicar TODOS os achados em uma SPEC v3 (no mesmo
> arquivo) que vire base do plano.

---

## Sumário

Encontrados **17 achados** materiais (8 críticos, 5 médios, 4 menores).
A v2 endureceu a estrutura mas deixou três furos sérios para arrumar:

- A2-1: streaming fallback sem `onToken` trava o UI da bolha.
- A2-7: Gemini multi-turn em conversas longas perde iterações
  intermediárias (a "Opção 3" é incompleta).
- A2-8: usar `effortStreaming="medium"` como sentinel para auto-mode
  polui semântica.

---

## Achados Críticos (CRIT)

### CRIT-A2-1: Streaming fallback deixa o UI travado

**Onde:** §5.4.

**Achado:** "Quando o provider não oferece SSE para um modelo
específico, o adapter cai para unário e **NÃO** chama `onToken(message)`
no fim."

Mas o consumidor real é `chat-panel.tsx` na bolha do Nex. Hoje ele
mostra "Pensando..." enquanto espera `onToken`. Se o adapter nunca
chama `onToken`, a UI fica em "Pensando" até receber a mensagem
final via `done` event, sem indicação de progresso. Combinado com
o typewriter frontend que reage à mensagem completa, isso já é o que
acontece hoje no OpenAI nano (vimos nos logs).

Mas a v2 prometeu O5 ("streaming token-a-token em todos os 4"). Não
chamar `onToken` no fim é coerente com O5 (não emitimos delta falso),
**mas a UI precisa fallback decente**.

**Demanda:** spec v3 separa em dois campos do retorno:
- `result.streamed: boolean` — true se houve `onToken` real durante o
  parse.
- Adapter sempre devolve. Bubble usa para decidir entre typewriter
  frontend (quando `streamed=false`) e direto (quando `true`).

Sem isso, M8 ("streaming nos 4") é cosmético.

---

### CRIT-A2-7: Gemini multi-turn perde iterações intermediárias

**Onde:** §7.3 decisão 2 + §8.4.

**Achado:** "Nova coluna `conversations.reasoning_context` JSONB
nullable. Guarda **o último** `ReasoningContext` da conversa."

Em uma conversa com 5 mensagens do usuário, cada uma com 2 iterações
do agente (10 chamadas Gemini), o `reasoning_context` no banco vai
ter só os parts da última chamada da última mensagem. A
**próxima** chamada da Gemini precisa do histórico de **toda** a
conversa, com cada response.parts inteira, em ordem.

A doc da Gemini: "Return the entire response with all parts back to
the model in subsequent turns". "Entire" = **toda** a conversa.

**Consequência:** se a 1ª pergunta gera thinking + tool call + texto,
e a 2ª pergunta é continuação ("e o estoque do produto X?"), a
chamada da Gemini para a 2ª recebe: user1, model1_text_only,
user2 — perdendo thoughtSignature de model1. Doc avisa que isso
quebra contexto.

**Demanda:** ou guardar **array** de ReasoningContext (um por
iteração da conversa inteira), ou aceitar perda explicitamente como
limitação documentada. v3 escolhe:

- **Opção definitiva:** `conversations.reasoning_history` JSONB
  default `[]` (array). `run-agent.ts` faz **append** a cada
  iteração que produz reasoning. Adapter Gemini recebe o array todo
  e reconstrói `contents[]` na ordem.
- Em paralelo: limitar tamanho do array (cap em 20 iterações;
  truncar mais antigas para não inflar o banco).

Isso atualiza §5.1 (ChatRequest.reasoningContext vira
ReasoningContext[]) e §8.3 (run-agent acumula array).

---

### CRIT-A2-8: Sentinel "medium" para auto-mode polui semântica

**Onde:** §8.3.

**Achado:** "Quando `cap.levels=['auto']`, definir
`request.reasoningEffort = 'medium'` como sinal interno; o adapter
vê e usa modo adaptive."

Problema: `medium` é um valor legítimo de effort para outros modelos.
Adapter precisa de outro sinal para distinguir "medium real" de
"medium = sentinel auto". A v2 não diz como.

**Demanda:** trocar `ReasoningEffort` para:

```ts
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "auto";
```

Adicionar `"auto"`. Catálogo agora pode ter `levels: ["auto"]`.
Adapter recebe `reasoningEffort: "auto"` e sabe que precisa usar
`type: "adaptive"` (Anthropic), `thinkingBudget: -1` (Gemini), ou
defaults do modelo (OpenAI/OR). Sem ambiguidade.

UI: quando `cap.levels=["auto"]`, dropdown mostra valor "Auto"
disabled com texto explicativo. Server Action salva `"auto"` em
`agent_settings.reasoning_effort`.

Migration de dados: linhas existentes com `reasoning_effort=NULL`
permanecem; valor padrão fica `"medium"` quando user habilita.

---

### CRIT-A2-9: AgentSettings.reasoningEffort fica inválido ao trocar modelo

**Onde:** §9 (não coberto).

**Achado:** `agent_settings.reasoning_effort` é uma coluna única
global. Se admin escolhe `medium` com gpt-5.4-nano e troca para o3
(que aceita só low/medium/high), o valor `medium` continua válido.
Mas se trocar de o3 (low/medium/high) para gpt-5.4-nano com effort
`minimal`, o nano aceita `minimal` (não há conflito). Mais perigoso:
se trocar para Gemini 3.1 Pro (`levels=["auto"]`), o valor `medium`
no banco vira inválido (deveria virar `"auto"`).

**Demanda:** quando o admin troca o modelo ativo em
`/agente/configuracao`, a Server Action `updateActiveLlmConfig`
chama em sequência um helper `reconcileReasoningEffort(modelId)`
que:

1. Pega o `cap = reasoningCapsOf(newModelId)`.
2. Se `cap` é null ou `cap.enabled=false`: zera (`reasoning_effort=NULL`).
3. Se `cap.levels=["auto"]`: força `reasoning_effort="auto"`.
4. Se valor atual não está em `cap.levels`: troca para o mais alto
   suportado (`cap.levels[cap.levels.length-1]`).

Decisão sintetizada na §9 da v3. Teste cobre os 4 caminhos.

---

### CRIT-A2-10: Multi-turn ordering OpenAI não cobre turno sem tool call

**Onde:** §7.1 decisão 4.

**Achado:** Spec mostra:
```
input = [user, ...iter[0].reasoning, fc, fco, ...iter[1].reasoning, fc, fco]
```

Mas o agente pode fazer 1 iteração com tool call seguida de iteração
sem tool call (resposta final, só texto). Nesse caso `iter[1]` não
tem `fc/fco`. Sequência fica `[user, ...iter[0].reasoning, fc0, fco0]`
e a 2ª iteração da chamada Responses retorna `output: [reasoning, message]`
(sem function_call). Isso é o que tem que ser preservado **se** uma
3ª iteração existir.

**Demanda:** generalizar para:

```
input = [
  user,
  ...iter.flatMap(it => {
    const items = [...it.reasoningItems];
    if (it.functionCall) items.push(it.functionCall, it.functionCallOutput);
    if (it.message) items.push(it.message); // mensagem do assistant intermediária
    return items;
  })
]
```

Em loop com `MAX_ITERATIONS=5`, qualquer combinação de tool calls +
texto + reasoning é representável.

---

### CRIT-A2-11: UI live-sync via window event é frágil

**Onde:** §9.2.

**Achado:** "ReasoningCard ouve event `agentModelChanged` (window
event) emitido pelo `LlmConfigForm` quando salva mudança."

`/agente/configuracao` e `/agente/recursos` são rotas Next.js
separadas — se o usuário navegar (cliques no menu), o cleanup do
componente perde o listener. Cross-tab também não funciona com
window event normal.

**Demanda:** mais simples e robusto: `revalidatePath` após
mudança no LlmConfigForm. Quando o usuário navega para
`/agente/recursos`, o server component refeta `AgentSettings` e
modelos efetivos com valores atualizados. Sem live-sync entre abas;
a UX é "salvou em configuração → vai em recursos → ve atualizado".

Critério M4 ajusta: "Trocar modelo em /agente/configuracao e
navegar para /agente/recursos exibe efforts atualizados sem reload
manual da página." (ou seja: o `router.refresh()` faz o serviço).

---

### CRIT-A2-12: Modelos `levels=["auto"]` com effort customizável

**Onde:** §7.2 (Claude Opus 4.7).

**Achado:** Opus 4.7 está marcado `levels: ["auto"]` mas a doc da
Anthropic diz: "Claude Opus 4.7: `type: 'enabled'` ❌ Error /
`adaptive` ✅ Required". Não diz que o budget é não-customizável; só
diz que o **type** é. Pode ser que `adaptive` aceite
`budget_tokens` como teto. Se sim, o usuário pode ajustar
low/medium/high (mapping para budget) mesmo em modo adaptive.

**Demanda:** v3 separa dois conceitos:

- **`cap.levels`**: níveis de UI disponíveis.
- **`cap.adaptiveMode: boolean`**: provider opera em modo
  adaptive nativo.

Em Opus 4.7: `levels=["low","medium","high"]`, `adaptiveMode=true`.
Adapter usa `type:"adaptive"` + `budget_tokens` calculado.

Em Gemini 3.1 Pro: `levels=["auto"]`, `adaptiveMode=true`,
`adaptiveBudget=-1`.

Em modelos onde o range é controlável: `levels=[multi]`,
`adaptiveMode=false`.

Tabela do anexo §15 redesenhada com `adaptiveMode` separado.

---

### CRIT-A2-13: outputCap dos modelos OpenAI é chute

**Onde:** §15 (anexo).

**Achado:** Tabela marca outputCap=16384 para gpt-5.4-nano e
32768 para -pro. Esses são chutes. A doc real da OpenAI diz
"Reserve 25,000+ tokens" sem fixar cap por modelo. E
`max_output_tokens` da Responses API aceita valores grandes para
modelos com janela grande.

**Demanda:** v3 marca outputCap **opcional** para OpenAI; quando
ausente, adapter não aplica clamp e deixa o cliente passar
`max_output_tokens` direto. Plan deve incluir task "buscar limites
oficiais na doc atual da OpenAI e preencher". Sem isso, default
sem clamp.

---

## Achados Médios (MED)

### MED-A2-14: Comportamento de checkpoint=PLAYGROUND no playground com modelo Haiku 4.5

**Onde:** §6.

**Achado:** Spec calcula `reasoningAllowed = cap.enabled && cap.supportsWithTools && checkpoint logic`.

Se o usuário está no playground e o modelo é Haiku 4.5
(supportsWithTools=false), `reasoningAllowed=false` independente do
checkpoint. Mas a UI hoje mostra que o checkpoint está ativo. O usuário
fica confuso.

**Demanda:** quando o modelo é configurado e tem
supportsWithTools=false, **forçar** checkpoint=OFF na Server Action
do `updateAgentResources`. UI exibe banner explicando: "Modelo
selecionado não suporta raciocínio com ferramentas. Modo de
raciocínio desativado automaticamente."

Funde com CRIT-A2-9 (reconcileReasoningEffort).

---

### MED-A2-15: Gemini streaming format detection — task de prototipagem

**Onde:** §7.3.

**Achado:** Spec diz "detectar Content-Type" mas plan deve incluir
task explícita: **antes** de implementar streaming Gemini, fazer
chamada real e logar header + primeira chunk. Sem essa prova, a
implementação é especulativa.

**Demanda:** plano vai ter uma sub-task "spike: chamar Gemini
streamGenerateContent com curl, logar Content-Type e primeiros 200
bytes" antes da task de implementação.

---

### MED-A2-16: OpenRouter aceita reasoning_details em mensagem do histórico?

**Onde:** §7.4.

**Achado:** Spec diz "reenviar inteiro como campo `reasoning_details`
em messages[i]". Mas OpenRouter é Chat Completions OpenAI-compatible
no campo `messages`. Não é documentado que o **request** aceite
`reasoning_details` em `messages[i]`.

**Demanda:** task de spike no plano: testar que OpenRouter aceita
`reasoning_details` no request quando reenviado. Se não aceitar, a
mitigação é não preservar — aceitar limitação documentada.

---

### MED-A2-17: Plano de rollback se M1 falhar

**Onde:** §13.

**Achado:** Spec não define rollback. Se o refator OpenAI quebrar
produção (chamadas começam a falhar 500), o que fazer?

**Demanda:** §13 v3 acrescenta:

- Cada commit é revertível por `git revert <SHA>` isolado.
- Em caso de falha pós-merge em main, executar `git revert` do
  commit do adapter afetado, push, redeploy.
- Tempo médio esperado de rollback: <5 min.

---

### MED-A2-18: Quantidade de testes — refinamento por bloco

**Onde:** §10.

**Achado:** v2 chuta 77. Refinamento:

- OpenAI: 15 + 3 spec-driven (instructions, store:false, multi-turn ordering)
- Anthropic: 15 + 1 (adaptiveMode flag)
- Gemini: 15 + 2 (array reasoning_history, content-type detection)
- OpenRouter: 12 + 1 (rejeição de modelo sem cap)
- Checkpoint matrix: 12 (sem mudança)
- UI ReasoningCard: 8 + 3 (estados disabled, autoModeHint, reconcile)
- run-agent integration: 5 (carregar e salvar reasoning_history)
- **Total revisado: 92.**

---

## Achados Menores (MIN)

### MIN-A2-19: Migration timestamp

**Demanda:** plano usa `YYYYMMDDHHmm` como nome de migration baseado
no horário do commit. Documentar isso no plano.

### MIN-A2-20: Persistência de "reasoning history" e GDPR

**Demanda:** documentar que `reasoning_history` pode conter PII
indireto via texto de pergunta replicado. Política de retenção
sugerida: 30 dias. Job de limpeza (`worker` cron) fora de escopo
desta entrega, mas spec documenta intenção.

### MIN-A2-21: Cap de tamanho do reasoning_history

**Demanda:** §5.1 v3 documenta cap "20 iterações ou 50KB serialized,
o que vier primeiro". Truncamento mantém últimas iterações.

### MIN-A2-22: Tabela do anexo §15 cresceu — colocar em arquivo separado

**Demanda:** mover REASONING_CAPS para
`docs/superpowers/specs/2026-05-25-reasoning-caps-table.md` referenciado
pelo design. Plano consulta esse doc para implementar o catálogo.

---

## Validação positiva (sem achado)

- §3 critérios mensuráveis M1-M8 estão bons.
- §10.5 matriz de testes de checkpoint é exemplar.
- §5.6 logging mínimo está proporcional.
- §11 verificação real com pré-requisito de credencial é defensiva.
- §15 tabela cobre os modelos relevantes do catálogo atual.

---

## Decisão de saída

**Spec v2 reprovada** com 8 achados críticos. Aplicar todos na **SPEC v3**.
v3 vira base do plano (próxima etapa do workflow).

Mudanças estruturais maiores que a v3 deve absorver:

1. `ReasoningEffort` ganha `"auto"`.
2. `ReasoningContext` vira array em ChatRequest/Result.
3. `conversations.reasoning_history` JSONB array (não `reasoning_context`).
4. `ReasoningCap` ganha `adaptiveMode: boolean` separado de `levels`.
5. `ChatResult.streamed: boolean` para UI saber se houve delta.
6. Server Action `reconcileReasoningEffort` no salvamento de modelo.
7. `revalidatePath` substituí window event para sync.
8. Tabela de capability migra para arquivo separado.
