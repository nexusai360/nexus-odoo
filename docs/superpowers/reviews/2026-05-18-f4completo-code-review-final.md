# F4 completo — Code Review final (etapa [10])

> Auditoria holística do conjunto "F4 completo", branch `feat/mcp-dominios-completos`,
> diff vs `main`. Cada onda (A–H) já teve review próprio; esta é a auditoria final
> de integração, segurança e corretude do conjunto.
> Data: 2026-05-18. Auditor: code-review (Opus).

## Veredito

**APROVADO COM RESSALVAS.**

Nenhum achado CRÍTICO. Nenhum bloqueador de merge para produção. As 5 verificações
exigidas pela SPEC v3 §6 estão verdes. Achados restantes são IMPORTANTE/MENOR de
natureza comportamental/operacional, não defeitos que quebrem runtime ou segurança.

## Contagem por severidade

| Severidade | Quantidade |
|---|---|
| CRÍTICO | 0 |
| IMPORTANTE | 2 |
| MENOR | 4 |

## Verificações (SPEC v3 §6)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | verde |
| `npx tsc -p mcp/tsconfig.json` | verde |
| `npx jest` | verde — 837 testes, 104 suites |
| `npx eslint src/ mcp/` | verde — 0 erros |
| `npx next build` | verde |

Contagem de testes bate exatamente com o esperado (837). Harness de integração
valida igualdade de conjuntos das 33 tools (`integration.test.ts` linhas 144–159):
catálogo bruto tem 33 entradas e o conjunto de IDs do `super_admin` é exatamente
`TODOS_IDS`.

---

## Achados

### IMPORTANTE

#### IMP-1 — `comercial_pedidos_periodo` agrega `vrNf` (≈0 para pedidos em aberto), inconsistente com as demais tools comerciais

- **Arquivo:** `src/lib/reports/queries/comercial.ts:23` (`queryPedidosPeriodo`);
  `mcp/tools/comercial/pedidos-periodo.ts:44-45` (descrição/aviso).
