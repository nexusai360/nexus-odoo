# SPEC , Nex Arquitetura 3.0: agente profissional (memória, orquestração, precisão)

> **Versão: v3** (v1 + 2 reviews adversariais aplicadas , relatórios em
> `2026-06-12-nex-arq3-review1.md` (3 BLOCKER/9 MAJOR/6 MINOR) e
> `2026-06-12-nex-arq3-review2.md` (2 BLOCKER/8 MAJOR/6 MINOR + 5 cortes)).
> **Pedido do usuário (2026-06-12):** "agente MEGA inteligente e preciso, a verdadeira
> fonte de verdade da empresa, que saiba conversar, transmitir confiança e sabedoria,
> e ACIMA DE TUDO lembrar do que é falado na conversa".
> **Base de pesquisa:** os 4 docs `research/2026-06-12-*.md` (diagnóstico, memória,
> arquitetura, precisão).

## 1. Problema (medido)

1. **Memória , dor nº 1, causa mecânica:** janela = 12 LINHAS de `messages`
   (não turnos); `sanitizeHistoryPairs` descarta assistant-com-toolCalls
   DEPOIS do `take:12`; janela efetiva ~4 turnos de prosa (132 chars/msg).
   **Correção do diagnóstico (review 2, MJ2-1):** `Message.toolResults` JÁ
   persiste os resultados íntegros no banco , eles só nunca voltam ao
   contexto. O custo de "lembrar" é derivar digest e injetar, com backfill
   retroativo de graça sobre o que já existe.
2. **Single-shot sem plano** para perguntas compostas.
3. **Um modelo para tudo** (mini): teto baixo para explicação/raciocínio.
4. **Validadores fortes (V1-V8) mas cegos para memória:** V2/guardrail leem
   SÓ toolResults do turno atual (auto-validator.ts:66-70) , qualquer
   resposta correta baseada em memória seria REPROVADA (conflito M×P,
   review 2 B2-1). O repair loop e a proveniência precisam nascer
   memory-aware.

## 2. Objetivos e gates REAIS (review 1 B2 / review 2 MJ2-6 aplicados)

Dois níveis de verificação, com infra nomeada:

**Gate determinístico (CI, sem LLM, roda em todo PR):**
- `montar-conversa.test.ts` estendido: dado um histórico sintético de 30
  turnos com tool results conhecidos, o prompt montado CONTÉM o digest do
  turno 3, o focoAtual correto e o resumo , e NÃO contém payload bruto além
  do budget. (Testa a memória por construção, custo zero.)
- Golden 171 atual: zero regressão (gate pré-push existente).

**Bateria E2E paga (manual/nightly, padrão cost-regression.e2e.ts):**
- `memoria-30-turnos`: conversa real de 30 turnos via runAgent; asserções em
  turnos intermediários (estende `scripts/ab-cerebro.ts`, que já encadeia
  `turnosAntes` via runAgent , review 2 MJ2-2: o harness está 80% pronto; o
  gap é asserção por turno). Custo medido: US$0,30-0,60/run, 6-10min.
- **M1:** no turno 28, "qual era aquele valor de [coisa do turno 3]?"
  responde com o número exato do digest. **M2:** anáfora ≥95% nos goldens de
  follow-up (ampliar 4→15 casos). **O1:** compostas completas (≥10 casos).
- **C1 (custo/latência):** medir por `tokensCachedInput` da telemetria (a
  tese "prefixo cacheável" vale só até o catálogo: `tools[]` varia por
  pergunta , review 2 MJ2-7; mitigação: catálogo sticky por conversa).
  p50 simples: latência não piora >15%; custo/turno ≤2x atual.

## 3. Arquitetura

### 3.1 Memória em camadas (com as correções das reviews)

```
L0  System prompt (estático)  + catálogo de tools (sticky por conversa)
L1  [CORTADO desta spec , AgentUserMemory vira onda futura]
L2  resumoProgressivo da conversa (cap ~600 tk, atualizado ASYNC via BullMQ)
L3  Janela recente por TURNOS (8-12) com SÍNTESE TEXTUAL:
    cada turno assistant vira "texto final + toolDigest" (1-3 linhas com
    tool, args-chave e números do _DESTAQUE). NUNCA replay de toolCalls
    crus: tool call órfã = 400 nos adapters (review 1 B3). O digest entra
    como PARTE DO CONTENT da mensagem assistant no replay.
L4  focoAtual (working memory determinística, ~150-250 tk)
L5  [ADIADO , FTS sob demanda fica para depois do M1/M2 provarem valor]
```

- **Persistência:** `AgentMessage.toolDigest` derivado de `toolResults` (que
  já existe!) , derivação síncrona barata no fim do turno + **backfill** das
  conversas existentes por script. `AgentConversation.resumoProgressivo/
  resumoAteMensagemId/focoAtual`. `ConversationEntity` (anáfora).
- **RBAC (review 2 MJ2-5):** o digest carrega `dominio` (da tool de origem);
  a INJEÇÃO (L2/L3/L4) filtra por `userAllowedDomains` do turno , domínio
  revogado não re-serve dado via memória. O resumoProgressivo é re-gerado
  excluindo domínios revogados quando o perfil muda (lazy, na 1ª injeção).
- **Anáfora UNIFICADA (review 2 MJ2-3):** a heurística de focoAtual/entidades
  NÃO nasce paralela ao `router/contextualize` (R2-ctx) vivo em produção:
  o R2-ctx passa a LER o focoAtual como fonte canônica de contexto , uma
  única interpretação da anáfora no sistema. Fallback CQR (modelo pequeno)
  só quando heurística não fecha.
