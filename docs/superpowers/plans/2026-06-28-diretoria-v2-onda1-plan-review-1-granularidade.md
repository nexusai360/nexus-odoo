# Review #1 (granularidade / testabilidade / ambiguidade) , PLAN Diretoria v2 Onda 1

> Alvo: `docs/superpowers/plans/2026-06-28-diretoria-v2-onda1-plan.md` (v1).
> Base de comparação: SPEC v3 (§3 grid, §4 contexto, §9 schema, §11 perf, §12 ondas)
> e código real da worktree (`src/lib/diretoria/queries/estoque.ts`,
> `src/lib/diretoria/access.ts`, `src/lib/diretoria/capabilities.ts`,
> `src/app/(protected)/diretoria/estoque/page.tsx`).
> Critérios: cada task = 1 unidade pequena, verificável; zero ambiguidade; TDD;
> ordem/dependências corretas; nenhuma task faltando para o objetivo da onda.

## Contagem por severidade
- CRÍTICO: 1
- ALTO: 2
- MÉDIO: 7
- BAIXO: 2
- Total: 12

---

## CRÍTICO

### C1 , T5: assinatura do registry não casa com as queries reais (sem task de adapter)
**Problema.** T5 declara `LOADERS: Record<string, (prisma, ctx) => Promise<unknown>>`
e diz "reusando queries existentes". Mas as assinaturas reais divergem:
- `queryIndicadoresEstoque(prisma)` , recebe SÓ `prisma`, ignora `ctx`.
- `queryEstoquePorLocal(prisma)` / `queryEstoquePorFamilia(prisma)` , idem (e
  `queryEstoquePorLocal` NÃO é `async`, retorna a Promise de `agrupaSaldo`).
- A própria SPEC fala em `loader(periodo, uf, escopo)`; nenhuma das 3 aceita esses
  args.
Sem uma camada de adaptação, `LOADERS['A-01'] = queryIndicadoresEstoque` não tem a
aridade `(prisma, ctx)` e `resolverBlocos(prisma, blocos, ctx)` não consegue chamá-las
de forma uniforme. A onda inteira depende disso e hoje o passo não existe.
**Correção.** Adicionar à T5 (ou criar T5a) a definição explícita dos wrappers, um por
componente, ex.: `'A-01': (prisma, _ctx) => queryIndicadoresEstoque(prisma)`,
`'A-02': (prisma, _ctx) => queryEstoquePorLocal(prisma)`,
`'A-03': (prisma, _ctx) => queryEstoquePorFamilia(prisma)`. Declarar no step que `ctx`
é aceito mas não usado nestes 3 (UF/período entram na Onda 2) e cobrir no teste que
cada loader é invocado com `(prisma, ctx)` e devolve a forma esperada.

---

## ALTO

### A1 , T8 é um épico (3 unidades): page + gating + seed
**Problema.** T8 junta (a) reescrever a `page.tsx`, (b) lógica de gating server
(capability do componente vs `canDiretoria`), (c) seed do layout padrão. São três
escopos distintos, dois deles testáveis isoladamente, agrupados numa task só , viola
"uma unidade por task". O gating é LÓGICA PURA e testável (filtra ids por permissão),
mas está enterrado numa task de UI sem teste.
**Correção.** Quebrar em:
- **T8a , gating (pura, TDD):** `filtrarBlocosPermitidos(blocos, catalogo, podeFn)`
  em `src/lib/diretoria/builder/gating.ts`, com teste: bloco sem capability permitida
  é removido; só ids permitidos seguem para `resolverBlocos`. Resolve também a
  verificação "não dispara query" como ASSERT unitário (ver M7), não como leitura de log.
- **T8b , seed** (ver A2).
- **T8c , page render:** reescrever `page.tsx` orquestrando `carregarLayout` →
  `filtrarBlocosPermitidos` → `empacotar` → `resolverBlocos` → `<GridRelatorio>`.
  Verificação E2E no browser.

### A2 , Seed do layout padrão: load-bearing, ambíguo e sem teste
**Problema.** O "Resultado verificável" da onda depende 100% do layout PADRÃO existir
(3 blocos). Mas T8 define o seed como "via SQL/script OU no primeiro load por
super_admin" , duas mecânicas alternativas não decididas ("portar e adaptar"
disfarçado), sem arquivo nomeado e sem verificação própria. Se o seed não roda, a
página abre vazia e a onda "passa" em tsc/jest mas falha no objetivo real.
**Correção.** Task dedicada **T8b , seed determinístico e idempotente**: arquivo
explícito (ex.: `scripts/seed-diretoria-layout.ts` ou `prisma db execute` com INSERT
`ON CONFLICT DO NOTHING`), criando 1 `DiretoriaRelatorio` (`tela='estoque'`,
`donoUserId=null`, `isPadrao=true`) + 3 `DiretoriaRelatorioBloco` (A-01, A-02, A-03
com ordem/larguraQuartos/alturaU concretos dentro das travas). Verificação: rodar o
seed 2x e conferir via `information_schema`/SELECT que existem exatamente 1 relatório
e 3 blocos (idempotência comprovada). Decidir UMA mecânica, não duas.

---

## MÉDIO

### M1 , Contradição capability: opcional no tipo, obrigatória no teste, usada no gating
**Problema.** T1 define `capability?` (opcional) na interface. O teste da T1 exige
"todo componente com capability conhecida" (obrigatória). T8 faz gating por capability
do componente. Os 3 componentes (A-01/02/03) são domínio estoque → deveriam mapear
para `diretoria.estoque.view` (capability real existente em `capabilities.ts`). Hoje o
plano não diz qual capability cada um carrega, nem o que o gating faz quando
`capability` é `undefined`.
**Correção.** Decidir: capability obrigatória para componentes gateáveis (preencher
`diretoria.estoque.view` nos 3) OU regra explícita "capability undefined ⇒ público".
Alinhar interface, teste da T1 e a regra do gating (T8a). Se obrigatória, trocar
`capability?` por `capability` no `ComponenteCatalogo`.

