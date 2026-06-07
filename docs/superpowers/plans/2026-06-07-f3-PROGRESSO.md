# F3 (Cerebro de Orquestracao) , PROGRESSO (ponto de retomada)

> Apos compactacao: LER este arquivo + a spec (docs/superpowers/specs/2026-06-07-f3-cerebro-orquestracao-design.md) + (quando existir) o plano. Continuar do proximo passo.

**Branch:** feat/nex-reconstrucao (F1 e F2 ja em producao/merged). **Modo:** autonomo TOTAL ate o fim (usuario pediu "continue ate o final"). So parar em merge/deploy/ultrareview ou bloqueio real.
**DB:** `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`. Env: `set -a; . ./.env.local; set +a`.

## Decisoes canonicas (fixadas com o dono)
- Spec unica, plano em 3 ondas: 3a retrieval+router ativo; 3b intencao+verificador; 3c "Fora do Catalogo".
- Tool retrieval: embedding por tool + router shadow->active (fallback catalogo cheio).
- Intencao: deterministico leve (regex/keywords) exaustiva|ranking|amostragem|pontual.
- Verificador: consolidar pipeline atual + checagens novas (totais batem, datas no periodo, anti-JOIN, freshness).
- **"Caminho 3" RENOMEADO para "Fora do Catalogo"**: ramos Falta Honesta / Fora de Escopo / Consulta BI Avancada. Renomear codigo (mcp/tools/caminho3/ -> fora-do-catalogo/) na ONDA 3c; ids das tools NAO mudam.

## Estado
- [x] Brainstorm + requisitos (4 decisoes + naming) , feito com o dono via AskUserQuestion.
- [x] SPEC v1 commitada (704c825).
- [x] 2 reviews adversariais da spec (workflow w032ppkov, Opus) , acharam 4 criticos reais. SPEC v3 commitada (2caf2f9) com correcoes [R]: embeddingText (nao examples), cache de processo (nao pgvector), rename so user-facing (chave caminho3 estavel), shadow-compare instrumentado (migration AgentRouterDecision + recall@K>=98%), verificador estende auto-validator (V5-V7, limitado ao envelope atual), precedencia de intencao, K/limiar com metodo, mini-oraculo, grafo de dependencia.
- [x] PLAN v1 -> 2 reviews adversariais (workflow wl200v0dk) -> PLAN v3 commitado (2035410). 5 criticos aplicados [P]: V6/V7 (V5 ocupado), V6 nao duplica V2, datas-no-periodo cortado p/ F4, import ../rag/embed, embedQuestion().vector, routerEnabled Boolean vs routerToolRetrieval (task 3a.0), ToolEntry id/descricao, callTool ~1241, retry so-texto (V6/V7 Falta Honesta direta), log-decision no escopo, embeddar so catalogo proprio, floor real, epicos divididos, mini-oraculo com classes, cap 400 chars.
- [~] EXECUCAO , Onda 3a em andamento:
  - [x] 3a.0 flag routerToolRetrieval + migration (55cadf3).
  - [x] 3a.1a embedding-text estrutura + check cobertura piso 25 (d8b2da5). Descoberta: 102 read-tools, menor descricao 32 chars.
  - [x] 3a.1b triggers curados (workflow wa46iq9bv, 92 read-tools) integrados em mcp/catalog/tool-triggers.data.ts (84a873a). embedding-text re-exporta. fix fiscal_apuracao.
  - [x] 3a.3/3a.4/3a.5/3a.8a modulos puros (e56e830): types (RetrievalTool/ToolRetrievalResult), embed-tools (cache processo, import ../rag/embed + ./constants), pick-tools (top-K+nucleo, floor por getToolDomain), retrieval-rank (rankOf). 12 testes verdes.
  - [x] 3a.2 descriptionForRetrieval capado 400 chars publicado no tools/list (c42bf4b).
  - [x] 3a.6 migration AgentRouterDecision (offered/scores/rank) + log-decision estendido (9f4e4ea).
  - [x] 3a.7 camada C no filter-catalog apos RBAC (621c0d4).
  - [x] 3a.8b/8c retrieval fiado no run-agent (shadow loga offered/scores; active passa toolRetrieval; chosenToolRank no updateDecision) (c710538). 555 testes do agente verdes.
- [x] **ONDA 3a COMPLETA.** Retrieval de tool em shadow, gate de go-live instrumentado.
- [x] **ONDA 3b COMPLETA.** 3b.1 classify-intent (3a9e004), 3b.2 apply-intent-args + injecao gate active (c05e8a1), 3b.3/3b.4/3b.5 V6/V7 + runShadowChecks shadow (1ef6ea6), 3b.6 decideRetryOuGap + shadow log no run-agent (63b564d). 583 testes do agente verdes. NOTA: injecao de intencao consolidada na flag routerToolRetrieval (active); V6/V7 so shadow.
- [~] **ONDA 3c** , INICIANDO: git mv caminho3->fora-do-catalogo (3c.1), rotulos user-facing mantendo chave de dominio caminho3 estavel (3c.2a recusa.ts, 3c.2b UI router, 3c.2c prompt/docs), ramo Fora de Escopo+gap (3c.3 fora-do-catalogo.ts + run-agent).
- [ ] **Verificacao**: mini-oraculo 40-50 perguntas (V.1), E2E recall@K>=98% via tsx (V.2), rebuild worktree+shadow-compare (V.3), code review + PR (V.4).
  - LEMBRETES p/ o plano (das reviews): migration manual AgentRouterDecision (migrate deploy, nao dev); curar embeddingText de ~35-40 read-tools + check de startup/CI; NAO renomear chave de dominio caminho3; V5-V7 dentro de auto-validator com retry compartilhado cap=1; injecao de args de intencao entre tc.arguments e callTool (run-agent ~1214); mini-oraculo 30-50 perguntas anotadas.
- [ ] Execucao Onda 3a (tool retrieval + router ativo) , TDD inline + workflow p/ unidades independentes.
- [ ] Execucao Onda 3b (classify-intent + verifier/).
- [ ] Execucao Onda 3c (rename caminho3->fora-do-catalogo + endurecimento).
- [ ] Verificacao E2E contra cache real + shadow-compare.
- [ ] Code review + PR.

## Lembretes de raiz
- Reuso: router pick-domains/filter-catalog, embed.ts/embed-domains, RBAC visibleTools, auto-validator+guardrails, caminho3 tools, multi-LLM.
- Rebuild da worktree + `--env-file .env.local` por onda que tocar app/mcp. Worker via `build app`.
- tsc raiz + `tsc -p mcp/tsconfig.json` + jest por onda. Sem travessao. Opus sempre.
- Heartbeat ScheduleWakeup ~15min ativo. Avisar humano so em merge/deploy/ultrareview.