- **Problema:** `queryPedidosPorEtapa` e `queryPedidosPorVendedor` usam
  `vrProdutos` deliberadamente — com a justificativa, documentada no próprio
  código (`comercial.ts:31-35`), de que `vrNf` é 0 para pedidos não faturados e
  subnotificaria todo o pipeline em aberto. `queryPedidosPeriodo`, porém, soma
  `vrNf`. Como o universo é de 71 pedidos majoritariamente em etapas
  pré-faturamento, `valorTotal` desta tool sairá quase inteiramente zerado. A
  descrição da tool diz "valor faturado no período" e o aviso diz "Valor vem de
  vrNf". O resultado é coerente *com o aviso*, mas incoerente com as outras duas
  tools comerciais que respondem à mesma pergunta de negócio ("quanto vale o
  comercial") com outra base — um gestor que pergunte "pedidos do mês" e depois
  "pedidos por vendedor" verá números que não fecham entre si.
- **Recomendação:** decidir uma base única para o domínio comercial. Ou
  `queryPedidosPeriodo` passa a usar `vrProdutos` (alinhando com etapa/vendedor),
  ou expõe ambos (`valorPedidos` via `vrProdutos` + `valorFaturado` via `vrNf`)
  para a pergunta ficar inequívoca. Não bloqueia merge — é correção de semântica
  de relatório, melhor resolvida antes de F5 conectar o agente.

#### IMP-2 — Migration `f4completo_fatos_dominios` não inclui os `GRANT SELECT`; provisionamento depende de execução manual dos scripts SQL

- **Arquivos:** `prisma/sql/2026-05-17-mcp-role.sql` (estendido com os 6 fatos),
  `prisma/sql/2026-05-18-mcp-bi-role.sql` (novo); migration Prisma
  `20260518110146_f4completo_fatos_dominios`.
- **Problema:** os scripts SQL de role estão corretos e completos (`mcp-role.sql`
  cobre os 6 fatos novos linhas 46-51; `mcp-bi-role.sql` cobre os 12 fatos). Mas
  são scripts versionados fora do fluxo de `prisma migrate` — a SPEC v3 §4 os
  trata como "aplicar UMA VEZ" manualmente. As 6 tabelas de fato novas são
  criadas pela migration Prisma, mas o `GRANT SELECT` correspondente só existe no
  script SQL avulso. Se o deploy de produção rodar `prisma migrate deploy` sem
  reexecutar `2026-05-17-mcp-role.sql`, **toda tool nova retorna `permission
  denied` sob o role `nexus_mcp`** — exatamente o risco que a SPEC §7 e o achado
  I6 anteciparam. Os testes unitários rodam como superusuário e não pegam isso.
- **Recomendação:** este é um item de **runbook de deploy [12]**, não um defeito
  de código. Garantir que o passo de deploy assistido inclua, na ordem:
  (1) `prisma migrate deploy`, (2) reexecução de `2026-05-17-mcp-role.sql`,
  (3) execução de `2026-05-18-mcp-bi-role.sql` com senha real. Documentar
  explicitamente no runbook que migration de schema e GRANT são passos separados.
  Sem ação no runbook, o MCP sobe quebrado em produção.

### MENOR

#### MEN-1 — `fiscal_produtos_faturados` reporta frescor só de `fato_nota_fiscal_item`, que carrega `dataEmissao` desnormalizada de `fato_nota_fiscal`

- **Arquivo:** `mcp/tools/fiscal/produtos-faturados.ts:61`.
- **Problema:** a tool filtra por período usando `FatoNotaFiscalItem.dataEmissao`,
  campo desnormalizado da nota-mãe (N8). O `withFreshness` recebe só
  `["fato_nota_fiscal_item"]`. Como `dataEmissao` no item só é atualizada quando
  o builder do *item* roda, e ambos os builders (`fato_nota_fiscal` e
  `fato_nota_fiscal_item`) são `incremental` e rodam no mesmo ciclo
  (`registry.ts:31-32`), na prática o frescor está correto. Mas o acoplamento é
  implícito: se um dia o builder do item passar a rodar em cadência diferente, o
  frescor reportado seria silenciosamente otimista.
- **Recomendação:** sem ação necessária agora. Opcionalmente declarar
  `["fato_nota_fiscal", "fato_nota_fiscal_item"]` no `withFreshness` para tornar
  a dependência explícita — `withFreshness` já reporta a fonte mais defasada.

#### MEN-2 — `bi_consulta_avancada`: o cap por wrap de subquery contorna `ORDER BY`/`LIMIT` do SQL original de forma não óbvia

- **Arquivo:** `mcp/tools/caminho3/bi-consulta-avancada.ts:88-92`.
- **Problema:** para SQL sem CTE, o handler envelopa em
  `SELECT * FROM (<sql>) AS _bi_subquery LIMIT 1001`. Se o SQL original já tem
  `ORDER BY` sem `LIMIT`, o wrap preserva a ordenação (subquery ordenada é
  estável o suficiente na prática do Postgres), mas se tiver `LIMIT 5000` interno
  o resultado é cortado em 1001 e `truncado` fica `true` — comportamento correto,
  porém o agente pode achar que pediu 5000. É um detalhe de contrato, não bug.
- **Recomendação:** documentar no `aviso` ou na descrição da tool que o cap de
  1000 linhas é absoluto e sobrepõe qualquer `LIMIT` maior no SQL. Texto atual do
  aviso já menciona truncamento — suficiente. Sem ação obrigatória.

#### MEN-3 — `sql-guard` não bloqueia funções voláteis/perigosas dentro de um SELECT legítimo

- **Arquivo:** `mcp/tools/caminho3/sql-guard.ts`.
- **Problema:** o guard valida estrutura (statement único, raiz `SelectStmt`, sem
  `INTO`/`FOR UPDATE`/CTE data-modifying). Um `SELECT pg_sleep(60)` ou
  `SELECT * FROM pg_read_file(...)` passa pelo AST — é um `SelectStmt` válido. A
  SPEC v3 §3.7 reconhece isso explicitamente e delega: `pg_sleep` é morto pelo
  `statement_timeout=5s`, e `pg_read_file`/funções de superusuário falham por
  falta de privilégio sob `nexus_mcp_bi`. A defesa é o role + timeout, não o
  guard. A análise está correta e alinhada à SPEC.
- **Recomendação:** nenhuma — comportamento conforme projetado. Registrado só
  para confirmar que a defesa-em-profundidade foi auditada e o vetor está coberto
  pelas camadas corretas (role read-only + `statement_timeout` + `REVOKE CREATE`).

#### MEN-4 — `bi-pool` aplica os `SET` de read-only de forma assíncrona não-aguardada no evento `connect`

- **Arquivo:** `mcp/tools/caminho3/bi-pool.ts:30-37`.
- **Problema:** o handler de `connect` dispara
  `client.query("SET default_transaction_read_only = on; SET statement_timeout = '5s'")`
  com `void` + `.catch`. Há uma janela teórica: se a primeira `pool.query` do
  handler do 3c for despachada na mesma conexão antes do `SET` completar, ela
  rodaria sem `read_only`. Na prática o `pg` serializa as queries por conexão e o
  `connect` resolve antes da conexão ser entregue ao `acquire`, então a ordem é
  garantida. Além disso, o controle primário de read-only é o **role**
  `nexus_mcp_bi` (sem GRANT de escrita), que não depende do `SET`. O `SET` é
  reforço; mesmo que falhasse, o role já barra DML.
- **Recomendação:** nenhuma ação obrigatória — o role é o controle real e a
  ordenação do `pg` cobre a janela. Opcionalmente, mover os `SET` para a
  connectionString via parâmetro `options` (`-c default_transaction_read_only=on`)
  elimina a assincronia por completo.

---

## Pontos verificados e aprovados (sem achado)

- **Builders `raw→fato` (6 novos):** mapeamento consistente — `Number(x ?? 0)`
  para dinheiro, `selection`→`String` fail-safe, datas via `T00:00:00`, m2o via
  `relId`/`relNome`, `rawDeleted=false`, `markFatoBuilt(tx, …)` dentro da
  transação. `derivarTipoMovimento` (`fato-nota-fiscal.ts:45`) trata default
  `"outro"` com log, conforme I7.
- **`fato-nota-fiscal-item` (streaming em transação):** correto. `notaInfoMap`
  montado fora da transação; `$transaction` com `deleteMany` + loop cursor
  paginado de 5000 + `markFatoBuilt(tx)`; timeout 600s/maxWait 60s. Falha de
  chunk → rollback total (consequência natural da transação). COMMIT é o ponto de
  consistência — leitores concorrentes nunca veem estado parcial. Atende N2/N4.
- **`registry.ts`:** os 6 builders novos registrados, todos `cycle: "incremental"`,
  coerente com a SPEC §3 (fontes `incremental` no `MODEL_CATALOG`).
- **`FATO_FONTE` (`freshness.ts:39-47`):** cobre os 6 fatos novos, todos
  `incremental`, `model` plausível contra o `MODEL_CATALOG`. Sem isso o frescor
  sairia mudo (N3) — atendido.
- **Catálogo:** 33 tools, todos os 8 imports de domínio em `catalog/index.ts`;
  harness de integração valida igualdade de conjuntos (não só `length`).
- **RBAC:** `visibleTools`/`assertToolAllowed` aplicam gate de role antes de
  domínio; tools de domínio-vazio `sempreVisivel: true` sem `dominio` (I5);
  `bi_consulta_avancada` `gatedRoles: ["super_admin","admin"]`.
- **Segurança 3c — defesa ponta a ponta sólida:** role `nexus_mcp_bi` com
  `SELECT` só nos 12 fatos + suporte, sem `raw_*`, sem DML, `REVOKE CREATE`
  (C4 atendido); `default_transaction_read_only` + `statement_timeout` por
  conexão; AST guard rejeita multi-statement, não-`SELECT`, `SELECT INTO`,
  `FOR UPDATE` e CTE data-modifying; cap de 1000 linhas; pool isolado em módulo
  próprio nunca exposto no `ToolHandlerCtx`; fail-safe quando `MCP_BI_DATABASE_URL`
  ausente. Nenhum caminho de SQL perigoso passa sem ser barrado por pelo menos
  uma camada.
- **Audit sob role restrito:** `recordAudit` usa `createMany` (sem RETURNING),
  preservando `INSERT`-sem-`SELECT` do `nexus_mcp` — correto. Audit do 3c gravado
  pela conexão `nexus_mcp` (não o pool BI), SQL no campo `params`, `outcome` no
  enum padrão (`ok`/`denied`/`error`/`invalid_input`), sem valor `dynamic_query`.
- **Segredos:** nenhum segredo commitado. Scripts SQL usam placeholder
  `SUBSTITUIR_POR_SENHA_FORTE`; `.env.example` ganhou `MCP_BI_DATABASE_URL` como
  template sem valor.
- **Migration de enum:** `20260518105922_f4completo_enum_dominios` isolada, só
  `ADD VALUE` dos 5 valores novos, sem uso na mesma transação (C7 atendido).
- **Conformidade SPEC v3:** decisões N1–N8, C1–C7, I1–I8 verificadas no código —
  todas implementadas. Reescrita de `bi_consulta_avancada` para contrato `{sql}`
  + saída tabular conforme §3.7/§3.8.

## Bloqueadores de merge para produção

**Nenhum.** IMP-2 não é defeito de código — é um item obrigatório do runbook de
deploy [12]: o passo de aplicar/reaplicar os scripts SQL de role
(`2026-05-17-mcp-role.sql` e `2026-05-18-mcp-bi-role.sql`) deve constar
explicitamente no deploy assistido, senão o MCP sobe com `permission denied` nas
19 tools novas. Recomenda-se tratar IMP-1 (semântica de `vrNf` vs `vrProdutos`)
antes da F5 conectar o agente, mas não bloqueia o merge.
