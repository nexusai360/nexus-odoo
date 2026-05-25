# Review Adversarial #1 — SPEC v1 fato_produto canônica

**Data:** 2026-05-25
**Spec:** `2026-05-25-fato-produto-canonica-design.md` v1
**Postura:** caçar falha, não validar.

## Achados

### CRIT-1: Resposta da tool com saldo 0 já é cosmeticamente igual a "produto inexistente"

**Onde:** §5.6.

Quando o produto existe no cadastro mas sem saldo, a tool agora vai
devolver `saldoTotal: 0, valorTotal: 0, numLocais: 0,
semEstoqueCadastrado: true`. Mas o agente Nex hoje renderiza isso como
"saldo 0 unidades em 1 local" sem distinguir do caso real "produto tem
saldo 0 em 1 local" (que pode existir: produto saído, recém-cadastrado).

A distinção tem que ser explícita no formato da resposta da tool, não
só em uma flag boolean que o agente pode ignorar.

**Demanda v2:** quando `semEstoqueCadastrado=true`:
- `numLocais` vira `0` (não 1 — porque não há nenhum local com linha).
- Adicionar `mensagemContexto: string` explícito tipo "produto cadastrado, sem linha de saldo".
- Mantém `semEstoqueCadastrado` para machine-readable.

### CRIT-2: Spec não cobre o caso "produto inativo no Odoo"

**Onde:** §5.1 (campo `ativo`), §5.5 (mescla).

`fato_produto` vai ter produtos ativos E inativos (active=false no Odoo).
A busca atual não filtra por `ativo`. Resultado: pergunta "saldo de mola
espiral em aço" pode trazer um produto inativo (descontinuado), confundindo
o usuário.

**Demanda v2:** `searchProductByNameWithMetaCanonical` aceita parâmetro
opcional `incluirInativos: boolean` (default `false`). Default filtra
`ativo=true`. Caller pode override para casos especiais.

A query `querySaldoProduto` passa `incluirInativos=false` (sempre).

Adicionar teste: produto inativo NÃO aparece em busca padrão.

### CRIT-3: Campo `controla_estoque` precisa governar o que entra em `linhas`

**Onde:** §5.5, §5.6.

Há produtos no cadastro com `controla_estoque=false` (serviços, kits
virtuais, taxas). Esses **não fazem sentido** numa pergunta de saldo —
não há estoque mesmo conceitualmente.

Se a busca retornar 4 produtos onde 1 tem controla_estoque=false, a
tool não deveria incluir esse 1 em `linhas` com semEstoqueCadastrado=true
(porque é falso positivo: o produto não controla estoque por design,
não é "sem saldo registrado").

**Demanda v2:** querySaldoProduto separa as classes:
- `linhas`: produtos com `controla_estoque=true` (com ou sem saldo).
- `ambiguidade.controleEstoqueDesativado`: lista curta de produtos
  ignorados por não controlarem estoque (opcional, só se houver).

Ou mais simples: filtra `controla_estoque=true` na search. Decisão
v2: **filtrar na search por default** com flag para incluir.

### CRIT-4: Spec deixa "ncm_codigo" como string vinda de slice

**Onde:** §5.1 e tabela.

`data.ncm_id[1]` é tipo `"95.06.91.00 - Artigos e equipamentos p/cultura fisica..."`. Slice antes do " - " pode falhar se o NCM vier com formato diferente em outros registros, ou se o nome do NCM contém " - " naturalmente.

**Demanda v2:** usar regex defensivo: extrair primeira sequência tipo `[0-9.]+` no início da string. Se não casar, deixar null e logar warning (não falhar o map).

### MED-5: Métrica de duração de build não tem benchmark prévio

**Onde:** §3 M4, §7 R6.

"< 10s para 3787 linhas" é estimativa. Sem prova, pode estourar e
quebrar timeout do worker em CI/produção.

**Demanda v2:** task no plan: rodar `buildFatoProduto` em dev local e
medir antes de declarar pronto. Se for > 30s, otimizar com COPY/UNNEST.

### MED-6: Pesquisa por código não vai por unaccent (é número)

**Onde:** §5.4 (busca).

O fuzzy normaliza `unaccent` no `nome`. Se o usuário pesquisa "código
2556" ou "1000202492", quer busca exata por `codigo` ou `codigo_unico`.
A spec não cobre essa rota.

**Demanda v2:** `searchProductByNameWithMetaCanonical` adiciona camada
de busca por código antes do fuzzy:
1. Camada 0 (nova): se o termo casa `^\d+$|^[A-Z]\d+$|^[\d.]+$` (regex de
   código), tentar match exato em `codigo`, `codigo_unico` e `codigo_barras`.
2. Camada 1: AND tokenizado em `nome` (existente).
3. Camada 2: trgm em `nome` (existente).

Retorno do layer: novo valor `"codigo"`.

### MED-7: A flag `semEstoqueCadastrado` precisa também resetar `valorTotal`

**Onde:** §5.5.

Se a fato_produto tem `preco_custo`, a tentação é multiplicar saldo×preço.
Mas saldo 0 × preço positivo = 0, tudo bem. Só registrar explicitamente
que valor é 0 quando não há saldo (mesmo se tivesse preço).

OK, sem ajuste. Marcado como validação positiva.

### MIN-8: Spec não documenta como `markFatoBuilt` é consumido

**Demanda v2:** referência a `fato-build-state.ts` e como o estado é
exposto em `/api/health` ou similar. Apenas referência, não muda código.

### MIN-9: A migration usa `CURRENT_TIMESTAMP` no Postgres mas Prisma espera `now()`

**Demanda v2:** confirmar que `@default(now())` no schema gera SQL
correspondente ao `DEFAULT CURRENT_TIMESTAMP` da migration (Prisma faz
isso automaticamente). Sem ajuste, só nota.

### MIN-10: 8 testes do builder + 2 extensões em querySaldoProduto pode ser pouco

**Demanda v2:** acrescentar testes do helper de busca canonical:
- Modelo inativo não aparece.
- controla_estoque=false não entra na search.
- Camada de código (CRIT-6) funciona.

Total revisado: **15 testes**.

### MIN-11: Não há plano de rebuild explícito (regra de raiz §2.1)

**Demanda v2:** task explícita no plan:
- após `prisma migrate`: `docker compose up -d --build worker mcp`.
- após mudanças em `src/lib/reports/queries/**`: rebuild `mcp`.

## Validação positiva

- §5.1 tabela de campos cobre busca + desambiguação sem inflar.
- §5.5 estratégia de enriquecimento (catalogo + saldo) é correta.
- §6 migration idempotente compatível com pattern do projeto.
- §10 riscos R5 (multi-agente) e R6 (build) bem identificados.

## Decisão

Spec v1 reprovada com **4 críticos + 3 médios + 3 menores**. Aplicar
todos em SPEC v2.
