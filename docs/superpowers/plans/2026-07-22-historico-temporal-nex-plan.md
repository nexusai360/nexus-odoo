# PLANO , Histórico temporal no Agente Nex

> Versão: **v2 (final)**. Ciclo: v1 → 1 review adversarial → v2 (decisão do dono: 1 review só).
> Spec-fonte (v2, final): `docs/superpowers/specs/2026-07-22-historico-temporal-nex-spec.md`.
> Regras: TDD por unidade; perícia por onda; E2E contra dado real; sem merge/deploy; commits
> atômicos `GIT_AGENTE_BYPASS=1`; worker → `docker compose build app`; Opus sempre.
>
> **Correções v1→v2 (review do plano, evidência no código):** A-1 testes são CO-LOCALIZADOS
> (`mcp/tools/estoque/*.test.ts`, sem `__tests__/`); modelo = `concentracao.test.ts`. A-3
> Decimal→number (`.toNumber()`) no modo faixa. A-4 `ate` default é **datetime completo** de agora
> (date-only excluiria os pontos de hoje). A-5 `FORMATADORES` está em `responder.ts:2155`;
> formatador REAL é obrigatório; **NÃO** tocar `TOOLS_SEM_FORMATADOR_REAL` (2396) , o
> `envelope-contract.test.ts` se auto-ajusta. A-6 contagens de `integration.test.ts` mudam em 9
> asserções, em 2 describes (in-process + HTTP). B-1 extrair extratores puros para módulo folha
> (fronteira do worker). B-2 `jobOk` vem de `atendimentoSincronizado(prisma).ok`.

---

## Dados reais para E2E (A0 já sondado no cache `nexus_odoo_l1`)
- **saldo:** `produtoId=162, localId=11` (6 pontos em `fato_estoque_saldo_historico`); alt `52/11`.
- **preço:** TODAS as 12.008 chaves têm **1 ponto só** (`evento='mudanca'`, vigente) , o preço
  ainda não variou no cache; **máx. 1 faixa** por produto+tabela. Usar p.ex. `produtoId=13200,
  tabelaId=3, quantidadeMinima=0` (1 ponto). E2E de preço valida `ok`+1 ponto+valor correto; a
  riqueza de série multi-ponto e carry-forward é validada no SALDO. O modo "série por faixa"
  compila e roda (retorna 1 série na prática).

---

## ONDA A , Expor histórico existente (preço e saldo) [alto ROI, zero ingestão]

### A1. Tool `estoque_evolucao_preco`
- **A1.1 (TDD, teste primeiro)** `mcp/tools/estoque/evolucao-preco.test.ts` (CO-LOCALIZADO, sem
  `__tests__/`; modelo de ctx: `mcp/tools/estoque/concentracao.test.ts` , `makePrisma()` devolve
  stub com `fatoBuildState:{findMany}`, `syncState:{findMany}` e os models usados; `makeCtx()` =
  `{prisma, user}`). Mockar TODA a superfície que o handler+`serieDePreco` tocam:
  `appSetting.findUnique` (via `getCorteDados`), `fatoPrecoHistorico.findFirst`+`findMany`
  (+`findMany({distinct})` no modo faixa), `fatoCapturaRodada.findMany`, `fatoBuildState.findMany`,
  `syncState.findMany`. **Zerar o cache de 60s de `getCorteDados`** entre testes (é estado de
  módulo , importar e resetar, ou mockar `appSetting` de forma estável). Afirmar: (a) Zod rejeita
  sem `tabelaId`; (b) `quantidadeMinima` presente → `pontos[]` (1 série); (c) ausente → `series[]`
  (uma por faixa distinta); (d) `de/ate` default são strings concretas (não `undefined`) e `ate` é
  datetime de agora; (e) envelope tem `_RESPOSTA/_DESTAQUE/aviso`; (f) estado `ok`.
