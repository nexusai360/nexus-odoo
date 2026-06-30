# Review #2 (técnica/adversarial) , PLAN Diretoria v2 / Onda 1

> Foco: correção técnica, reuso e riscos. Base confrontada contra o código real:
> `src/lib/diretoria/queries/estoque.ts`, `access.ts`, `capabilities.ts`,
> `prisma/schema.prisma`, `src/components/diretoria/*`, `estoque/page.tsx`, `prisma.ts`.
> Cada achado: severidade, problema, correção concreta.

## Placar
- CRÍTICO: 0
- ALTO: 4
- MÉDIO: 4
- BAIXO: 3
- Total: 11

---

## ALTO

### A1 , Packing (T2) vs render CSS (T6): duas fontes de verdade e altura ignorada
**Problema.** O motor calcula `BlocoPosicionado { linha, colInicio }`, mas o T6 renderiza
com `grid-column: span (largura*3)` apenas (auto-flow). Span sozinho NÃO usa
`linha`/`colInicio`: quem posiciona vira o auto-flow do browser, então a saída do motor
fica órfã e pode divergir da grade real. Pior: o algoritmo descrito (cursor de coluna,
quebra quando não cabe) trata toda linha como 1u de ALTURA. Com `altura ∈ {1..6}`, um
bloco alto (6u) ao lado de um baixo (1u) faz a "linha" seguinte do motor começar sem
limpar o bloco alto, gerando sobreposição/ragged rows no CSS. Esse é exatamente o ponto
que a SPEC §15 marcou como o mais complexo.
**Correção.** Escolher UMA fonte de verdade. Opção recomendada: posicionamento explícito,
`grid-template-columns: repeat(12,1fr)`, `grid-auto-rows: 132px`, e cada bloco emite
`grid-column: <colInicio*3+1> / span <largura*3>` e `grid-row: span <altura>`. O motor
precisa ser height-aware (manter altura por coluna ocupada, ou usar `grid-auto-flow: dense`).
Se for manter span-only auto-flow, então `linha`/`colInicio` saem da assinatura (motor só
valida quebra/clamp) e o teste "sem sobreposição" passa a checar a soma por linha, não
posições que ninguém usa.

### A2 , `dados: Map` cruzando a fronteira RSC server→client não serializa
**Problema.** T6 passa `dados={Map}` ao `<GridRelatorio>`/`<BlocoCard>`. Map não é
serializável pelo RSC; se `GridRelatorio`/`BlocoCard`/o gráfico (client, recharts) receber
o Map como prop, quebra em runtime. Já houve essa mordida nesta branch (commit `387dfadb`
"nav serializavel server->client").
**Correção.** Resolver `dados` no server e entregar a cada folha apenas o pedaço dela
(objeto/array plano). Nunca passar um `Map` para componente client. `GridRelatorio` pode
ser server e fazer o lookup `dados.get(id)` internamente, passando só o resultado plano ao
renderizador client.

### A3 , Relação Prisma incompleta em T3 (prisma generate quebra)
**Problema.** T3 descreve só o lado filho (`relatorioId uuid FK`). Prisma exige os DOIS
lados da relação: `blocos DiretoriaRelatorioBloco[]` no pai e `relatorio
DiretoriaRelatorio @relation(fields:[relatorioId], references:[id], onDelete: Cascade)` no
filho. Sem isso `prisma generate` falha e a tarefa não fecha.
**Correção.** Declarar ambos os lados + `onDelete: Cascade` (apagar relatório apaga blocos).
Seguir convenção já usada no schema (`@db.Uuid`, `@map` snake, `@@index`). Confirmado o
padrão em `UserDiretoriaAccess`/`UserDiretoriaUf`.

### A4 , Regressão: reescrever `estoque/page.tsx` para 3 blocos derruba A-04..A-08 já no ar
**Problema.** A página atual já entrega 7 seções funcionando com dado real (A-01 KPIs, A-02
local, A-03/A-05 família, A-03 catálogo modelos, A-08 compras fornecedor, A-07 compras
ativas, A-06 seriais). T8 reescreve a página para um layout padrão de 3 blocos, removendo
da tela viva tudo que já funciona. A própria SPEC §0/§15 alerta "não quebrar o que já
funciona".
**Correção.** O layout padrão da onda 1 deve incluir os blocos já construídos (registrar
loaders para catálogo/compras-fornecedor/compras-ativas/seriais e mantê-los no seed), OU
manter a página atual e subir o construtor atrás de flag até a paridade. Não deletar as
queries/components existentes. O "resultado verificável" da onda deve exigir paridade, não
3 blocos.

---

## MÉDIO

