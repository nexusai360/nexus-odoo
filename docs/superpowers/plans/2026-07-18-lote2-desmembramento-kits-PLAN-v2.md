# PLAN v2 (FINAL) , Lote 2: Desmembramento de Kits (BOM) para análise de compra

> v2 = v1 + review adversarial (1 crítico, 3 altos, 5 médios, 2 baixos, tudo medido no cache real).
> Mesma branch `feat/diretoria-entregas-estoque`, sem PR/merge até o dono liberar.

> ## ESTADO DA EXECUÇÃO (2026-07-18)
> - [x] **K0** investigação (fechada).
> - [x] **K2** função pura `desmembrarDemanda` (`src/lib/estoque/desmembrar-kit.ts`) , 7 testes verdes.
> - [ ] **K1** fato da BOM , **PRÓXIMO. Começa com MIGRATION de schema.** Parei aqui de propósito:
>   regra do projeto (CLAUDE.md/STATUS) é NÃO iniciar migration com contexto apertado (migration
>   pela metade = pior caso). Retomar com contexto fresco: editar `prisma/schema.prisma`
>   (`FatoListaMaterialItem`), `migrate diff --from-migrations --to-schema` (aditivo, sem reset),
>   `agente schema-changed`, builder `fato-lista-material.ts` (padrão `fato-produto.ts`, ligar por
>   `produto_produzido_id`), registrar no `registry.ts`, rebuild worker via `app`, popular o fato.
> - [ ] **K3** integração na `queryNecessidadeCompra` (épico, decomposto em K3a-d).
> - [ ] **K4** UI (aba Compras). · [ ] **K5** verificação.

## 1. Objetivo
Kit vendido → desmembrar nos componentes → necessidade de compra **por componente** (estoque do
componente − demanda desmembrada). É o "estoque menos demanda no unitário" que o dono descreveu.
Fase 1 = QUANTIDADE (esta entrega). Fase 2 = rateio de VALOR (Matrix/acessórios), pendente do dono.

## 2. Decisões corrigidas pela review (o que muda vs v1)
- **[C1] Ligação pelo PAI direto**: `FatoListaMaterialItem.produto_pai_id = item.produto_produzido_id`
  (casa 1:1 com o cabeçalho, medido; recupera 8 kits que `lista_material_id` perdia). `lista_material_id`
  vira só reforço.
- **[M4] Só 1 migration**: `ehKit` deriva de `fato_produto.unidadeNome` (`/^kit/i`), não precisa coluna;
  a ligação por pai dispensa `listaMaterialId`. **K2 (colunas no fato_produto) ELIMINADO.**
- **[M1] `tipo_item`**: incluir `P` **e** `PRD-R` (os 2 PRD-R são peças estruturais reais; excluir
  subestimaria a compra). Excluir só o que K0 provar ser não-material.
- **[A1] Kit montado**: abater a demanda do kit pelo **saldo do próprio kit** antes de desmembrar
  (3 kits têm saldo montado; só o excedente vira demanda de componente).
- **[M2] Componente órfão**: 11 componentes sem `raw_sped_produto` ativo → linha com aviso, nome do
  raw da BOM, sem custo (igual ao "kit sem BOM").
- **[M3] Agregar**: demanda de um componente = kits desmembrados + venda avulsa, somados numa linha
  antes de subtrair o saldo.
- **[A2] Duas telas**: `queryNecessidadeCompra` E `queryEstoqueDisponivelDiretoria` vivem na mesma
  página. Decisão: desmembrar **só a necessidade de compra** nesta fase (é a que o dono pediu); a
  outra continua por produto, e a UI rotula a diferença. Documentar.
- **[B1] Rebuild**: mudança em `queryNecessidadeCompra` roda no **app** (não é consumida pelo MCP);
  o fato novo exige rebuild do **worker** (via `app`).

## 3. Ondas (K0 é gate de K1+)

### K0 , Fechar premissas (gate, sem código) , JÁ FEITO
- tipo_item P=473/PRD-R=2 (ambos material); BOM 1 nível (sem recursão); componentes têm saldo
  próprio (148/168); ligação por pai 1:1; 0 quantidades sujas; todos compráveis. Unidade dos
  componentes: `unid` (256) e `pares` (10) , a `quantidade` da BOM é na unidade do componente.

### K1 , Fato da BOM (1 migration aditiva)
- `model FatoListaMaterialItem`: `id`, `produtoPaiId` (Int, index), `componenteProdutoId` (Int, index),
  `componenteNome` (String?), `quantidade` (Decimal 18,4), `tipoItem` (String?), `listaId` (Int?).
- Migration aditiva por `migrate diff --from-migrations --to-schema` (sem reset); depois
  `agente schema-changed`. Banco compartilhado, só a main como worktree hoje.
- Builder `src/worker/fatos/fato-lista-material.ts` no padrão `fato-produto.ts`: lê
  `raw_sped_produto_lista_material_item` (raw_deleted=false), `produto_pai_id = produto_produzido_id[0]`,
  `componente_produto_id = produto_id[0]`, `componente_nome = produto_id[1]`, `quantidade`, `tipo_item`.
  transaction deleteMany+createMany + markFatoBuilt. Registrar em `registry.ts` (FATO_BUILDERS).
- TDD do `mapListaMaterialRow` (m2o, quantidade defensiva).

### K2 , Função de desmembramento (pura, TDD) , sem banco
- `desmembrarDemanda(itens, bomPorPai, saldoKitPorProduto): DemandaComponente[]`:
  - kit (unidade kit) COM BOM: para cada componente, `max(0, qtdKit − saldoKitMontado) × qtdComponente`.
  - kit SEM BOM ou não-kit: passa o próprio produto (fallback honesto, flag `semBom`).
  - agrega por componente (soma kits + venda direta).
- Testes: kit simples, kit com saldo montado (abate), kit sem BOM (fallback), componente vendido
  direto + via kit (agrega), múltiplos componentes.

### K3 , Integrar na necessidade de compra (decomposto, [B2])
- K3a: `queryNecessidadeCompra` carrega a BOM (fato) + saldo de kit; monta `bomPorPai`.
- K3b: aplica `desmembrarDemanda` na demanda antes de subtrair o saldo (por componente).
- K3c: fallback de componente órfão (nome do raw, custo/saldo ausentes → aviso).
- K3d: nova saída por componente + flag de kit sem BOM. E2E real (necessidade por componente fecha).

### K4 , UI (aba Compras do Estoque) , inline, ui-ux-pro-max
- Coluna/visão de necessidade por componente, com aviso para kits sem BOM e componentes órfãos.
- Perícia de UI.

### K5 , Verificação
- rebuild app+worker (via `app`), tsc/jest/E2E verdes, docs (kpis-diretoria + STATUS), auto-perícia.

## 4. Fase 2 (pendente do dono): rateio de VALOR (Matrix estrutura / acessórios por quilo + torre).

## 5. Invariantes
- Ligação por pai; 1 nível; incluir P+PRD-R; abater kit montado; agregar por componente; fallback
  honesto (kit sem BOM e componente órfão); rebuild via app; migration aditiva sem reset + schema-changed.
