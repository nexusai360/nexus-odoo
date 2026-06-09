# RADAR — pendências conhecidas a resolver

> Itens identificados que **não bloqueiam** a entrega atual, mas precisam ser
> resolvidos antes de marcos seguintes. Revisar a cada nova onda/fase.

---

## R-ajustes — Histórico de ajustes só mostra transição no mais recente (opcional)

**Aberto em:** 2026-06-05 (B2/Backtest, redesign do drill-down).

**Contexto:** o drill-down do Backtest tem um **Histórico de ajustes** (seção
"Ajuste manual"). Hoje o banco guarda, por ajuste, apenas **data + justificativa**
(append `[AJUSTE HUMANO <iso>] <reason>` em `razoes`) e o **status humano atual**
(`humanStatus`). Não há registro do **status ANTES** de cada ajuste. Por isso a
linha mostra a transição "antigo → novo" (tag cinza riscada → tag colorida) só no
ajuste **mais recente** (derivada de `status` do juiz → `humanStatus` efetivo); os
ajustes anteriores mostram só data + justificativa.

**Pedido:** para ter a transição em **todos** os ajustes do histórico, passar a
gravar o status-antes em cada ajuste. Mudança **pequena**: em `adjustEvaluation`
(`src/lib/actions/agent-quality.ts`) gravar o `previousStatus` por ajuste (coluna
nova ou um JSON `adjustment_history[]` em `conversation_quality_evaluations`), e o
drill-down (`evaluation-drilldown.tsx`, `parseRazoes`/Histórico) renderiza a
transição por linha. **Opcional / cosmético.**

---

## R-tempo — KPI de tempo médio das respostas no Backtest (a discutir)

**Aberto em:** 2026-06-04 (feedback do usuário no B2).

**Contexto:** o tempo de geração de cada resposta JÁ é armazenado em
`LlmUsage.durationMs` (por iteração do loop de tool calling, ligado a
`conversation_id`). A bubble viva mostra o wall-clock do turno
(`doneAt − startedAt`) no header "Raciocínio · N tools · X.Xs"; o monitoramento
Bubble (coluna Conversa) passou a mostrar o mesmo, derivado de
`createdAt(assistant final) − createdAt(user)` (proxy fiel do wall-clock).

**Pedido do usuário:** no **Backtest** (aba Monitoramento), o drill-down de cada
linha de avaliação não mostrava o tempo, e não há KPI/gráfico de tempo médio.
1. ~~tempo por avaliação no drill-down da `evaluations-table`~~ **FEITO**
   (commit `1b83b88`: `getEvaluationDetail.durationMs` + `Clock` no cabeçalho);
2. **PENDENTE:** um KPI/gráfico de tempo médio (e talvez p50/p95) no topo do Backtest.

**A decidir:** fonte exata (somar `LlmUsage.durationMs` por turno vs proxy por
`createdAt`), atribuição LlmUsage→mensagem (hoje LlmUsage só tem
`conversation_id`, não `message_id`), e forma de visualização (KPI vs série
temporal). Discutir antes de implementar.

---

## ~~R1 — Fonte de "contas a receber/pagar" pode ser a tabela errada~~ RESOLVIDO

**Aberto desde:** 2026-05-18 (teste end-to-end da F4 onda 1).
**Resolvido em:** 2026-05-18 — commit `fix(f4): re-source fato_financeiro_titulo para finan.lancamento`.

### Diagnóstico confirmado

`fato_financeiro_titulo` era derivado de `raw_finan_pagamento_divida` (eventos
de pagamento — ~21 registros abertos, `vr_saldo` ≈ 0 nos abertos). A fonte
correta é **`raw_finan_lancamento`** (`finan.lancamento` — carteira de títulos):
- `tipo='a_receber' situacao_divida_simples='aberto'`: 120 títulos, R$ 1.164.266,36
- `tipo='a_pagar'  situacao_divida_simples='aberto'`:  18 títulos, R$    95.694,95
- Para título aberto: `vr_saldo == vr_documento == vr_total`.

### Correção aplicada

