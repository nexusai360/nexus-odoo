# PROGRESSO , Milestone "Nex Especialista"

> Ponto de retomada entre sessões. Modo autônomo TOTAL autorizado pelo usuário
> (2026-06-11: "resolve isso tudo aí, confio em vc"; redesenhar o que precisar;
> orçamento LLM sem teto rígido , qualidade decide, custo desempata).
> Ler junto: SPEC v3 `docs/superpowers/specs/2026-06-11-nex-especialista-design.md`
> e LAUDO `docs/superpowers/research/2026-06-11-laudo-forense-agente-nex.md`.
> Branch: `feat/nex-reconstrucao` (worktree).

## Grafo de fases
A0 (instrumentação) → A1 (A/B preliminar + troca) → B (contrato de lista) →
C (filtros/composição) → A2 (A/B confirmatório) → D (prompt 2.0) → E (blindagem).
Cada fase: plano próprio (bite-sized) + 2 reviews quando material → execução TDD
→ E2E real → commit atômico → atualizar ESTE arquivo.

## Estado
- [x] LAUDO forense completo (commit 9fd47f9) , causas: modelo mini, listas sem
  contrato (84 tools, só 3 declaram ordenação), filtros faltantes, prompt-remendo.
- [x] SPEC v1 → 2 reviews adversariais Opus (18 achados, 3 BLOCKERs) → **SPEC v3**.
  Achados-chave aplicados: golden atual NÃO roda LLM (chama tool.handler direto);
  só 4/124 kpiOuro; gate de contrato deve ser incremental; AutoValidator integrado;
  composição multi-eixo + follow-up contextual no escopo; A/B roda 2x (A1/A2).
- [ ] **Fase A0 , Instrumentação** (PRÓXIMA):
  - [ ] A0.3 pre-flight credenciais (SELECT llm_credentials: frontier com saldo?).
  - [ ] A0.1 harness agêntico A/B: roda golden via runAgent + llmOverride
        (campo JÁ existe, run-agent.ts ~360), captura tool usada + resposta +
        custo end-to-end (todas as origens LlmUsage do turno) + latência + juiz
        de alucinação. Local: src/lib/agent/evals/ (novo arquivo .e2e.ts ou script).
  - [ ] A0.2 popular kpiOuro: ≥60 casos SELECT-verificados (hoje 4/124).
- [ ] Fase A1 , A/B preliminar (mini × gpt-5.4 × frontier OpenRouter) + promoção.
- [ ] Fase B , contrato de lista (84 tools; task-zero auditoria; ordenadoPor;
      topMaiores; gate allowlist; validador enquadramento; embeddingText audit).
- [ ] Fase C , filtros + composição multi-eixo + follow-up (mineração das razoes).
- [ ] Fase A2 , A/B confirmatório.
- [ ] Fase D , prompt 2.0 + AutoValidator atualizado.
- [ ] Fase E , golden gate pre-push + métricas no STATUS.

## Fatos úteis (cravados na perícia de hoje)
- Modelo ativo: gpt-5.4-mini; custo p50 US$0,0044/turno; janela 12 msgs;
  router ativo (threshold 0.3, topK 3, oferta média 47-65 tools).
- Perícia: maio 69,6% correto; votos usuário 8/9 negativos.
- Caso forense #1: financeiro_titulos_vencidos sem orderBy nem topMaiores →
  "10 maiores" falsos (real: Johnson R$170,8mi). queryTitulosVencidos
  (src/lib/reports/queries/financeiro.ts) e handler são os alvos da Fase B.1.
- Truncagem real vive no guardToolResult (run-agent.ts ~141-189; 30/10 itens).
- Já corrigido em prod hoje: #94 cold start (batch embeddings), #95 financeiro
  provisorio + reconcile 3h (fantasmas R$172,7mi se autopurgam).
- Dev local: rodar `npm run dev:fresh` na pasta principal para o next dev pegar
  o código novo (o turno de 64,5s do print era processo velho).
