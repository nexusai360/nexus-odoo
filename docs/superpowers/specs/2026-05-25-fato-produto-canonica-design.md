# SPEC v3 FINAL — fato_produto canônica (catálogo de busca cobrindo 100% do cadastro)

**Autor:** claude-fato-produto-canonica
**Data:** 2026-05-25
**Branch:** feat/f4-leitura-expansao
**Status:** v3 FINAL (incorpora Review #1 + Review #2). Base do plan.

> **Changelog v2 → v3 (Review #2):**
>
> - **CRIT-1:** regex de código restrita (`^\d{3,}$|^[A-Z0-9]{8,}$`)
>   para não capturar `W8000` (vai para fuzzy de nome).
> - **CRIT-2:** `createMany({ skipDuplicates: true })` no builder.
> - **CRIT-3:** algoritmo explícito de mescla na §5.5
>   (sem duplicata, idempotente).
> - **MED-4:** plan v3 task explícita de registrar
>   `JOB_BUILD_FATO_PRODUTO` em `worker/jobs.ts`.
> - **MED-5:** `mapProdutoRow` retorna `number` para campos numéricos
>   (Prisma converte).
> - **MED-6:** `codigo_barras` normalizado (remove não-alfanumérico).
> - **MIN-7/MIN-8:** registrar com nome `'fato_produto'` em
>   `markFatoBuilt`; rebuild `mcp` cobre prompt.

## 1. Contexto

O agente Nex busca produtos via `searchProductByNameWithMeta` em
`fato_estoque_saldo`, que cobre apenas produtos com saldo (1787 de
3787 do cadastro). Usuário trouxe caso real: "mola espiral em aço"
retorna 1 produto, mas o Odoo tem 4 (3 sem saldo).

Causa: escopo de dados. Não é bug da busca; é a fato errada como
fonte do catálogo.

## 2. Estado atual (verificado)

- `raw_sped_produto`: 3787 linhas com JSONB rico.
- `fato_estoque_saldo`: 1787 produtos únicos.
- `fato_nota_fiscal_item`: histórico, não é catálogo.
- Builders em `src/worker/fatos/` seguem padrão `mapXxxRow` +
  `buildFatoXxx`.
- `_search-universal.ts` aceita `SearchTarget` whitelist.
- Indexes `unaccent + pg_trgm` já existem em `fato_estoque_saldo`.

## 3. Objetivo

Fato canônica `fato_produto` cobrindo 100% do cadastro. Busca passa
a usar essa fato como camada primária; `fato_estoque_saldo` vira
apenas enriquecimento de saldo.

### Critérios de sucesso

- (M1) `fato_produto` ≥ 3787 linhas após build (igual ao count do raw
  com `raw_deleted=false`).
- (M2) `searchProductByNameWithMetaCanonical("mola espiral em aço")`
  retorna ≥ 4 ids (filtrando ativo=true e controla_estoque=true).
- (M3) Tool `estoque_saldo_produto` com `termo="mola espiral em aço"`
  retorna `linhas` com até 5 candidatos + `ambiguidade.totalMatches >= 4`.
  Produtos sem saldo aparecem com `semEstoqueCadastrado=true`,
  `numLocais=0`, `mensagemContexto` populado.
- (M4) Build de `fato_produto` roda em < 30s (benchmark obrigatório
  antes de declarar pronto — task no plan).
- (M5) Busca por código exato (ex.: `"2556"` ou `"1000202492"`) retorna
  o produto correspondente via layer `"codigo"`.
- (M6) Job de build agendado roda diariamente; manual run funciona.
- (M7) Produto inativo (active=false) NÃO aparece em busca padrão.

## 4. Não-objetivos

- Refazer outras fatos.
- Mudar buscadores de parceiro/pedido.
- Criar tool MCP nova (a tool atual continua).
- Sincronizar campos de e-commerce/fiscal avançados.
- Migrar `fato_estoque_saldo`/`fato_estoque_movimento` (intactas).

## 5. Arquitetura

### 5.1 Schema `fato_produto`

PK `odoo_id INT`.

| Coluna | Tipo | Source JSON | Uso |
|---|---|---|---|
| `odoo_id` | `INT @id` | `data.id` | PK; junta com `fato_estoque_saldo.produto_id` |
| `nome` | `TEXT NOT NULL` | `data.nome` | Busca |
| `codigo` | `TEXT?` | `data.codigo` | Busca por código |
| `codigo_unico` | `TEXT?` | `data.codigo_unico` | Código alternativo |
| `codigo_barras` | `TEXT?` | `data.codigo_barras` | EAN/GTIN |
| `ativo` | `BOOLEAN` | `data.active` | Filtro padrão da busca |
| `tipo` | `TEXT?` | `data.tipo` | Produto/serviço/kit/etc |
| `marca_id` | `INT?` | `data.marca_id[0]` | M2O |
| `marca_nome` | `TEXT?` | `data.marca_id[1]` | Denorm |
| `familia_id` | `INT?` | `data.familia_id[0]` | M2O |
| `familia_nome` | `TEXT?` | `data.familia_id[1]` | Denorm |
| `unidade_nome` | `TEXT?` | `data.unidade_id[1]` | "unid", "kg" |
| `ncm_codigo` | `TEXT?` | extração regex de `data.ncm_id[1]` | Ref fiscal |
| `controla_estoque` | `BOOLEAN` | `data.controla_estoque` | Filtro padrão da busca |
| `permite_venda` | `BOOLEAN` | `data.permite_venda` | Filtros |
| `permite_compra` | `BOOLEAN` | `data.permite_compra` | Filtros |
| `preco_custo` | `DECIMAL(14,4)?` | `data.preco_custo` | |
| `preco_venda` | `DECIMAL(14,4)?` | `data.preco_venda` | |
| `peso_liquido` | `DECIMAL(10,4)?` | `data.peso_liquido` | |
| `peso_bruto` | `DECIMAL(10,4)?` | `data.peso_bruto` | |
| `criado_em` | `TIMESTAMP?` | `data.create_date` | |
| `atualizado_em_odoo` | `TIMESTAMP?` | `data.write_date` | Staleness |
| `atualizado_em` | `TIMESTAMP @default(now())` | — | Quando builder escreveu |

**Extração de `ncm_codigo` (CRIT-4 absorvido):** regex defensivo
`^[\d.]+` aplicado a `data.ncm_id[1]`. Se não casar, `null` + warning
em log (não falha o map).

Índices:

- `@@index([ativo])`
- `@@index([codigo])`
- `@@index([codigo_unico])`
- `@@index([codigo_barras])`
- `@@index([familia_id])`
- `@@index([marca_id])`
- `@@index([controla_estoque])` (novo, para filtro padrão)
- Funcional **btree** em `lower(f_unaccent_immutable(nome))`.
- Funcional **gin_trgm** em `lower(f_unaccent_immutable(nome)) gin_trgm_ops`.

### 5.2 Builder `src/worker/fatos/fato-produto.ts`

Espelha `fato-parceiro.ts`. Padrão: truncate + insert em lote
(`createMany({ skipDuplicates: true })`), paginado 500 em 500 na
leitura do raw. Decisão final: **truncate + insert**, justificada por
(a) raw é fonte única, (b) 3787 linhas cabem em memória,
(c) padrão estabelecido. `skipDuplicates` defensivo (CRIT-2 v2).

### 5.2.1 Normalização de `codigo_barras` (MED-6 v2)

No `mapProdutoRow`:

```ts
const codigo_barras_raw = typeof raw.codigo_barras === "string" ? raw.codigo_barras : null;
const codigo_barras = codigo_barras_raw
  ? codigo_barras_raw.replace(/[^0-9A-Z]/gi, "").toUpperCase() || null
  : null;
```

Resultado armazenado canonicalizado (sem espaço/hífen). Busca por
código casa exato.

### 5.2.2 Campos numéricos retornam `number` (MED-5 v2)

`mapProdutoRow` converte `preco_custo`, `preco_venda`, `peso_*` via
`parseFloat` defensivo (retorna `null` quando `raw` field é `false` ou
não-numérico). Prisma `Decimal(14,4)` aceita `number`.

```ts
export interface FatoProdutoRow { /* todas as colunas */ }

export function mapProdutoRow(raw: Record<string, unknown>): FatoProdutoRow;

export async function buildFatoProduto(prisma: PrismaClient): Promise<{
  totalLidos: number;
  totalEscritos: number;
  durationMs: number;
}>;
```

### 5.3 Job de build

`src/worker/jobs.ts` ganha `JOB_BUILD_FATO_PRODUTO`, mesmo cron dos
demais fatos (`fato-parceiro` etc).

### 5.4 Camada de busca (CRIT-2 + CRIT-3 + MED-6)

`_search-universal.ts`: estende `SearchTarget`:

```ts
| { table: "fato_produto"; pkColumn: "odoo_id"; nameColumn: "nome" }
```

`_search-helpers.ts`: nova função pública (a antiga vira alias para
preservar callers; ambas chamam internamente esta):

```ts
export async function searchProductByNameWithMetaCanonical(
  prisma: PrismaClient,
  termo: string,
  options?: {
    incluirInativos?: boolean;        // default false
    incluirSemControleEstoque?: boolean; // default false
  },
): Promise<{
  ids: number[];
  totalMatches: number;
  layer: "codigo" | "exact" | "fuzzy" | "none";
}>;
```

**Filtros default (CRIT-2 e CRIT-3):**
- `ativo = true`
- `controla_estoque = true`

**Layer "codigo" (MED-6 v1 + CRIT-1 v2) — nova camada 0:** regex
**restrita** `^\d{3,}$|^[A-Z0-9]{8,}$`. Cobre puramente numérico
(códigos curtos como `2556`, IDs longos como `1000202492`, EANs com
até 13 dígitos) e alfanumérico longo. Termos curtos com letras (ex.:
`W8000`) **não** entram aqui — vão direto para fuzzy de nome.

Se o termo casa a regex, tenta match exato em:
1. `codigo`
2. `codigo_unico`
3. `codigo_barras` (normalizado: só `[0-9A-Z]`, vide §5.2.1).

Se algum casar, retorna com `layer="codigo"`. Senão segue para layer 1
(AND tokenizado em nome) e layer 2 (trgm).

### 5.5 `querySaldoProduto` enriquecido — algoritmo explícito (CRIT-3 v2)

`src/lib/reports/queries/estoque.ts`:

1. `buscaResult = await searchProductByNameWithMetaCanonical(termo)`
   (filtros default aplicam ativo + controla_estoque). Devolve
   `{ ids: ids[], totalMatches, layer }`.
2. `produtoIdsFiltro = buscaResult.ids` (array, sem dedup necessário
   pois search já retorna distinct).
3. Carrega linhas brutas de `fato_estoque_saldo` `WHERE produto_id IN
   (produtoIdsFiltro)`.
4. Agrega linhas brutas em `mapaSaldo: Map<produtoId, AggregadoSaldo>`
   (mesmo padrão atual).
5. `idsComSaldo = Set<number>(mapaSaldo.keys())`.
6. `idsSemSaldo = produtoIdsFiltro.filter(id => !idsComSaldo.has(id))`.
7. Se `idsSemSaldo.length > 0`: carrega metadados de `fato_produto`
   `WHERE odoo_id IN (idsSemSaldo) SELECT odoo_id, nome, familia_nome,
   marca_nome`.
8. Para cada metadado, cria linha sintética:
   `{ produtoNome, familiaNome, marcaNome, saldoTotal: 0,
      valorTotal: 0, numLocais: 0, semEstoqueCadastrado: true,
      mensagemContexto: "produto cadastrado, sem linha de saldo" }`.
9. Concatena `linhas = [...do mapaSaldo, ...sinteticas]`.
10. Ordena `linhas` por `valorTotal desc, nome asc`.
11. `buscaMeta = { totalMatches: buscaResult.totalMatches, layer:
    buscaResult.layer }`.

Algoritmo é determinístico e sem duplicata.

### 5.6 Tool MCP `estoque_saldo_produto` (CRIT-1)

Output schema ganha campos opcionais por linha:

```ts
linha: {
  // ... existente ...
  semEstoqueCadastrado?: boolean;   // novo, true quando produto não tem linha em fato_estoque_saldo
  mensagemContexto?: string;        // novo, microcopy para o agente respeitar
}
```

Quando `semEstoqueCadastrado=true`:
- `numLocais = 0` (CRIT-1: não confundir com "tem linha mas saldo zero")
- `mensagemContexto = "produto cadastrado, sem linha de saldo"`.

Contrato externo da tool preservado fora dessas adições opcionais.

### 5.7 Prompt do agente

`identity-base.ts` ganha bloco curto na seção `[AMBIGUIDADE ESTRUTURADA]`:

> **Produtos sem saldo cadastrado:** quando uma linha trouxer
> `semEstoqueCadastrado: true`, indique explicitamente "está no
> cadastro, sem linha de saldo registrada" em vez de "saldo zero".
> Use o texto de `mensagemContexto` se presente.

E na regra de quantitativo (que já existe):

> Quando `ambiguidade.totalMatches` > N (número de linhas mostradas),
> avise "encontrei X produtos no cadastro, mostrando os primeiros N".

## 6. Migration

`prisma/migrations/<timestamp>_fato_produto_canonica/migration.sql`:

```sql
CREATE TABLE "fato_produto" (
  "odoo_id" INTEGER PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "codigo" TEXT,
  "codigo_unico" TEXT,
  "codigo_barras" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "tipo" TEXT,
  "marca_id" INTEGER,
  "marca_nome" TEXT,
  "familia_id" INTEGER,
  "familia_nome" TEXT,
  "unidade_nome" TEXT,
  "ncm_codigo" TEXT,
  "controla_estoque" BOOLEAN NOT NULL DEFAULT false,
  "permite_venda" BOOLEAN NOT NULL DEFAULT true,
  "permite_compra" BOOLEAN NOT NULL DEFAULT true,
  "preco_custo" DECIMAL(14,4),
  "preco_venda" DECIMAL(14,4),
  "peso_liquido" DECIMAL(10,4),
  "peso_bruto" DECIMAL(10,4),
  "criado_em" TIMESTAMP(3),
  "atualizado_em_odoo" TIMESTAMP(3),
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "fato_produto_ativo_idx" ON "fato_produto"("ativo");
CREATE INDEX "fato_produto_codigo_idx" ON "fato_produto"("codigo");
CREATE INDEX "fato_produto_codigo_unico_idx" ON "fato_produto"("codigo_unico");
CREATE INDEX "fato_produto_codigo_barras_idx" ON "fato_produto"("codigo_barras");
CREATE INDEX "fato_produto_familia_id_idx" ON "fato_produto"("familia_id");
CREATE INDEX "fato_produto_marca_id_idx" ON "fato_produto"("marca_id");
CREATE INDEX "fato_produto_controla_estoque_idx" ON "fato_produto"("controla_estoque");

CREATE INDEX "fato_produto_nome_unaccent_idx"
  ON "fato_produto" (lower(public.f_unaccent_immutable("nome")));
CREATE INDEX "fato_produto_nome_trgm_idx"
  ON "fato_produto" USING gin (lower(public.f_unaccent_immutable("nome")) gin_trgm_ops);
```

## 7. Testes

**Total: 15 testes** (MIN-10 absorvido).

### `fato-produto.test.ts` (8)

1. `mapProdutoRow` extrai cada campo correto.
2. `mapProdutoRow` lida com campos `false` (M2O nulo do Odoo).
3. `mapProdutoRow` extrai `marca_id` + `marca_nome` de M2O.
4. `mapProdutoRow` extrai `familia_id` + `familia_nome` de M2O.
5. `mapProdutoRow` extrai `ncm_codigo` via regex defensivo (cobre
   formato normal + null quando falha).
6. `buildFatoProduto` faz truncate + insert.
7. `buildFatoProduto` retorna métricas.
8. `buildFatoProduto` ignora `raw_deleted=true`.

### `_search-helpers.test.ts` (4)

9. `searchProductByNameWithMetaCanonical` filtra `ativo=false` por default.
10. `searchProductByNameWithMetaCanonical` filtra `controla_estoque=false` por default.
11. `searchProductByNameWithMetaCanonical` layer `"codigo"` casa pelo
    código exato.
12. `searchProductByNameWithMetaCanonical` aceita override
    `incluirInativos/incluirSemControleEstoque`.

### `estoque.test.ts` (3 novos)

13. `querySaldoProduto` com termo que retorna produtos sem saldo:
    linhas trazem `semEstoqueCadastrado=true`.
14. `querySaldoProduto` com termo "mola espiral em aço" (mock) retorna
    `buscaMeta.totalMatches >= 4`.
15. `querySaldoProduto` com termo de código exato retorna `layer="codigo"`.

## 8. Verificação contra dado real

1. Aplicar migration: `npx prisma migrate dev`.
2. Rodar `buildFatoProduto` no banco local (script manual ou via
   worker job manual).
3. SQL: `SELECT COUNT(*) FROM fato_produto;` deve ser ≥ 3787.
4. SQL: `SELECT odoo_id, nome FROM fato_produto WHERE
   lower(public.f_unaccent_immutable(nome)) LIKE '%mola%espiral%'
   AND ativo=true AND controla_estoque=true LIMIT 10;` — deve listar
   ≥ 4 produtos cobrindo códigos 1656, 1914, 1000362265, 2556.
5. Benchmark de tempo do build (M4): logar `durationMs`.
6. Via bubble: pergunta "qual o saldo de mola espiral em aço?" deve
   trazer ≥ 4 linhas, 3 com `semEstoqueCadastrado`.

## 9. Rollout

- Migration aplicada local + Prisma client regenerado.
- Rebuild `mcp` e `worker` (regra de raiz §2.1 — MIN-11 absorvido):
  ```bash
  docker compose up -d --build mcp worker
  ```
- Reinicia `app` (Next dev) ou já recarrega via HMR.
- Sem feature flag; contrato externo da tool preservado.
- Rollback: `git revert` + `DROP TABLE fato_produto`.

## 10. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Builder estoura memória | Paginação 500 em 500 (igual fato-parceiro). |
| R2 | M2O `false` inconsistente | Guards no map; null silencioso. |
| R3 | Produto deletado no Odoo continua na fato | `raw_deleted=false` + truncate. |
| R4 | Produtos sem saldo poluem resposta | Default `controla_estoque=true` (CRIT-3); flag `semEstoqueCadastrado` para o agente distinguir. |
| R5 | Conflito multi-agente em schema.prisma | Verificar `docs/agents/active/`. |
| R6 | Build > 30s | Benchmark obrigatório (M4) antes de declarar pronto. |
| R7 | Raw sync atrasa | Cadência mesma dos outros fatos. |
| R8 | NCM em formato inesperado | Regex defensivo + warning log. |
| R9 | Produtos inativos confundem usuário | Default `ativo=true`. |

## 11. Critérios de aceitação

- [ ] `tsc` + `eslint` + `jest` verdes (15 testes novos).
- [ ] Migration aplicada local + Prisma client regen.
- [ ] `fato_produto` ≥ 3787 linhas após build.
- [ ] SQL confirma 4+ "mola espiral".
- [ ] Bubble retorna 4+ produtos com 3 marcados `semEstoqueCadastrado`.
- [ ] Rebuild `mcp` + `worker` aplicado (StartedAt > commit).
- [ ] `HISTORY.md` registrado com `scope=feat+infra`.
- [ ] Active file deletado ao final.
- [ ] Benchmark de build documentado.

## 12. Decisões absorvidas (Review #1 + Review #2)

**Review #1:**
- CRIT-1: linha sem saldo tem `numLocais=0` + `mensagemContexto`.
- CRIT-2: filtro `ativo=true` default.
- CRIT-3: filtro `controla_estoque=true` default.
- CRIT-4: NCM extraído via regex defensivo.
- MED-5: benchmark obrigatório.
- MED-6: layer `"codigo"` adicionada.
- MIN-10: testes ampliados para 15.
- MIN-11: rebuild explícito no rollout.

**Review #2:**
- CRIT-1 v2: regex de código restrita (`^\d{3,}$|^[A-Z0-9]{8,}$`).
- CRIT-2 v2: `createMany({ skipDuplicates: true })`.
- CRIT-3 v2: algoritmo explícito de mescla, sem duplicata.
- MED-4: registro de `JOB_BUILD_FATO_PRODUTO` em `worker/jobs.ts`.
- MED-5: `mapProdutoRow` retorna `number` (não Prisma.Decimal).
- MED-6: `codigo_barras` normalizado no map.
- MIN-7/MIN-8: validações positivas.
