# F2 , PROGRESSO DE EXECUCAO (ponto de retomada)

> Apos compactacao: LER este arquivo + o plano `2026-06-06-f2-entidades-desambiguacao-plan.md` + a spec. Continuar do proximo bloco.

**Branch:** feat/nex-reconstrucao. **Modo:** autonomo, execucao INLINE, commit atomico por bloco. Fase 1 ja em producao.
**DB:** `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`. Env: `set -a; . ./.env.local; set +a`.
**Reusar:** padrao `resolverEmpresa` de `src/lib/metrics/_shared/empresa.ts`.

## Blocos (ordem do plano v3)
- [~] **Bloco A** , helpers `src/lib/entities/_shared`: types, _fuzzy (levenshtein/normalizar/scoreFuzzy), _documento, _classificar-ref, sinonimias, _lacuna, barrel. TDD.
- [ ] **Bloco B** , 8 resolvedores (armazem, produto, nota-fiscal, conta-contabil, conta-referencial, pedido, natureza-operacao, centro-resultado). Parceiro NAO aqui.
- [ ] **Bloco C** , migration FatoParceiro.documentoDigits + @@index([chave]) (MANUAL + migrate deploy, NAO migrate dev; drift) + prisma generate + builder worker + backfill.
- [ ] **Bloco C-bis** , resolverParceiro (depende de documentoDigits no client) + export ./parceiro no barrel.
- [ ] **Bloco D** , 4 tools detalhar-por-id (produto, pedido, conta[gated], nota; sem `numero` na nota=null).
- [ ] **Bloco E** , registro catalogo + fix integration.test (catalogo total +4; admin +4; manager/viewer +3, pois contabil_detalhar_conta e gated).
- [ ] **Bloco F** , rebuild app+mcp DA WORKTREE com `docker compose --env-file .env.local up -d --build` + reprocesso/backfill.
- [ ] **Bloco G** , E2E contra cache real, 1 task por entidade.
- [ ] **Bloco H** , code review + PR.

## Lembretes de raiz
- migrate deploy (nunca migrate dev). Rebuild SEMPRE da worktree + `--env-file .env.local` (senao crash loop). Worker via `build app`.
- tsc raiz + `tsc -p mcp/tsconfig.json` + jest por bloco. Sem travessao.
- Imports: src/ sem `.js`; mcp/tools com `.js`.
- Heartbeat ScheduleWakeup ativo. Avisar usuario quando a F2 fechar; merge = decisao dele (mas ja autorizou seguir).
