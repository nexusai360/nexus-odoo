# Review adversarial v1 → v2 do PLAN R1

Auditoria critica do PLAN v1 (commit a05083f). Cada achado vira mudanca
obrigatoria na v2.

## Achados CRITICOS (bloqueiam v2)

**C1. Tarefas D4 e F1 lumpam multiplas unidades em uma so.**
v1 §Wave D D4 diz "6 componentes UI em 4h", mas isso e' um epico, nao
uma task. Quebrar:
- D4a RouterKpiCards.tsx (30min)
- D4b RouterHistogram.tsx (45min)
- D4c RouterLatencyChart.tsx (45min)
- D4d RouterDiscordanciasTable.tsx (1h)
- D4e RouterControls.tsx + dialog (1h)
- D4f RouterCalibrationButton.tsx (30min)

§Wave F F1 e' mais grave: "completar ate 100% dos cenarios listados"
sem decompor. Quebrar em uma sub-task por arquivo de teste com
contagem explicita.

**C2. `run-agent.ts` e' arquivo compartilhado de alto conflito.**
v1 nao declara linhas exatas a adicionar. Multi-agente vai pra
guerra. v2 deve especificar:
- linha de import (top do arquivo)
- bloco de chamada de router (antes do mcpToolsToProviderTools)
- bloco de update apos loop de tool execution
- TOTAL esperado: ~40 linhas adicionadas, zero linha removida

**C3. PR #30 ja' foi mergeado a main.**
v1 G6 deixa em aberto "contra main ou stack com PR #30". Decidir:
contra main, com rebase da branch feat/router-catalogo-r1 em cima de
main atual antes de abrir PR.

**C4. Falta tarefa explicita de rebase em main.**
A branch feat/router-catalogo-r1 foi criada de feat/agente-nex-95pct-ronda1
ANTES do PR #30 mergear. Agora main tem novo conteudo. Antes da Wave G
(verificacao), rebasear em main. v2 adiciona G0 Rebase.

**C5. lru-cache decision (P3 open) ainda em aberto.**
Decidir agora: **inline implementation** (~25 linhas). Razoes: evita
adicionar dependencia para algo trivial; nao precisa de features
avancadas (TTL, async eviction etc.). Documentar em B2.

**C6. PLAN nao declara dependencia entre tarefas.**
Algumas tarefas tem deps escondidas. Exemplo: A6 (testes Wave A)
depende de A1-A5 prontos. B6 (testes Wave B) depende de B1-B5. v2
adiciona coluna "Depende de" em cada task.

## Achados ALTOS

**A1. Migration filename precisa de convencao do projeto.**
v1 usa `2026XXXXXXXXXX_router_catalogo`. Confirmar com migrations
recentes (ex: `20260525210000_agente_nex_inteligencia`,
`20260528020000_dim_empresa_grupo`). v2 fixa o timestamp YYYYMMDDhhmmss.

**A2. Race condition em embed-domains lazy load.**
Se 2 turnos chegam simultaneamente em cold start (cache vazio), ambos
disparam embedTexts. Solucao: usar promise sharing
(`pendingEmbedPromise: Promise<...> | null`). v2 documenta.

**A3. Embed-question LRU tem race similar.**
Mesma pergunta concorrente. Aceitavel (duas calls ao OpenAI custam
~$0.000002, despresivel). v2 documenta como decisao consciente.

**A4. Componentes UI tem deps com queries.**
D4* dependem de D2 (server actions de query). v2 declara.

**A5. Histograma PostgreSQL precisa SQL exato.**
P5 open. PostgreSQL tem `width_bucket(value, low, high, count)`.
Query exemplo:
```sql
SELECT width_bucket((scores->>'topo_score')::float, 0, 1, 10) AS bucket,
       count(*) AS qty
FROM agent_router_decision
WHERE mode IN ('shadow', 'active') AND created_at > now() - interval '7 days'
GROUP BY bucket ORDER BY bucket;
```
Problema: `scores` e' JSON, nao temos `topo_score` separado. Solucao:
adicionar coluna `topScore Float?` em AgentRouterDecision (denormalizado,
computado em log-decision.create). v2 atualiza §6.1 do SPEC e A1
da Wave A.

