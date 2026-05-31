# Reviews adversariais , PLAN B1 Contábil

Review genuína (Opus) sobre o PLAN, aterrada no código real. Achados B1P-*. Veredito: não
pronto como estava (3 furos que quebram a suíte/execução); v-final aplica tudo.

- **B1P-1 (rebaixado):** contagem `MODEL_CATALOG` 114→116 está correta (referencial já no
  catálogo; +2 raws novos). Confirmar via `grep -c` que parte de 114.
- **B1P-2 (BLOQUEADOR→resolvido):** `CONTABIL_IDS` é spreadado em `TODOS_IDS`
  (`...CONTABIL_IDS`), então adicionar os 5 ids a `CONTABIL_IDS` já satisfaz os
  `toEqual([...TODOS_IDS])`. Bumpar os hardcoded `74→79`/`83→88`. (A review alertou para
  `TODOS_IDS`; verificado que o spread cobre.)
- **B1P-3 (BLOQUEADOR→resolvido):** Task 9 ganhou contrato exato: `outputSchema.dados` com
  `_RESPOSTA` opcional; injeção do `_RESPOSTA` honesto por mutação APÓS `enriquecerEnvelope`
  (não há formatador por-tool); `withFreshness` devolve `dados` em ok/vazio (mutação válida).
- **B1P-4 (MATERIAL→resolvido):** join `contaNatureza` via `Map<odooId,natureza>` de
  `fatoContaContabil` é viável (`conta_id` M2O → odooId casa). Ordem `fato_contabil_lancamento`
  antes de `_item` fixada no FATO_BUILDERS (item lê tipo do cabeçalho).
- **B1P-5 (MATERIAL→resolvido):** migration via workaround de drift (`db execute` +
  `migrate resolve --applied`) como caminho PRIMÁRIO (DB dev tem drift; espelha O1/O3/R2-ctx),
  não `migrate deploy`.
- **B1P-6 (MATERIAL→resolvido):** BI_SCHEMA_REFERENCE em `src/lib/agent/bi-schema-reference.ts`
  é OBRIGATÓRIO (o teste varre `@@map("fato_*")` e exige cada nome) , movido para a Task 1,
  no mesmo passo do schema.
- **B1P-8 (MENOR):** verificar se `contabil.conta.referencial` precisa entrar no `MODELOS_B1`
  do model-catalog.test (sem arquivo discovery).
- **B1P-9 (MENOR→resolvido):** query layer usa `groupBy` + `_sum`, especificado.
- **B1P-10 (MATERIAL→resolvido):** Task 5 quebrada em 5a (cabeçalho) + 5b (item, o join é o
  risco). Task 9 (4 tools simétricas) mantida agrupada.
- **B1P-7/B1P-11 (MENOR):** `gen:mcp-catalog` não requer DB (anotado); PR declara a divergência
  consciente do plano-mãe §0.1 (tools visíveis+honestas, não ocultas).