- **Builder** (`src/worker/fatos/fato-financeiro-titulo.ts`): fonte trocada para
  `rawFinanLancamento`, filtro `tipo IN ('a_receber','a_pagar')`, tipo mapeado
  direto (não derivado de `sinal`), `vrSaldo` agora é o valor correto.
- **Queries** (`src/lib/reports/queries/financeiro.ts`): `vrSaldo` re-adicionado
  ao output; `totalAReceber`/`totalAPagar`/`totalVencido` usam `vrSaldo`.
- **Handlers MCP** (3 tools de título): `tituloSchema` inclui `vrSaldo`; shape
  serializa `vrSaldo`.
- **Testes** (builder + queries + handlers): fixtures atualizados para o formato
  real de `finan.lancamento`; novos casos cobrem filtro de caixa descartado.

---

## R2 — Verificação por dado real, não só review de código

**Aberto desde:** 2026-05-18.

Os 2 bugs de financeiro da F4 onda 1 (critério "em aberto" errado; valor
somando `vr_saldo` ~zero) **passaram por 12 reviews adversariais** e só foram
pegos rodando o MCP contra o cache real. Lição: review de código não cobre
premissas sobre o dado.

### Ação

Toda onda de domínio novo (comercial, fiscal, contábil, produção) deve incluir,
na etapa de verificação, um **teste end-to-end contra o cache real** — popular
os fatos, subir o servidor, exercer as tools e conferir os números — não só
`tsc`/`eslint`/`jest`/code-review.

---

## R3 — Contábil e Produção quase não têm dado no cache

**Aberto desde:** 2026-05-18 (levantamento dos domínios restantes da F4).

Levantamento das tabelas `raw` por domínio que falta cobrir no MCP:

| Domínio | Tabelas `raw` | Volume |
|---|---|---|
| **Comercial** (pedidos) | `pedido_documento` (71), `pedido_parcela` (1.925), `pedido_etapa` (203), `pedido_documento_historico` (8.054), `pedido_operacao` (36) | substancial — domínio real |
| **Fiscal** (SPED) | `sped_documento` (3.743 notas), `sped_documento_item` (211.385), `sped_documento_pagamento` (36.141), `sped_participante` (6.516)… (40 tabelas) | substancial — domínio real |
| **Contábil** | `contabil_conta` (934), `contabil_conta_referencial` (2.204) | **só o plano de contas** — não há tabela de lançamentos contábeis no cache |
| **Produção** | `producao_processo` (1) | **1 único registro** — praticamente inexistente |

### Implicação — confirmado pelo censo F0 (não é gap de sync)

Verifiquei o censo completo do Odoo (`discovery/output/censo.md`): o dado
contábil/produção **não existe na instância Odoo**, não é só não-sincronizado.

- **Contábil:** `contabil.lancamento` (Lançamento Contábil) = **0 registros**;
  `contabil.demonstracao`, `contabil.encerramento`, `contabil.operacao` = 0.
  Só o **plano de contas** tem dado (`contabil.conta` 934, `…referencial`
  2.204, `…arvore` 4.955). A Matrix **não opera o módulo de contabilidade** no
  Odoo.
- **Produção:** `producao.processo` = 1; todos os demais modelos `producao.*`
  = 0. A empresa **movimenta/entrega** equipamento de academia — não fabrica.

### Decisão de escopo

"MCP 100% de todos os domínios" se traduz, na realidade do dado, em:
- **Comercial** (pedidos) e **Fiscal** (notas SPED) — domínios reais, dado rico
  → tools semânticas completas.
- **Contábil** — apenas tool(s) de *estrutura do plano de contas* (referência),
  pois não há movimento. Ou omitir até o cliente operar contabilidade no Odoo.
- **Produção** — sem dado; nada a expor. Omitir.
- O **Caminho 3c (modo BI)** cobre a cauda longa: qualquer pergunta fora das
  tools, inclusive sobre o que houver de contábil/produção, cai no SQL
  controlado.

Pendente: aval do usuário sobre cobrir contábil (plano de contas) e omitir
produção, ou aguardar dado.

---

## ~~R4 — GRANTs SQL fora do `prisma migrate`~~ RESOLVIDO

