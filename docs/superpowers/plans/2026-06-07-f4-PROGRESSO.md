# F4 (Apresentacao) , PROGRESSO (ponto de retomada)

> Apos compactacao: LER este arquivo + a spec (docs/superpowers/specs/2026-06-07-f4-apresentacao-design.md) + o plano (quando existir). Continuar do proximo passo.

**Branch:** feat/nex-reconstrucao. F1/F2/F3 ja em producao (merged). **Modo:** autonomo TOTAL ate o fim das 6 fases (autorizacao duravel do usuario 2026-06-07, inclui MERGE para main). So parar ao atingir ~80% de contexto (ai: doc redonda + commits + PR + merge + rodar `agente handoff` com ENTER automatico).
**DB:** `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`. Env: `set -a; . ./.env.local; set +a`. Migrations: manual + migrate deploy (NUNCA migrate dev). Cautela com quebra de plataforma.

## Roadmap (dossie-MASTER secao 6)
- F1 Metricas Canonicas , FEITA (merged #58)
- F2 Entidades/Desambiguacao , FEITA (merged #59)
- F3 Cerebro de Orquestracao , FEITA (merged #60, shadow)
- **F4 Apresentacao , EM ANDAMENTO** (esta)
- F5 Evals/Golden Dataset , pendente
- F6 Custo/Latencia , pendente

## Decisoes canonicas F4 (fixadas com o dono)
1. Paginacao 50/50: PAGINACAO_LIMIT_DEFAULT 10->50 (teto 50). total/temMais sempre.
2. Envelope canonico UNICO (z.object em mcp/lib/envelope.ts) + migrar TODAS as ~107 tools; ~60 sem _RESPOSTA/_DESTAQUE ganham.
3. Humanizacao: os 4 itens (Title Case, escopo-empresa cross-dominio, aviso de dado incompleto, formatadores reais p/ fmtGenerico).
4. Freshness>6h: _staleness interno no envelope (NAO imprime no corpo; stripper vigente).

## Estado
- [x] Brainstorm + decisoes (AskUserQuestion). Mapa do estado atual (Explore).
- [x] SPEC v1 -> 2 reviews adversariais (workflow wrntvpb6o, acharam 6+ CRITICOS de regressao) -> SPEC v3 commitada (4ed6fd4). Correcoes [R]: envelope BASE+extend (nao chapado), ARRAY_KEYS unica (toca o motor), paginacao 50 com teto-por-byte (guard 24KB), reusar humanizeName, freshness>6h server-side, numeros reais (102 read/9 write fora), ranking desempate+N, baseline snapshot.
- [x] PLAN v1 -> 2 reviews adversariais (wm08wckr3, 6 CRITICOS/ALTOS) -> PLAN v3 commitado (cadabbb): bloco "CORRECOES v3 [P]" no topo do plano (13 correcoes) , 6 consumidores (audit.ts), vocabulario+subconjuntos (nao lista plana), contar por TOOL, Onda 4 = 1 task/tool, EnvelopeBaseShape=FreshnessEnvelope<ToolEnvelope>, teto-por-byte deterministico, baseline so KPI invariante, allowlist nominal, ranking com fixture de empate.
- [x] Task 1.0 inventario gerado: docs/superpowers/plans/2026-06-07-f4-tools-a-migrar.md (100 read, 47 envelope, 53 a migrar; chaves: contas/eventos/familia/familias/linhas/marca/porEtapa/produtos).
- [x] **Task 1.1 FEITA** (961a9aa): mcp/lib/array-keys.ts , ARRAY_KEYS_VOCAB + subconjuntos PRIORITY/GUARD/VALOR/SANITIZE espelhando as listas atuais + primeiraListaDe. ADITIVO (ninguem importa ainda). 4 testes verdes. V6 fica so em dados.linhas (nao migrar).
- [x] Script `~/bin/agente` handoff: Fase 3 agora da ENTER automatico (key code 36 apos paste) , pedido duravel do usuario, manter sempre.
- [~] **PARADA DE WRAP-UP nesta sessao** (~71% contexto). Planejamento F4 100% feito e revisado; execucao Onda 1.2+ e da proxima sessao.

## PROXIMA SESSAO , comecar pela Onda 1.2 (rewire seguro do motor)
1.2: trocar a lista local de cada um dos **6 consumidores** pelo subconjunto certo de mcp/lib/array-keys.ts: run-agent.ts guardToolResult (2 loops ~147 e ~163 -> ARRAY_KEYS_GUARD), auto-validator V2 (~212 -> ARRAY_KEYS_VALOR), sanitize-tool-result (~89 -> ARRAY_KEYS_SANITIZE), freshness ARRAY_KEYS_PRIORITY (~153 -> ARRAY_KEYS_PRIORITY), audit.ts extractRowCount (~49 -> ARRAY_KEYS_PRIORITY). V6 NAO muda (so dados.linhas). ATENCAO cross-boundary: src/lib/agent importar de mcp/lib , se quebrar o boundary/build, mover a constante para um local neutro (ex.: src/lib/shared/) ou duplicar com comentario apontando a fonte. **Teste de caracterizacao ANTES**: snapshot do output atual dos 6 sobre fixtures; apos trocar, saida byte-a-byte identica. tsc raiz+mcp + jest verdes. Depois 1.3 (EnvelopeBaseShape) -> 1.4 (teste de contrato) -> 1.5 (baseline) -> 1.6 (freshness>6h server-side) -> Ondas 2..6 (ver plano v3).

## RETOMADA (proxima sessao) , F4 execucao
ORDEM (NAO pular a fundacao): Onda 1 (1.0 inventario das ~55 tools sem KPI -> docs/.../2026-06-07-f4-tools-a-migrar.md; 1.1 mcp/lib/array-keys.ts; 1.2 unificar os 5 consumidores [run-agent guardToolResult, auto-validator V2/V6, sanitize-tool-result, freshness ARRAY_KEYS_PRIORITY] , RE-CONFIRMAR ancoras por grep, preservar comportamento; 1.3 EnvelopeBaseShape+envelopePronto mantendo o TIPO ToolEnvelope; 1.4 teste de contrato mcp/__tests__/envelope-contract.test.ts; 1.5 baseline snapshot tsx; 1.6 freshness>6h server-side log) -> Onda 2 (paginacao default 50 + teto-por-byte + reescrever 35 testes importando a constante) -> Onda 3 (estender humanizeName + escopo.ts so onde ha filtro + cobertura.ts) -> Onda 4 (migrar ~55 tools por dominio via workflow Opus, E2E KPI x SELECT por tool) -> Onda 5 (ranking desempate+N) -> Onda 6 (contrato verde 102 + baseline KPI identico + rebuild mcp + PR + merge).
RISCO PRINCIPAL: Onda 1.2 toca o motor do agente; validar com tsc+jest e NAO mudar comportamento (so a fonte da lista de chaves). Migration: NENHUMA nesta fase.
- [ ] Execucao: envelope canonico (z.object) -> paginacao 50/50 -> humanize/escopo/staleness -> migrar ~60 tools por dominio (workflow Opus) -> formatadores reais -> ranking criterio.
- [ ] Verificacao E2E (numero identico ao atual) + rebuild mcp + integration.test.
- [ ] Code review + PR + merge.

## Lembretes de raiz
- Reuso: enriquecerEnvelope/calcularExtras, paginacao.ts, responder.ts (FORMATADORES+calcs), agrupador.topPorParticipante, fiscal/_escopo-empresa (generalizar), withFreshness, auto-validator V2/V6.
- Numero SEMPRE de codigo; LLM so redige. E2E deve provar numero inalterado pos-migracao.
- tsc raiz + tsc -p mcp/tsconfig.json + jest verdes por onda. Rebuild mcp da worktree --env-file .env.local. Sem travessao. Opus sempre.
- TODO p/ handoff final: ajustar `agente handoff` para dar ENTER automatico na mensagem (pedido do usuario, manter em todas as sessoes).
