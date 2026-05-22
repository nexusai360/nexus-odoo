# F4 L2 — Bateria de validação de leitura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Construir e rodar `scripts/f4l-l2-harness.ts` — bateria que exerce as 45 tools de domínio e confere cada resultado contra o Odoo, produzindo um relatório de assertividade.

**Architecture:** Um script standalone. Para cada caso: monta `ctx` (prisma + UserContext super_admin), invoca `tool.handler(input, ctx)`, computa o esperado no Odoo (`search_count`/`read_group`/`search_read`), compara. Agrega num relatório. Inclui a conferência de fidelidade dos 114 modelos.

**Spec:** `docs/superpowers/specs/2026-05-22-f4-l2-bateria-leitura-spec.md` (v3).

**Tech Stack:** TypeScript, `tsx`, Prisma, `OdooClient`, sem OpenAI.

---

## Task 1: Infra do harness

**Files:** Create `scripts/f4l-l2-harness.ts`.

- [ ] **Step 1** — Esqueleto: imports (`prisma` de `src/worker/prisma`, `catalogo` de `mcp/catalog/index.js`, `clientFromEnv`), tipo `Caso` (`{ tool, input, descricao, conferir(res, odoo): Promise<{ok,esperado,obtido,nota}> }`), e `ctxDe(prisma)` que devolve `{ prisma, user }` com um `UserContext` super_admin de teste (todos os domínios).
- [ ] **Step 2** — Helpers Odoo: `contar(odoo, model, domain)` → `search_count`; `somar(odoo, model, domain, campo)` → `read_group` agregando `campo`; `agrupar(odoo, model, domain, campo, groupby)` → `read_group`.
- [ ] **Step 3** — Runner: itera os casos, invoca o handler, roda `conferir`, captura `preparando`/erro, acumula resultados.
- [ ] **Step 4** — `relatorio()`: agrega por tool e domínio, assertividade, grava `docs/superpowers/research/2026-05-22-l2-relatorio.md`.
- [ ] **Step 5** — Commit: `chore(f4-l2): infra do harness de validacao de leitura`.

## Task 2: Conferência de fidelidade (114 modelos)

- [ ] **Step 1** — Função `conferirFidelidade(odoo)`: percorre `MODEL_CATALOG`, compara `count` da tabela `raw_*` (via `prisma`) ao `search_count` do Odoo. Marca exato / divergência-de-janela.
- [ ] **Step 2** — Integra ao relatório (seção própria).
- [ ] **Step 3** — Commit: `feat(f4-l2): conferencia de fidelidade cache vs Odoo`.

## Task 3: Casos — estoque (6 tools)

- [ ] **Step 1** — Casos para `estoque_saldo_produto`, `estoque_valor_armazem`, `estoque_entradas_saidas`, `estoque_top_movimentados`, `estoque_produtos_parados`, `estoque_concentracao`. Conferência conforme a tabela §3.2 da spec (snapshot → `search_count`/`read_group` do modelo de origem; entradas/saídas → `read_group` por período).
- [ ] **Step 2** — Commit: `feat(f4-l2): casos de estoque`.

## Task 4: Casos — financeiro (6 tools)

- [ ] **Step 1** — Casos para `financeiro_saldo_contas`, `financeiro_caixa_periodo`, `financeiro_fluxo_caixa`, `financeiro_contas_a_receber`, `financeiro_contas_a_pagar`, `financeiro_titulos_vencidos`. Períodos com dado real descobertos do cache.
- [ ] **Step 2** — Commit: `feat(f4-l2): casos de financeiro`.

## Task 5: Casos — comercial (9 tools)

- [ ] **Step 1** — Casos para `comercial_pedidos_periodo`, `_por_etapa`, `_por_vendedor`, `_atrasados`, `comercial_parcelas_a_vencer`, `comercial_contar_pedidos`, `preco_produto`, `preco_tabela`, `preco_contar_regras`. `tabelaId` real descoberto do cache.
- [ ] **Step 2** — Commit: `feat(f4-l2): casos de comercial`.

## Task 6: Casos — fiscal (11 tools)

- [ ] **Step 1** — Casos para `fiscal_faturamento_periodo`, `_notas_emitidas`, `_notas_recebidas`, `_impostos_periodo`, `_faturamento_por_cliente`, `_produtos_faturados`, `_notas_recebidas_por_fornecedor`, `fiscal_apuracao`, `fiscal_carta_correcao`, `fiscal_contar_notas`, `fiscal_certificados`.
- [ ] **Step 2** — Commit: `feat(f4-l2): casos de fiscal`.

## Task 7: Casos — cadastros, contábil, domínios-vazios, referência (13 tools)

- [ ] **Step 1** — Casos para `cadastro_buscar_parceiro`, `cadastro_parceiros_por_uf`, `cadastro_contar_parceiros`, `servico_buscar`, `servico_listar`, `servico_contar`, `contabil_plano_de_contas`, `contabil_estrutura_conta`, `rh_status_dominio`, `crm_status_dominio`, `producao_status_dominio`, `referencia_buscar` (várias tabelas). `referencia_buscar` sozinha gera centenas de leituras (15 tabelas × códigos amostrados).
- [ ] **Step 2** — Commit: `feat(f4-l2): casos de cadastros, contabil, dominios-vazios e referencia`.

## Task 8: Rodar, relatório e correções

- [ ] **Step 1** — Garantir cache recente (ciclo de sync já rodado pelos smokes L1b/L1c; rodar `f4l-ingest.ts` se necessário).
- [ ] **Step 2** — Rodar `tsx --env-file=.env.local scripts/f4l-l2-harness.ts`.
- [ ] **Step 3** — Analisar o relatório. Cada divergência que não seja janela de sync é um bug: investigar, corrigir a tool/query/fato com teste de regressão, reexecutar.
- [ ] **Step 4** — `tsc` raiz+mcp, `eslint`, `jest`, `next build` verdes.
- [ ] **Step 5** — Commit final: `test(f4-l2): bateria de leitura executada — relatorio de assertividade`.

## Critérios de pronto (spec §4)

45 tools exercidas e conferidas contra o Odoo; fidelidade dos 114 modelos; relatório com assertividade e divergências; bugs corrigidos com regressão; verde.
