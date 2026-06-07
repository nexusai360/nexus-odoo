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
  - [~] 3a.1b curadoria TOOL_TRIGGERS por dominio , workflow wa46iq9bv (6 agentes Opus). Ao terminar: integrar sub-mapas em mcp/catalog/embedding-text.ts (TOOL_TRIGGERS), jest verde, commit.
  - [ ] 3a.4 types, 3a.8a rank helper, 3a.3 embed-tools, 3a.5 pick-tools (modulos puros, independem dos triggers , fazendo em paralelo a curadoria).
  - [ ] 3a.2 publicar embeddingText capado na description; 3a.6 migration AgentRouterDecision + log-decision; 3a.7 camada C filter-catalog; 3a.8b/8c fiar retrieval shadow no run-agent.
- proxima onda: 3b (classify-intent, apply-intent-args, V6/V7 no auto-validator), 3c (rename fora-do-catalogo + Fora de Escopo/gap), Verificacao (mini-oraculo, recall@K, rebuild).
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