**Aberto desde:** 2026-05-18 (code review final F4 completo — IMP-2).
**Resolvido em:** 2026-05-18.

### Solução aplicada

Os 2 scripts avulsos foram **consolidados** num único script idempotente
`prisma/sql/provision-mcp.sql` e o deploy virou **um comando**:

```bash
npm run db:deploy   # = prisma migrate deploy && npm run db:provision
```

- **Idempotente** — seguro rodar a cada deploy.
- **A prova de esquecimento** — o `GRANT SELECT` nos fatos e dinamico (loop
  sobre `fato_*`); um fato novo e coberto automaticamente, sem editar o script.
- Senhas via variavel de ambiente (`MCP_DB_PASSWORD`/`MCP_BI_DB_PASSWORD`),
  nunca no arquivo.

Runbook: `docs/runbooks/deploy-mcp-db.md`. O deploy assistido [12] usa
`npm run db:deploy` como passo de banco.

---

## R5 — Achados BAIXO do review adversarial F5 (2026-05-19)

**Aberto desde:** 2026-05-19 (reviews adversariais das ondas 1-7).

### R5-A — `logAudit` sem `await` em `user-whatsapp.ts` (review 1-2-7, BAIXO-1)
`addWhatsappNumber`/`removeWhatsappNumber` chamam `logAudit({...})` sem `await`.
Em Server Action serverless, a promise pode não completar → risco de auditoria perdida.
**Ação:** adicionar `await logAudit(...)` nas duas actions.

### R5-B — `deleteCredential` sem `findUnique` antes do delete (review 1-2-7, BAIXO-2)
`prisma.llmCredential.delete` lança erro `P2025` cru quando `id` não existir.
**Ação:** capturar `P2025` e retornar erro de domínio claro.

### R5-C — `ChatUsage` agregado perde `costKnown` (review 1-2-7, BAIXO-3)
`totalUsage.costUsd` soma 0 para iterações sem pricing — total pode ser subestimado
sem sinalização. A tela de consumo lê de `LlmUsage` (correto), mas o retorno de
`runAgent` é impreciso para quem o consumir diretamente.
**Ação:** adicionar `costKnown`/`costPartial` ao `ChatUsage` agregado.

### R5-D — Rota SSE sem heartbeat (review 3-5, BAIXO-1)
Loop de tool calling longo pode passar 30-60s sem byte SSE → proxies podem fechar.
**Ação:** adicionar comentário SSE de keep-alive (`: ping\n\n`) periódico no `route.ts`.

### R5-E — `ApiKey.createdById` sem FK para `User` (review 4-6, BAIXO-3)
`createdById` é `String?` solto sem `@relation`. Verificar `revokedAt` ao consumir
chaves na F6.
**Ação:** adicionar `@relation` no schema na F6 antes de consumir API keys.

### R5-F — Idempotência do inbound: `processedCreate` pode duplicar em race extremo (review 4-6, M4 — parcialmente corrigido)
A ordem foi corrigida (enfileira antes de gravar), mas em race extremo de dois
requests simultâneos do mesmo `messageId` pode processar 2×. O dedup no job
mitiga o impacto, mas é tolerado conscientemente.

### R5-G — Streaming do Anthropic com tools: stop_reason é ignorado (review 1-2-7, ALTO-2 — mitigado)
O streaming foi habilitado mesmo com tools. O `#parseStream` acumula tokens e
tool_use blocks. No entanto, tokens emitidos durante um turno com tool_use também
chegam ao `onToken` callback — o `ChatPanel` os exibirá na bolha de streaming e
depois sobrescreve com o `message` do evento `done`. Comportamento visual pode
causar piscar no chat em turnos intermediários. Tolerado para a fase atual;
resolver refinando o streaming para só emitir tokens quando `stop_reason !== tool_use`.