- **A1.2** `mcp/tools/estoque/evolucao-preco.ts`: `ToolEntry` `id:"estoque_evolucao_preco"`,
  `dominio:"estoque"`, seguindo `mcp/tools/comercial/pedido-historico-etapas.ts`. Input Zod (todos
  `.describe`): `produtoId:int`, `tabelaId:int` (obrigatório), `quantidadeMinima?:number`,
  `de?:string`, `ate?:string`. Handler:
  - `const ate = ateIn ?? new Date().toISOString()` (**A-4: datetime completo**);
    `const de = deIn ?? new Date(Date.now()-90*864e5).toISOString()`;
  - `quantidadeMinima` definido → `serieDePreco(prisma, produtoId, tabelaId, quantidadeMinima, de,
    ate)` (**B1: 4º arg posicional**);
  - ausente → `prisma.fatoPrecoHistorico.findMany({where:{produtoId,tabelaId},
    distinct:["quantidadeMinima"], select:{quantidadeMinima:true}})`; para cada faixa →
    `serieDePreco(prisma, produtoId, tabelaId, faixa.quantidadeMinima.toNumber(), de, ate)`
    (**A-3: `.toNumber()`**) → `series[]` (cada uma com `quantidadeMinima`);
  - `withFreshness(prisma, ["fato_preco"], ...)` (**INV-7: fato-base, não `_historico`**);
  - `_RESPOSTA` (nº pontos, inicial→final, faixas); `aviso` explica `inicial` (carry-forward,
    pode ser pré-corte) e `lacunas`.
  - Verificação: `npx tsc --noEmit` + teste A1.1 verdes.
- **A1.3** `mcp/tools/estoque/index.ts`: `import { estoqueEvolucaoPreco }` + entrada no array
  `estoqueTools`.
