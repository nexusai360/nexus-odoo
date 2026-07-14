# PLAN v3 , Diretoria: estoque por local, pedidos a atender, pagamentos por visão

**Spec:** `.../specs/2026-07-13-diretoria-estoque-pedidos-pagamentos-SPEC-v3.md`
**Branch:** `feat/diretoria-estoque-pedidos-pagamentos`
**Versão:** v3 , **documento de execução**. v1 → review #1 (18 achados) → v2 → review #2
(5 bloqueantes, 3 inéditos) → v3.
**Método:** TDD. **Toda UI inline na sessão principal com `ui-ux-pro-max`** , nunca
delegada.

> **O que a review #2 derrubou (e esta v3 corrige):**
> 1. **Teste de integração contra Postgres não tem infra** e quebraria o CI (`ci.yml:36`
>    roda jest sem `services: postgres`). → Trocado por teste unitário sobre a **string
>    SQL exportada** + gate contra o cache real.
> 2. **Prisma não faz join sem relation** , as 7 queries de estoque são `findMany`, e o
>    "join com `fato_estoque_local`" era inexecutável. → **Helper único**
>    `localIdsPorClassificacao()` + `where: { localId: { in: [...] } }`.
> 3. **O KPI de estoque iria a R$ 0 no primeiro deploy**: o `app` migra e serve na hora
>    (`docker/entrypoint.sh:70`), mas o `fato_estoque_local` só é populado no snapshot (30
>    min) do worker, que sobe depois. → **Fail-safe + dispatch no boot + backfill**.
> 4. **O job diário "pula se ocupado" e, se falhar no meio, gera um número quimera** (parte
>    dos itens com atendimento, parte sem, misturados no mesmo total). → **Retry**,
>    **barreira de completude** e **fallback uniforme**.
> 5. **O contrato de `NULL` não existia para o MCP** , o Nex responderia número inflado
>    sem ressalva, violando a §5.9 da spec. → Tools retornam `parcial` + timestamp.
> Mais: **7 épicos** quebrados e **6 decisões adiadas** fechadas.

---

## Decisões fechadas (o executor não decide nada)

| # | Decisão | Escolha |
|---|---|---|
| D1 | Infra de teste de integração | **Não criar.** Teste unitário sobre a **string SQL exportada** (assertiva de que contém `i.raw_deleted = false`) + **gate SQL contra o cache real**. É o padrão vigente do repo (511 testes, todos com prisma mockado). |
| D2 | Como filtrar por classificação | **Helper `localIdsPorClassificacao()`** → `where: { localId: { in: ids } }`. **Sem FK/relation** (não acoplar fatos num pipeline de DELETE+INSERT). |
| D3 | Intervalo do job de atendimento | **Fixo em 24 h no código.** Não configurável nesta entrega (exigiria tocar 6 arquivos e o `aplicarAgendamento`, que tem early-return). → RADAR. |
| D4 | Títulos sem vínculo de venda (216 / R$ 2,06 mi) | **Entram**, em balde explícito **"Sem vínculo de venda"**, visível. Sumir com R$ 2 mi em silêncio é o pecado que a spec corrige. |
| D5 | C-09 (dimensão pagamento) | **Segue a visão selecionada no C-07.** Duas visões diferentes lado a lado é o bug que a spec ataca. |
| D6 | Parâmetro das tools de estoque do MCP | `classificacao: z.enum(["fisico","demonstracao","todos"]).default("fisico")`, **idêntico nas 7**. |
| D7 | Ordem do registry de fatos | **Executa na ordem do array** (`runBuilders` é `for...of` sequencial com `await`) , confirmado. Só posicionar. |
| D8 | Fallback quando o atendimento não sincronizou | **Uniforme**: ou todos os pedidos usam a coluna, ou **todos** usam a quantidade cheia + aviso. **Nunca misturar** no mesmo somatório. Governado por `fato_build_state`. |

---

## Ordem das ondas

```
Onda 0  Locais + helper (fundação)  ─┐
Onda A  Fatos limpos                 ├─ dado. Nada depois funciona sem elas.
Onda B  Ingestão do atendimento     ─┘  <- E/F/H só fecham depois do job TER RODADO
Onda C  Estoque (usa 0)
Onda D  Seriais (usa 0)
Onda E  Demanda: 5 blocos (usa A + B)
Onda F  Necessidade + A-12 (usa 0 + A + B)
Onda G  Pagamentos (independente)
Onda H  MCP/Nex (usa 0 + A + B + D)
Onda I  Verificação E2E + docs + deploy
```

**Rebuilds** (`CLAUDE.md` §2.1): ondas 0/A/B → `docker compose build app` +
`up -d --force-recreate worker` (**o worker não tem `build:` próprio** , rebuildar pelo
`app`). Migrations → **todos**. Onda H → `up -d --build mcp`. **Sempre conferir a data da
imagem** (`docker image inspect nexus-odoo:local --format '{{.Created}}'`).

## Convenção dos gates