### R6 — Build quebra no prerender de `/_not-found` e `/_global-error` (PRÉ-EXISTENTE, ALTO)
`next build` falha no prerender das páginas internas do Next (`_not-found`,
`_global-error`) com `TypeError: Cannot read properties of null (reading 'useContext')`.
**Confirmado pré-existente:** reproduzido em `git stash` total (código 100% HEAD,
sem nenhuma mudança do rework F5-UI v2) — o build da branch `feat/integracao-whatsapp`
já estava quebrado. O bug é mascarado por um segundo: `/integracoes/bi` quebra
antes no prerender estático (corrigido com `export const dynamic = "force-dynamic"`),
e só então `_global-error`/`_not-found` aparecem.
**Causa provável:** o root `app/layout.tsx` usa `cookies()` (`getResolvedThemeFromCookie`),
o que conflita com o prerender estático das páginas de erro internas no Next 16
Turbopack. `tsc`, `eslint` e `jest` passam — só o `next build` quebra.
**Ação:** investigação dedicada — tornar o root layout compatível com prerender
estático das páginas de erro (ex.: mover a leitura de cookie para um boundary
dinâmico, ou adicionar `export const dynamic` ao `not-found.tsx`/`global-error.tsx`
próprios). Fora do escopo do rework de UI da F5.

---

## R7 — `eslint .` acusa `no-explicit-any` em test files do MCP (PRÉ-EXISTENTE, BAIXO)

**Aberto desde:** 2026-05-21 (verificação da F4 Onda 2 rodada 3 de correções).

`npm run lint` (`eslint .`) reporta 83 erros `@typescript-eslint/no-explicit-any`,
todos em arquivos de **teste** do servidor MCP (`mcp/__tests__/e2e/*`,
`mcp/auth/__tests__/*`, `mcp/middleware/idempotency.ts`, `migrate-scopes.ts`) e
em `src/lib/actions/mcp-api-keys.test.ts` / `src/worker/odoo/__tests__/`. Foram
introduzidos pela F4 Onda 2 (Bloco P, commit `736cd0d` e arredores), não pela
rodada 3 de correções de UI — nenhum arquivo tocado na r3 tem erro de lint.

**Implicação:** não bloqueia (`tsc`/`jest`/`build` verdes; produção não usa
`any` de teste), mas deixa `npm run lint` vermelho no repo inteiro.

**Ação:** numa varredura dedicada, tipar os mocks dos testes do MCP ou aplicar
`eslint-disable` justificado por bloco. Fora do escopo da r3 (correções de UI
do painel Servidor MCP).

---

## R8 — Dois modelos da F2 não sincronizam (achado da bateria L2, MÉDIO)

**Aberto desde:** 2026-05-22 (bateria L2 de validação de leitura).

A conferência de fidelidade da L2 (count `raw_*` vs `search_count` do Odoo)
flagrou dois modelos do catálogo F2 com `sync_state.last_status = 'erro'`:

- **`pedido.documento.historico.tempo`** (raw 0, Odoo 8.658). Erro do Odoo:
  `coluna pedido_documento_historico_tempo.id não existe`. É um modelo Odoo
  sem coluna `id` (view/agregado); o sync, que faz `search_read` selecionando
  `id`, não consegue lê-lo. **É não-sincronizável pelo mecanismo atual.**
  Ação: removê-lo do `MODEL_CATALOG` (e ajustar `model-catalog.test.ts`), ou
  dar ao sync um caminho para modelos sem `id`.
- **`sped.produto.lote.serie`** (raw 5.000, Odoo 7.534). `last_error` vazio
  após 3 tentativas — provável timeout ou erro não serializado numa página
  específica. O raw tem 5.000 de um sync parcial anterior. Ação: re-rodar o
  sync só desse modelo com log verboso para capturar o erro real.

**Implicação:** nenhuma tool da F4 depende desses dois modelos — as 55/56
conferências de tool da L2 passaram. É dívida de robustez do sync da F2, não
um gap da F4 leitura. Cada ciclo de sync gasta 3 tentativas falhas em cada um.

**Ação:** sessão de debug dedicada ao sync da F2. Fora do escopo da F4 L2.

### R8-B — Gap pequeno de backfill em 4 modelos (BAIXO)

