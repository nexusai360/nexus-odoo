# Auditoria de qualidade do Agente Nex (Spec da Execução)

> Objetivo único: identificar **padrões reproducíveis de falha e acerto** nas
> 6 mil conversas reais para gerar **mudanças concretas e mensuráveis** no
> prompt-mestre, no catálogo de tools e no fluxo do agente. Tudo que não levar
> a uma ação concreta de melhoria é desperdício.

## 1. Por que este spec existe

Sem mapeamento, a auditoria vira "leu e classificou" — sem alavanca de
melhoria. Este spec define **o que coletar, como classificar, e como
agregar** para que o relatório final entregue:

1. **Onde acertamos**: padrões que devemos preservar.
2. **Onde erramos**: padrões reprodutíveis (não casos isolados) com causa
   raiz identificada.
3. **Como melhorar**: ação concreta por padrão identificado (mudança de prompt,
   ajuste de tool, novo guardrail).

Cada padrão na taxonomia tem **ação associada** já mapeada (§5). Se um
padrão não tem ação possível, ele não entra.

## 2. Realidade do banco (já levantada)

- **6.013 conversas** · **6.078 mensagens user** · **10.668 respostas assistant**
- **5.751 turnos com tool_calls** · **4.917 respostas finais** (assistant sem toolCalls)
- **10.638 chamadas LLM** · praticamente 1 modelo só (`gpt-5.4-nano`)
- 97 % das respostas curtas (< 500 chars) — agente é objetivo por padrão

**Heurísticas brutas que já dão pistas**:

| Sinal | Ocorrências | % do total | O que sugere |
|---|---|---|---|
| Contém "não consigo" / "não encontrei" | 508 | 10 % | Limitação real ou tool errada |
| Contém "erro" / "falhou" | 97 | 2 % | Falha técnica |
| **Contém placeholder `Xs` (freshness)** | **449** | **9 %** | **Bug sistemático** |

O bug do `Xs` (placeholder de freshness não substituído) já é um achado
acionável **antes** mesmo da auditoria começar.

## 3. Top 5 tools usadas (alvo da auditoria)

| Tool | Chamadas | Domínio |
|---|---|---|
| estoque_saldo_produto | 1.149 | estoque |
| preco_produto | 1.038 | comercial |
| servico_buscar | 1.014 | cadastros |
| contabil_plano_de_contas | 929 | contábil |
| cadastro_buscar_parceiro | 517 | cadastros |

Concentração em 5 tools cobre ~80 % do volume. Padrões aqui têm maior
alavanca de melhoria.

## 4. Estrutura de cada turno avaliado

Um **turno** é a unidade atômica:

```
turno = {
  conversationId,
  userMessageId, userMessage,            -- a pergunta
  toolMessageId, toolCalls[],             -- (opcional) a chamada de tool
  finalMessageId, finalMessage,           -- a resposta final
  model, tokensInput, tokensOutput, durationMs,
  createdAt
}
```

**Importante** — o que NÃO temos no banco (limitações da auditoria):

- ❌ Não temos `tool_results` (resultado retornado pela tool) — só foi
  instrumentado agora; turnos antigos não têm.
- ❌ Não temos como conferir se os **números** estão corretos
  (R$ 38M é verdade?) sem re-rodar a tool — e mesmo assim só vale se os dados
  são estáveis (cache muda, dados ficam diferentes).

**O que podemos avaliar com confiança**:

- ✅ Aderência semântica: a resposta atende a pergunta?
- ✅ Escolha de tool: a tool chamada faz sentido pra pergunta?
- ✅ Encadeamento: se precisa de 2 tools (parceiro → notas), encadeou?
- ✅ Coerência interna: a resposta usa os parâmetros das tools que chamou?
- ✅ Qualidade do texto: gramática, freshness, formato, placeholder.
- ✅ Limitação declarada: "não consigo" é justificada ou é capitulação?

## 5. Taxonomia controlada de padrões (vocabulário fixo)

Cada turno avaliado **DEVE** ser tagueado com **exatamente um classification
status** + **0 ou mais pattern tags** da lista abaixo. Vocabulário fixo permite
agregação determinística no relatório final.

### Classification status

| Status | Critério |
|---|---|
| `CORRETO` | Pergunta atendida, tool certa, resposta direta e útil. |
| `PARCIAL` | Tentou responder mas faltou algo (resposta incompleta, fluxo de tools cortado, formato ruim) — usuário sai com menos do que pediu. |
| `ERRADO` | Não respondeu o que foi perguntado, ou respondeu com tool errada, ou inventou dado, ou criou loop de clarificação. |
| `FORA_DE_ESCOPO` | Usuário pediu algo que o agente legitimamente não tem (gap de produto). Não conta como erro do agente. |