**Atenção:** isso e' uma mudanca de SPEC. v2 do PLAN deve sinalizar e
referenciar uma errata SPEC v3 → v3.1 OU resolver com query
do JSON via `->>'topo_score'` que tambem funciona em width_bucket.
Decisao mais simples: usar JSON. Documentar query exato.

**A6. F1 cenarios faltantes precisam lista.**
v2 lista os cenarios em §11.2 da SPEC v3 ainda nao cobertos por
testes de Waves anteriores. Atualmente F1 e' caixa preta.

**A7. G3 bateria R-X disparo nao especificado.**
P6 open. Investigar: scripts/quality-audit/ tem algum
disparador? v2 deve definir comando exato.

## Achados MEDIOS

**M1. STATUS.md update.**
PLAN nao prevee atualizar STATUS.md ao fim de cada Wave (para
retomada entre sessoes). v2 adiciona STATUS update no fim de cada Wave.

**M2. .env.example deve listar ROUTER_FORCE_DISABLE.**
v2 adiciona em E3.

**M3. Defaults de AppSetting nas linhas existentes.**
Migration aditiva precisa garantir que o registro unico de AppSetting
(`id = 1`) tenha os 4 campos novos populados. Prisma defaults cobrem
INSERT de novas rows. Para a existente: UPDATE no SQL da migration:
```sql
UPDATE app_settings SET
  router_enabled = false,
  router_threshold = 0.55,
  router_top_k = 3,
  router_retry_expand_below = 0.70
WHERE id = 1;
```
v2 explicita em A1.

**M4. Tarefa de update do CLAUDE.md.**
Decisoes canonicas do projeto podem precisar nova entrada (decisao 12:
"router de catalogo por embedding como filosofia"). Avaliar se vale.
v2 adiciona ao Wave G como opcional.

**M5. Calibracao (P8) e' simulacao pura.**
v2 confirma: nenhuma chamada LLM no script. So embed + score + comparar
com tool real chamada no historico.

**M6. Open question P4 (silenciamento de erros) aceito.**
Aceito como tradeoff. v2 documenta: erros de log-decision aparecem em
console.warn estruturado, monitoraveis por filtro de log futuro.

## Achados BAIXOS

**B1. Tempo total reajustado pra "18-25h em 4-6 dias".**
Vago. v2 mantem mas adiciona criterio: cada wave tem tempo somado;
calculo simples bate ~47h porque assume 0 paralelismo. Em pratica com
foco continuo: ~25h. Documentar formula.

**B2. ai-ux-pro-max usado 2 vezes (D1 e D6).**
Aceitavel. Manter.

**B3. G6 PR body deve ter checklist gates §12 da SPEC v3.**
v2 explicita.

## Conclusao

PLAN v1 tem **6 achados criticos** + **7 altos** + **6 medios**.
Mudancas v2:
- Wave A: A1 expandido com SQL UPDATE para AppSetting existente,
  filename timestamp exato.
- Wave B: B1 race condition documentada, B2 lru-cache decisao inline,
  B5 erros loggados.
- Wave C: C1 declarando linhas exatas em run-agent.ts.
- Wave D: D2 explicita query histograma, D4 quebrada em D4a-f.
- Wave E: E3 atualiza .env.example.
- Wave F: F1 quebrada em sub-tasks.
- Wave G: nova G0 Rebase, G3 com disparador real, G6 explicita PR
  contra main com checklist completo, G8 opcional CLAUDE.md update.
- Coluna "Depende de" em cada task.
- Update STATUS.md ao fim de cada wave.

Saida: PLAN v2 no mesmo arquivo. Header passa a marcar "v2 (apos
review adversarial #1)".