A mesma conferência de fidelidade da L2 achou 4 modelos com `last_status` ok
mas `raw` ligeiramente abaixo do Odoo, persistente entre corridas:
`estoque.saldo` (−92), `finan.fluxo.caixa` (−147), `finan.banco.extrato` (−20),
`finan.banco.saldo` (−4) — todos ~1%. São modelos `incremental`: o ciclo
incremental só puxa por `write_date` e nunca remove/repuxa linhas antigas
perdidas no backfill. O ciclo de **reconcile** (24h) fecharia o gap; o
`f4l-ingest.ts` roda só snapshot+incremental, sem reconcile. Não é bug de
tool. Ação: rodar um reconcile, ou aceitar o gap de ~1% como ruído de janela.

---

## ~~R9 — Router de catálogo (R1): calibração e meta de ativação~~ RESOLVIDO

**Resolvido em 2026-05-28 23:10:** modelo large@0.30 + tuning de vocabulário
(forceIncludeOn) levaram a **cobertura Top-K a 98-99%** (meta 95% batida);
gate de ativação agora incide sobre Top-K (allInTopKPct), não Top-1.
Telemetria de embedding no menu de consumo + precisão de custo corrigida.
Multidomínio validado. Histórico abaixo.

---

### R9 (original) — threshold default 0.55 mal calibrado

**Aberto desde:** 2026-05-28 (calibragem offline da Wave G, executada de
verdade pela primeira vez contra as 291 perguntas R8-R23).

A calibragem (`scripts/router/calibrate-against-batteries.ts`,
`runCalibration`) revelou que o **threshold default 0.55** faz o router cair em
**fallback em 84% das perguntas** (245/291) e acertar só **16,2% de Top-1**. Não
é bug de scoring: a distribuição de cosseno do `text-embedding-3` entre pergunta
e descrição de domínio fica majoritariamente abaixo de 0.55. Sweep completo
(topK=3, dataset 291, 216 mapeáveis):

| threshold | Top-1 | Top-K | Fallbacks |
|---|---:|---:|---:|
| 0.35 | **63,9%** | **75,9%** | 52 |
| 0.40 | 59,3% | 67,6% | 86 |
| 0.45 | 42,1% | 48,1% | 147 |
| 0.50 | 25,5% | 27,3% | 209 |
| 0.55 (default atual) | 16,2% | 16,7% | 245 |

### Atualização 2026-05-28 22:35 (threshold + modelo resolvidos; gap restante)

Duas correções aplicadas (commits `8501e6e`, `ebdd066`):
1. **Threshold default 0.55 -> 0.30** (schema + run-agent + linha `global`).
2. **Modelo small -> large** (`text-embedding-3-large`/3072) só no router (o
   `embed()` default segue small/1536 porque o RAG da F5 tem pgvector(1536)).
   A/B comprovou o ganho:

| modelo @ threshold | Top-1 | Top-K | Fallbacks |
|---|---:|---:|---:|
| small @ 0.35 | 63,9% | 75,9% | 52 |
| large @ 0.20 | 78,2% | 93,5% | 9 |
| **large @ 0.30 (produção)** | **77,3%** | **92,1%** | 15 |

Meta de ativação também elevada de 85% para **95%** por decisão do usuário
(`constants.ts ROUTER_PROMOTION_MIN_TOP1`).

**Gap restante para fechar o R9:** Top-1 plateou em ~78% com large (teto do
vocabulário atual, não do threshold). Para chegar a 95% de Top-1 é preciso
enriquecer `domain-vocabulary.ts`. **Questão de metrica em aberto (decisão do
usuário):** o router entrega top-K domínios ao LLM, então o Top-K (~92%, perto
de 95%) é o que de fato determina se o LLM recebe a ferramenta certa; o Top-1
é mais rígido do que o necessário. Definir se o gate de 95% incide sobre Top-1
(exige tuning pesado de vocabulário, talvez inalcançável) ou Top-K (quase lá).

**Implicação:** nenhuma de produção, **o router segue em shadow** e o gate
bloqueia a ativação enquanto não bater a meta.

---

## F3 R1 , chosenToolRank inflado pelo piso (pre-condicao para ativar retrieval)

**Quando:** 2026-06-07 (code review F3).
**Onde:** `src/lib/agent/run-agent.ts` (chosenToolRank via rankOf sobre retrievalOfferedTools) + `pick-tools.ts`.