- **A1.4** `mcp/catalog/tool-triggers.data.ts`: chave `"estoque_evolucao_preco"` com 4-5 perguntas
  ("como o preço do produto X evoluiu", "histórico de preço do item Y na tabela Z", "o preço subiu
  ou caiu nos últimos meses", "variação de preço do produto ao longo do tempo").
- **A1.5** `mcp/lib/responder.ts`: criar `fmtEvolucaoPreco: FormatadorCanonico` (padrão dos `fmt*`)
  e mapear `estoque_evolucao_preco: fmtEvolucaoPreco` no objeto `FORMATADORES` (**linha 2155**).
  **NÃO** editar `TOOLS_SEM_FORMATADOR_REAL` (2396) nem `TOOLS_QUE_PRECISAM_FORMATADOR` (2303) , o
  formatador real basta e o `envelope-contract.test.ts` se auto-ajusta.

### A2. Tool `estoque_evolucao_saldo`
- **A2.1 (TDD)** `mcp/tools/estoque/evolucao-saldo.test.ts` (co-localizado): input aceita
  `{produtoId}` e `{produtoId, localId}`; `de/ate` default concretos (`ate` datetime de agora);
  carry-forward `inicial` presente quando há ponto anterior; estado `ok`. Mesma superfície de mock
  (trocando `fatoEstoqueSaldoHistorico` por `fatoPrecoHistorico`).
- **A2.2** `mcp/tools/estoque/evolucao-saldo.ts`: `id:"estoque_evolucao_saldo"`. Input:
  `produtoId:int`, `localId?:int`, `de?:string`, `ate?:string`. Handler materializa janela concreta
  (mesma regra A-4), chama `serieDeSaldo(prisma, produtoId, localId ?? undefined, de, ate)`
  (**B1: `undefined` explícito**), `withFreshness(prisma, ["fato_estoque_saldo"], ...)`. `_RESPOSTA`
  resume quantidade/valor inicial→final; `aviso` idem A1.
  Verificação: tsc + teste A2.1 verdes.
- **A2.3** `index.ts` (import + array).
- **A2.4** `tool-triggers.data.ts`: chave `"estoque_evolucao_saldo"` ("como o saldo do produto X
  evoluiu", "histórico de estoque do item Y", "o saldo desse produto subiu ou caiu", "evolução da
  quantidade em estoque no período").
- **A2.5** `responder.ts`: `fmtEvolucaoSaldo` + entrada em `FORMATADORES` (2155). (Mesma regra A-5.)

### A3. Atualizar contagens do catálogo (`mcp/__tests__/integration.test.ts`) [A-6]
- **A3.1** Adicionar `"estoque_evolucao_preco"` e `"estoque_evolucao_saldo"` ao array `ESTOQUE_IDS`
  (linhas ~100-111) , alimenta `TODOS_IDS` e os `toEqual([...].sort())` (l.310 e ~648).
- **A3.2** Ajustar as asserções `toHaveLength` (somando 2 read-tools de estoque):
  - `120 → 122`: linhas **273, 310, 318, 641**.
  - `129 → 131`: linha **296** (catálogo bruto read+write).
  - `33 → 35`: linhas **329, 666** (manager estoque+financeiro).
  - `18 → 20`: linhas **340, 685** (viewer estoque).
  - Inalteradas: **351** (`21`), **359** (`6`).
  Rodar o teste e conferir o número real do erro para cada uma (não chutar).
  Verificação: `npx jest mcp/__tests__/integration.test.ts` + `mcp/__tests__/envelope-contract.test.ts` verdes.

### A4. Perícia + verificação da Onda A
- **A4.1** Perícia (auto): grep `_historico` nos 2 arquivos de tool → zero em `withFreshness`;
  `undefined`/`.toNumber()` corretos; `ate` datetime (não date-only); janela nunca `undefined`;
  registro nos 5 pontos (grep dos 2 ids em index/triggers/responder/integration).
- **A4.2** E2E contra dado real: script node que importe as tools + um PrismaClient real do cache;
  chamar com os ids de A0 (saldo 162/11; preço 13200/3/0) e conferir: estado `ok` (não
  `preparando`), série bate com `SELECT`, carry-forward correto (saldo), modo série-por-faixa OK.
- **A4.3** `tsc` + `eslint` + `jest` (tools + integration + envelope-contract) verdes.
- **A4.4** Commit atômico: `feat(mcp): tools estoque_evolucao_preco e estoque_evolucao_saldo`
  (`GIT_AGENTE_BYPASS=1`). Atualizar STATUS.md.

---

## ONDA B , Historizar valores do pedido (`fato_pedido_valor_historico`)

### B0. Extrair extratores puros (fronteira do worker) [B-1]
- **B0.1** Criar módulo folha `src/lib/diretoria/pedido-extratores.ts` movendo `extrairRentabilidade`
  e `extrairDesconto` (hoje em `entregas-parciais.ts:222,237`) , funções puras `(data)=>...`.
  Reexportar de `entregas-parciais.ts` para não quebrar a tela. Motivo: importar `entregas-parciais`
  no worker arrasta grafo com risco de `server-only`/`next/*`. Verificação: tela e testes existentes
  seguem verdes; `tsc`.

### B1. Schema + migration
- **B1.1** `prisma/schema.prisma`: model `FatoPedidoValorHistorico` (`@@map`), campos spec §4.1
  (chave `pedidoId`; `rodadaId/capturadoEm/evento/vigente`; núcleo + snapshot; `Decimal?` valores,
  `DateTime?` `dataPrevista`), espelhando `FatoPrecoHistorico`. Comentar que o índice único parcial
  vive só no SQL cru.
- **B1.2** `npx prisma migrate dev --name fato_pedido_valor_historico`; editar a migration para
  acrescentar em SQL cru `CREATE UNIQUE INDEX ... ("pedido_id") WHERE "vigente"` + índices
  `(pedido_id, capturado_em)`, `(capturado_em)`, `(rodada_id)` (modelo:
  `prisma/migrations/20260719171725_frente_b_historico_temporal/migration.sql`).
- **B1.3** Avisar schema entre worktrees ANTES; `agente schema-changed` DEPOIS; `npx prisma
  generate`. Verificação: `\d fato_pedido_valor_historico` mostra o índice parcial.

### B2. Leitor de valores do pedido (unidade própria , M2)
- **B2.1 (TDD)** teste de `lerValoresPedido(prisma)`: por `pedidoId`, núcleo+snapshot de `fato_pedido`
  (etapa/vrProdutos/dataPrevista) + `raw_pedido_documento.data` via `extrairRentabilidade`/
  `extrairDesconto` (de `pedido-extratores.ts`, B0), sem recomputar.
- **B2.2** Implementar em `src/worker/fatos/`. Verificação: teste verde + tsc.

### B3. Agregação saldo a atender item→pedido (unidade própria , M3)
- **B3.1 (TDD)** `agregarSaldoAtenderPorPedido(prisma)`: soma `aAtenderDoItem` por pedido (venda e
  custo); `jobOk` obtido de `atendimentoSincronizado(prisma).ok` (**B-2**, global); se `false`,
  sinaliza "adiar" (não retorna número cheio).
- **B3.2** Implementar reusando `aAtenderDoItem`/`custoDe` de `atendimento-item.ts` e
  `atendimentoSincronizado` de `atendimento-status.ts`. Verificação: teste verde.

### B4. Builder `captura-pedido-valor.ts` (TDD)
- **B4.1 (TDD)** `src/worker/fatos/captura-pedido-valor.test.ts`: base (todos, vigente), sem-mudança
  (0), mudança de núcleo (só alterado, vigente migra), baixa (`evento='baixa'` NULL), `jobOk=false`
  (rodada adiada, 0 linhas), guarda recalibrada (baixas > teto próprio → recusada).
- **B4.2** `src/worker/fatos/captura-pedido-valor.ts`: `SERIE="pedido_valor"`, reusa `captura-serie.ts`
  + `calcularDelta` + `decidirRodada` (teto próprio parametrizável). Monta `LinhaSerie` por
  `pedidoId` (B2+B3); delta contra vigente; grava em lotes na transação (padrão `capturarPreco`).
  Verificação: teste B4.1 + tsc.

### B5. Agendar no worker
- **B5.1** `src/worker/sync/processors.ts`: `capturarPedidoValor(ctx.prisma)` em
  `processIncrementalCycle`, gate `origem==="cron"` + `fato_pedido.ok`, try/catch isolado.
- **B5.2** `docker compose build app` + `docker compose up -d --force-recreate worker`; conferir
  `docker image inspect nexus-odoo:local --format '{{.Created}}'` = agora.

### B6. Perícia + E2E + commit (Onda B)
- Perícia INV-1..INV-9. E2E: 1 captura real → 1 vigente por pedido, 2ª rodada = 0; medir taxa de
  baixa e calibrar teto (M4). Commit atômico + STATUS.md + `docs/kpis-diretoria.md`.

---

## ONDA C , Tools temporais do pedido/carteira no Nex (depende de B)

### C1. `comercial_evolucao_pedido`
- Query core em `src/lib/reports/queries/` (série de 1 pedido de `fato_pedido_valor_historico`,
  corte + carry-forward, padrão `serie-historico.ts`) + `ToolEntry` comercial + 5 pontos de registro
  (incl. `integration.test.ts` contagens comercial + `envelope-contract`) + TDD + E2E.
  `withFreshness(["fato_pedido"])` (INV-7).

### C2. `comercial_evolucao_carteira`
- Query de agregação mensal (saldo a entregar/faturar) + tool + registro + TDD + E2E.

### C3. `comercial_rampa_cbs_ibs`
- Query de agregação mensal de `vrCbs`/`vrIbs` + tool + registro + TDD + E2E (depende de CBS/IBS no
  núcleo, §5.2 spec).

### C4. Auditar (não criar) aging de etapa
- Revisar `comercial_pedido_historico_etapas` / `_travados_por_etapa`; estender só se faltar. NÃO
  criar tool nova (M6).

### C5. Consolidação
- `docs/kpis-diretoria.md` (fonte de cada métrica histórica). STATUS.md/HISTORY.md. Perícia final +
  E2E. Commit atômico.

---

## Notas de execução
- Sem UI nesta frente. Arquivos compartilhados (`index.ts`/`responder.ts`/`tool-triggers`/
  `integration.test.ts`) integrados inline pelo orquestrador para evitar conflito.
- Cada tool NOVA muda contagens em `integration.test.ts` (2 describes) , atualizar junto.
