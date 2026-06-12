# SPEC , Nex Arquitetura 3.0: agente profissional (memória, orquestração, precisão)

> **Versão:** v1 (aguarda 2 reviews adversariais)
> **Pedido do usuário (2026-06-12):** "agente MEGA inteligente e preciso, a verdadeira
> fonte de verdade da empresa, que saiba conversar, transmitir confiança e sabedoria,
> e ACIMA DE TUDO lembrar do que é falado na conversa".
> **Base de pesquisa (ler antes de revisar):**
> - `research/2026-06-12-diagnostico-pipeline-atual.md` (o que existe, com linhas)
> - `research/2026-06-12-sota-memoria-conversacional.md` (memória em camadas)
> - `research/2026-06-12-sota-arquitetura-agentes.md` (orquestração/tiers)
> - `research/2026-06-12-sota-precisao-confianca.md` (verificação/proveniência)

## 1. Problema (medido, não estimado)

1. **Memória é a dor nº 1 e tem causa mecânica:** a janela de histórico são
   12 LINHAS de `messages` (não turnos); mensagens `role=tool` nunca são
   persistidas (0 no banco, contra 19.755 assistant); `sanitizeHistoryPairs`
   descarta do histórico todo assistant-com-toolCalls como "par incompleto"
   DEPOIS de gastar vaga no `take:12`. Janela efetiva: ~4 turnos de prosa
   (média 132 chars/assistant). O agente literalmente não tem como lembrar
   números de 5 turnos atrás.
2. **Single-shot sem plano:** perguntas compostas ("compare X e Y e me explica
   a diferença") dependem de o mini acertar 2+ tool calls num turno só.
3. **Um único modelo (gpt-5.4-mini) para tudo:** ótimo custo p/ perguntas
   simples; teto baixo para raciocínio composto/explicativo (A/B de 2026-06-11
   mostrou empate na SELEÇÃO de tool, mas a qualidade de explicação/raciocínio
   nunca foi o critério daquele A/B).
4. **Precisão já é forte (validadores V1-V8 + golden 171), mas o loop não
   fecha:** reprova vira retry genérico, não crítica direcionada; não há
   contrato de proveniência nem verificação de claims derivados (percentuais,
   rankings); consistência ENTRE turnos não é verificada.

## 2. Objetivos mensuráveis (critérios de aceite do projeto)

- **M1 (memória):** numa conversa de 30 turnos, perguntar "qual era aquele
  valor de [coisa do turno 3]?" responde certo (golden multi-turno novo,
  bateria `memoria-30-turnos`). Hoje: impossível por construção.
- **M2 (anáfora):** "isso/ela/e do mês passado?" resolve com a entidade/período
  corretos em ≥95% dos casos golden de follow-up (hoje 4 casos; ampliar p/ ≥15).
- **O1 (composta):** perguntas compostas de 2-3 sub-consultas respondem completas
  (golden `composta-*` ≥10 casos) sem perder nenhuma parte.
- **P1 (precisão):** zero regressão no golden 171; novos casos de claims
  derivados (percentual/ranking/variação) e de consistência entre turnos
  (mesma métrica+recorte = mesmo número na mesma conversa).
- **C1 (custo/latência):** p50 de pergunta simples NÃO piora >15% em latência;
  custo médio por turno ≤ 2x o atual (tiers pagam o forte só onde precisa).
- **E2E:** replay da conversa real `a395702f` + bateria de 30 turnos, com
  avaliação lado a lado.

## 3. Arquitetura

### 3.1 Memória em 5 camadas (research de memória, §3 , adotado integralmente)

```
L0  System prompt + catálogo (estático, cacheável por prefixo)
L1  AgentUserMemory (perfil/aliases do usuário, ~100 tk)
L2  resumoProgressivo da conversa (cap ~600 tk, atualizado ASYNC via BullMQ)
L3  Janela recente VERBATIM por TURNOS (8-12 turnos, não linhas) +
    toolDigest (1-3 linhas com números-chave) no lugar de payload podado
L4  focoAtual (working memory estruturada, determinística, ~150-250 tk):
    métrica, período, entidades em foco, último resultado-chave
L5  Retrieval sob demanda sobre o histórico (FTS portuguese em AgentMessage)
```

Mudanças de persistência (Prisma):
- `AgentMessage.toolDigest` (+ persistir SEMPRE um digest por tool call:
  tool, argumentos-chave, números do _DESTAQUE/_agregado). Corrige a raiz
  do esquecimento: o dado passa a EXISTIR no histórico.
- `AgentConversation.resumoProgressivo/resumoAteMensagemId/focoAtual`.
- `AgentUserMemory` e `ConversationEntity` (schema no research §3.2).
- Montagem do prompt na ordem L0→L1→L2→L3→L4 (volátil no fim, preserva
  prompt caching de prefixo).

