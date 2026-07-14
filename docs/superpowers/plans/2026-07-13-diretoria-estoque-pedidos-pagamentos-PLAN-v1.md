# PLAN v1 , Diretoria: estoque por local, pedidos a atender, pagamentos por visão

**Spec:** `docs/superpowers/specs/2026-07-13-diretoria-estoque-pedidos-pagamentos-SPEC-v3.md`
**Branch:** `feat/diretoria-estoque-pedidos-pagamentos`
**Método:** TDD (`superpowers:test-driven-development`). Toda UI é feita **inline na
sessão principal** com `ui-ux-pro-max` , nunca delegada.

---

## Ordem das ondas e por quê

```
Onda 0  Locais (fundação)      ─┐
Onda A  Fatos limpos            ├─ dependências de dados. NADA depois delas funciona sem elas.
Onda B  Ingestão do atendimento ─┘
Onda C  Estoque (usa 0)
Onda D  Seriais (usa 0)
Onda E  B-04 + KPI demanda (usa A + B)
Onda F  Necessidade de compra + A-12 (usa 0 + A + B)   <- a onda que só existe se 0,A,B estiverem certas
Onda G  Pagamentos (independente das demais)
Onda H  MCP/Nex (usa A + B)
Onda I  Verificação E2E + docs
```

**Regra de ouro desta execução:** as ondas 0, A e B mexem em **dado**. Cada uma termina
com uma **medição contra o cache real** que bate com o número da spec. Se não bater, a
onda não fechou , não se avança para a UI em cima de dado errado.

