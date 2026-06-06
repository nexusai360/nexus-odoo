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
- [x] **Bloco C** , commits `c..parte1` + `054d663`. 11 metricas (`src/lib/metrics/fiscal/*`) + barrel + spike C0. 15 suites, 33 testes verdes. Exports: faturamentoAutorizado/AutorizadoTotal/Bruto/NaoAutorizado/impactoCancelamentos/Saida/Entrada/PorEmpresa/PorOperacao/PorCfop/Recebido.
  - **C0 VEREDITO (dado real 2026-06-06):** ponte `FatoPedidoParcela.finanLancamentoId` MORTA (0 registros, JOIN casa 0). Elo REAL = `FatoFinanceiroLancamentoItem.pedidoId` direto (2227 itens, R$6.452.439,44 pago / R$26.923.169,53 saldo). A metrica `faturamento-recebido` usa `FatoFinanceiroLancamentoItem` agrupado por `pedidoId` somando `vrPagoTotal` (recebido) e `vrSaldo` (a receber); eixo "recebido por NOTA" = gap honesto. Corrige SPEC 4.9 e o caminho do plano C0/C15/C16.
- [~] **Bloco D** , EM ANDAMENTO. 5 tools MCP em `mcp/tools/fiscal/` + helper `_escopo-empresa.ts` + registro no `mcp/tools/fiscal/index.ts` + fix `mcp/__tests__/integration.test.ts` (contagens 93->98 admin/super_admin, catalogo 102->107, FISCAL_IDS +5).
  - **PADRAO DE TOOL (de faturamento-periodo.ts):** `ToolEntry<Input,Output>` de `../../catalog/types.js`; imports `withFreshness` de `../../lib/freshness.js`, `enriquecerEnvelope` de `../../lib/with-responder.js`; metricas de `@/lib/metrics/fiscal`. Campos: id, dominio:"fiscal", descricao, inputSchemaShape:inputSchema.shape, inputSchema, outputSchema, handler:async(input,ctx)=>{ const env = await withFreshness(ctx.prisma,["fato_nota_fiscal"], async()=>shape(...)); if(env.estado==="preparando")return env; return enriquecerEnvelope(env, id, {destaque,agregado}); }. gatedRoles:['admin','super_admin'] em por_empresa.
  - Tools: D1 fiscal_faturamento_por_empresa (gated), D2 _por_operacao, D3 _por_cfop (freshness inclui fato_nota_fiscal_item), D4 _nao_autorizado, D5 _recebido (eixo pedido|nota; nota=gap, NAO grava featureRequest). Helper montarEscopoEmpresa(prisma, empresaRef?, recorte) resolve empresaRef via resolverEmpresa, ramo grupo deriva M/X de faturamentoPorEmpresa.
- [ ] **Bloco E** , refactor 9 queries/tools fiscais (E1 fiscal.ts queryFaturamentoPeriodo MANTEM chave valorFaturado, so troca where; E2-E13). Ordem E1-E4 (fiscal.ts) antes de E5-E13 (tools).
- [ ] **Bloco E** , refactor de 9 tools/queries fiscais (empresaRef + escopo).
- [ ] **Bloco F** , rebuild containers (app p/ worker + mcp) + reprocesso do builder (popula as colunas).
- [ ] **Bloco G** , E2E contra cache real.
- [ ] **Bloco H** , code review + STATUS/HISTORY + PR.

## Lembretes de raiz
- Calculo SEMPRE em codigo; nunca travessao; teste E2E contra dado real obrigatorio.
- Schema mudou: rebuild app (p/ worker) + mcp. Worker NAO tem build proprio (rebuildar via `app`).
- `agente schema-changed` ja rodado no bloco A.
- Heartbeat ScheduleWakeup ativo (15 min). So avisar o usuario quando a Fase 1 INTEIRA fechar.