Resolução de anáfora: heurística determinística contra `focoAtual` +
`ConversationEntity` (recência); fallback de query-rewriting com modelo
pequeno SÓ quando a heurística não fecha (CQR). Custo zero na maioria.

### 3.2 Orquestração por tiers com cascata (research de arquitetura)

- **T1 simples** (1 tool óbvia): fluxo atual, gpt-5.4-mini, `reasoning_effort`
  baixo. É a maioria do tráfego; nada muda no custo.
- **T2 composta** (2+ sub-consultas/comparações): planner-executor CONSOLIDADO
  (1 plano curto → tool calls paralelas → 1 síntese). Modelo forte (gpt-5.4)
  só no plano e na síntese; tools rodam igual.
- **T3 explicativa/contestação** ("por quê?", "explica a conta", "tá errado"):
  modelo forte com o contexto de memória completo (L2-L5).
- **Classificação:** regras lexicais + sinais (nº de métricas citadas,
  conjunções, interrogativas de causa) com default conservador (na dúvida,
  tier acima). **Cascata:** reprova de validador no T1 re-executa em T2/T3
  (o caso já estava errado; o custo extra é só nos errados).
- **Transporte:** migrar o loop de tool calling para a Responses API com
  `previous_response_id` (raciocínio persistido entre passos), `verbosity`
  controlada e tool calls paralelas. NÃO adotar multi-agente com handoffs
  (consolidação é a tendência comprovada: Genie/Cortex reduziram passos).

### 3.3 Precisão e confiança (research de precisão)

- **Repair loop budget 1:** o veredito do validador volta como crítica
  estruturada ("o número X não deriva do tool result; o correto está no campo
  Y") para UMA regeneração; se reprovar de novo, cascata de tier; se ainda
  reprovar, resposta honesta de falha (nunca número suspeito).
- **Contrato de proveniência:** toda resposta numérica declara (em linguagem
  natural) fonte/critério/recorte , já parcialmente feito; o validador novo
  confere que a tool citada == tool executada.
- **V-claims (novo validador):** percentuais/variações recomputados; rankings
  e superlativos conferidos contra a ordenação real; unidade/escala; período
  citado == período consultado.
- **Consistência entre turnos:** cache (métrica, recorte normalizado) → número
  por conversa; responder a mesma pergunta com número diferente sem explicar
  o porquê (sync nova, recorte diferente) é reprovado.
- **"Não sei" acionável:** motivo concreto + alternativa mais próxima + o que
  destravaria (refina o Caminho 3a existente).
- **Flywheel:** toda falha de produção (validador ou feedback do usuário) gera
  caso golden automaticamente (fila de triagem em `feature_requests`).

## 4. Entrega em ondas (cada onda: TDD + E2E real + ship.py)

- **Onda M , Memória (primeiro, é a dor declarada):**
  M.1 persistir toolDigest por tool call (worker de digest síncrono no
      run-agent, barato, determinístico);
  M.2 janela por TURNOS (8-12) sem descartar assistant-com-toolCalls
      (consertar sanitizeHistoryPairs/take);
  M.3 focoAtual determinístico (extração dos argumentos/resultados);
  M.4 ConversationEntity + heurística de anáfora;
  M.5 resumoProgressivo async (BullMQ) + injeção L2;
  M.6 AgentUserMemory (aliases/preferências) , pode ficar p/ onda M2;
  M.7 FTS L5 sob demanda.
- **Onda O , Orquestração:** O.1 migração Responses API; O.2 classificador de
  tiers + cascata; O.3 planner-executor consolidado p/ T2; O.4 T3 com modelo
  forte.
- **Onda P , Precisão:** P.1 repair loop direcionado; P.2 contrato de
  proveniência + validador; P.3 V-claims; P.4 consistência entre turnos;
  P.5 flywheel golden.

## 5. Não-objetivos (desta spec)

- Multi-agente com handoffs/A2A (consolidar > fragmentar, evidência no research).
- Trocar o catálogo semântico por text-to-SQL livre (decisão canônica #3 fica).
- pgvector/grafo temporal de memória (FTS basta para L5 agora; research §pitfalls).
- Trocar de provedor LLM (OpenAI segue; A/B Anthropic continua bloqueado por crédito).

## 6. Riscos e mitigações

- **Custo:** tiers pagam modelo forte só em T2/T3 + cascata (casos já errados).
  Teto OpenAI atual US$8; monitorar custo/turno na telemetria existente.
- **Latência de T2/T3:** plano+síntese adicionam 1 chamada; aceitável para
  perguntas compostas (usuário prefere completo a rápido-e-errado). Medir.
- **Migração Responses API:** atrás de flag (`agent_settings`), rollback =
  flag off; manter o caminho atual até o golden FULL passar igual ou melhor.
- **Resumo progressivo com drift:** sempre re-resumir de mensagens originais
  (nunca resumo-de-resumo); cap de tokens; validado nos goldens de memória.
- **Compactação de contexto do dev:** PROGRESSO atualizado por onda (regra já vigente).