### Pattern tags (causa raiz / categoria do problema)

**Fluxo / orquestração:**
- `fluxo_tool_incompleto` — parou na primeira tool sem encadear a segunda (parceiro→notas, produto→preço, etc).
- `parametro_incompleto` — chamou tool certa mas faltou filtrar por X que estava na pergunta.
- `tool_errada` — escolheu tool diferente da que responderia a pergunta.
- `nao_usou_tool` — respondeu de cabeça quando devia ter consultado.
- `tool_redundante` — chamou tool quando não precisava.

**Qualidade do texto:**
- `placeholder_nao_substituido` — `Xs`, `{var}`, freshness não computado.
- `gramatica_plural` — "Existem 1", concordância errada.
- `formato_quebrado` — markdown bagunçado, bullets soltos.
- `resposta_truncada` — resposta cortou no meio.

**Conteúdo:**
- `dado_inventado` — número/nome que não tem origem em tool nem em contexto.
- `entendeu_mal_termo` — confundiu o significado do termo (cliente vs fornecedor, etc).
- `erro_data` — período errado (mês passado vs mês corrente, etc).
- `pergunta_ignorada` — respondeu coisa diferente do que foi perguntado.

**Comportamento:**
- `pediu_clarificacao_desnecessaria` — pediu info que podia ter assumido como default.
- `recusa_indevida` — recusou algo legítimo.
- `loop_clarificacao` — ficou perguntando sem responder nunca.
- `limitacao_real_declarada` — agente avisou honestamente que não consegue (PARCIAL aceitável).

**Acertos:**
- `acerto_modelo` — exemplo de turno que vale preservar como referência.
- `acerto_encadeamento` — encadeou tools corretamente em fluxo complexo.
- `acerto_objetividade` — resposta enxuta e completa.

### Ação associada a cada pattern tag (mapa de melhoria)

| Pattern | Ação no agente |
|---|---|
| `fluxo_tool_incompleto` | Adicionar regra no prompt: "Pergunta envolvendo X e Y? Encadear tool A → tool B antes de responder." Listar fluxos canônicos. |
| `parametro_incompleto` | Revisar descrição da tool (mais explícita sobre os filtros). Adicionar exemplos de uso no prompt. |
| `tool_errada` | Revisar descrição das tools confundidas. Adicionar diferenciação clara no prompt-mestre. |
| `nao_usou_tool` | Endurecer regra: "Sempre consultar tool para X" no identity-base. |
| `tool_redundante` | Adicionar guardrail: "Não chame tool Y quando X já cobre". |
| `placeholder_nao_substituido` | **Bug de código** — investigar template de freshness (`withFreshness` / `atualizadoEm`). |
| `gramatica_plural` | Adicionar exemplo no prompt sobre concordância. |
| `formato_quebrado` | Reforçar regra de saída no prompt. |
| `resposta_truncada` | Verificar `maxTokens` do adapter. |
| `dado_inventado` | Endurecer "nunca responda número sem tool" no prompt. |
| `entendeu_mal_termo` | Adicionar glossário do domínio no prompt. |
| `erro_data` | Reforçar regra de data padrão (mês corrente, hoje, etc). |
| `pergunta_ignorada` | Revisar prompt — talvez ele esteja seguindo template em vez de ler a pergunta. |
| `pediu_clarificacao_desnecessaria` | Já existe regra no prompt — pode estar sendo ignorada. Achar exemplos para reforçar. |
| `recusa_indevida` | Revisar guardrails — talvez tenham se tornado muito restritivos. |
| `loop_clarificacao` | Adicionar regra "depois de 1 clarificação, assumir default e responder". |

## 6. Pipeline da auditoria

```
[Estágio 1] Dump
  scripts/quality-audit/01-dump-turns.ts
  → Lê banco; constrói turnos; agrupa em batches de 40
  → Grava docs/agent-quality-review/batches/batch-XXXX.json
  → Sample estratificado por tool (proporcional ao volume)

[Estágio 2] Avaliação paralela
  Eu (orquestrador) disparo subagentes em paralelo (5 por rodada)
  Cada subagente:
    - Recebe path do batch-XXXX.json + a rubrica (esse spec)
    - Lê o arquivo
    - Avalia cada turno aplicando taxonomia §5
    - Grava docs/agent-quality-review/results/batch-XXXX-result.json
    - Retorna pra mim 1 linha de resumo
  Loop até esgotar batches

[Estágio 3] Agregação
  scripts/quality-audit/02-aggregate.ts
  → Lê todos os results
  → Conta por status e por pattern tag
  → Clusteriza recomendações de prompt
  → Gera docs/agent-quality-review/RELATORIO-FINAL.md
```

