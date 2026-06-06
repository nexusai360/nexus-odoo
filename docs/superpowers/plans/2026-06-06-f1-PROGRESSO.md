# F1 , PROGRESSO DE EXECUCAO (ponto de retomada)

> Atualizado a cada bloco. Apos compactacao de contexto, LER:
> 1. este arquivo, 2. o plano `2026-06-06-f1-faturamento-empresa-plan.md`,
> 3. a spec `2026-06-06-f1-faturamento-empresa-spec.md`. Continuar do proximo bloco.

**Branch:** `feat/nex-reconstrucao` (worktree `branches/feat-nex-reconstrucao`).
**Modo:** autonomo, execucao INLINE task a task (decisao do usuario), commit atomico por bloco.
**DB cache:** Postgres container `nexus-odoo-db-1`, db `nexus_odoo_l1`, user `nexus`. Carregar env com `set -a; . ./.env.local; set +a`. Conferir via `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -At -c "..."`.

## Estado dos blocos
- [x] **Bloco A** (schema/migration/builder) , commit `776af23`. Colunas `empresa_id`+`situacao_nfe` em `fato_nota_fiscal_item` (NULAS ate o reprocesso do bloco F). Builder propaga. 17 testes verdes.
  - DESVIO documentado: migration manual + `prisma migrate deploy` (NAO `migrate dev`, que pediria reset destrutivo por drift pre-existente ffli_*/message_feedback). Em prod o `migrate deploy` aplica normal.
- [x] **Bloco B** , helpers `_shared` , commit `1da3058`. 4 suites, 19 testes verdes.
- [~] **Bloco C** , EM ANDAMENTO. spike recebido (C0) + 11 metricas TDD em `src/lib/metrics/fiscal/`.
  - **C0 VEREDITO (dado real 2026-06-06):** ponte `FatoPedidoParcela.finanLancamentoId` MORTA (0 registros, JOIN casa 0). Elo REAL = `FatoFinanceiroLancamentoItem.pedidoId` direto (2227 itens, R$6.452.439,44 pago / R$26.923.169,53 saldo). A metrica `faturamento-recebido` usa `FatoFinanceiroLancamentoItem` agrupado por `pedidoId` somando `vrPagoTotal` (recebido) e `vrSaldo` (a receber); eixo "recebido por NOTA" = gap honesto. Corrige SPEC 4.9 e o caminho do plano C0/C15/C16.
- [ ] **Bloco D** , 5 tools MCP novas + index + fix integration.test.
- [ ] **Bloco E** , refactor de 9 tools/queries fiscais (empresaRef + escopo).
- [ ] **Bloco F** , rebuild containers (app p/ worker + mcp) + reprocesso do builder (popula as colunas).
- [ ] **Bloco G** , E2E contra cache real.
- [ ] **Bloco H** , code review + STATUS/HISTORY + PR.

## Lembretes de raiz
- Calculo SEMPRE em codigo; nunca travessao; teste E2E contra dado real obrigatorio.
- Schema mudou: rebuild app (p/ worker) + mcp. Worker NAO tem build proprio (rebuildar via `app`).
- `agente schema-changed` ja rodado no bloco A.
- Heartbeat ScheduleWakeup ativo (15 min). So avisar o usuario quando a Fase 1 INTEIRA fechar.
