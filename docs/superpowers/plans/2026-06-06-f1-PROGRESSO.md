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
- [x] **Bloco D** , 5 tools MCP + helper escopo + registro + integration.test (48 verdes; 93->98, 102->107, FISCAL_IDS +5). tsc raiz + tsc mcp limpos. DESVIO: nao escrevi .test.ts unitario por tool (wrappers finos sobre metricas ja testadas; cobertos por integration.test + E2E do bloco G).
  - **PADRAO DE TOOL (de faturamento-periodo.ts):** `ToolEntry<Input,Output>` de `../../catalog/types.js`; imports `withFreshness` de `../../lib/freshness.js`, `enriquecerEnvelope` de `../../lib/with-responder.js`; metricas de `@/lib/metrics/fiscal`. Campos: id, dominio:"fiscal", descricao, inputSchemaShape:inputSchema.shape, inputSchema, outputSchema, handler:async(input,ctx)=>{ const env = await withFreshness(ctx.prisma,["fato_nota_fiscal"], async()=>shape(...)); if(env.estado==="preparando")return env; return enriquecerEnvelope(env, id, {destaque,agregado}); }. gatedRoles:['admin','super_admin'] em por_empresa.
  - Tools: D1 fiscal_faturamento_por_empresa (gated), D2 _por_operacao, D3 _por_cfop (freshness inclui fato_nota_fiscal_item), D4 _nao_autorizado, D5 _recebido (eixo pedido|nota; nota=gap, NAO grava featureRequest). Helper montarEscopoEmpresa(prisma, empresaRef?, recorte) resolve empresaRef via resolverEmpresa, ramo grupo deriva M/X de faturamentoPorEmpresa.
- [~] **Bloco E** , EM ANDAMENTO. E1 FEITO (queryFaturamentoPeriodo em fiscal.ts: borda exclusiva + natureza venda + empresaId, chave valorFaturado mantida; tsc raiz+mcp ok). FALTA E2-E13: E2 queryNotasEmitidas (so periodo+empresa, NAO natureza pois e lista), E3 queryFaturamentoPorCliente (+empresa+natureza), E4 queryProdutosFaturados (+empresa direto no item via coluna nova), E5-E13 tools fiscais antigas ganham empresaRef+escopo (faturamento-periodo, notas-emitidas, notas-recebidas, faturamento-por-cliente, produtos-faturados, impostos-periodo, faturamento-mensal-serie, faturamento-por-marca [usa $queryRawUnsafe+buildEmpresaSqlFragment alias 'nf'/$3], faturamento-por-uf [idem]). Helpers em `@/lib/metrics/_shared/*` (sem .js em src; com .js em mcp/tools). APOS bloco E: rebuild mcp (fiscal.ts afeta mcp) + rodar integration.test + tsc.
- [ ] **Bloco H** , code review (gsd-code-review) + atualizar STATUS.md/HISTORY + abrir PR. Merge p/ main = decisao do usuario.
- [ ] **Bloco E** , refactor de 9 tools/queries fiscais (empresaRef + escopo).
- [x] **Bloco F** , rebuild app+mcp (imagem 18:30) + recriar worker/mcp + reprocesso. ARMADILHA resolvida: `docker compose up` precisa de `--env-file .env.local` (interpolacao `${ODOO_URL}`), senao worker entra em crash loop por env vazio; o reprocesso roda SEM `--env-file` (DATABASE_URL ja no container). Colunas populadas: 219.460 itens, 219.459 com empresa_id/situacao_nfe (1 orfao).
- [x] **Bloco G** , E2E contra cache real PASSOU. Numeros (saida autorizada): TOTAL_GRUPO = 34.325 notas, R$1.852.798.390,94; SOMA_EMPRESAS = identico (fechamento perfeito), SEM_EMPRESA=0; 14 empresas faturam; situacoes excluidas corretamente (cancelada 171/R$13M, em_digitacao, denegada, rejeitada, inutilizada); CFOP item R$1.851.604.388,21 vs cabecalho R$1.852.798.390,94 = 0,064% (tolerancia ok).
- [ ] **Bloco H** , code review + STATUS/HISTORY + PR.

## Lembretes de raiz
- Calculo SEMPRE em codigo; nunca travessao; teste E2E contra dado real obrigatorio.
- Schema mudou: rebuild app (p/ worker) + mcp. Worker NAO tem build proprio (rebuildar via `app`).
- `agente schema-changed` ja rodado no bloco A.
- Heartbeat ScheduleWakeup ativo (15 min). So avisar o usuario quando a Fase 1 INTEIRA fechar.