- **Resumo:** sempre re-resumir das mensagens originais (nunca resumo-de-
  resumo); cap rígido; conteúdo factual (números com proveniência).

### 3.2 Orquestração por tiers (O.1 CORTADO , reviews 1 B1 + 2 B2-2)

- A "migração para Responses API" CAI: o gpt-5.4-mini JÁ roda em
  `/v1/responses` (catalog.ts:376) e o encadeamento intra-turno já existe
  via `reasoningHistory` (run-agent.ts:824-827). `store:false` é decisão
  deliberada e fica.
- **T1 simples** (maioria): fluxo atual, mini, effort baixo. Sem mudança.
- **T2 composta , T2-LITE primeiro (corte da review 2):** sem planner
  dedicado num primeiro momento (gpt-5.4 mediu 89,8s/chamada , inviável
  como planner síncrono). T2-lite = mini com instrução de decomposição no
  prompt + teto maior de tool calls por turno + síntese final caprichada.
  Se os goldens `composta-*` mostrarem teto, aí avalia-se planner forte
  ASSÍNCRONO (com aviso de processamento ao usuário).
- **T3 explicativa/contestação:** modelo forte (gpt-5.4) com memória completa
  injetada , aqui latência maior é aceitável e o valor é máximo. Atrás de
  flag em `agent_settings` (rollback = flag).
- **Classificação:** lexical conservadora (na dúvida, tier acima) + CASCATA:
  reprova de validador em T1 re-executa em T3 (paga o forte só nos errados).
- **Streaming/TTFT (review 2 MJ2-8):** T1 streama como hoje (validação
  pós-flush + evento `revising` quando o repair corrige); T2/T3 podem reter
  o flush até validar (usuário já espera mais nesses tiers).

### 3.3 Precisão e confiança (memory-aware desde o nascimento)

- **Validadores memory-aware (resolve review 2 B2-1):** o conjunto de fontes
  legítimas de número passa a ser: toolResults do turno ∪ digests injetados
  ∪ focoAtual ∪ resumoProgressivo (tudo que o prompt REALMENTE continha).
  O hint de retry cita a fonte certa em vez de apagar o número de memória.
- **Repair loop budget 1:** crítica direcionada (qual número, qual fonte) →
  1 regeneração → cascata de tier → falha honesta. Nunca número suspeito.
- **Proveniência:** resposta numérica declara fonte/critério/recorte;
  validador confere tool citada ∈ tools executadas/da memória usada.
- **V-claims:** percentuais/variações recomputados; rankings/superlativos
  contra a ordenação real; período citado == consultado.
- **P.4 consistência entre turnos , nasce em SHADOW freshness-aware
  (review 2 MJ2-4):** sync de 3min muda número legitimamente; o check loga
  divergências (mesma métrica+recorte, números diferentes, sem menção a
  atualização) e só vira blocking com dados de produção provando precisão.
- **Flywheel MANUAL primeiro (corte review 2):** falha de produção vira
  candidato a golden numa fila revisada por humano/Claude; automação total
  só depois de o processo provar taxa de candidatos úteis.

## 4. Entrega em ondas (cada onda: TDD + gates determinísticos + E2E + ship.py)

- **Onda M , Memória:**
  M.0 harness: asserções por turno no ab-cerebro + teste determinístico de
      montagem de prompt (30 turnos sintéticos) , PRIMEIRO, é o gate de tudo;
  M.1 `toolDigest` derivado de `toolResults` (+ script de backfill);
  M.2 janela por TURNOS com síntese textual (consertar sanitize/take , sem
      replay de toolCalls crus);
  M.3 `focoAtual` determinístico + unificação com R2-ctx;
  M.4 `ConversationEntity` + heurística de anáfora (fallback CQR);
  M.5 `resumoProgressivo` async (BullMQ) + injeção L2 com RBAC;
  M.6 validadores memory-aware (B2-1) , junto com M.2, não depois.
- **Onda O:** O.2 classificador de tiers + cascata; O.3 T2-lite; O.4 T3 forte
  atrás de flag.
- **Onda P:** P.1 repair direcionado; P.2 proveniência; P.3 V-claims;
  P.4 consistência em shadow; P.5 flywheel manual.

## 5. Não-objetivos / cortes desta spec

- Migração de transporte LLM (O.1) , já está em Responses; store:false fica.
- Multi-agente com handoffs; text-to-SQL livre (decisão canônica #3).
- pgvector/grafo temporal; FTS L5 (adiado); AgentUserMemory L1 (onda futura).
- Planner síncrono com modelo forte (T2-lite primeiro; 89,8s/chamada mata UX).
- Flywheel automático (manual primeiro).

## 6. Riscos e mitigações (atualizados)

- **Conflito M×P:** tratado por construção (M.6 na onda M; fontes legítimas
  ampliadas). Gate: golden 171 + casos novos de memória passam JUNTOS.
- **Adapters multi-provider:** síntese textual no replay (sem toolCalls
  órfãos); playground com llmOverride continua funcionando , teste dedicado.
- **RBAC:** digest com domínio + filtro na injeção; teste de regressão de
  domínio revogado.
- **Custo:** tiers + cascata; telemetria custo/turno já existe; teto US$8.
- **Latência T3:** flag + medição; T1 intocado.
- **Backfill:** idempotente, em lotes, fora do horário de pico (worker).