**Banda de tolerância:** ±1 em contagens, **±0,5%** em valores (o cache anda).
**Armadilha obrigatória em todo SQL de valor de estoque:** filtrar **`quantidade > 0`**
(regra real do KPI, `estoque.ts:56`). Sem isso "fora" dá R$ 5,92 mi em vez de R$ 16,3 mi
, o local `Virtual` tem **custo negativo** (-R$ 149.336).

---

## ONDA 0 , Locais (fundação)

### T0.1 , Módulo puro de classificação (TDD)
- **Novo:** `src/lib/estoque/classificacao-local.ts` + `.test.ts` (teste primeiro).
- **API:**
  ```ts
  export type ClassificacaoLocal = "fisico" | "demonstracao" | "fora";
  export interface LocalBruto {
    odooId: number; nomeCompleto: string | null;
    estoqueEmMaos: boolean; calculaExtratoSaldo: boolean; temProprietario: boolean;
  }
  export const SHOWROOM_ODOO_ID = 35;
  export function classificarLocal(l: LocalBruto): ClassificacaoLocal;
  ```
- **Regra (ordem importa). O separador da raiz é `" / "`** , escrito literalmente:
  ```ts
  const raiz = (l.nomeCompleto ?? "").split(" / ")[0];
  ```
  1. `odooId === SHOWROOM_ODOO_ID` → `demonstracao`
  2. `nomeCompleto?.startsWith("Terceiros / Demonstração")` → `demonstracao`
  3. `raiz === "Próprio" && estoqueEmMaos && calculaExtratoSaldo && temProprietario` → `fisico`
  4. resto → `fora` (**fail-closed**)
- **Casos de teste (obrigatórios):**
  | entrada | esperado |
  |---|---|
  | id 11, `Próprio / Jds - Matriz DF`, (t,t,t) | `fisico` |
  | id 29, `Próprio / ASTEC DF`, (t,**f**,t) | `fora` |
  | id 35, `Próprio / Showroom` | `demonstracao` |
  | id 271, `Próprio / INATIVO`, (f,f,f) | `fora` |
  | id 36, `Próprio / Jds Comércio - Matriz DF …` (razão social, em_maos=f) | `fora` |
  | id 251, `Terceiros / Demonstração` | `demonstracao` |
  | id 300, `Terceiros / Demonstração / Cliente X` | `demonstracao` |
  | id 3, `Virtual` | `fora` |
  | id 2, `Terceiros` | `fora` |
  | `nomeCompleto = null` | `fora` |
  | `nomeCompleto = ""` | `fora` |
  | **`Jds - Matriz DF » Próprio`** (formato do FATO, não do raw), (t,t,t) | **`fora`** , prova que a função só aceita `nome_completo` |

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
- `npx prisma migrate dev --name fato_estoque_local` → **`agente schema-changed`**.

### T0.3 , Builder do `fato_estoque_local` (TDD, padrão D1)
- **Novo:** `src/worker/fatos/fato-estoque-local.ts` + `.test.ts`
- Lê `raw_estoque_local` com **`rawDeleted: false`**; mapeia `nome`, `nome_completo`,
  `tipo`, `nivel`, `local_superior_id`, `estoque_em_maos`, `calcula_extrato_saldo`,
  `jsonb_typeof(proprietario_local_id) = 'array'` → `temProprietario`; aplica
  `classificarLocal()`; rebuild total (delete + createMany).
- **Teste:** função de mapeamento `mapLocalRow()` **pura e exportada** (padrão do
  `fato-estoque-saldo.ts`, que testa `mapSaldoRow`), com os casos da T0.1 + a exclusão de
  `raw_deleted`.
- **Registry:** `{ nome: "fato_estoque_local", cycle: "snapshot", run: rebuildFatoEstoqueLocal }`,
  **posicionado antes de `fato_serial_saldo`** (que faz join nele). `runBuilders` é
  `for...of` sequencial , a ordem do array é a ordem de execução (D7).
  *(Nota: `fato_estoque_saldo` **não** faz join , a classificação é aplicada nas queries.)*

### T0.4 , Helper de classificação (D2) , **a peça que todas as ondas usam**
- **Novo:** `src/lib/estoque/locais-por-classificacao.ts` + `.test.ts`
  ```ts
  export interface FiltroLocal { ids: number[] | null; classificacaoIndisponivel: boolean }
  /** ids dos locais da classificação. Se o fato estiver VAZIO, devolve
   *  { ids: null, classificacaoIndisponivel: true } -> o chamador NÃO filtra e avisa. */
  export async function localIdsPorClassificacao(
    prisma: PrismaClient, cls: ClassificacaoLocal = "fisico",
  ): Promise<FiltroLocal>;
  ```