### M2 , Travas de altura divergem da SPEC (conjunto discreto {1,2,3,4,6})
**Problema.** SPEC §3 define altura ∈ **{1,2,3,4,6}** (sem 5). T2 modela `altura(1..6)`
e o teste só cobre "larguras inválidas clampam", não altura=5 (que é inválida pela
SPEC mas válida no range 1..6). Risco de aceitar altura proibida.
**Correção.** Em T2, validar altura contra o conjunto discreto da SPEC (ex.: clamp para
o valor permitido mais próximo) e adicionar caso de teste explícito: `altura=5` é
normalizada/rejeitada. Idem nas travas por tipo da T1 (`travasDoTipo`).

### M3 , T4: mapeamento DB→BlocoLayout não especificado (nomes de campo divergem)
**Problema.** O schema (T3) usa `larguraQuartos`/`alturaU`/`componenteId`; `BlocoLayout`
(T2) usa `largura`/`altura`/`componenteId`. `carregarLayout` precisa converter, mas a
T4 não declara o mapeamento nem o testa.
**Correção.** Na T4, especificar a função de mapeamento linha→`BlocoLayout`
(`larguraQuartos→largura`, `alturaU→altura`) e cobrir no teste do mock prisma que os
campos chegam renomeados corretamente.

### M4 , Suspense por bloco: SPEC §11 diz "onda 1", plano resolve tudo em Promise.all
**Problema.** SPEC §11 afirma "Suspense por bloco ... Definido já na onda 1". O plano
(T5 `resolverBlocos` com `Promise.all` no server + T6 render) resolve TUDO antes de
renderizar; não há Suspense/streaming por bloco em nenhuma task. Discrepância de escopo.
**Correção.** Decidir explicitamente: ou (a) adicionar task de Suspense boundary por
`<BlocoCard>` na T6, ou (b) registrar no plano que Suspense por bloco fica para a Onda
2/3 e ajustar a SPEC. Não deixar a promessa órfã.

### M5 , Estados de erro/vazio por bloco ausentes na UI
**Problema.** T5 trata loader sem id "retorna null + marca", e loaders podem falhar.
Mas T6/T7 não especificam como `<BlocoCard>`/render exibe o caso `null`/erro/vazio.
Sem isso, um bloco com dado ausente quebra ou renderiza em branco.
**Correção.** Em T6, especificar estados do `<BlocoCard>`: carregando (se aplicável),
vazio (dado sem linhas) e erro (loader falhou/null → placeholder com aviso). É UI, mas
o contrato de estados precisa estar no step.

### M6 , T3: índices ausentes para a consulta de `carregarLayout` e ordenação
**Problema.** T3 cita "@@index" genérico. A consulta da T4 filtra por
`tela`+`donoUserId`+`isPadrao` e ordena blocos por `ordem`. Sem índice em
`(tela, isPadrao, donoUserId)` e em `(relatorioId, ordem)` a leitura faz scan.
**Correção.** Em T3, declarar explicitamente os índices: `DiretoriaRelatorio
@@index([tela, isPadrao])` (e/ou incluir `donoUserId`) e `DiretoriaRelatorioBloco
@@index([relatorioId, ordem])`. Verificar presença via `information_schema`.

### M7 , Verificação "bloco sem permissão não dispara query (log)" não é acionável
**Problema.** T8 propõe comprovar o gating "por log". Não há instrumentação de log
especificada e log é evidência frágil. O gating é determinístico e testável.
**Correção.** Trocar por asserção unitária na T8a: dado um bloco sem permissão,
`filtrarBlocosPermitidos` o remove e `resolverBlocos` é chamado SEM aquele id (spy no
mock prisma confirma que o loader correspondente não roda). Mantém a verificação no
nível de teste, não de inspeção manual de log.

---

## BAIXO

### B1 , `escopoUfs`/UF do `LoaderCtx` não é consumido pelos 3 loaders da onda
**Problema.** `LoaderCtx` tem `uf`/`escopoUfs`, mas as 3 queries de estoque não
aceitam filtro de UF (ex.: `queryIndicadoresEstoque(prisma)`). SPEC §7 fala em injetar
escopo por UF nas queries; na onda 1 isso não acontece (campo morto).
**Correção.** Registrar no plano que o escopo por UF é no-op nesta onda (estoque não
filtra por UF) e que a injeção real entra quando vierem componentes UF-sensíveis
(B/C, Onda 2). Evita falsa sensação de gating por UF já ativo.

### B2 , T7: componente de gráfico para A-03 não nomeado
**Problema.** T7 diz "A-03 (gráfico família, reusa charts)" sem nomear qual componente
de chart existente. "Reusa charts" é levemente ambíguo.
**Correção.** Nomear o componente/charts concreto a reusar (o mesmo já usado na tela de
estoque atual para distribuição por família) no step da T7.

---

## Notas de dependência/ordem (sem achado bloqueante)
- Ordem T1→T2→T3→T4→T5→T6→T7→T8 está coerente: `BlocoLayout`/`BlocoPosicionado` (T2)
  precedem T4/T6; catálogo (T1) precede loaders (T5) e gating (T8a). Manter.
- Após a quebra da T8, a ordem sugerida é T8a (gating, pura) → T8b (seed) → T8c (page),
  com T8c por último por depender de tudo.
