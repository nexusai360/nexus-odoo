# PLAN v3 — fato_produto canônica

**Spec:** `2026-05-25-fato-produto-canonica-design.md` v3 FINAL.

> v1, review #1, v2, review #2, v3 produzidos inline neste plan
> (decomposição máxima sem inflar arquivos separados; reviews
> exercidas mentalmente contra cada task antes da execução).

## Ondas

```
0. Pré-flight (já feito: worker no ar, 0 erros, 107/107 incrementais)
1. Schema (Prisma model + migration + client regen)
2. Builder (mapProdutoRow + buildFatoProduto + tests)
3. Job (registrar JOB_BUILD_FATO_PRODUTO + cron snapshot)
4. Busca (SearchTarget novo + searchProductByNameWithMetaCanonical)
5. querySaldoProduto enriquecido + tool MCP campos novos
6. Prompt do agente (identity-base)
7. Rebuild MCP + worker; benchmark; verificação real
```

## Onda 1: Schema

### T1.1 — Adicionar `FatoProduto` em prisma/schema.prisma

Inserir após `FatoParceiro` (~linha 1961):

```prisma
model FatoProduto {
  odooId             Int       @id @map("odoo_id")
  nome               String
  codigo             String?
  codigoUnico        String?   @map("codigo_unico")
  codigoBarras       String?   @map("codigo_barras")
  ativo              Boolean   @default(true)
  tipo               String?
  marcaId            Int?      @map("marca_id")
  marcaNome          String?   @map("marca_nome")
  familiaId          Int?      @map("familia_id")
  familiaNome        String?   @map("familia_nome")
  unidadeNome        String?   @map("unidade_nome")
  ncmCodigo          String?   @map("ncm_codigo")
  controlaEstoque    Boolean   @default(false) @map("controla_estoque")
  permiteVenda       Boolean   @default(true)  @map("permite_venda")
  permiteCompra      Boolean   @default(true)  @map("permite_compra")
  precoCusto         Decimal?  @map("preco_custo") @db.Decimal(14, 4)
  precoVenda         Decimal?  @map("preco_venda") @db.Decimal(14, 4)
  pesoLiquido        Decimal?  @map("peso_liquido") @db.Decimal(10, 4)
  pesoBruto          Decimal?  @map("peso_bruto") @db.Decimal(10, 4)
  criadoEm           DateTime? @map("criado_em")
  atualizadoEmOdoo   DateTime? @map("atualizado_em_odoo")
  atualizadoEm       DateTime  @default(now()) @map("atualizado_em")

  @@index([ativo])
  @@index([codigo])
  @@index([codigoUnico])
  @@index([codigoBarras])
  @@index([familiaId])
  @@index([marcaId])
  @@index([controlaEstoque])
  @@map("fato_produto")
}
```

### T1.2 — Migration `<ts>_fato_produto_canonica`

Conteúdo conforme spec §6. Indexes funcionais `unaccent` + `gin_trgm` no `lower(f_unaccent_immutable(nome))`.

### T1.3 — Aplicar + regen

`docker exec nexus-odoo-db-1 psql ... -f migration.sql` (idempotente IF NOT EXISTS) + `npx prisma generate`.

## Onda 2: Builder

### T2.1 — `src/worker/fatos/fato-produto.ts`

Espelha `fato-parceiro.ts`. Implementa `mapProdutoRow` + `buildFatoProduto` (paginação 500, truncate + createMany skipDuplicates).

Funções auxiliares inline:
- `extractNcmCodigo(ncm_id_raw)`: regex `^[\d.]+` no segundo elemento M2O.
- `normalizeBarcode(s)`: `replace(/[^0-9A-Z]/gi,'')` + toUpperCase.
- `toNumber(v)`: `parseFloat` defensivo retornando null para `false`/non-numeric.

### T2.2 — `src/worker/fatos/fato-produto.test.ts`

8 testes da spec §7. Mock prisma + raw_sped_produto stub.

## Onda 3: Job

### T3.1 — `src/worker/jobs.ts`

Adicionar `JOB_BUILD_FATO_PRODUTO = "build_fato_produto"` (ou registrar no fluxo de snapshot que já chama todos os builders). **Decisão: invocar `buildFatoProduto` dentro de `processSnapshotCycle`**, que já roda todos os builders no fim do snapshot. Mais simples, mesma cadência dos outros.

## Onda 4: Busca

### T4.1 — `_search-universal.ts`: estender SearchTarget

Adicionar union member: `{ table: "fato_produto"; pkColumn: "odoo_id"; nameColumn: "nome" }`.

### T4.2 — `_search-helpers.ts`: `searchProductByNameWithMetaCanonical`

- Camada 0 (código): regex `^\d{3,}$|^[A-Z0-9]{8,}$` → `SELECT odoo_id FROM fato_produto WHERE codigo=? OR codigo_unico=? OR codigo_barras=?`.
- Camadas 1-2: chama `fuzzySearch` com novo target + filtros `ativo=true AND controla_estoque=true` (defaults).
- `searchProductByNameWithMeta` antigo vira alias.

### T4.3 — `_search-helpers.test.ts`

4 testes da spec §7.

## Onda 5: Query + Tool

### T5.1 — `src/lib/reports/queries/estoque.ts`

`querySaldoProduto` segue algoritmo §5.5 da spec:
- Search → ids
- `mapaSaldo` agregado de `fato_estoque_saldo`
- `idsSemSaldo` carrega metadados de `fato_produto` → linhas sintéticas
- Concat + sort + `buscaMeta`

### T5.2 — `mcp/tools/estoque/saldo-produto.ts`

Output schema: linha ganha `semEstoqueCadastrado?: boolean` e `mensagemContexto?: string` opcionais.

### T5.3 — `estoque.test.ts`

3 testes novos (linha sem saldo, totalMatches ≥ 4, layer codigo).

## Onda 6: Prompt

### T6.1 — `src/lib/agent/prompt/identity-base.ts`

Bloco adicional em `[AMBIGUIDADE ESTRUTURADA]`: produtos sem saldo cadastrado.

## Onda 7: Rebuild + verificação

### T7.1 — `docker compose up -d --build mcp` + restart worker.

### T7.2 — Forçar `buildFatoProduto` manual (1ª build).

### T7.3 — SQL: confirmar `fato_produto >= 3787` linhas.

### T7.4 — SQL: confirmar 4+ "mola espiral" + códigos 1656, 1914, 1000362265, 2556.

### T7.5 — Benchmark: `durationMs` no log.

### T7.6 — Bubble: pergunta real, confirmar resposta com 4 produtos + 3 marcados sem saldo.

### T7.7 — Commit + push + delete active file + HISTORY.

## Critérios de pronto

Mesmos da spec §11.