**Rebuilds obrigatórios** (regra de raiz do projeto, `CLAUDE.md` §2.1):
- Onda 0, A, B (worker/fatos/sync) → `docker compose build app` + `up -d --force-recreate worker`
- Onda G (schema) → **todos** (app + mcp + worker)
- Onda H (mcp/**, reports/queries/**) → `docker compose up -d --build mcp`

---

## ONDA 0 , Classificação de local (fundação)

### T0.1 , Módulo puro de classificação (TDD)
- **Arquivo novo:** `src/lib/estoque/classificacao-local.ts`
- **Teste primeiro:** `src/lib/estoque/classificacao-local.test.ts`
- **API:**
  ```ts
  export type ClassificacaoLocal = "fisico" | "demonstracao" | "fora";
  export interface LocalBruto {
    odooId: number; nomeCompleto: string | null;
    estoqueEmMaos: boolean; calculaExtratoSaldo: boolean; temProprietario: boolean;
  }
  export function classificarLocal(l: LocalBruto): ClassificacaoLocal;
  export const SHOWROOM_ODOO_ID = 35;
  ```
- **Regra (ordem importa):**
  1. `odooId === 35` (Showroom) → `demonstracao` (exceção de negócio)
  2. `nomeCompleto` começa com `"Terceiros / Demonstração"` → `demonstracao`
  3. raiz (1º segmento de `nomeCompleto` por `" / "`) `=== "Próprio"` **e**
     `estoqueEmMaos` **e** `calculaExtratoSaldo` **e** `temProprietario` → `fisico`
  4. resto → `fora` (**fail-closed**)
- **Casos de teste obrigatórios (um por linha da tabela):**
  | entrada | esperado |
  |---|---|
  | id 11 `Próprio / Jds - Matriz DF`, em_maos=t, calc=t, prop=t | `fisico` |
  | id 29 `Próprio / ASTEC DF`, em_maos=t, **calc=f**, prop=t | `fora` |
  | id 35 `Próprio / Showroom` (exceção) | `demonstracao` |
  | id 271 `Próprio / INATIVO`, em_maos=f | `fora` |
  | id 251 `Terceiros / Demonstração` | `demonstracao` |
  | id 3 `Virtual` | `fora` |
  | id 2 `Terceiros` | `fora` |
  | `nomeCompleto = null` | `fora` (fail-closed) |
  | `nomeCompleto = ""` | `fora` |
  | `Terceiros / Demonstração / Cliente X` (filho) | `demonstracao` |
  | id 36 `Próprio / Jds Comércio - Matriz DF …` (razão social), em_maos=f | `fora` |
- **Verificação:** `npx jest src/lib/estoque/classificacao-local.test.ts` verde.

### T0.2 , Schema `FatoEstoqueLocal` + migration
- **Arquivo:** `prisma/schema.prisma`
- **Modelo:**
  ```prisma
  model FatoEstoqueLocal {
    odooId              Int      @id @map("odoo_id")
    nome                String?
    nomeCompleto        String?  @map("nome_completo")
    tipo                String?              // 'S' sintetico | 'A' analitico
    nivel               Int?
    localSuperiorId     Int?     @map("local_superior_id")
    estoqueEmMaos       Boolean  @default(false) @map("estoque_em_maos")
    calculaExtratoSaldo Boolean  @default(false) @map("calcula_extrato_saldo")
    temProprietario     Boolean  @default(false) @map("tem_proprietario")
    classificacao       String                // fisico | demonstracao | fora
    atualizadoEm        DateTime @default(now()) @map("atualizado_em")
    @@index([classificacao])
    @@map("fato_estoque_local")
  }
  ```
- **Comando:** `npx prisma migrate dev --name fato_estoque_local`
- **Protocolo de schema (CLAUDE.md):** avisar antes; rodar `agente schema-changed` depois.
- **Verificação:** `npx prisma generate` limpo; tabela existe no banco.

### T0.3 , Builder do `fato_estoque_local` (TDD)
- **Arquivo novo:** `src/worker/fatos/fato-estoque-local.ts`
- **Teste:** `src/worker/fatos/fato-estoque-local.test.ts` (mock do prisma; valida que
  `raw_deleted = true` é excluído e que a classificação vem do módulo puro)
- **Implementação:** lê `raw_estoque_local` **com `rawDeleted: false`**, mapeia
  `data->>'nome'`, `nome_completo`, `tipo`, `nivel`, `local_superior_id`,
  `estoque_em_maos`, `calcula_extrato_saldo`, `jsonb_typeof(proprietario_local_id)='array'`
  → `temProprietario`, aplica `classificarLocal()`, faz rebuild total (delete + createMany).
- **Registry:** `src/worker/fatos/registry.ts` → `{ nome: "fato_estoque_local", cycle: "snapshot", run: rebuildFatoEstoqueLocal }`
  (**`snapshot`**: cadastro de local muda raramente, e acompanha o `fato_estoque_saldo`,
  que também é snapshot).

### T0.4 , Medição contra o cache real (portão da onda)
- Rodar o builder e conferir, com SQL, **exatamente**:
  - `fisico`: **16 locais**, 4 com saldo, **R$ 29.852.652** a custo
  - `demonstracao`: **128 locais**, 35 com saldo, **R$ 1.562.449**
  - `fora`: **244 locais**, 3 com saldo, **R$ 16.318.304**
  - local **414** (JDS DEMO SP) **ausente** (está `raw_deleted` no Odoo)
- **Se não bater, a onda não fechou.** Registrar os números medidos no PROGRESSO.

---

## ONDA A , Fatos limpos (`raw_deleted`)

### TA.1 , Fix do `fato_pedido_item` (TDD)
- **Arquivo:** `src/worker/fatos/fato-pedido-item.ts:39-41`
- **Teste primeiro:** `src/worker/fatos/fato-pedido-item.test.ts` , inserir 1 item vivo +
  1 item `raw_deleted=true` e provar que **só o vivo** entra no fato (o teste falha antes
  do fix).
- **Fix:** adicionar `AND i.raw_deleted = false` ao `INSERT..SELECT`.
- **Medição:** antes **1.007** linhas mortas no fato; depois **0**. Soma do fato passa de
  R$ 65,30 mi para ~R$ 62,65 mi (bate com o cabeçalho). Validar no `PV-2051/26`: 42 itens
  → **4**.

### TA.2 , Auditoria dos builders por uso real
- **Método:** para cada arquivo em `src/worker/fatos/*.ts`, localizar as leituras de raw
  (`prisma.rawX.findMany` **e** `FROM raw_x` em SQL cru) e verificar se filtram
  `rawDeleted`/`raw_deleted`. **Não usar grep de string** (não enxerga camelCase , foi o
  erro que a review #2 pegou).
- **Para cada builder que lê raw sem filtrar:** medir quantas linhas mortas ele ingere
  hoje (`SELECT count(*) FROM raw_x WHERE raw_deleted`). Se > 0 → corrigir + teste. Se
  = 0 → registrar como "não vaza hoje, mas sem guarda" no relatório.
- **Entregável:** `docs/superpowers/plans/2026-07-13-auditoria-raw-deleted.md` com a
  tabela builder × raw × filtra? × linhas mortas hoje.
- **Já sabido:** `fato_pedido_item` vaza (1.007). `fato_pedido`, `fato_pedido_parcela`,
  `fato_estoque_saldo` estão OK.

---

## ONDA B , Ingestão do atendimento (a mais delicada)

### TB.1 , `extraFields` no catálogo (TDD)
- **Arquivos:** `src/worker/catalog/model-catalog.ts` (tipo + entrada),
  `src/worker/odoo/field-selection.ts`
- **Teste primeiro:** `src/worker/odoo/field-selection.test.ts` , provar que
  (a) campos `store=false` continuam excluídos por padrão; (b) os declarados em
  `extraFields` **entram**; (c) `excludeFields` continua vencendo.
- **Catálogo:**
  ```ts
  { odooModel: "sped.documento.item", mode: "incremental",
    cortePai: { ... },
    extraFields: ["quantidade_a_atender_pedido", "quantidade_atendida_pedido"] }
  ```

### TB.2 , Job de atendimento (TDD)
- **Arquivo novo:** `src/worker/sync/atendimento.ts`
- **Teste:** `src/worker/sync/atendimento.test.ts`
- **Contrato , cada ponto abaixo é um teste:**
  1. `search_read` em `sped.documento.item` com domínio `[["pedido_id","!=",false]]`
     **+ `corteDomain('sped.documento.item')`** , **ignorando `write_date`** (é o ponto
     central: o `write_date` do item não muda quando a entrega acontece).
  2. `fields = getModelFields(client, "sped.documento.item")` , que **já inclui** os
     `extraFields`. **NUNCA** pedir só os 2 campos computados: o upsert do raw
     **substitui o `data` inteiro** (`incremental.ts:100-106`) e isso **zeraria o
     `fato_pedido_item`** silenciosamente.
  3. **Paginado** com `PAGE_SIZE` (os 24.412 itens pesam **184 MB** como texto; o worker
     tem heap de 2 GB e **já sofreu OOM**).
  4. Upsert em `raw_sped_documento_item` (mesmo padrão do `syncIncremental`).
  5. Retorna `{ lidos, atualizados, duracaoMs }` para o log.
- **Teste de não-regressão explícito:** após o job, um item do raw **mantém** todas as
  chaves originais (`produto_id`, `quantidade`, `vr_produtos`, `pedido_id`…). Este teste
  existe porque a v2 da spec teria destruído o JSONB.

### TB.3 , Scheduler de 24 h
- **Arquivo:** `src/worker/index.ts`
- **Fato descoberto na review:** **não existe ciclo diário**. Os schedulers são
  `incremental` (3-10 min), `snapshot` (**30 min**) e `reconcile` (180 min).
- **Implementar:** novo `upsertJobScheduler` `JOB_ATENDIMENTO` na **`maintenanceQueue`**,
  `every: 24h`, com o **ciclo-lock** (`src/worker/sync/ciclo-lock.ts`) como os demais.
- **Config:** `sync.atendimento_interval_min` em `AppSetting` (default 1440), no mesmo
  padrão de `sync-config.ts`.
- **Teste:** o job é registrado; respeita o lock; não roda concorrente com o snapshot.

### TB.4 , Colunas de atendimento no fato + migration
- **Schema:** `FatoPedidoItem` ganha
  `quantidadeAAtender Decimal? @db.Decimal(18,4) @map("quantidade_a_atender")` e
  `quantidadeAtendida Decimal? @db.Decimal(18,4) @map("quantidade_atendida")`
- `npx prisma migrate dev --name pedido_item_atendimento`

### TB.5 , Builder lê os campos do JSONB
- **Arquivo:** `src/worker/fatos/fato-pedido-item.ts`
- Adicionar ao `INSERT..SELECT`:
  `(i.data->>'quantidade_a_atender_pedido')::numeric` e
  `(i.data->>'quantidade_atendida_pedido')::numeric` (com `COALESCE`, pois itens antigos
  ainda não terão o campo até o job rodar).
- **Teste:** item com o campo no JSONB → fato preenchido; item sem o campo → `null`, sem
  quebrar.

### TB.6 , E2E do ciclo (portão da onda)
- Rodar o job de verdade contra o Odoo, medir **duração** (esperado ~83 s para 23.365
  itens) e **heap**.
- Validar no cache:
  - `fato_pedido_item.quantidade_a_atender` preenchido;
  - Σ a atender nos 338 pedidos ABERTA pós-corte ≈ **5.694 unidades**;
  - o JSONB do raw **continua completo** (contar as chaves de um item antes/depois);
  - `PV-2051/26`: 4 itens, a atender coerente com o Odoo.
- **Teste de frescor (o bug que a review #1 pegou):** provar que o valor **atualiza**
  após uma entrega , comparar `quantidade_atendida` de um item antes e depois de rodar o
  job, num item cujo `write_date` seja anterior à última NF que o atendeu.

---

## ONDA C , Estoque (queries + UI)

### TC.1 , Queries de estoque filtram por classificação
- **Arquivo:** `src/lib/diretoria/queries/estoque.ts`
- Todas as queries de saldo (`queryIndicadoresEstoque`, `agrupaSaldo`,
  `queryEstoquePorLocal`, `queryEstoquePorFamilia`, `queryEstoquePorMarca`,
  `queryCatalogoEstoque`, `queryEstoqueGranular`, `queryIndicadoresAvancadosEstoque`)
  passam a **juntar com `fato_estoque_local`** e filtrar `classificacao = 'fisico'`.
- **Teste:** `estoque.test.ts` , saldo em local `fora` **não** entra no KPI; saldo em
  `demonstracao` **não** entra no físico.

### TC.2 , Query e KPI de demonstração
- Nova `queryEstoqueDemonstracao(prisma)` → `{ valor, unidades, locais, linhas[] }`
  (linhas = por local/cliente, ordenado por valor).
- **Teste:** valor = **R$ 1.562.449**, locais = **35**.

### TC.3 , Painel "Estoque em demonstração" (UI , inline + `ui-ux-pro-max`)
- Novo bloco **A-13** no catálogo (`src/lib/diretoria/builder/catalogo.ts`), tipo
  `tabela`, domínio `A`.
- Componente em `src/components/diretoria/blocos/blocos-estoque.tsx` + `case "A-13"`.
- Adicionar ao `PADROES_ABA` da aba `estoque` em
  `src/app/(protected)/diretoria/estoque/page.tsx`.
- Adicionar `demonstracao` ao `EstoqueData` e ao `Promise.all` da page.

### TC.4 , A-02 exibe a classificação
- Coluna "Tipo" (Físico / Demonstração) na tabela "Estoque por local".

---

## ONDA D , Seriais

### TD.1 , Schema `FatoSerialSaldo` + migration
```prisma
model FatoSerialSaldo {
  id            String   @id @default(uuid())
  odooId        Int      @unique @map("odoo_id")   // id da linha de rastreabilidade
  serial        String
  produtoId     Int?     @map("produto_id")
  produtoNome   String?  @map("produto_nome")
  localId       Int?     @map("local_id")
  localNome     String?  @map("local_nome")
  classificacao String                              // fisico | demonstracao | fora
  saldo         Decimal  @db.Decimal(18,4)
  valorCusto    Decimal? @db.Decimal(18,2) @map("valor_custo")
  atualizadoEm  DateTime @default(now()) @map("atualizado_em")
  @@index([classificacao])
  @@index([localId])
  @@index([serial])
  @@map("fato_serial_saldo")
}
```

### TD.2 , Builder (TDD)
- **Arquivo novo:** `src/worker/fatos/fato-serial-saldo.ts`
- Lê `raw_estoque_saldo_rastreabilidade_hoje` (**`raw_deleted = false`**), só
  **`saldo > 0`** e `lote_serie_id` preenchido. Junta com `fato_estoque_local` para a
  classificação e com `fato_produto` para o custo.
- **Registry:** `cycle: "snapshot"` (mesmo frescor do `fato_estoque_saldo`).
- **Teste:** saldo ≤ 0 não entra; sem serial não entra; classificação vem do local.

### TD.3 , Query + A-06 (UI , inline + `ui-ux-pro-max`)
- `querySeriais` reescrita: lê `fato_serial_saldo`, filtro por classificação (padrão
  `fisico`), retorna serial, produto, local, classificação, saldo.
- A-06 passa a ter as colunas **Serial · Produto · Local · Saldo** (+ filtro de
  classificação). Remove o aviso âmbar de "local não preenchido" (deixou de ser verdade).
- **Nota na tela:** o depósito **Jib DF** tem saldo mas **nenhum serial** , correto, nem
  todo produto é serializado.

### TD.4 , KPI de seriais e A-09 leem a fonte nova
- `queryIndicadoresEstoque` / `queryIndicadoresAvancadosEstoque`: o contador de "seriais
  em estoque" passa a vir de `fato_serial_saldo` (classificação `fisico`), **não** de
  `fato_serial`. Evita dois números na plataforma.

---

## ONDA E , B-04 + KPI de demanda

### TE.1 , Query de pendentes com "a atender × custo" (TDD)
- **Arquivo:** `src/lib/diretoria/queries/pedidos.ts`
- `queryDemandasPendentes` passa a somar, por pedido, `Σ (quantidadeAAtender ×
  fato_produto.preco_custo)` a partir de `fato_pedido_item` (**itens vivos**).
- Retorna também `itensSemCusto` e `produtosNaoEncontrados` (contadores expostos na
  tela).
- **Teste:** pedido com 10 un, 6 atendidas → valor = 4 × custo. Pedido 100% atendido →
  **R$ 0,00, mas presente na lista** (decisão #4).

### TE.2 , KPI B-01 a custo
- `queryIndicadoresDemandas`: `valorAEntregar` passa a ser **a custo, a atender**.
- Rótulo da tela ajustado para deixar explícito que é custo.

### TE.3 , B-04 e B-01 na tela (UI , inline + `ui-ux-pro-max`)
- Coluna "Valor" do B-04 → "A atender (custo)".
- Exibir os contadores de itens sem custo (padrão do KPI de estoque).

---

## ONDA F , Necessidade de compra + A-12

### TF.1 , Query de necessidade (TDD)
- **Arquivo:** `src/lib/diretoria/queries/estoque.ts`
- `queryNecessidadeCompra(prisma)`:
  - demanda por produto = Σ `quantidadeAAtender` das linhas vivas de pedidos
    `bucketDemanda='ABERTA'` e `dataOrcamento >= corte`;
  - saldo por produto = Σ saldos em locais `classificacao='fisico'`;
  - `necessidade = max(0, demanda − saldo)`; `custo = necessidade × preco_custo`;
  - **drill-down:** saldo por depósito (`localId`, `localNome`) para cada produto.
- **Teste:** produto com demanda 10 e saldo 3 → falta 7. Produto com saldo ≥ demanda →
  ausente da lista.

### TF.2 , A-12 corrigido
- `queryEstoqueDisponivelDiretoria`: usa **saldo físico** e **quantidade a atender**
  (hoje usa saldo total e quantidade cheia), e itens **vivos**.
- **Teste:** A-12 e necessidade **fecham entre si na mesma leitura**.

### TF.3 , Painel de necessidade (UI , inline + `ui-ux-pro-max`)
- Novo bloco **A-14** "Necessidade de compra", tipo `tabela`, domínio `A`, na aba
  `estoque`, **abaixo** do estoque (como o colaborador pediu).
- Colunas: Produto · Demanda a atender · Saldo físico · **Falta comprar** · Custo
  estimado. Linha expansível com o **saldo por depósito**.
- Texto curto na tela: a necessidade é **nacional**; o drill-down mostra **onde a
  mercadoria está**, para decidir entre transferir e comprar.

---

## ONDA G , Pagamentos (3 visões)

### TG.1 , Schema do título + migration
- `FatoFinanceiroTitulo` ganha
  `formaPagamentoNome String? @map("forma_pagamento_nome")` e
  `provisorio Boolean @default(false)`.
- `npx prisma migrate dev --name titulo_forma_pagamento`

### TG.2 , Builder do título (TDD)
- **Arquivo:** `src/worker/fatos/fato-financeiro-titulo.ts`
- Extrai `forma_pagamento_id[1]` → `formaPagamentoNome` e `provisorio`.
- **Teste:** título sem forma → `null` (e cai no balde "Não informado" na query).
- **Medição:** forma preenchida em **99,98%** (5.536/5.537).

### TG.3 , Query das 3 visões (TDD)
- **Arquivo:** `src/lib/diretoria/queries/vendas.ts` , `queryFormasPagamento` reescrita.
- Lê **`fato_financeiro_titulo`** (`tipo = 'a_receber'`), não mais
  `fato_pedido_parcela`.
- Visões:
  - **pago**: `notaFiscalId != null` **e** `vrSaldo <= 0`
  - **a_receber**: `notaFiscalId != null` **e** `vrSaldo > 0`
  - **carteira**: `notaFiscalId == null`
- Respeita **empresa** e **UF** (hoje não respeita , furo de RBAC: usuário restrito a UF
  vê o grupo inteiro).
- Retorna, por visão: fatias por forma de pagamento + total + **contagem de provisórios**.
- **Teste:** os três totais batem com **R$ 31,40 mi / R$ 28,25 mi / R$ 52,39 mi**;
  "Não informado" = **1 título, R$ 31.157,90**.

### TG.4 , C-07 com seletor de visão (UI , inline + `ui-ux-pro-max`)
- Seletor de visão (padrão **Pago**), donut da visão selecionada.
- Legenda de uma linha explicando cada visão (texto da spec §5.7).
- Aviso discreto quando houver título **provisório** na visão.

### TG.5 , C-05 e C-09 reapontados
- Ambos consomem a mesma query. Decidir e implementar: reapontar para a fonte nova ou
  manter a antiga explicitamente. **Não deixar órfão.**

---

## ONDA H , MCP / Agente Nex

### TH.1 , Tools alinhadas (TDD)
- `mcp/tools/comercial/demanda-em-aberta.ts`, `demanda-por-produto.ts`,
  `pedido-situacao.ts` e `src/lib/reports/queries/comercial.ts`:
  - passam a usar **quantidade a atender** (hoje usam a cheia , é o mesmo bug do B-04);
  - reportam **os dois valores**: a atender **a custo** e a atender **a preço de venda**.
- **Teste:** a tool não retorna mais o cabeçalho cheio; os dois valores vêm preenchidos.

### TH.2 , Rebuild do container `mcp`
- `docker compose up -d --build mcp` (regra de raiz , `mcp/**` e
  `src/lib/reports/queries/**` vivem no container `mcp`).
- Verificar a data da imagem (`docker image inspect`), não confiar no "Built".

---

## ONDA I , Verificação e documentação

### TI.1 , E2E contra o cache real (obrigatório antes de declarar pronto)
- Subir os serviços, rodar os ciclos (`snapshot`, `incremental`, `JOB_ATENDIMENTO`), e
  conferir **cada número** da §9 da spec:

  | # | Item | Alvo |
  |---|---|---|
  | 1 | KPI estoque | ~R$ 31,42 mi |
  | 2 | Demonstração | R$ 1.562.449 / 35 locais |
  | 3 | `fato_pedido_item` mortos | 0 (era 1.007) |
  | 4 | a atender (unidades, 338 pedidos) | ~5.694 |
  | 5 | B-04 | ~R$ 21,35 mi |
  | 6 | Seriais físicos | ~2.511 |
  | 7 | Pagamentos | 31,40 / 28,25 / 52,39 mi |
  | 8 | "Não informado" | 1 título, R$ 31,1 mil |
  | 9 | A-12 × necessidade | fecham na mesma leitura |

- Testar **na UI**, não só em SQL.

### TI.2 , `docs/kpis-diretoria.md`
- Atualizar **no mesmo commit** de cada mudança de KPI (regra do projeto): valor em
  estoque (só físico ÷ índice), demonstração, demanda a entregar (custo, a atender),
  seriais (nova fonte), formas de pagamento (3 visões, nova fonte).

### TI.3 , RADAR
- Registrar: etapa `Cancelado` como ABERTA (2 pedidos); `fato_serial` legado; filtros
  globais mortos; divergência de valorização Diretoria × Relatórios; doc do projeto que
  afirma "snapshot 24h" (é 30 min); necessidade de compra sem lead time/trânsito.

---

## Commits

Um commit atômico por task (ou por par teste+implementação). Mensagens em pt-br, sem
travessão. `docs/agents/HISTORY.md` atualizado nos marcos de onda.

## Definição de pronto

- `npx tsc --noEmit` limpo · `npm test` verde · `npx eslint` limpo
- Todos os números da TI.1 conferidos **contra o cache real**
- Containers rebuildados conforme o mapa de impacto
- `kpis-diretoria.md` atualizado
- Testado na UI pelo dono antes do PR ir para merge