`retrievalOfferedTools` inclui o nucleo minimo inteiro (dominios picked +
transversais + _desconhecido), que costuma ser a maior parte do catalogo. Logo
`chosenToolRank != null` quase sempre, e o gate de go-live "% no top-K >= 98%"
(spec 4.5) pode passar trivialmente sem provar que o top-K (a parte que enxuga)
acerta. Os dados crus para uma metrica melhor JA estao persistidos em
`AgentRouterDecision.retrievalScores` (cosseno por tool) + `retrievalOfferedTools`.

**Acao antes de ligar `routerToolRetrieval=active`:** computar o gate sobre o
rank restrito as candidatas top-K (excluindo floorAdded) ou rankear por
retrievalScores; nao confiar no chosenToolRank cru. Implicacao de producao:
nenhuma (retrieval segue em shadow; default nao corta catalogo).

## F3 R2 , V6 (total x linhas) e shadow-only ate o envelope canonico (F4)

**Quando:** 2026-06-07. **Onde:** `src/lib/agent/validation/auto-validator.ts` validateV6.

V6 ja pula listas truncadas (`_amostraReduzida`/`_listaTruncada`) para nao dar
falso positivo. Mas a verificacao plena de coerencia (totais, datas no periodo)
depende do envelope canonico unico, que e da F4. Manter V6/V7 em shadow ate la;
so promover a active (Falta Honesta direta) quando o envelope padronizar
total/linhas/periodo. Implicacao de producao: nenhuma (V6/V7 so logam).

---

## F6 , Pendências pós-merge (telemetria entregue; ativação/medição-fiel no full-stack)

