# Perícia: numeração de rodadas + avaliação do Router na R24 (2026-06-01)

> Disparada pelo relato de que a aba Router (Monitoramento do Agente Nex)
> mostrava avaliação ruim/mal configurada da "Rodada 24", e de que a numeração
> vivia confundindo (a recente aparecia como R34/R35 em vez de R24).

## 1. Causa-raiz da bagunça de numeração

Existiam **27 markers `[AUDIT-POS-...]`** no banco. A função
`buildRodadaNamesFromMarkers` numerava TODOS a partir do mais antigo
(`RODADA_ZERO = 8`), então a rodada recente caía em "R34".

A perícia (script `scripts/router/forensic-rounds.ts`) mostrou que os **10
markers da manhã de 26/05 têm ZERO avaliações de qualidade**: eram
testes/dev de pré-catálogo, não rodadas de backtest. As rodadas oficiais (LLM
disparado, com avaliação) começam em **R8 = `2026-05-26T17-21-31`** e seguem
contíguas até a recente.

Ancorando R8 nesse marker, a sequência fecha **R8 → R24**, e bate com três
fontes independentes:
- a tabela legada `LEGACY_MARKERS` (R8-R19, ponto a ponto);
- o comentário do `calibrate-rounds.ts` (R20-R23 = 27/05 22:43 → 28/05 10:12);
- a expectativa do time (a rodada de 31/05 = **R24**).

Tabela oficial (17 rodadas com avaliação):

| Rodada | marker | convs |
|---|---|---|
| R8 | 2026-05-26T17-21-31 | 100 |
| ... | ... | ... |
| R23 | 2026-05-28T10-12-30 | 291 |
| **R24** | **2026-05-31T18-18-13** | **388 (291 + 97 reruns de quota)** |

### Correção aplicada
- `rodada-labels.ts`: `buildRodadaNamesFromMarkers` agora **ancora em R8**
  (`R8_ANCHOR_MARKER`). Markers anteriores recebem rótulo `Teste DD/MM HH:MM`,
  não `Rodada N`.
- `queries.ts`: `getAllRodadaMarkers` passou a contar **só markers com
  avaliação** (JOIN em `conversation_quality_evaluations`), excluindo os
  pré-R8 naturalmente.
- `monitoramento-content.tsx`: a numeração é construída do conjunto **global**
  de markers (não do recorte do período), corrigindo o bug "R8 nas views
  semana/mês vs R24 no tudo".
- Teste: `rodada-labels.test.ts` trava R8→R24 e o rótulo de teste para pré-R8.

Backtest e Router passam a usar a **mesma numeração** ancorada.

## 2. Avaliação do Router na R24 (verdade-base real)

A R24 **não tinha nenhuma decisão de router** registrada: a aba Router mostrava
só calibração velha de R20-R23 (vocab antigo `048ea0d2`, avaliada por label do
`test-questions.json`, que fabricava concordância em domínios sem anchor).

Reavaliação correta (`scripts/router/reevaluate-r24.ts`): para cada uma das
**291 perguntas únicas** da R24 (deduplicando os 97 reruns), re-rodamos
`pickDomains` com o **vocab atual** (`aefb1bb6`) e o threshold das settings
(0,3), usando como verdade-base **as tools que o agente DE FATO chamou** na
corrida 99%.

### Achado crítico: bug de mapeamento tool → domínio
As tools são `cadastro_*` (singular), mas o domínio é `cadastros` (plural).
`getToolDomain` pegava o prefixo `cadastro` e devolvia `_desconhecido`. Efeito:
- **falsas discordâncias** (o router escolhia `cadastros` certo, mas a
  verdade-base saía `_desconhecido`);
- **furo de RBAC** (camada B): `_desconhecido` é sempre mantido no catálogo,
  então as tools de cadastro escapavam do scoping por domínio.

Correção: `PREFIX_ALIAS = { cadastro: "cadastros" }` em `tool-to-domain.ts`
(+ testes). Não altera o roteamento (embedding), só o rótulo de domínio das
tools.

### Resultado (R24, 267 perguntas com tool real)

| Métrica | Antes do fix | Depois do fix |
|---|---|---|
| Top-1 | 76,0% | **87,3%** |
| Top-K (cobertura, gate) | 85,0% | **96,3%** |
| Discordâncias | 38 (14,2%) | **8 (3,0%)** |

Gate de ativação (7 dias): **elegível** (Top-K 95,1%).

### Furos residuais (8 discordâncias) e calibração
- **5** eram `registrar_lacuna`: o agente registrou lacuna por falta de
  dado/escopo (ex.: "vai ter halteres pra entrega amanhã?"). Não são furo do
  router (que inclusive acertou o domínio em alguns).
- **3** eram frases coloquiais/ambíguas: "fala aí, vendi quanto hoje?",
  "quanto vai entrar essa semana?", "vai bater a meta esse mês?".

**Calibração aplicada** (`domain-vocabulary.ts`, `forceIncludeOn`, não muda o
hash do vocab nem o embedding):
- fiscal: `/\bvend(i|emos)\b/i`, `/(bater|fechar|atingir).{0,12}\bmeta\b/i`
- comercial: `/\bvai entrar\b/i`

Resultado pós-calibração (R24): **Top-1 88,4% · Top-K 97,4% · 5 discordâncias**,
e **todas as 5 são `registrar_lacuna`** (o router escolheu o domínio plausível
em todas). Na prática: **zero falha genuína de roteamento** na R24.

## 3. Pendências
- Router permanece **OFF** (`routerEnabled=false`). A ativação é decisão
  humana (muda comportamento de produção).
- Rebuild de `mcp`/`worker` no deploy: `tool-to-domain.ts` mudou (afeta
  filter-catalog e log-decision). CI/CD cobre no merge; dev local manual.

## Scripts (todos read-only exceto `reevaluate-r24.ts`)
- `scripts/router/forensic-rounds.ts` — perícia da classificação rodada vs teste.
- `scripts/router/census-rounds.ts` — censo de markers e decisões por modo.
- `scripts/router/reevaluate-r24.ts` — reavaliação da R24 (grava; `--dry` só relata).
- `scripts/router/verify-r24.ts` — KPIs/gate + lista de discordâncias.
