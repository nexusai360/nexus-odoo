# Review Adversarial #2 — SPEC v2 fato_produto canônica

**Data:** 2026-05-25
**Spec:** `2026-05-25-fato-produto-canonica-design.md` v2
**Postura:** mais profunda que a #1; caçar furos finos restantes.

## Achados

### CRIT-1: Conflito entre busca por código exato e fuzzy de nome com dígitos

**Onde:** §5.4 Layer "codigo".

Regex `^[\d.]+$|^[A-Z0-9]{4,}$` captura tanto código (`2556`,
`1000202492`) quanto **trecho de nome com dígitos** (`W8000` do produto
`MOLA ESPIRAL EM ACO W8000`). Se o usuário digitar `W8000`, a v2
encaminha para busca exata de código e não acha nada — pula
direto para `none`, perdendo o produto.

**Demanda v3:** layer `"codigo"` é tentada **em paralelo** ao layer
exato. Se layer código casa, ela **soma** ao resultado do layer exact
em vez de substituir. Se nenhuma das duas casa, cai para fuzzy.

Alternativa mais simples: a regex de código fica restrita a strings
**puramente numéricas** ou puramente alfanuméricas longas (≥ 8 chars).
Termos curtos com letras-e-números (ex.: `W8000`) saem fora.

**Decisão v3:** versão restritiva — `^\d{3,}$|^[A-Z0-9]{8,}$`. Cobre
`2556`, `1656`, `1000202492` e EANs. Termos curtos com letra (`W8000`)
caem em layer 1 (nome) onde funcionam via trgm.

### CRIT-2: Spec não define o que acontece em conflito de chave primária

**Onde:** §5.2 Builder.

Strategy "truncate + insert" funciona, mas se `prisma.fatoProduto.createMany`
encontrar duplicata por algum erro de raw, falha o batch inteiro. Spec
não fala de `skipDuplicates`.

**Demanda v3:** `createMany({ data: batch, skipDuplicates: true })`.
Logar contagem de duplicatas (deveria ser zero; se não, sinal de raw
inconsistente).

### CRIT-3: Mescla na §5.5 pode duplicar linhas

**Onde:** §5.5 passo 4.

"Ids presentes em ambos" → linha normal. "Ids só em `fato_produto`"
→ linha sem saldo. Mas a `fato_estoque_saldo` pode ter **múltiplas
linhas por produto_id** (uma por local). A iteração atual de
`querySaldoProduto` agrega via Map por `produtoId` — bem. Mas se a
mescla introduzir o produto via `fato_produto` antes do loop de
agregação, pode dar inconsistência (produto duplicado se já vier em
`fato_estoque_saldo`).

**Demanda v3:** algoritmo explícito:

1. Carrega linhas brutas de `fato_estoque_saldo` filtradas por
   `produtoIdsFiltro`.
2. Agrega via Map por `produtoId` → conjunto `idsComSaldo`.
3. Para cada id em `produtoIdsFiltro` que **não** está em
   `idsComSaldo`, busca metadata em `fato_produto` e adiciona linha
   sintética com `saldoTotal=0`, `numLocais=0`,
   `semEstoqueCadastrado=true`.
4. Ordena por `valorTotal desc, nome asc`.

Algoritmo idempotente, sem duplicata.

### MED-4: Worker container atual pode não ter código do builder

**Onde:** §9 Rollout.

A regra de rebuild diz "rebuilde worker". Mas precisa garantir que o
**job já está agendado** no worker rebuildado. Se o builder está no
código mas o job não está registrado, o build nunca roda
automaticamente.

**Demanda v3:** plan v3 task explícita: "alterar `src/worker/jobs.ts`
registrando `JOB_BUILD_FATO_PRODUTO` no array de jobs do cron build;
testar que worker rebuildado tem o job".

### MED-5: Decimal(14,4) vs Prisma `Decimal`

**Onde:** §5.1 schema, §6 migration.

Prisma schema usa `Decimal? @db.Decimal(14, 4)`. Já validado em outros
fatos. Sem mudança, só nota: garantir consistência no `mapProdutoRow`
para que o valor seja `Prisma.Decimal` ou número JS dependendo do
runtime (`createMany` aceita number).

**Demanda v3:** `mapProdutoRow` retorna **number** para campos de
preço/peso, com `parseFloat` defensivo. Prisma converte.

### MED-6: Caracteres especiais no `codigo_barras`

**Onde:** §5.4 busca camada "codigo".

EAN/GTIN são puramente numéricos. Se `codigo_barras` no Odoo tem
espaço ou hífen, a busca exata falha.

**Demanda v3:** ao salvar `codigo_barras` no builder, normalizar:
remover espaços e caracteres não-`[0-9A-Z]` (preserva alfanumérico).
Plan v3 inclui essa normalização no `mapProdutoRow`.

### MIN-7: Documentar uso de `markFatoBuilt`

**Onde:** §5.2.

Spec v1 já tinha menção. V2 manteve mas sem detalhe. Plan v3 já vai
expor o nome registrado (`'fato_produto'`).

### MIN-8: Aviso prévio em conversation.persistMessage de assistant com toolCalls

Não é dessa spec, mas como o agente que mexer vai tocar prompt + tool,
vale uma nota:

**Demanda v3:** documentar no rollout que após mudar
`identity-base.ts`, o composeSystemPrompt já injeta no próximo turno;
não precisa de nada além de rebuild do `mcp` (que importa identity).

## Validação positiva (sem achado)

- §5.6 distinção clara entre `numLocais=0` (sem linha) e saldo zero (em linhas existentes).
- §10 R8 R9 cobertos com filtros default sólidos.
- §11 critérios objetivos.

## Decisão

Spec v2 reprovada com **3 críticos + 3 médios + 2 menores**. Aplicar
em SPEC v3 (próximo).