**Quando:** 2026-06-08. **Status:** F6 MERGED (PR #65). Produção **inalterada**
(`routerEnabled=false`, `routerToolRetrieval=shadow`; as novas chamadas `logUsage`
só completam a telemetria de custo). Nada bloqueia; são passos de medição/ativação
que dependem do ambiente full-stack e de decisão do usuário.

### F6-A , Custo-fiel + Gate C precisam do ambiente full-stack
`runAgent` E2E via `tsx` no host **não carrega tools**: o container MCP (`:3100`)
fecha a sessão streamable-HTTP autenticada vinda do host (`other side closed`;
reproduzível com `curl`+token = problema de infra, fora do escopo F6). Logo
`cost-regression.e2e` sai `faithful=false` e `golden-under-active.e2e` sai
`INCONCLUSIVO` (exit 2) , **nunca mascaram**. **Ação:** rodar ambos no ambiente
full-stack (app/docker, onde a sessão MCP funciona) e capturar o baseline
`src/lib/agent/evals/golden/cost-scorecard.json`. Gates A (recall@K=100%) + B
(golden-nex VERDE) já cobrem o critério de promoção; Gate C é confirmação E2E.

### ~~F6-B , Promover `routerToolRetrieval=active`~~ ATIVADO 2026-06-08
`routerEnabled=true` + `routerToolRetrieval=active` aplicados em `agent_settings`,
sob gate triplo verde: recall@K=100% + golden-nex VERDE + golden-under-active com
critério **no-regressão** (active nunca perde tool que o catálogo cheio usaria), 10/10
pares. Reversível: `UPDATE agent_settings SET router_tool_retrieval='shadow'`.
Gotcha de acesso MCP em dev resolvido (sessão do host falhava por `MCP_DB_PASSWORD`
vazio no container , recriar o `mcp` da raiz principal com `.env`): ver
`docs/RUNBOOK-retrieval-ativacao.md`. Opcional: medir o ganho real de custo
(cost-scorecard faithful shadow×active) no full-stack; coordenar com `feat/router-ativacao-r2`.

---

## R10 , dim_empresa_grupo com odooId DESLOCADO vs empresaId das notas (MÉDIO-ALTO)

**Quando:** 2026-06-09 (perícia a pedido do usuário). **Onde:** `dim_empresa_grupo`
(builder no worker) vs `fato_nota_fiscal.empresaId`.

**Achado:** o `odooId` do `dim_empresa_grupo` NÃO casa com o `empresaId` gravado nas
notas. Confronto fato.empresaNome (nome na própria nota) × dim.nome: só `id=1` bate;
de `id>=4` quase todas DIVERGEM (a dim aponta para a empresa errada, deslocada).
Ex.: nota `empresaId=4` = "Jds Comércio - Matriz 18.282.961/0001-00", mas dim
`odooId=4` = "Jht DF Comércio 10.557.556/0001-37". E `empresaId=2` e `3` (Jht DF
Matriz e Filial SE, ativos, com notas até hoje) NEM EXISTEM no `res.company`
sincronizado (RawResCompany tem 1,4,5,...,21,27 , sem 2,3). dim_empresa_grupo
tem 18 cadastros; o fato tem 15 empresaIds distintos , id-spaces diferentes.

**Impacto:** qualquer resolução de nome/UF/tipo via `fato.empresaId → dim.odooId`
rotula a empresa ERRADA (os VALORES por id estão certos; o NOME vinha trocado).
Era a causa da "empresa duplicada" que o usuário viu (uma linha era a empresa real
sem dim, outra era outra empresa mal-rotulada com o mesmo nome).

**Mitigação aplicada (2026-06-09):** `faturamentoPorEmpresa` passou a usar o
`empresaNome` DENORMALIZADO da nota (autoritativo), sem a dim. Corrige o rótulo
imediatamente.

**Pendência (worker, fazer direito):** reconstruir `dim_empresa_grupo` no id-space
correto (o `empresaId` das notas parece ser company_id de SPED/contábil, não
`res.company.id`; investigar RawSpedEmpresa) e cobrir os ids 2/3 ausentes. Enquanto
não fizer, NENHUM resolvedor deve confiar em `dim.odooId == fato.empresaId`.
Além disso há cadastro malformado/duplicado na própria dim: `odooId=21`
("Jht SP Comércio - Filial MG 34.161.829/0005-11 34.161.829/00", CNPJ repetido)
duplica o `odooId=12`.

### R10 , atualização 2026-06-09 (perícia completa: origem + impacto + fix recomendado)

**Origem exata:** `dim_empresa_grupo` é populada por **seed ESTÁTICO** na migration
`prisma/migrations/20260528020000_dim_empresa_grupo/migration.sql` (`INSERT ... VALUES`),
com `odoo_id` = ids do **res.company** (1,4,5,6,...). Mas o `empresaId` gravado em
`fato_nota_fiscal` é de OUTRO id-space (denso: 1,2,3,4,...; ex.: Jht DF Matriz =
empresaId **2** na nota, mas res.company **4**). Os dois nunca casam de id 4 em diante.

**Impacto (3 consumidores):**
1. `faturamento_por_empresa` (nome) , **JÁ CORRIGIDO** (usa `fato.empresaNome`).
2. `resolverEmpresa` (`src/lib/metrics/_shared/empresa.ts`) , resolve ref textual via
   `dimEmpresaGrupo` e devolve `odooId` (id-space da dim) que depois filtra
   `fato.empresaId`. **BUG: "faturamento da empresa X" pode filtrar a empresa errada**
   (número errado) ou não achar. Ainda NÃO corrigido.
3. `filiais-listar` (`mcp/tools/cadastros/filiais-listar.ts`) , lista direto da dim
   (nomes reais, mas ids desalinhados do fato). Baixo impacto, mas inconsistente.

**Fix recomendado (fazer numa sessão fresca, com verificação):** parar de usar
`dim_empresa_grupo` como fonte e derivar empresa do **fato** (single source of truth):
`SELECT DISTINCT empresaId, empresaNome FROM fato_nota_fiscal`, parseando CNPJ/tipo/UF
do nome ("... - {Matriz|Filial} {UF} {CNPJ}"). Aplicar em `resolverEmpresa` e
`filiais-listar` (como já foi feito em `faturamento_por_empresa`). Depois, a dim pode
ser descontinuada (ou reconstruída no id-space do fato via worker). Requer rebuild do
mcp + E2E (resolver "empresa X" → empresaId certo; filtrar faturamento por empresa → número certo).
