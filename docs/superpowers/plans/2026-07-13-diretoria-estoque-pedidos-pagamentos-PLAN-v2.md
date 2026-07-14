# PLAN v2 , Diretoria: estoque por local, pedidos a atender, pagamentos por visão

**Spec:** `.../specs/2026-07-13-diretoria-estoque-pedidos-pagamentos-SPEC-v3.md`
**Branch:** `feat/diretoria-estoque-pedidos-pagamentos`
**Versão:** v2 (v1 + review adversarial #1 do plano , 18 achados, 5 bloqueantes)
**Método:** TDD. **Toda UI é feita inline na sessão principal com `ui-ux-pro-max`.**

> **O que a review #1 do plano derrubou:**
> 1. `fato_financeiro_titulo` **não tem `empresa_id`** , o filtro por empresa da Onda G
>    era impossível.
> 2. A Onda G não dizia **qual data nem qual coluna de valor** , só uma combinação
>    (`data_documento` + `vr_documento`) reproduz os números da spec.
> 3. **C-05 não consome a query de pagamentos** (premissa falsa), e existe uma tela
>    inteira , **`vendas-screen.tsx`** , que consome e que o plano não citava: mudar o
>    retorno **quebraria o `tsc`**.
> 4. O **ciclo-lock é por `jobName`**: um lock `JOB_ATENDIMENTO` não bloqueia nada, e a
>    `maintenanceQueue` **não usa lock**. O job rodaria concorrente com o incremental e
>    com o rebuild do fato.
> 5. A Onda H esquecia **7 tools de estoque do MCP** que também divergiriam da tela.
> Mais: o custo do job é **~4-8 min** (não 83 s), o `corteDomain` do item é **no-op**, o
> `COALESCE(...,0)` **zeraria o B-04**, e os gates por igualdade literal **já não batem**
> (o cache anda).

---

## Ordem das ondas

```
Onda 0  Locais (fundação)       ─┐
Onda A  Fatos limpos             ├─ dado. Nada depois funciona sem elas.
Onda B  Ingestão do atendimento ─┘  <- Onda E/F/H só fecham depois do job TER RODADO (não de ter sido registrado)
Onda C  Estoque (usa 0)
Onda D  Seriais (usa 0)
Onda E  B-04 + KPIs de demanda (usa A + B)
Onda F  Necessidade de compra + A-12 (usa 0 + A + B)
Onda G  Pagamentos (independente)
Onda H  MCP/Nex (usa 0 + A + B + D)
Onda I  Verificação E2E + docs
```

**Rebuilds** (`CLAUDE.md` §2.1): ondas 0/A/B → `docker compose build app` +
`up -d --force-recreate worker`. Onda G (schema) → **todos**. Onda H → `up -d --build mcp`.
**Verificar a data da imagem** (`docker image inspect nexus-odoo:local --format '{{.Created}}'`),
nunca confiar no "Built".

---

## Convenção dos gates (correção do achado #11)

Os gates **não são igualdade literal** , o cache anda entre a medição e a execução.
Cada gate tem **banda de tolerância** e o **SQL explícito**.

**Armadilha obrigatória em todo SQL de valor de estoque:** filtrar **`quantidade > 0`**
(é a regra real do KPI, `estoque.ts:56`). Sem isso, "fora" dá R$ 5,92 mi em vez de
R$ 16,3 mi, porque o local **`Virtual` tem custo negativo (-R$ 149.336)**.

Tolerâncias: **±1** em contagens de locais/pedidos, **±0,5%** em valores.

---

## ONDA 0 , Classificação de local (fundação)

### T0.1 , Módulo puro (TDD)
- **Novo:** `src/lib/estoque/classificacao-local.ts` + `.test.ts` (teste primeiro).
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
- **Regra (a ordem importa):**
  1. `odooId === 35` → `demonstracao` (única exceção de negócio)
  2. `nomeCompleto` começa com `"Terceiros / Demonstração"` → `demonstracao`
  3. raiz `=== "Próprio"` **e** `estoqueEmMaos` **e** `calculaExtratoSaldo` **e**
     `temProprietario` → `fisico`
  4. resto → `fora` (**fail-closed**)
- **Casos de teste (um por linha):** id 11 (t,t,t) → `fisico`; id 29 ASTEC (t,**f**,t) →
  `fora`; id 35 Showroom → `demonstracao`; id 271 INATIVO (f) → `fora`; id 251
  `Terceiros / Demonstração` → `demonstracao`; filho de Demonstração → `demonstracao`;
  id 3 `Virtual` → `fora`; id 2 `Terceiros` → `fora`; id 36 (razão social, em_maos=f) →
  `fora`; `nomeCompleto = null` → `fora`; `nomeCompleto = ""` → `fora`.

### T0.2 , Schema `FatoEstoqueLocal` + migration
```prisma
model FatoEstoqueLocal {
  odooId              Int      @id @map("odoo_id")
  nome                String?
  nomeCompleto        String?  @map("nome_completo")
  tipo                String?
  nivel               Int?
  localSuperiorId     Int?     @map("local_superior_id")
  estoqueEmMaos       Boolean  @default(false) @map("estoque_em_maos")
  calculaExtratoSaldo Boolean  @default(false) @map("calcula_extrato_saldo")
  temProprietario     Boolean  @default(false) @map("tem_proprietario")
  classificacao       String
  atualizadoEm        DateTime @default(now()) @map("atualizado_em")
  @@index([classificacao])
  @@map("fato_estoque_local")
}
```
- `npx prisma migrate dev --name fato_estoque_local`
- **Protocolo de schema:** avisar antes; `agente schema-changed` depois.

### T0.3 , Builder (TDD, teste de **integração**)
- **Novo:** `src/worker/fatos/fato-estoque-local.ts` + `.test.ts`
- Lê `raw_estoque_local` **com `rawDeleted: false`**; mapeia `nome`, `nome_completo`,
  `tipo`, `nivel`, `local_superior_id`, `estoque_em_maos`, `calcula_extrato_saldo`,
  `jsonb_typeof(proprietario_local_id)='array'` → `temProprietario`; aplica
  `classificarLocal()`; rebuild total.
- **Registry:** `{ nome: "fato_estoque_local", cycle: "snapshot", run: rebuildFatoEstoqueLocal }`
- **Ordem no registry (achado #2 da review):** `fato_estoque_local` **antes** de
  `fato_estoque_saldo` e de `fato_serial_saldo` , os dois fazem join nele. Confirmar que
  o registry executa **na ordem do array** (ler `src/worker/fatos/index.ts`); se não
  executar, tornar a dependência explícita.

### T0.4 , GATE da onda (medição real)
```sql
SELECT l.classificacao, count(DISTINCT l.odoo_id) locais,
       count(DISTINCT s.local_id) com_saldo,
       round(sum(s.quantidade * coalesce(p.preco_custo,0)),2) valor
FROM fato_estoque_local l
LEFT JOIN fato_estoque_saldo s ON s.local_id = l.odoo_id AND s.quantidade > 0   -- <<< obrigatório
LEFT JOIN fato_produto p ON p.odoo_id = s.produto_id
GROUP BY 1;
```
| classe | locais (±1) | c/ saldo | valor (±0,5%) |
|---|---|---|---|
| `fisico` | 16 | 4 | R$ 29.852.652 |
| `demonstracao` | ~128 | 35 | R$ 1.562.449 |
| `fora` | 244 | 3 | R$ 16.318.304 |

Local **414** ausente (está `raw_deleted` no Odoo). Registrar os números medidos no
PROGRESSO.

---

## ONDA A , Fatos limpos

### TA.1 , Fix do `fato_pedido_item` (teste de **integração**, não mock)
- **Arquivo:** `src/worker/fatos/fato-pedido-item.ts` , a cláusula a corrigir está no
  **`WHERE` (linhas ~41-42)**, não no LEFT JOIN.
- **Teste (achado #18):** o builder usa `$executeRaw` dentro de `$transaction` , **mock de
  prisma não exercita SQL cru**. O teste tem que ser de **integração contra o Postgres**:
  semear 1 item vivo + 1 `raw_deleted=true`, rodar o builder, provar que só o vivo entra.
- **Fix:** `AND i.raw_deleted = false`.
- **Gate:** linhas mortas no fato: **~1.007-1.009 → 0**. Soma do fato ≈ cabeçalho
  (~R$ 62,65 mi, era R$ 65,30 mi). `PV-2051/26`: 42 itens → **4**.

### TA.2 , Auditoria de `raw_deleted` por uso real
- **Método:** para cada `src/worker/fatos/*.ts`, achar as leituras de raw
  (`prisma.rawX.findMany` **e** `FROM raw_x` em SQL cru) e verificar o filtro. **Não usar
  grep de string** (não enxerga `rawDeleted:` camelCase , foi o erro da review anterior).
- Para cada builder sem filtro: medir `SELECT count(*) FROM raw_x WHERE raw_deleted`.
  **> 0 → corrigir + teste. = 0 → registrar** como "não vaza hoje, sem guarda".
- **Entregável:** `docs/superpowers/plans/2026-07-13-auditoria-raw-deleted.md`.
- Já sabido: `fato_pedido_item` vaza; `fato_pedido`, `fato_pedido_parcela`,
  `fato_estoque_saldo` OK.

---

## ONDA B , Ingestão do atendimento (a mais arriscada)

### TB.1 , `extraFields` no catálogo (TDD)
- **Arquivos:** `src/worker/catalog/model-catalog.ts` (tipo + entrada),
  `src/worker/odoo/field-selection.ts`
- **Testes:** (a) `store=false` continua excluído por padrão; (b) os de `extraFields`
  **entram**; (c) `excludeFields` continua vencendo.
- **Efeito colateral a registrar (achado #17):** `getModelFields` memoiza **por modelo**,
  então o **incremental normal** de `sped.documento.item` também passará a pedir os 2
  campos computados. É **desejável** (mantém o JSONB coerente entre os ciclos) e barato
  (só registros alterados). **Medir** o impacto no tempo do incremental e registrar.

### TB.2 , Job de atendimento (TDD)
- **Novo:** `src/worker/sync/atendimento.ts` + `.test.ts`
- **Contrato , cada item é um teste:**
  1. `search_read` em `sped.documento.item`, domínio **`[["pedido_id","!=",false]]`**,
     **ignorando `write_date`** (o `write_date` do item **não muda** quando a entrega
     acontece , é a razão de existir deste job).
  2. **Corte (achado #9):** `corteDomain('sped.documento.item')` **retorna `[]`** , o
     modelo tem `cortePai`, não `corte` (`corte.ts:34-38`, `model-catalog.ts:96`). Ou
     seja, aplicá-lo é **no-op**. **Decisão:** usar domínio explícito
     `["documento_id.data_emissao", ">=", CORTE_INGESTAO_ISO]` **além** do `pedido_id`,
     para não reingerir o que o purge (`src/worker/limpa/alvos.ts`) removeu.
     Verificado: dos 23.397 itens com `pedido_id`, **todos** têm pai com
     `data_emissao >= 2026-01-01` , o filtro não perde nada hoje, mas protege o futuro.
  3. `fields = getModelFields(client, "sped.documento.item")` , **TODOS** os campos (299
     `store=true` + 2 computados). **NUNCA** pedir só os 2: o upsert do raw
     **substitui o `data` inteiro** (`incremental.ts:100-106`) e isso **zeraria o
     `fato_pedido_item`** em silêncio.
  4. **Paginado.** `PAGE_SIZE` é **privado** em `incremental.ts:8` (achado #16) →
     **exportá-lo** (ou declarar no módulo novo). Payload real: **~196 MB**, worker com
     heap de 2 GB e **histórico de OOM**.
  5. Upsert em `raw_sped_documento_item` (mesmo padrão do `syncIncremental`).
  6. Retorna `{ lidos, atualizados, duracaoMs }`.
- **Teste de não-regressão obrigatório:** após o job, um item do raw **mantém todas as
  chaves** originais (`produto_id`, `quantidade`, `vr_produtos`, `pedido_id`, …).

### TB.3 , Scheduler de 24 h **com o lock certo**
- **Arquivo:** `src/worker/index.ts`
- **Fatos (achado #4):** o lock é por `jobName`
  (`lockKeyCiclo = odoo-sync:lock:${jobName}`, `ciclo-lock.ts:36`) e o
  `maintenanceWorker` **não usa lock nenhum**. Um lock `JOB_ATENDIMENTO` **não bloquearia
  nada**, e o job faria upsert em `raw_sped_documento_item` **ao mesmo tempo** que o
  `syncIncremental` e que o `rebuildFatoPedidoItem` (`DELETE + INSERT..SELECT` em
  transação).
- **Implementar:** seguir o padrão do **`JOB_ONDEMAND`** (`index.ts:387-404`): o handler
  do `JOB_ATENDIMENTO` **adquire o lock de `JOB_INCREMENTAL`** e **pula** se ocupado.
  Isso exige injetar o `cicloLock` no handler da `maintenanceQueue` (hoje ele não o
  conhece).
- **Disparo no boot (achado #7):** `upsertJobScheduler(JOB_ATENDIMENTO, { every: 24h })`
  **+ `maintenanceQueue.add(JOB_ATENDIMENTO, {})`** , é o padrão do próprio repo
  (`JOB_REFRESH_USD_BRL:512`, `JOB_SNAPSHOT_ESTOQUE:522`, `JOB_PROFILE_AGGREGATE:533`).
  Sem isso o job só rodaria 24 h depois do deploy.
- **Timeout:** o `CYCLE_HARD_TIMEOUT_MS` (10 min) **não cobre** a fila de manutenção ,
  definir timeout próprio (o job leva 4-8 min; usar **15 min**).

### TB.3b , Config do intervalo (achado #10)
- `aplicarAgendamento` (`index.ts:293-323`) tem **early-return** comparando **só** os 3
  intervalos existentes , um campo novo em `SyncConfig` **não reagendaria nada**. E ele
  só mexe na `syncQueue`, não na `maintenanceQueue`.
- **Superfície completa a tocar:** `sync-config.ts` (`SyncConfig` +
  `SYNC_CONFIG_DEFAULTS` + `KEY_MAP`), `src/lib/validations/sync-config.ts`, o form de
  `/configuracao`, a server action, **e** o `aplicarAgendamento` (incluir o campo novo na
  comparação **e** reagendar a `maintenanceQueue`).
- **Alternativa aceita (mais simples, decidir na execução):** **não** tornar configurável
  na tela nesta entrega , fixar 24 h no código e registrar no RADAR. Se escolher esta,
  TB.3b é só o registro.

### TB.4 , Colunas no fato + migration
- `FatoPedidoItem` ganha
  `quantidadeAAtender Decimal? @db.Decimal(18,4) @map("quantidade_a_atender")` e
  `quantidadeAtendida Decimal? @db.Decimal(18,4) @map("quantidade_atendida")`.
  **Nullable de propósito** (ver TB.5).
- `npx prisma migrate dev --name pedido_item_atendimento`

### TB.5 , Builder lê os campos , **NULL nunca vira 0** (achado #7)
- `src/worker/fatos/fato-pedido-item.ts`: no `INSERT..SELECT`,
  `(i.data->>'quantidade_a_atender_pedido')::numeric` **sem `COALESCE` para 0**.
- **Por quê:** item ainda não visitado pelo job **não tem** o campo. `COALESCE(...,0)`
  faria **todo pedido aparecer com R$ 0,00** no B-04 até o job rodar. `NULL` = "não sei",
  e as queries tratam `NULL` como **desconhecido**, nunca como zero.
- **Contrato das queries (Ondas E/F/H):** enquanto houver `NULL`, o pedido usa a
  **quantidade cheia** como fallback **e a tela sinaliza** "atendimento ainda não
  sincronizado". Depois do primeiro job, não há mais `NULL`.
- **Teste:** item com o campo → preenchido; item sem o campo → `NULL` (não 0).

### TB.6 , E2E do ciclo (GATE da onda)
- Rodar o job de verdade. **Custo real medido na review: ~237 s só de leitura**
  (500 recs / ~5 s / 4,2 MB, 23.397 itens, 301 campos) **+ os upserts** → **esperado 4-8
  min**. (O "83 s" da spec estava subestimado em 3-5x , corrigir o critério.)
- Validar:
  - `fato_pedido_item.quantidade_a_atender` preenchido, **sem `NULL`**;
  - Σ a atender nos pedidos ABERTA pós-corte ≈ **5.694 un** (±0,5%);
  - o **JSONB do raw continua completo** (contar chaves de um item antes/depois: ~301);
  - `PV-2051/26` coerente com o Odoo;
  - **heap** do worker durante o job (histórico de OOM).
- **Teste de frescor (o bug da review #1 da spec):** provar que o valor **atualiza** após
  uma entrega , escolher um item cujo `write_date` seja anterior à última NF que o
  atendeu, e comparar antes/depois do job.

---

## ONDA C , Estoque

### TC.1 , `agrupaSaldo` reestruturado (achado #12)
- `agrupaSaldo` (`estoque.ts:119-154`) hoje agrupa **por string** (`localNome` é a
  chave). Isso é exatamente o que a spec proíbe , e há **dois locais com o nome idêntico
  `Próprio / INATIVO`** (ids 14 e 271).
- **Refatorar:** chave = **`localId`**, rótulo = `localNome`. Família/marca continuam por
  nome (não têm o problema).
- **Teste:** dois locais de mesmo nome e ids diferentes **não** colapsam numa linha só.

### TC.2 , Queries de estoque filtram `fisico`
- `queryIndicadoresEstoque`, `queryEstoquePorLocal`, `queryEstoquePorFamilia`,
  `queryEstoquePorMarca`, `queryCatalogoEstoque`, `queryEstoqueGranular`,
  `queryIndicadoresAvancadosEstoque`: join com `fato_estoque_local`, filtro
  `classificacao = 'fisico'`.
- **Teste:** saldo em local `fora` não entra no KPI; saldo em `demonstracao` não entra no
  físico.
- **Gate:** KPI = **~R$ 31,42 mi** (R$ 29.852.652 / 0,95), ±0,5%.

### TC.3 , Query de demonstração
- Nova `queryEstoqueDemonstracao(prisma)` → `{ valor, unidades, locais, linhas[] }`.
- **Gate:** R$ 1.562.449 / 35 locais (±0,5% / ±1).

### TC.4 , Painel A-13 "Estoque em demonstração" (UI , inline + `ui-ux-pro-max`)
- Bloco **A-13** no `catalogo.ts` (tipo `tabela`, domínio `A`); componente + `case` em
  `blocos-estoque.tsx`; entrada em `PADROES_ABA.estoque`
  (`src/app/(protected)/diretoria/estoque/page.tsx:86`); campo em `EstoqueData` e no
  `Promise.all` da page.
- **Nota (achado #13):** `PADROES_ABA` só vale **quando não há layout salvo**
  (`page.tsx:112`). Hoje só existem 2 layouts salvos, com chaves antigas
  (`estoque-demo`, `vendas`) , **nenhum** com as chaves das abas atuais, então os blocos
  novos **aparecem**. Registrar: quem salvar layout depois precisará adicionar o bloco
  pelo construtor (é o comportamento esperado da ferramenta).

### TC.5 , A-02 com a classificação (resolve a contradição do achado #12)
- **A contradição:** se o A-02 só mostra `fisico`, uma coluna "Tipo" seria constante.
- **Decisão:** o A-02 mostra **os locais físicos** (é o "Estoque por local" do estoque
  vendável) e ganha um **rodapé** com o total excluído (demonstração e fora), com link
  para o A-13. Sem coluna constante.

---

## ONDA D , Seriais

### TD.1 , Schema `FatoSerialSaldo` + migration
```prisma
model FatoSerialSaldo {
  id            String   @id @default(uuid())
  odooId        Int      @unique @map("odoo_id")
  serial        String
  produtoId     Int?     @map("produto_id")
  produtoNome   String?  @map("produto_nome")
  localId       Int?     @map("local_id")
  localNome     String?  @map("local_nome")
  classificacao String
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
- **Novo:** `src/worker/fatos/fato-serial-saldo.ts`
- Lê `raw_estoque_saldo_rastreabilidade_hoje` (`raw_deleted = false`), só **`saldo > 0`**
  e `lote_serie_id` preenchido; join com `fato_estoque_local` (classificação) e
  `fato_produto` (custo).
- **Registry:** `cycle: "snapshot"`, **depois** do `fato_estoque_local`.

### TD.3 , Query + A-06 (UI , inline + `ui-ux-pro-max`)
- `querySeriais` reescrita sobre `fato_serial_saldo`, filtro por classificação (padrão
  `fisico`); colunas **Serial · Produto · Local · Saldo**.
- Remover o aviso âmbar de "local não preenchido" (deixou de ser verdade).
- **Nota na tela:** o depósito **Jib DF** tem saldo mas **nenhum serial** (nem todo
  produto é serializado) , a A-06 mostra 3 depósitos onde a A-02 mostra 4.
- **Gate:** ~**2.511** seriais físicos (1.235 + 749 + 527), ±0,5%.

### TD.4 , KPI de seriais e A-09 na fonte nova
- O contador de "seriais em estoque" passa a vir de `fato_serial_saldo`
  (`classificacao='fisico'`), **não** de `fato_serial`. Evita dois números.

---

## ONDA E , Demanda (B-01, B-04 **e os outros três blocos**)

### TE.1 , Base compartilhada de demanda (TDD)
- **Novo helper em `pedidos.ts`:** `carregarDemandaAAtender(prisma, filtros)` , devolve,
  por pedido: `qtdAAtender`, `valorACusto`, `valorAVenda`, `itensSemCusto`,
  `produtosNaoEncontrados`, e o fallback de `NULL` (TB.5).
- Custo = `fato_produto.preco_custo`. Venda = rateio pelo `vr_produtos` da linha.
- **Teste:** 10 un, 6 atendidas → 4 × custo. 100% atendido → **R$ 0,00, mas presente**.

### TE.2 , **As cinco** queries de `pedidos.ts` (achado #6)
A review mostrou que trocar só B-01 e B-04 cria **contradição dentro da mesma tela**:
o mapa e os gráficos continuariam a preço de venda, cheio.

| Query | Bloco | Ação |
|---|---|---|
| `queryIndicadoresDemandas:156` | B-01 | → custo, a atender |
| `queryDemandasPendentes:192` | B-04 | → custo, a atender |
| `queryDemandasPorUf:118` | B-02/B-03/B-05 | → **custo, a atender** |
| `queryDemandaPorEtapa:223` | B-06 | → **custo, a atender** |
| `queryDemandasMaisParadas:298` | B-07 | → **custo, a atender** |

Todas passam a usar `carregarDemandaAAtender`. **Uma base, cinco blocos, um número.**

### TE.3 , UI dos blocos B (inline + `ui-ux-pro-max`)
- B-04: coluna "Valor" → **"A atender (custo)"**.
- B-01: rótulo explícito de custo.
- Exibir contadores de **itens sem custo** e **produtos não encontrados** (padrão do KPI
  de estoque).
- Enquanto houver `NULL` de atendimento (antes do 1º job): aviso "atendimento ainda não
  sincronizado".
- **Gate:** B-04 ≈ **R$ 21,35 mi** (±0,5%).

---

## ONDA F , Necessidade de compra + A-12

### TF.1 , Cláusula de demanda **compartilhada** (achado #14)
- `queryEstoqueDisponivelDiretoria` (`estoque.ts:723-731`) inclui
  `categoriaOperacao='simples_faturamento'` **quando
  `VENDA_FUTURA.RESERVA_ESTOQUE_ATE_REMESSA === true`** (flag hoje `false`, mas
  **engatilhada de propósito**).
- **Extrair a cláusula para um helper único** (ex.: `whereDemandaComprometida()` em
  `src/lib/fiscal/regras/`) usado **pelo A-12 e pela necessidade**. Sem isso, no dia em
  que a flag virar, os dois divergem em silêncio.

### TF.2 , Query de necessidade (TDD)
- `queryNecessidadeCompra(prisma)`:
  - demanda por produto = Σ `quantidadeAAtender` das linhas **vivas** de pedidos na
    cláusula compartilhada (TF.1) e `dataOrcamento >= corte`;
  - saldo por produto = Σ saldos em locais `classificacao='fisico'`;
  - `necessidade = max(0, demanda − saldo)`; `custo = necessidade × preco_custo`;
  - **drill-down:** saldo por depósito (`localId`, `localNome`).
- **Teste:** demanda 10, saldo 3 → falta 7. Saldo ≥ demanda → ausente.
- **Performance:** volumes triviais (923 produtos com saldo, 20.346 itens) , **sem índice
  novo** (confirmado na review).

### TF.3 , A-12 corrigido
- Passa a usar saldo **físico**, quantidade **a atender**, itens **vivos**, e a cláusula
  compartilhada.
- **Gate:** A-12 e necessidade **fecham entre si na mesma leitura**.

### TF.4 , Painel A-14 "Necessidade de compra" (UI , inline + `ui-ux-pro-max`)
- Bloco **A-14** (tabela, domínio `A`), na aba `estoque`, **abaixo** do A-12/A-02 (como o
  colaborador pediu).
- Colunas: Produto · Demanda a atender · Saldo físico · **Falta comprar** · Custo
  estimado. Linha expansível com **saldo por depósito**.
- Texto curto: a necessidade é **nacional**; o drill-down mostra **onde a mercadoria
  está** (transferir × comprar). O `local_reserva_id` **não** é usado (só 31% preenchido,
  e os locais nele têm saldo zero) , dito na tela para ninguém supor o contrário.

---

## ONDA G , Pagamentos (a mais reescrita)

### TG.1 , Schema do título , **com empresa** (achado #1)
- `FatoFinanceiroTitulo` ganha:
  - `formaPagamentoNome String? @map("forma_pagamento_nome")`
  - `provisorio Boolean @default(false)`
  - **`empresaId Int? @map("empresa_id")`** ← **faltava**; sem ele o filtro por empresa da
    TG.4 é impossível. O dado existe em `raw_finan_lancamento.data->'empresa_id'`.
  - (`participanteId` **já existe** → a UF sai de `fato_parceiro.uf`, cobertura **100%**.)
- `npx prisma migrate dev --name titulo_forma_pagamento_empresa`

### TG.2 , Builder do título (TDD)
- `src/worker/fatos/fato-financeiro-titulo.ts`: extrai `forma_pagamento_id[1]`,
  `provisorio`, `empresa_id`.
- **Gate:** forma preenchida em **99,98%** (5.536/5.537); **15** provisórios.

### TG.3 , Query das 3 visões , **semântica fixada** (achado #2)
- `queryFormasPagamento` reescrita sobre **`fato_financeiro_titulo`** (`tipo='a_receber'`).
- **Recorte: `data_documento`** (via `janelaClampada`). **Valor: `vr_documento`.**
  Foi a **única combinação** que reproduziu os três números , as outras erram (com
  `data_vencimento`, a carteira dá R$ 55,68 mi em vez de 52,39; com `vr_total`, o pago dá
  31,29).
- **Visões:** `pago` = `notaFiscalId != null && vrSaldo <= 0`; `a_receber` =
  `notaFiscalId != null && vrSaldo > 0`; `carteira` = `notaFiscalId == null`.
- **Venda externa / intragrupo (achado #15):** a query nova filtra só `tipo='a_receber'`
  , um título de venda **intragrupo** entraria. **Decisão:** filtrar por
  `fato_pedido.categoriaOperacao='venda'` quando houver `pedidoId`, e por
  `fato_nota_fiscal.isVendaExterna` quando houver `notaFiscalId`. **Medir** quantos
  títulos ficam sem nenhum dos dois vínculos (**216 títulos / R$ 2,06 mi**, medido) e
  decidir explicitamente: entram num balde "sem vínculo" ou ficam fora. **Registrar o
  número na verificação.**
- **RBAC:** respeitar **empresa** (via `empresaId`) e **UF** (via
  `participanteId → fato_parceiro.uf`). Hoje **não respeita** , usuário restrito a UF vê o
  grupo inteiro (furo real).
- **Gate:** pago **1.148 / R$ 31,40 mi**; a receber **635 / R$ 28,25 mi**; carteira
  **3.654 / R$ 52,39 mi**; "Não informado" = **1 título / R$ 31.157,90** (±0,5%).

### TG.4 , Consumidores da query (achado #3 , **a lista certa**)
A premissa do v1 estava errada: **C-05 (`queryModalidadesEMaiorPedido`) não tem relação**
com forma de pagamento. Os consumidores **reais** de `formasPagamento` são:

| Arquivo | O quê |
|---|---|
| `src/app/(protected)/diretoria/vendas/page.tsx:52,69` | monta o `VendasData` |
| **`src/components/diretoria/vendas/vendas-screen.tsx:40,225-256`** | **tipo `VendasData` + renderiza cards e donut , o v1 nem citava. Mudar o retorno quebra o `tsc`.** |
| `src/components/diretoria/blocos/blocos-vendas.tsx:99` | **C-07** (donut) |
| `src/components/diretoria/blocos/blocos-vendas.tsx:118` | **C-09** (dimensão "pagamento") |

**Todos os quatro** precisam ser adaptados à nova forma de retorno (3 visões).
**C-05 fica explicitamente fora de escopo.**

### TG.5 , C-07 com seletor de visão (UI , inline + `ui-ux-pro-max`)
- Seletor de visão (padrão **Pago**), donut da visão selecionada.
- Legenda de uma linha por visão (texto da spec §5.7).
- Aviso discreto quando houver título **provisório** na visão.
- C-09 usa a visão selecionada (ou a visão `pago` por padrão , decidir e escrever).

---

## ONDA H , MCP / Agente Nex (achado #5 , escopo real)

Sem isto, o Nex passa a **contradizer a tela exatamente onde ela muda**.

### TH.1 , Tools de demanda
- `mcp/tools/comercial/demanda-em-aberta.ts`, `demanda-por-produto.ts`,
  `pedido-situacao.ts` e `src/lib/reports/queries/comercial.ts`:
  usam **quantidade a atender** (hoje usam a cheia , mesmo bug do B-04) e reportam **os
  dois valores** (custo **e** venda).

### TH.2 , Tools de estoque (**faltavam no v1**)
Todas leem `fatoEstoqueSaldo` sem classificação e passariam a divergir da tela:

| Tool | Divergência |
|---|---|
| `mcp/tools/estoque/valor-armazem.ts` | Nex diria R$ 47,7 mi; tela, R$ 29,85 mi |
| `mcp/tools/estoque/concentracao.ts` | idem |
| `mcp/tools/estoque/saldo-produto.ts` | idem |
| `mcp/tools/estoque/locais-por-produto.ts` | idem |
| `mcp/tools/estoque/produtos-saldo-zero.ts` | idem |
| `mcp/tools/comercial/estoque-disponivel.ts` (`queryEstoqueDisponivel`) | o docstring **declara paridade com o A-12**, que muda na Onda F |
| `mcp/tools/comercial/seriais-produto.ts` (`querySeriaisProduto`) | a fonte de serial muda na Onda D |

**Decisão por tool (escrever no código):** usar `classificacao='fisico'` por padrão e
**expor um parâmetro** para consultar demonstração/todos quando o usuário pedir
explicitamente ("quanto tem em demonstração?").

### TH.3 , Rebuild do `mcp`
- `docker compose up -d --build mcp`; **conferir a data da imagem**.

---

## ONDA I , Verificação e documentação

### TI.1 , E2E contra o cache real (regra de raiz , obrigatório)
Subir os serviços, rodar os ciclos (`snapshot`, `incremental`, `JOB_ATENDIMENTO`) e
conferir **na UI**, não só em SQL:

| # | Item | Alvo (±0,5%) |
|---|---|---|
| 1 | KPI estoque | ~R$ 31,42 mi |
| 2 | Demonstração | R$ 1.562.449 / 35 locais |
| 3 | `fato_pedido_item` mortos | 0 |
| 4 | Unidades a atender | ~5.694 |
| 5 | B-04 (e B-01/B-02/B-06/B-07) | ~R$ 21,35 mi |
| 6 | Seriais físicos | ~2.511 |
| 7 | Pagamentos | 31,40 / 28,25 / 52,39 mi |
| 8 | "Não informado" | 1 título, R$ 31,1 mil |
| 9 | A-12 × necessidade | fecham na mesma leitura |
| 10 | Nex × tela | mesmo número nas duas |
| 11 | Títulos sem vínculo | medir e registrar (~216 / R$ 2,06 mi) |

### TI.2 , `docs/kpis-diretoria.md` , **no mesmo commit** de cada mudança de KPI.

### TI.3 , RADAR
Etapa `Cancelado` como ABERTA; `fato_serial` legado; filtros globais mortos; valorização
Diretoria × Relatórios; doc que afirma "snapshot 24h" (é 30 min); necessidade sem lead
time/trânsito; `sync.atendimento_interval_min` não configurável (se TB.3b optar por
fixar).

---

## Definição de pronto

- `npx tsc --noEmit` limpo · `npm test` verde · `npx eslint` limpo
- Todos os gates da TI.1 conferidos **contra o cache real**
- Containers rebuildados (mapa de impacto) e **datas das imagens conferidas**
- `kpis-diretoria.md` atualizado
- **Testado na UI pelo dono** antes do PR ir para merge
