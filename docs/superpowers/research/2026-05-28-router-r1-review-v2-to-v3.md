# Review adversarial v2 → v3 do SPEC R1 (Router de catalogo)

Segunda passada critica, mais profunda. Atacando o que v1 → v2 nao
endereçou, mais detalhes que sobreviveram desapercebidos.

## Achados CRITICOS

**C1. Open question D (cache de embedding da pergunta) deixada em aberto.**
Decidir agora. Recomendacao: cache LRU em memoria de processo com 200
entradas, chave = hash da pergunta normalizada (trim + lowercase + collapse
whitespace). Custo de complexidade: <30 linhas. Beneficio: usuario que
manda mesma pergunta no playground 2x nao paga embed duas vezes. Pequeno
mas vale.

**C2. Open question H (versionamento runtime) deixada em aberto.**
Decidir agora: **mudanca de description em `domain-vocabulary.ts` exige
rebuild do container app**. Razoes: (a) arquivo e' TS importado; (b)
embeddings sao caros para hot-reload; (c) cache em memoria do processo nao
e' invalidado fora de rebuild; (d) producao roda em container imutavel.
Documentar e nao oferecer alternativa.

**C3. Modelo de embedding usado nao mencionado.**
`src/lib/agent/rag/embed.ts` usa `text-embedding-3-small` da OpenAI (1536
dimensoes). Documentar em §4.3 ou nova subsecao. Importante porque:
- Multilingual razoavel mas nao otimo em pt-br.
- 1536 dimensoes => storage e' float[1536] por vetor de dominio (so 9
  vetores em memoria, nada).
- Latencia OpenAI tipicamente 50-150ms (acima dos 30-80ms estimados).
- Custo: $0.02 / 1M tokens (~$0.00001 por pergunta media).

Atualizar §13 com latencia realista e §11 com benchmark obrigatorio.

**C4. Race condition no log-decision.**
Sequencia atual: (1) cria row com `id`, (2) entrega catalogo ao LLM, (3)
LLM responde, (4) atualiza row com `toolsActuallyUsed`. Se (3) demora ou
falha:
- Row fica com `toolsActuallyUsed = []` para sempre.
- Dashboard que filtra `toolsActuallyUsed nao vazio` ignora corretamente.
- Mas KPI denominador precisa estar claro.

Adicionar §10.1 nota: KPI top-1 ignora rows com `toolsActuallyUsed = []`
E `createdAt < now() - 60s` (timeout heuristico). Rows recentes podem ainda
estar em flight.

**C5. Multi-instancia / replicacao read.**
Em producao (Portainer + Postgres principal), nao temos replica. OK. Mas
documentar que se um dia adicionarmos replica de leitura para o painel,
update pode nao estar visivel imediatamente. Por ora, nao e' problema.

**C6. Authentication do endpoint kill-switch nao especificada.**
§16.2 cita `Authorization: Bearer <super_admin_session>`. Mas a app usa
cookies de sessao NextAuth, nao Bearer tokens (ApiKey existe so para
endpoint publico /api/mcp). Corrigir: usa o middleware existente de
`/admin/*` que valida sessao + role.

## Achados ALTOS

**A1. `mode` enum incompleto.**
Inclui "shadow", "active", "calibracao_R-X". Faltam:
- `"test"`: jest test environment.
- `"e2e"`: testes E2E.
Documentar todos os valores possiveis.

**A2. Scores em fallback.**
Em fallback por embed failed, nao temos scores. Em fallback por
`msg_trivial`, tambem nao. Em fallback por `score_baixo`, temos scores
mas todos abaixo do threshold. Documentar §6.1: `scores` pode ser
`{}` (objeto vazio) em fallbacks de tipos 1 e 2.

**A3. Calibragem inicial nao tem owner claro.**
v2 menciona calibragem mas nao define quem faz e quando. Definir:
- E' uma tarefa no PLAN, fase de pre-merge.
- Executor: o proprio R1 (script novo
  `scripts/router/calibrate-against-batteries.ts`).
- Saida: relatorio em `docs/router-calibration-r1.md`.
- Criterio de promocao: top-1 >= 85% nas perguntas das rodadas R8-R23.

**A4. Limpeza de description em pergunta.**
Antes de embedar, normalizar a pergunta:
- trim
- lowercase
- collapse multiplos espacos
- remover quebras de linha (`\n`, `\r`)
- remover quebra-encoding de copy-paste (`​`)

Adicionar a regra 2.5 entre regra 2 e 3.

**A5. `forceIncludeOn` deve ser checado ANTES ou DEPOIS do top-K?**
v2 §8 regra 7 diz "depois". Mas se o regex casa fortemente (ex: CNPJ
explicito), faz sentido o dominio entrar mesmo com score baixo. Confirmar
ordem.

## Achados MEDIOS

**M1. Cache de embedding de dominio - hot reload.**
Vocabulary muda → hash muda → embed-domains reembeda. Em runtime, isso
acontece na **proxima** chamada de `pickDomains`. Documentar: durante
reembed (200ms-1s para 9 dominios), todas as chamadas pendentes esperam
ou usam vetores antigos? Decidir: usar antigos ate reembed terminar
(mais simples), invalida na proxima chamada apos reembed.

**M2. Logging de pickDurationMs.**
Adicionar p50/p95/p99 no painel para acompanhar performance ao longo do
tempo.

**M3. Histograma de scores.**
Detalhar buckets: [0.0-0.1], [0.1-0.2], ..., [0.9-1.0]. 10 buckets
fixos. Ideal: ver pico bimodal em 0.7+ (acertos confiantes) e em 0.2-
(rejeicoes confiantes).

**M4. Botao "Rodar contra bateria R-X" precisa contar.**
Executar todas as ~290 perguntas via embed seria 290 chamadas API. Custo
~$0.003 (baixo). Latencia ~10-30s. UI deve mostrar progresso.

## Achados BAIXOS (registrar)

**B1. routerVersion scheme.**
Adotar `"r1.<major>.<minor>.<patch>-<vocab_hash>"`. Major/minor/patch
controlados manualmente pelo dev no proprio arquivo, vocab_hash gerado.

**B2. Tamanho do bin AgentRouterDecision.**
Com 1000 turnos/dia * 90 dias = 90k rows. Cada row ~2KB. Total ~180MB.
Aceitavel.

**B3. RetencaoLong-term.**
TTL 90d entra na proxima onda (fora do R1). Documentar no PLAN como
nao-objetivo desta entrega.

## Conclusao

v2 tem **6 achados criticos** + **5 altos** + **4 medios**. Atacar todos
na v3. Em particular, fechar definitivamente as 2 open questions
restantes (D e H).

Saida: SPEC v3 no mesmo arquivo. Header passa a marcar
**"v3 (apos review adversarial #2, definitiva para PLAN)"**.
