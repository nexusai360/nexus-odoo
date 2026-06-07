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
- [x] Brainstorm + decisoes (AskUserQuestion). Mapa do estado atual feito (Explore): envelope fragmentado 3 fontes, 44% tools com envelope, paginacao 10/50, sem Title Case, sem freshness>6h.
- [~] SPEC v1 escrita. Proximo: commit + 2 reviews adversariais => v3.
- [ ] PLAN v1 -> 2 reviews -> v3.
- [ ] Execucao: envelope canonico (z.object) -> paginacao 50/50 -> humanize/escopo/staleness -> migrar ~60 tools por dominio (workflow Opus) -> formatadores reais -> ranking criterio.
- [ ] Verificacao E2E (numero identico ao atual) + rebuild mcp + integration.test.
- [ ] Code review + PR + merge.

## Lembretes de raiz
- Reuso: enriquecerEnvelope/calcularExtras, paginacao.ts, responder.ts (FORMATADORES+calcs), agrupador.topPorParticipante, fiscal/_escopo-empresa (generalizar), withFreshness, auto-validator V2/V6.
- Numero SEMPRE de codigo; LLM so redige. E2E deve provar numero inalterado pos-migracao.
- tsc raiz + tsc -p mcp/tsconfig.json + jest verdes por onda. Rebuild mcp da worktree --env-file .env.local. Sem travessao. Opus sempre.
- TODO p/ handoff final: ajustar `agente handoff` para dar ENTER automatico na mensagem (pedido do usuario, manter em todas as sessoes).