## 7. Formato do `batch-XXXX.json`

```json
{
  "batchId": "0001",
  "createdAt": "2026-05-25T...",
  "turnos": [
    {
      "turnoId": "uuid-final-msg-id",
      "conversationId": "uuid",
      "createdAt": "...",
      "userMessage": "Qual o saldo do produto X?",
      "toolCalls": [{"name":"estoque_saldo_produto", "arguments":{...}}],
      "finalMessage": "O saldo é 16 unidades...",
      "model": "gpt-5.4-nano",
      "tokensInput": 1200,
      "tokensOutput": 50,
      "durationMs": 4200
    },
    ...
  ]
}
```

## 8. Formato do `batch-XXXX-result.json`

```json
{
  "batchId": "0001",
  "evaluatedAt": "2026-05-25T...",
  "totals": { "CORRETO": 32, "PARCIAL": 6, "ERRADO": 2, "FORA_DE_ESCOPO": 0 },
  "patterns": { "fluxo_tool_incompleto": 3, "placeholder_nao_substituido": 5, ... },
  "turnos": [
    {
      "turnoId": "uuid",
      "status": "PARCIAL",
      "patterns": ["fluxo_tool_incompleto"],
      "razao": "Pergunta era 'quantas notas do fornecedor X', mas o agente chamou só fiscal_notas_recebidas (sem filtrar por X). Deveria ter encadeado cadastro_buscar_parceiro→fiscal_notas_recebidas_por_fornecedor.",
      "sugestao_prompt": "Adicionar regra: 'Pergunta sobre fornecedor + notas? Buscar parceiro primeiro, pegar ID, depois consultar notas por fornecedor'."
    }
  ]
}
```

## 9. Briefing do subagente (será passado como prompt)

O subagente NÃO vê meu contexto. O briefing dele tem que conter:

1. Objetivo (avaliar 1 batch).
2. Rubrica completa (status + pattern tags + critérios).
3. Exemplos de cada categoria (3-5 turnos com avaliação esperada).
4. Path do batch a processar.
5. Path do result a escrever.
6. Restrição: "responda apenas com 1 linha de resumo no fim. Não dump JSON na resposta."

O briefing é gerado dinamicamente por um helper em
`scripts/quality-audit/build-subagent-briefing.ts` que injeta o caminho do
batch em um template.

## 10. Formato do `RELATORIO-FINAL.md`

Sumário executivo (1 página):

1. **Totais**: X turnos avaliados · A corretos (Y%) · B parciais (Y%) · C errados (Y%) · D fora de escopo.
2. **Top 10 padrões de falha** (ordenados por ocorrência), cada um com:
   - Contagem absoluta + %
   - 1 exemplo real (turnoId clicável)
   - Ação concreta proposta (do mapa §5)
3. **Top 5 acertos** (padrões a preservar).
4. **Bugs detectados** (separado dos padrões — coisas como `Xs`).
5. **Gaps de produto** (`FORA_DE_ESCOPO` agregado por tema).
6. **Recomendações priorizadas** (ordenadas por impacto = `quantidade × severidade`).

Cada recomendação na seção 6 tem:
- O que mudar (texto sugerido para o prompt OU mudança de código)
- Em qual arquivo (`identity-base.ts`, `compose.ts`, tool específica, etc)
- Quantos turnos afetados
- Estimativa de severidade (alta/média/baixa)

## 11. Critério de "esforço útil"

Quando o relatório terminar, ele PRECISA responder:

- ✅ Qual a taxa real de acerto do agente hoje? (número)
- ✅ Onde ele falha mais? (top 5 padrões com %)
- ✅ Qual a primeira mudança a fazer? (recomendação #1 com mudança literal de prompt)
- ✅ Existe bug de código que não é prompt? (placeholder Xs já sabemos)
- ✅ Existe gap de produto (tool ausente)? (FORA_DE_ESCOPO agregado)
- ✅ Quais padrões preservar?

Se o relatório responde isso, o esforço valeu. Se não, foi desperdício.

## 12. Após o relatório (Estágio 4)

Não faz parte da auditoria, mas é a continuação prevista:

1. Você revisa o relatório e marca quais recomendações aceita.
2. Em sessão futura, aplicamos as mudanças aceitas no prompt.
3. Plugamos o contextual suggester no `chat-panel.tsx` (Task 15).
4. **Mede de novo**: roda o dump+aval contra conversas pós-mudança para
   comparar taxa de acerto. Esse é o ciclo de melhoria contínua.