- **Fail-safe (bloqueante #3 da review):** se `fato_estoque_local` estiver **vazia**
  (primeiro deploy, antes do snapshot), **não filtrar** e sinalizar. **Nunca** devolver
  `[]`, que zeraria o KPI silenciosamente.
- **Uso padrão:** `where: { ...(f.ids ? { localId: { in: f.ids } } : {}) }`
- **Teste:** tabela vazia → `{ ids: null, classificacaoIndisponivel: true }`; com dados →
  ids corretos.

### T0.5 , Dispatch no boot (fecha o bloqueante #3)
- **Arquivo:** `src/worker/index.ts`
- No bootstrap, **disparar o build dos fatos novos imediatamente** (não esperar o
  snapshot de 30 min). Padrão do repo: `upsertJobScheduler(...)` **+**
  `queue.add(JOB, {})` , exatamente como `JOB_SNAPSHOT_ESTOQUE:522`,
  `JOB_REFRESH_USD_BRL:512`, `JOB_PROFILE_AGGREGATE:533`.

### T0.6 , GATE da onda (medição real)
```sql
SELECT l.classificacao, count(DISTINCT l.odoo_id) locais,
       count(DISTINCT s.local_id) com_saldo,
       round(sum(s.quantidade * coalesce(p.preco_custo,0)),2) valor
FROM fato_estoque_local l
LEFT JOIN fato_estoque_saldo s ON s.local_id = l.odoo_id AND s.quantidade > 0
LEFT JOIN fato_produto p ON p.odoo_id = s.produto_id
GROUP BY 1;
```
| classe | locais | c/ saldo | valor |
|---|---:|---:|---:|
| `fisico` | **16** | 4 | R$ 29.852.652 |
| `demonstracao` | **129** | 35 | R$ 1.562.449 |
| `fora` | **244** | 3 | R$ 16.318.304 |

Local **414** ausente (`raw_deleted` no Odoo). Registrar no PROGRESSO.

---

## ONDA A , Fatos limpos

### TA.1 , Fix do `fato_pedido_item` (D1)
- **Arquivo:** `src/worker/fatos/fato-pedido-item.ts` , o `WHERE` a corrigir (linhas
  ~41-42; **não** o LEFT JOIN).
- **Fix:** `AND i.raw_deleted = false`.
- **Teste (D1):** extrair o SQL para uma **const exportada** (`SQL_REBUILD_PEDIDO_ITEM`) e
  asseverar, em teste unitário, que contém `i.raw_deleted = false`. (Mock de prisma não
  exercita `$executeRaw` , e não há infra de integração.)
- **Gate (contra o cache):** linhas mortas no fato **~1.007-1.009 → 0**; soma do fato ≈
  cabeçalho (~R$ 62,65 mi, era R$ 65,30 mi); `PV-2051/26`: 42 itens → **4**.

### TA.2 , Auditoria de `raw_deleted` , **escopo fechado**
- **Lista fixa** (os builders que leem `raw_*` e alimentam esta entrega ou vizinhos
  diretos): `fato-pedido.ts`, `fato-pedido-item.ts`, `fato-pedido-parcela.ts`,
  `fato-estoque-saldo.ts`, `fato-serial.ts`, `fato-financeiro-titulo.ts`,
  `fato-nota-fiscal.ts`, `fato-nota-fiscal-item.ts`, `fato-produto.ts`, `fato-compra.ts`,
  `fato-dfe.ts`, `fato-parceiro.ts`.
- **Método:** achar as leituras (`prisma.rawX.findMany` **e** `FROM raw_x` em SQL cru).
  **Não usar grep de string** (não enxerga `rawDeleted:` camelCase).
- Para cada um sem filtro: medir `SELECT count(*) FROM raw_x WHERE raw_deleted`.
  **> 0 → corrigir + teste. = 0 → registrar** ("não vaza hoje, sem guarda").
- **Entregável:** `docs/superpowers/plans/2026-07-13-auditoria-raw-deleted.md`.
- Já sabido: `fato_pedido_item` vaza; `fato_pedido`, `fato_pedido_parcela`,
  `fato_estoque_saldo` OK.

---

## ONDA B , Ingestão do atendimento (a mais arriscada)

### TB.1 , `extraFields` no catálogo (TDD)
- **Arquivos:** `src/worker/catalog/model-catalog.ts` (tipo + entrada de
  `sped.documento.item`), `src/worker/odoo/field-selection.ts`.
- **Testes:** (a) `store=false` continua excluído por padrão; (b) os de `extraFields`
  entram; (c) `excludeFields` continua vencendo.
- **Efeito colateral , com limiar (menor #19):** `getModelFields` memoiza por modelo, então
  o **incremental de 3 min** também passará a pedir os 2 computados. É desejável (mantém o
  JSONB coerente). **Medir** o tempo do incremental antes/depois. **Se passar de ~2× do
  atual**, mover os `extraFields` para um caminho **opcional** (parâmetro em
  `getModelFields`, sem mudar o default memoizado).

### TB.2a , Exportar `PAGE_SIZE`
- `src/worker/sync/incremental.ts:8` , `const PAGE_SIZE = 500` é privado. **Exportar.**

### TB.2b , Leitura paginada dos itens (TDD)
- **Novo:** `src/worker/sync/atendimento.ts` , `buscarItensAtendimento(client)`.
- `search_read` em `sped.documento.item`, domínio:
  ```
  [["pedido_id","!=",false], ["documento_id.data_emissao",">=", CORTE_INGESTAO_ISO]]
  ```
  **ignorando `write_date`** , é a razão de existir do job (o `write_date` do item **não
  muda** quando a entrega acontece: item 254221 com `write_date` 2026-06-23 atendido por
  NF de 2026-06-30).
  *Nota:* `corteDomain('sped.documento.item')` **retorna `[]`** (o modelo tem `cortePai`,
  não `corte` , `corte.ts:34-38`), por isso o domínio de data é **explícito**. O purge
  (`src/worker/limpa/`) é **script manual**, não roda no worker , não há concorrência,
  mas o filtro impede reingerir o que foi purgado.
- `fields = getModelFields(client, "sped.documento.item")` , **TODOS** os campos (299
  `store=true` + 2 computados). **NUNCA** só os 2.
- **Paginado** com `PAGE_SIZE` (payload real: **~196 MB**; worker com heap de 2 GB e
  **histórico de OOM**).
- **Teste:** o domínio inclui as duas cláusulas e **não** inclui `write_date`; a paginação
  itera até esgotar.

### TB.2c , Upsert no raw + teste de não-regressão do JSONB (TDD)
- `gravarItensAtendimento(prisma, recs)` , mesmo padrão de `syncIncremental:100-108`.
- **Teste obrigatório:** o upsert **substitui o `data` inteiro**
  (`incremental.ts:100-106`); provar que, com o payload completo, o item mantém **todas**
  as ~301 chaves (`produto_id`, `quantidade`, `vr_produtos`, `pedido_id`…). É o teste que
  impede o bug que zeraria o `fato_pedido_item` em silêncio.

### TB.2d , Orquestrador `syncAtendimento()`
- Junta TB.2b + TB.2c; retorna `{ lidos, atualizados, duracaoMs }`.
- **Barreira de completude (bloqueante #4):** ao final, **e só em caso de sucesso**,
  `markFatoBuilt(prisma, "job_atendimento")` (`src/worker/fatos/fato-build-state.ts`, já
  existe e é usado por todos os builders). É o marcador que governa o fallback (D8).

### TB.3a , Scheduler + dispatch no boot
- `src/worker/index.ts`: `upsertJobScheduler(JOB_ATENDIMENTO, { every: 24h })` na
  **`maintenanceQueue`** **+ `maintenanceQueue.add(JOB_ATENDIMENTO, {})`** no bootstrap
  (senão só rodaria 24 h após o deploy , padrão do repo em `index.ts:512,522,533`).

### TB.3b , Lock + **retry** (bloqueante #4)
- O lock é por `jobName` (`ciclo-lock.ts:36`) e a `maintenanceQueue` **não usa lock** , um
  lock `JOB_ATENDIMENTO` **não bloquearia nada**. O handler deve **adquirir o lock de
  `JOB_INCREMENTAL`** (padrão `JOB_ONDEMAND`, `index.ts:387-404`).
  *(`adquirirLock`/`liberarLock` são funções de módulo em `index.ts:259,264`, no mesmo
  arquivo do `maintenanceWorker:136` , **não precisa injeção**.)*
- **Se o lock estiver ocupado: REAGENDAR em +15 min**
  (`maintenanceQueue.add(JOB_ATENDIMENTO, {}, { delay: 900_000 })`), **não pular**. Um
  skip num job diário = **mais 24 h de dado velho**, e o incremental roda a cada 3 min ,
  a colisão é provável.

### TB.3c , Timeout de 15 min
- BullMQ não tem timeout por job. Usar o padrão do repo: **`Promise.race`** com o job
  (`index.ts:413-425` faz isso com `CYCLE_HARD_TIMEOUT_MS`). O `CYCLE_HARD_TIMEOUT_MS` (10
  min) **não cobre** a `maintenanceQueue` , definir `ATENDIMENTO_TIMEOUT_MS = 15 min` (o
  job leva 4-8 min).

### TB.4 , Colunas no fato + migration
- `FatoPedidoItem` ganha
  `quantidadeAAtender Decimal? @db.Decimal(18,4) @map("quantidade_a_atender")` e
  `quantidadeAtendida Decimal? @db.Decimal(18,4) @map("quantidade_atendida")`.
  **Nullable de propósito.**
- `npx prisma migrate dev --name pedido_item_atendimento` → **`agente schema-changed`**.

### TB.5 , Builder lê os campos , **`NULL` nunca vira 0**
- `fato-pedido-item.ts`: `(i.data->>'quantidade_a_atender_pedido')::numeric` **sem
  `COALESCE` para 0**.
- **Por quê:** `COALESCE(...,0)` faria **todo pedido aparecer com R$ 0,00** no B-04 até o
  job rodar. `NULL` = "não sei".
- **Teste:** item com o campo → preenchido; item sem → `NULL` (não 0).

### TB.6 , Contrato do fallback (D8) , **uniforme, nunca misturado**
- **Novo:** `src/lib/diretoria/atendimento-status.ts`
  ```ts
  /** true se o job de atendimento já completou ao menos uma vez. */
  export async function atendimentoSincronizado(prisma): Promise<{ ok: boolean; em: Date | null }>;
  ```
  Lê `fato_build_state` (chave `job_atendimento`, gravada na TB.2d).
- **Regra (bloqueante #4):**
  - `ok === true` → **todas** as queries usam `quantidadeAAtender`.
  - `ok === false` → **todas** usam a **quantidade cheia** + a tela/tool exibe
    "atendimento ainda não sincronizado".
  - **Proibido** somar coluna preenchida com fallback no mesmo total , isso produziria um
    número intermediário que não significa nada (pior que os dois números que a spec veio
    consertar).
- **Teste:** com o marcador ausente, a query devolve a base cheia **inteira** e a flag
  `parcial: true`.

### TB.7 , E2E do ciclo (GATE da onda)
- Rodar o job de verdade. **Custo real: ~237 s de leitura** (500 recs / ~5 s / 4,2 MB;
  23.397 itens; 301 campos) **+ upserts** → **esperado 4-8 min**. (O "83 s" da spec estava
  subestimado em 3-5×.)
- Validar:
  - `quantidade_a_atender` preenchido, **sem `NULL`**;
  - Σ a atender nos pedidos ABERTA pós-corte ≈ **5.694 un** (±0,5%);
  - o **JSONB do raw continua completo** (~301 chaves antes/depois);
  - `PV-2051/26` coerente com o Odoo;
  - **heap** do worker durante o job (histórico de OOM);
  - `fato_build_state` tem `job_atendimento`.
- **Teste de frescor:** provar que o valor **atualiza** após uma entrega , item cujo
  `write_date` é anterior à NF que o atendeu, antes/depois do job.

---

## ONDA C , Estoque

### TC.1 , `agrupaSaldo` por `localId` (não por nome)
- `estoque.ts:119-154` agrupa por **string** (`localNome` é a chave). Há **dois locais com
  o nome idêntico `Próprio / INATIVO`** (ids 14 e 271) , colapsariam numa linha.
- **Refatorar:** chave = **`localId`**, rótulo = `localNome`. Família/marca seguem por
  nome.
- **Teste:** dois locais de mesmo nome e ids diferentes **não** colapsam.

### TC.2a..TC.2g , Uma task por query (épico quebrado)
Cada uma: consome `localIdsPorClassificacao(prisma, "fisico")` (T0.4), aplica
`where: { ...(f.ids ? { localId: { in: f.ids } } : {}) }`, propaga
`classificacaoIndisponivel` para a tela.

| task | query | nota |
|---|---|---|
| TC.2a | `queryIndicadoresEstoque` (`:49`) | o KPI. Gate: **~R$ 31,42 mi** |
| TC.2b | `queryEstoquePorLocal` (`:157`) | usa o `agrupaSaldo` da TC.1 |
| TC.2c | `queryEstoquePorFamilia` (`:162`) | |
| TC.2d | `queryEstoquePorMarca` (`:167`) | |
| TC.2e | `queryCatalogoEstoque` (`:246`) | |
| TC.2f | `queryEstoqueGranular` (`:372`) | |
| TC.2g | `queryIndicadoresAvancadosEstoque` (`:541`) | **precisa adicionar `localId` ao `select`** (hoje não seleciona) |

### TC.3 , Query de demonstração
- `queryEstoqueDemonstracao(prisma)` → `{ valor, unidades, locais, linhas[] }`.
- **Gate:** R$ 1.562.449 / **35** locais com saldo.

### TC.4 , Painel A-13 "Estoque em demonstração" (UI , inline + `ui-ux-pro-max`)
- Bloco **A-13** em `catalogo.ts` (tabela, domínio `A`); componente + `case` em
  `blocos-estoque.tsx`; entrada em `PADROES_ABA.estoque`
  (`.../diretoria/estoque/page.tsx:86`); campo em `EstoqueData` + `Promise.all` da page.
- **Nota:** `PADROES_ABA` só vale quando **não há layout salvo** (`page.tsx:112`). Hoje só
  existem 2 layouts salvos, com chaves antigas (`estoque-demo`, `vendas`) , os blocos
  novos **aparecem**.

### TC.5 , A-02 com rodapé de exclusão
- **Decisão (resolve a contradição):** o A-02 mostra **só os locais físicos** e ganha um
  **rodapé** com o total excluído (demonstração + fora), com link para o A-13. Uma coluna
  "Tipo" seria constante e inútil.
- **Alinhar a SPEC §5.2 na Onda I** (ela ainda diz "exibe a classificação de cada local").

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
- `npx prisma migrate dev --name fato_serial_saldo` → **`agente schema-changed`**.

### TD.2 , Builder (TDD)
- **Novo:** `src/worker/fatos/fato-serial-saldo.ts` , lê
  `raw_estoque_saldo_rastreabilidade_hoje` (`raw_deleted = false`), só **`saldo > 0`** e
  `lote_serie_id` preenchido; join com `fato_estoque_local` (classificação) e
  `fato_produto` (custo).
- **Registry:** `cycle: "snapshot"`, **depois** do `fato_estoque_local`.

### TD.3 , Query `querySeriais` sobre a fonte nova
- Lê `fato_serial_saldo`, filtro por classificação (padrão `fisico`); retorna serial,
  produto, local, saldo.

### TD.4 , A-06 na tela (UI , inline + `ui-ux-pro-max`)
- Colunas **Serial · Produto · Local · Saldo** + filtro de classificação.
- Remover o aviso âmbar de "local não preenchido" (deixou de ser verdade).
- **Nota:** **Jib DF** tem 599 unidades de saldo e **zero seriais** , a A-06 mostra 3
  depósitos onde a A-02 mostra 4 (nem todo produto é serializado).
- **Gate:** ~**2.511** seriais físicos (1.235 + 749 + 527).

### TD.5 , **A-09 troca de fonte** (task órfã, achado #9 da review)
- `queryIndicadoresAvancadosEstoque` (`estoque.ts:557`) lê hoje
  `prisma.fatoSerial.findMany({ where: { dataSaida: null, … } })`.
- **Trocar para `prisma.fatoSerialSaldo`** (`classificacao='fisico'`, `saldo > 0`).
- Sem esta task, a plataforma fica com **dois números de seriais** , exatamente o que a
  SPEC §5.3 proíbe.

---

## ONDA E , Demanda (5 blocos, uma base)

### TE.1 , Base compartilhada (TDD)
- **Novo helper em `pedidos.ts`:** `carregarDemandaAAtender(prisma, filtros)` → por pedido:
  `qtdAAtender`, `valorACusto`, `valorAVenda`, `itensSemCusto`, `produtosNaoEncontrados`,
  `parcial` (do contrato TB.6).
- **Fórmulas, escritas:**
  - `valorACusto = Σ quantidadeAAtender × fato_produto.preco_custo`
  - `valorAVenda = Σ quantidadeAAtender × (vrProdutos / quantidade)` , divisão segura: o
    builder já filtra `quantidade > 0` (`fato-pedido-item.ts:44`).
- **Fallback (D8):** se `atendimentoSincronizado().ok === false` → **todos** os pedidos na
  quantidade cheia + `parcial: true`.
- **Teste:** 10 un, 6 atendidas → 4 × custo. 100% atendido → **R$ 0,00, mas presente**.

### TE.2a..TE.2e , Uma task por query (épico quebrado)
Trocar **as cinco** , senão o mapa e os gráficos continuam a preço de venda cheio,
**contradizendo o B-01/B-04 na mesma tela**.

| task | query | bloco |
|---|---|---|
| TE.2a | `queryIndicadoresDemandas` (`:156`) | B-01 |
| TE.2b | `queryDemandasPendentes` (`:192`) | B-04 |
| TE.2c | `queryDemandasPorUf` (`:118`) | B-02 / B-03 / B-05 |
| TE.2d | `queryDemandaPorEtapa` (`:223`) | B-06 |
| TE.2e | `queryDemandasMaisParadas` (`:298`) | B-07 |

### TE.3 , UI dos blocos B (inline + `ui-ux-pro-max`)
- B-04: coluna "Valor" → **"A atender (custo)"**; B-01 com rótulo de custo.
- Exibir **itens sem custo** (27) e **produtos não encontrados** (11).
- Se `parcial` → aviso "atendimento ainda não sincronizado".
- **Gate:** B-04 ≈ **R$ 21,35 mi**.

---

## ONDA F , Necessidade de compra + A-12

### TF.1 , Cláusula de demanda compartilhada
- `queryEstoqueDisponivelDiretoria` (`estoque.ts:723-731`) inclui
  `categoriaOperacao='simples_faturamento'` quando
  `VENDA_FUTURA.RESERVA_ESTOQUE_ATE_REMESSA === true` (hoje `false`, mas **engatilhada de
  propósito**).
- **Extrair para helper único**: `whereDemandaComprometida(): Prisma.FatoPedidoWhereInput`
  em `src/lib/fiscal/regras/`, usado **pelo A-12 e pela necessidade**. Sem isso, no dia em
  que a flag virar, os dois divergem em silêncio.

### TF.2 , Query de necessidade (TDD)
- `queryNecessidadeCompra(prisma)`:
  - demanda/produto = Σ `quantidadeAAtender` das linhas **vivas** de pedidos na cláusula
    TF.1 e `dataOrcamento >= corte`;
  - saldo/produto = Σ saldos em locais `fisico` (helper T0.4);
  - `necessidade = max(0, demanda − saldo)`; `custo = necessidade × preco_custo`;
  - **drill-down:** saldo por depósito (`localId`, `localNome`).
- **Performance:** volumes triviais (923 produtos com saldo; 20.346 itens) , **sem índice
  novo**.

### TF.3 , A-12 corrigido
- Saldo **físico** + quantidade **a atender** + itens **vivos** + cláusula TF.1.
- **Gate:** A-12 e necessidade **fecham entre si na mesma leitura**.

### TF.4 , Painel A-14 "Necessidade de compra" (UI , inline + `ui-ux-pro-max`)
- Bloco **A-14** (tabela, domínio `A`), aba `estoque`, **abaixo** do A-12/A-02.
- Colunas: Produto · Demanda a atender · Saldo físico · **Falta comprar** · Custo
  estimado. Linha expansível com **saldo por depósito**.
- Texto: a necessidade é **nacional**; o drill-down mostra **onde a mercadoria está**
  (transferir × comprar). O `local_reserva_id` **não** é usado (31% preenchido, e os
  locais nele têm saldo zero) , dito na tela.

---

## ONDA G , Pagamentos

### TG.1 , Schema do título , **com empresa** + migration
- `FatoFinanceiroTitulo` ganha:
  - `formaPagamentoNome String? @map("forma_pagamento_nome")`
  - `provisorio Boolean @default(false)`
  - **`empresaId Int? @map("empresa_id")`** ← sem ele o filtro por empresa é **impossível**
    (o fato não tem empresa hoje). Dado em `raw_finan_lancamento.data->'empresa_id'`.
  - (`participanteId` **já existe** → UF via `fato_parceiro.uf`, cobertura **100%**.)
- `npx prisma migrate dev --name titulo_forma_pagamento_empresa` → **`agente schema-changed`**.

### TG.2 , Builder do título (TDD)
- `fato-financeiro-titulo.ts`: extrai `forma_pagamento_id[1]`, `provisorio`, `empresa_id`.
- **Gate:** forma preenchida em **99,98%** (5.536/5.537); **15** provisórios.

### TG.3 , Query das 3 visões , semântica **fixada**
- `queryFormasPagamento` reescrita sobre **`fato_financeiro_titulo`** (`tipo='a_receber'`).
- **Recorte: `data_documento`** (via `janelaClampada`). **Valor: `vr_documento`.** Foi a
  **única combinação** que reproduziu os três números (com `data_vencimento` a carteira dá
  R$ 55,68 mi em vez de 52,39; com `vr_total` o pago dá 31,29).
- **Visões:** `pago` = `notaFiscalId != null && vrSaldo <= 0`; `a_receber` =
  `notaFiscalId != null && vrSaldo > 0`; `carteira` = `notaFiscalId == null`.
- **Venda externa / intragrupo:** filtrar por `fato_pedido.categoriaOperacao='venda'`
  quando houver `pedidoId`, e por `fato_nota_fiscal.isVendaExterna` quando houver
  `notaFiscalId`. **Títulos sem nenhum vínculo (216 / R$ 2,06 mi) entram num balde
  explícito "Sem vínculo de venda"** (D4) , visível, nunca sumido em silêncio.
- **RBAC:** respeitar **empresa** (`empresaId`) e **UF** (`participanteId → fato_parceiro.uf`).
  Hoje **não respeita** , usuário restrito a UF vê o grupo inteiro (furo real).
- **Gate:** pago **1.148 / R$ 31,40 mi**; a receber **635 / R$ 28,25 mi**; carteira
  **3.654 / R$ 52,39 mi**; "Não informado" = **1 título / R$ 31.157,90**.

### TG.4a..TG.4d , Consumidores (épico quebrado , mudar o tipo quebra o `tsc`)
| task | arquivo | o quê |
|---|---|---|
| TG.4a | `src/components/diretoria/vendas/vendas-screen.tsx:40,225-256` | novo tipo `FormasPagamentoPorVisao` + os 2 renders (**o v1 nem citava este arquivo**) |
| TG.4b | `src/app/(protected)/diretoria/vendas/page.tsx:52,69` | monta o `VendasData` |
| TG.4c | `src/components/diretoria/blocos/blocos-vendas.tsx:99` | **C-07** |
| TG.4d | `src/components/diretoria/blocos/blocos-vendas.tsx:118` | **C-09** , segue a visão do C-07 (D5) |

**C-05 (`queryModalidadesEMaiorPedido`) está FORA de escopo** , não tem relação com forma
de pagamento (a premissa do v1 era falsa).

### TG.5 , C-07 com seletor de visão (UI , inline + `ui-ux-pro-max`)
- Seletor de visão (padrão **Pago**), donut da visão selecionada.
- Legenda de uma linha por visão (texto da SPEC §5.7).
- Aviso discreto quando houver título **provisório** na visão.

---

## ONDA H , MCP / Agente Nex

### TH.1 , Tools de demanda (+ **contrato de `parcial`** , bloqueante #5)
- `mcp/tools/comercial/demanda-em-aberta.ts`, `demanda-por-produto.ts`,
  `pedido-situacao.ts`, `src/lib/reports/queries/comercial.ts`:
  - usam **quantidade a atender** (hoje usam a cheia , mesmo bug do B-04);
  - reportam **custo e venda**;
  - **retornam `atendimento_sincronizado_em` e `parcial: true|false`** e, quando `parcial`,
    o texto diz **"valor provisório, atendimento ainda não sincronizado"**. Sem isso o Nex
    responderia número inflado **sem ressalva** , violando a SPEC §5.9 (e a decisão #2 do
    `CLAUDE.md`: toda tool de leitura retorna o timestamp da última sync).

### TH.2a..TH.2g , Uma task por tool de estoque (épico quebrado)
Todas leem `fatoEstoqueSaldo` sem classificação e passariam a divergir da tela. Cada uma
recebe o parâmetro **`classificacao: z.enum(["fisico","demonstracao","todos"]).default("fisico")`** (D6):

| task | tool |
|---|---|
| TH.2a | `mcp/tools/estoque/valor-armazem.ts` (hoje diria R$ 47,7 mi contra R$ 29,85 mi da tela) |
| TH.2b | `mcp/tools/estoque/concentracao.ts` |
| TH.2c | `mcp/tools/estoque/saldo-produto.ts` |
| TH.2d | `mcp/tools/estoque/locais-por-produto.ts` |
| TH.2e | `mcp/tools/estoque/produtos-saldo-zero.ts` |
| TH.2f | `mcp/tools/comercial/estoque-disponivel.ts` (o docstring **declara paridade com o A-12**, que muda na Onda F) |
| TH.2g | `mcp/tools/comercial/seriais-produto.ts` (a fonte de serial muda na Onda D) |

### TH.3 , Snapshot do catálogo MCP (task órfã, achado #10)
- `npm run gen:mcp-catalog` → commitar `src/lib/mcp-catalog-snapshot.json`;
  `npm run audit:tools`.
- Consumido por `src/lib/actions/mcp-catalog-schema.ts` e
  `src/lib/agent/memoria/tool-digest.ts`, com testes
  (`mcp-catalog-schema.test.ts`, `golden-gate.test.ts`). Sem regenerar, o snapshot fica
  defasado e os testes quebram.
- Conferir que continuam **55 tools** (`mcp/__tests__/integration.test.ts:5`) , não
  adicionamos tool nova.

### TH.4 , Rebuild do `mcp`
- `docker compose up -d --build mcp`; **conferir a data da imagem**.

---

## ONDA I , Verificação, docs e deploy

### TI.1 , E2E contra o cache real (regra de raiz) , **na UI**, não só em SQL

| # | Item | Alvo (±0,5%) |
|---|---|---|
| 1 | KPI estoque | ~R$ 31,42 mi |
| 2 | Demonstração | R$ 1.562.449 / 35 locais |
| 3 | `fato_pedido_item` mortos | 0 |
| 4 | Unidades a atender | ~5.694 |
| 5 | B-01/B-02/B-04/B-06/B-07 | ~R$ 21,35 mi, coerentes entre si |
| 6 | Seriais físicos | ~2.511 |
| 7 | Pagamentos | 31,40 / 28,25 / 52,39 mi |
| 8 | "Não informado" | 1 título, R$ 31,1 mil |
| 9 | Sem vínculo de venda | ~216 / R$ 2,06 mi |
| 10 | Provisórios | 15 |
| 11 | Itens sem custo / produtos não encontrados | 27 / 11 |
| 12 | A-12 × necessidade | fecham na mesma leitura |
| 13 | Nex × tela | **mesmo número** |
| 14 | `fato_build_state` | tem `job_atendimento` |

### TI.2 , Ordem de deploy (fecha o bloqueante #3)
- As migrations rodam **no container `app`** (`docker/entrypoint.sh:70` ,
  `prisma migrate deploy`); o **worker pula de propósito** (linhas 8-22). O Shepherd
  atualiza **um serviço por vez**.
- **Ordem:** `app` (migra) → `worker` (builda os fatos novos, com o dispatch no boot da
  T0.5) → `mcp`.
- **A janela em que o app já filtra e o fato ainda está vazio é coberta pelo fail-safe da
  T0.4** (não filtra + avisa). **Validar em produção logo após o deploy**, com o gate T0.6.

### TI.3 , `docs/kpis-diretoria.md` , **no mesmo commit** de cada mudança de KPI.

### TI.4 , RADAR
Etapa `Cancelado` como ABERTA (2 pedidos); `fato_serial` legado (remover); filtros globais
mortos (`derivar-estoque.ts`, `construtor-estoque.tsx`); valorização Diretoria ×
Relatórios; doc do projeto que afirma "snapshot/reconcile 24h" (é 30/180 min);
`sync.atendimento_interval_min` não configurável (D3); necessidade sem lead time/trânsito;
**SPEC §5.2 desalinhada da TC.5** (A-02).

---

## Definição de pronto

- `npx tsc --noEmit` limpo · `npm test` verde · `npx eslint` limpo
- Todos os gates da TI.1 conferidos **contra o cache real**
- Containers rebuildados e **datas das imagens conferidas**
- `kpis-diretoria.md` atualizado
- **Testado na UI pelo dono** antes do PR ir para merge