### M1 , Sem unicidade do "padrão"/"do usuário"; seed em render é race
**Problema.** `carregarLayout` assume um único relatório padrão (`isPadrao`, dono null) e um
por usuário, mas o schema T3 não tem unique. Dois padrões podem coexistir → escolha
ambígua. Pior, T8 sugere semear "no primeiro load por super_admin": escrita dentro de um
GET, em corrida, sem unique, gera padrões duplicados.
**Correção.** Índices únicos parciais: um padrão por tela (`UNIQUE(tela) WHERE dono_user_id
IS NULL AND is_padrao`) e um por (tela, dono_user_id). Seed via script idempotente dedicado
(prisma/sql ou script TS rodado uma vez), nunca dentro do render da página.

### M2 , `resolverBlocos` com `Promise.all` derruba o relatório inteiro se um loader falhar
**Problema.** Um erro de DB num bloco rejeita o `Promise.all` e quebra a página toda,
contra a filosofia de resiliência (SPEC §4 "consumir é no-op se ausente") e contra Suspense
por bloco.
**Correção.** `Promise.allSettled`; bloco com erro renderiza estado de erro próprio e os
demais seguem. Casar com o tratamento de "loader ausente → null + marca" que o T5 já prevê.

### M3 , Suspense por bloco (SPEC §11) é incompatível com resolver tudo upfront em T8
**Problema.** T8 chama `resolverBlocos` (Promise.all) ANTES do render, o que faz a página
aguardar todos os loaders: zero streaming, Suspense não entrega nada. T6 já levanta a
dúvida.
**Correção.** Para Suspense real, cada bloco vira um server component async que aguarda só o
seu loader, embrulhado em `<Suspense>`. Alternativa honesta: declarar que onda 1 resolve em
bloco único (sem Suspense) e mover Suspense por bloco para a onda 2, removendo a alegação do
plano.

### M4 , Gating por bloco é no-op/inexercível na onda 1
**Problema.** Os 3 blocos são todos da área estoque → capability `diretoria.estoque.view`,
a MESMA que `requireDiretoriaArea("estoque")` já exige para entrar na página. Logo "bloco
sem permissão não renderiza nem dispara query" não pode ser demonstrado. E `userUfs` não se
aplica às queries de estoque (não têm filtro de UF), então o escopo por UF também é no-op
aqui.
**Correção.** Incluir no seed/teste um 4º bloco-fixture com capability distinta (ex. de
outra área) só para provar o gating, ou ajustar a verificação E2E para um caso que realmente
exercite negação. Documentar que UF-scoping não atua em estoque.

---

## BAIXO

### B1 , Packing clampa largura a 1..4 genérico, ignorando travas por tipo do catálogo
**Problema.** T1 define travas por tipo (kpi 1..2 etc.), mas T2 clampa só a 1..4. Um bloco
salvo com largura fora da trava do seu tipo passa silenciosamente.
**Correção.** Validar/clampar largura e altura contra as travas do catálogo (`travasDoTipo`)
no packing ou no `layout-repo`, não só ao range global.

### B2 , Dedupe por `componenteId` é mais estreito que a intenção da SPEC §11
**Problema.** SPEC §11 quer "mesma QUERY usada por 2 blocos roda 1x"; o plano dedup só por
id de componente (ajuda apenas se o MESMO componente aparece 2x, raro). Para onda 1 (3
componentes distintos) é no-op.
**Correção.** Suficiente para a onda; registrar que o ganho real (dedupe por chave de query)
fica para quando dois componentes compartilharem o mesmo loader/parâmetros.

### B3 , `prisma db execute` cria drift vs histórico de migrations
**Problema.** CREATE TABLE IF NOT EXISTS via `db execute` mantém schema.prisma e DB
alinhados para `generate`, mas não gera registro de migration; em prod faltará a migration.
Aceitável no escopo local-only, mas é dívida.
**Correção.** Salvar o SQL como arquivo versionado (prisma/sql/…) e, quando a F6/onda for
liberada para prod, materializar uma migration real. Confirmar idempotência (IF NOT EXISTS
em tabela e índices).

---

## Notas de reuso confirmadas (corretas no plano)
- `queryIndicadoresEstoque/queryEstoquePorLocal/queryEstoquePorFamilia` recebem só `prisma`;
  o `LoaderCtx` (periodo/uf/escopo) é ignorado por elas , o plano acerta ao notar isso.
- Gráficos client com recharts já existem (`vendas-charts.tsx`, "use client"); reuso de
  visual em T7 é viável.
- Worker NÃO é tocado: correto, nenhum builder/catálogo muda. Mudança em schema.prisma só
  exige `prisma generate` local (dev:fresh já roda).
- Convenções de schema (uuid/@map/@@index) batem com models existentes.
