# F6 , Custo / Latencia (1-2 centavos USD por consulta, rapido)

> Reconstrucao do Nex, Fase 6 (ultima). Fonte: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` secao 6 (Fase 6). Fases 1-5 em producao (PRs #58/#59/#60/#63/#64).
> **Spec v1** , passa por 2 reviews adversariais antes do plano.

## 1. Objetivo

Bater o alvo do dono , **1-2 centavos USD por consulta, com baixa latencia** , **sem perder a precisao** ja provada pela F5 (golden verde). F6 e **otimizacao + telemetria**: mede custo/latencia por requisicao, corta gasto evitavel (modelo certo no passo certo, cache, short-circuit) e **trava regressao de custo** (nenhuma mudanca pode encarecer a consulta sem aviso). O golden da F5 e a rede que garante que a otimizacao **nao baixa a qualidade**.

## 2. O que ja existe (reuso , verificar no codigo)

- `src/lib/agent/llm/get-active-config.ts` , config de modelo ativo (provider/modelo/credencial).
- `src/lib/agent/llm/usage-stats.ts` , (verificar) estatistica de uso/tokens.
- `src/lib/agent/llm/get-client.ts` , cliente LLM.
- `src/lib/agent/run-agent.ts` , o loop do agente (onde os passos/modelos sao chamados).
- `src/lib/agent/router/*` , F3: `pickDomains`, `pickTools`, `embedQuestion` (retrieval ja reduz tokens de prompt , nao manda catalogo inteiro).
- `McpAuditLog` , ja tem `durationMs` (latencia por tool call). **Verificar se ja loga tokens/custo**; se nao, F6 adiciona.
- `AgentSettings` , config (threshold/topK/etc.).
- **Golden F5** (`golden-nex.e2e.ts`) , rede de qualidade que valida que a otimizacao nao regrediu acerto.

## 3. Os 5 levers do dossie (Fase 6) , o que F6 entrega

| Lever | O que e | Reuso/risco |
|---|---|---|
| **Retrieval ja barateia** | tool retrieval (F3) nao manda o catalogo inteiro no prompt | ja existe; F6 so MEDE o ganho |
| **Cache de roteamento/entidade** | pergunta repetida nao re-roteia nem re-resolve entidade | cache por chave normalizada da pergunta; TTL; invalidar em sync |
| **Modelo certo no passo certo** | modelo menor p/ roteamento/classificacao de intencao; modelo forte so na redacao final (numeros vem de codigo) | `get-active-config` por papel; cuidado: nao baixar qualidade (golden valida) |
| **Short-circuit / limite de passos** | quando a metrica e direta (1 tool resolve), nao gastar passos extras; teto de passos do agente | `run-agent` , detectar caso de 1-tool; limite duro de passos |
| **Telemetria de custo/latencia** | custo (USD) + tokens + latencia por requisicao no `McpAuditLog` (ou tabela proxima), p/ regressao de custo | base do gate de regressao de custo (alvo 1-2c) |

## 4. Arquitetura (proposta v1 , a detalhar)

### 4.1 Telemetria de custo (a fundacao , sem ela nao ha como otimizar com seguranca)

- Cada turno do agente registra: `inputTokens`, `outputTokens`, `modelo`, `custoUsd` (derivado de uma tabela de precos por modelo), `latenciaMs`, `passos`, `cacheHits`. Local: estender `McpAuditLog` (ja tem `durationMs`/`params`) **ou** uma tabela/coluna nova , decidir na v2 (preferir estender o que existe; **migration so se inevitavel**, manual + `migrate deploy`).
- Funcao pura `estimarCustoUsd(modelo, inputTokens, outputTokens)` com tabela de precos versionada em codigo (sem chamada externa).

### 4.2 Modelo por papel (model tiering)

- Papeis: `roteamento` (pickDomains/intencao), `classificacao`, `redacao_final`. `get-active-config` passa a resolver modelo **por papel** (config em `AgentSettings`/codigo), default conservador.
- **Guard-rail:** trocar modelo de um papel **so com o golden F5 verde** (qualidade) E o scorecard de custo melhor/igual. O numero sempre vem de codigo, entao o modelo de redacao pode ser menor sem mexer no numero , o golden prova.

### 4.3 Cache (roteamento + entidade)

- Cache em-processo (LRU) por chave = pergunta normalizada (+ user.domains p/ RBAC). Guarda a decisao de roteamento e a resolucao de entidade. TTL curto; **invalidar quando o cache de dado sincroniza** (a resposta numerica nunca e cacheada , so a decisao de roteamento/entidade, que nao depende do dado).
- Risco: cachear algo que dependa de RBAC/contexto , a chave inclui `user.domains`.

### 4.4 Short-circuit / limite de passos

- Em `run-agent`: se o cerebro (F3) seleciona **1 tool de alta confianca** e a intencao e `pontual`, executar direto (sem rodada extra de "pensar"). Teto duro de passos (ex. N=4) com fallback honesto se estourar.

### 4.5 Gate de regressao de custo

- Um harness (estilo F5) roda um conjunto representativo de perguntas, soma `custoUsd`/`latenciaMs` por consulta e **falha se a media exceder o alvo** (1-2c) ou se **regredir** vs o snapshot anterior. Reusa o golden como conjunto de perguntas (qualidade + custo medidos juntos).

## 5. Decisoes canonicas (a fixar na v3, pos-reviews)

1. **Qualidade nunca regride por custo:** toda otimizacao roda o golden F5; se baixar acerto, reverte. Numero sempre de codigo.
2. **Telemetria primeiro:** sem medir custo/tokens nao se otimiza as cegas. A telemetria e a primeira onda.
3. **Migration evitada:** preferir estender `McpAuditLog`/campos Json; migration so se inevitavel (manual + `migrate deploy`, cautela , o banco tem drift).
4. **Cache so de decisao, nunca de numero:** roteamento/entidade podem ser cacheados; a resposta numerica nao (vem sempre do cache de dado fresco).
5. **Model tiering conservador:** default mantem o modelo atual; baixar so com golden verde + custo medido.

## 6. Fora de escopo (YAGNI)

- Re-arquitetar o agente; trocar provider; fine-tuning.
- Otimizar o worker/sync (e ingestao, nao consulta).
- UI de billing (a telemetria e dado; tela e outra onda se pedida).

## 7. Criterios de aceite (preliminar, refinar na v3)

- Telemetria: cada consulta loga tokens+custoUsd+latencia; `estimarCustoUsd` testada.
- Harness de custo roda sobre o golden e reporta custo/latencia media por consulta + compara com snapshot (regressao).
- Golden F5 continua **verde** apos as otimizacoes (qualidade preservada).
- Alvo 1-2c documentado e medido (se nao bater de primeira, reportar o gap e o caminho, nao mascarar).
- tsc raiz+mcp + jest verdes; migration evitada (ou manual justificada).

## 8. Riscos

- **Otimizar as cegas** -> telemetria primeiro (4.1).
- **Cache servir resposta velha/errada** -> cachear so decisao, nao numero; chave com RBAC; TTL + invalidacao em sync.
- **Modelo menor baixa qualidade** -> golden F5 e o gate; reverter se regredir.
- **Custo do proprio harness** (rodar o golden chama LLM) -> rodar na verificacao de onda, nao em loop; estimar.
- **Migration** -> evitar; se inevitavel, manual + `migrate deploy`, cautela com drift.
