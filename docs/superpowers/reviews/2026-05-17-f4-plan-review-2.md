# Review #2 — PLAN F4 (MCP Semântico) — auditoria adversarial final

> Revisor adversarial sênior. Etapa [7] do workflow (`CLAUDE.md §6`).
> Alvo: `docs/superpowers/plans/2026-05-17-f4-mcp-semantico.md` (v2, 39 tasks).
> Base: SPEC v3 + Review #1 (24 achados).
> Foco: granularidade, integração, testabilidade — cada task é executável por um
> subagente Sonnet mecânico? Verificado contra o código real (`report-data.ts`,
> `processors.ts`, `fato-estoque-saldo.ts`, `fato-build-state.ts`,
> `freshness.ts`, `domains.ts`, `tsconfig.json`, `prisma/schema.prisma`).

Contagem: **3 CRÍTICO · 7 IMPORTANTE · 6 MENOR.**
Status agregado dos 24 achados da Review #1: **20 resolvidos · 4 resolvidos só
parcialmente** (C5, I8, I3, I6 — ver tabela e achados novos N1, N2, N5, N9).

---

## Tabela — status dos 24 achados da Review #1

| # | Achado original | Resolução na v2 | Veredito |
|---|---|---|---|
| C1 | 4c-2 épico de 6 tools | 4c.4–4c.9, uma task/tool, schemas Zod literais, `shape` definido em 4c.4 e descrito em 4c.5–4c.9 | **RESOLVIDO** |
| C2 | `withFreshness`×`estadoDoFato`; multi-fato | 4c.0 Step 1 fixa `estadoDoFato` no wrapper; 4c.2 Step 4 define o envelope | **RESOLVIDO** (mas ver N3 — wrapper precisa reconstruir o estado preparando) |
| C3 | 4a.9 épico servidor+pipeline | 4a.14/4a.15/4a.16/4a.17, 4a.17 com teste do pipeline | **RESOLVIDO** |
| C4 | Catálogo nunca criado | 4a.12 cria `mcp/catalog/index.ts`; contrato declarado; cada tool registra | **RESOLVIDO** (ver N6 — ordem de descomentar imports) |
| C5 | `mcp/tsconfig.json`/imports cruzados | 4a.4 define `paths`/`include`; 4a.5 Step 2 compila import transitivo; 4f-5 Dockerfile copia `src/` | **PARCIAL** — ver N1 (`jsx`/`module` herdados conflitam; `tsx` ≠ `tsc` no Dockerfile) |
| C6 | Teste de paridade #IM-8 | 4c.10 cria o teste | **RESOLVIDO** (ver N7 — `jest.spyOn` em módulo ESM exige cuidado) |
| I1 | PK `bancoId` não verificada | 4a.2 Step 3 verifica; 4a.3 Step 1 escolhe a PK | **RESOLVIDO** |
| I2 | Monetário como `Float` | 4a.3 todos `Decimal(18,2)` | **RESOLVIDO** |
| I3 | `markFatoBuilt` fora da transação | 4b.2–4b.4 Step 1 dizem `markFatoBuilt(tx,…)` dentro | **PARCIAL** — ver N5 (`createMany` + `markFatoBuilt(tx)`: o `tx` do `$transaction` interativo serve, mas o tipo `FatoBuildStateClient` aceita — ok; o gap real é o `atualizadoEm` por linha) |
| I4 | Registry quebra `try/catch` por builder | 4b.1 Step 1/3 replica o `try/catch`+log | **RESOLVIDO** |
| I5 | `processIncrementalCycle` sem ponto de chamada | 4b.1 Step 4: após o `for` (linha 64) | **RESOLVIDO** |
| I6 | 4c-1 épico de 6 relatórios | 4c.0 + 4c.1a–4c.1f, uma task/relatório | **PARCIAL** — ver N2 (cada 4c.1x ainda funde extração + reescrita do wrapper + migração de teste = 3 unidades) |
| I7 | núcleo herda `catch`? | 4c.0 Step 1: núcleo não captura; `catch` só no wrapper | **RESOLVIDO** |
| I8 | Mapa fato→fonte inexistente | 4c.2 Step 1 cria `FATO_FONTE` | **PARCIAL** — ver N4 (`reportFreshness` lê `lastSnapshotAt`; fatos incrementais não têm `lastSnapshotAt` — `withFreshness` precisa de campo por modo) |
| I9 | Agregação de financeiro sem casa | 4d.0 cria `financeiro.ts`; 4d.1–4d.7 função/teste por tool | **RESOLVIDO** |
| I10 | `diasAtraso`/"não pago" dep 4a.2 | 4d.5–4d.7 dependem de 4a.2 | **RESOLVIDO** |
| I11 | `.env.example` órfão | 4a.0; 4a.6 falha seguro | **RESOLVIDO** |
| M1 | `typeof prisma` frágil | 4a.11 `PrismaClient` | **RESOLVIDO** |
| M2 | session-store `Map` | 4a.8 Step 3 comentário | **RESOLVIDO** |
| M3 | `server.ts` reeditado fora de onda | 4f-3 declara | **RESOLVIDO** |
| M4 | 4b.0 muda 4a.1 retroativo | 4a.2 antes de 4a.3 | **RESOLVIDO** |
| M5 | 4c-2.0 depois de 4c-2 | `withFreshness` é 4c.2, antes das tools | **RESOLVIDO** |
| M6 | 4f-4 testa tool de 4e | 4f-4 Step 2 declara dep | **RESOLVIDO** |
| M7 | Verificação CI×manual | dividida | **RESOLVIDO** |

---

## CRÍTICO

### N1 — `mcp/tsconfig.json` herda `module`/`jsx`/`lib` errados do raiz; `tsc` no Dockerfile não garante o runtime `tsx`
**Task afetada:** 4a.4, 4a.5, 4f-5.
A Review #1 (C5) pediu resolução de `@/`. A v2 resolveu o alias, mas
**introduziu três problemas novos** ao copiar o snippet do tsconfig:

1. O raiz tem `"moduleResolution": "bundler"` e `"module": "esnext"`. O
   `mcp/tsconfig.json` redefine para `nodenext`/`nodenext`. **`extends` faz
   merge, mas `moduleResolution: "bundler"` é incompatível com `module:
   "nodenext"`** — e mais grave: o `src/` foi escrito sob `bundler` (imports sem
   extensão `.js`, `import "@/lib/..."`). Compilar `src/**` com
   `moduleResolution: "nodenext"` **vai exigir extensões `.js` explícitas em
   todo import relativo de `src/`** e quebrar. O plano manda `include:
   ["**/*.ts", "../src/**/*.ts"]` — ou seja, recompila TODO o `src/` sob regras
   `nodenext`. Isso falha em centenas de arquivos. A 4a.4 Step 2 afirma "PASS" —
   não vai passar.
2. `jsx: "react-jsx"` no `mcp/tsconfig.json` é ruído: o `mcp/` é Node puro sem
   JSX. Foi copiado só porque o `src/` tem `.tsx`. Sintoma de que o `include` de
   `src/**` está errado em conceito.
3. **`include` de `src/**` é a decisão errada.** O `mcp/` não deve *compilar* o
   `src/` — deve apenas *resolver tipos* dele. O correto é `mcp/tsconfig.json`
   com **`references`** ao projeto raiz, ou um `include` só de `mcp/**` com
   `paths` apontando para `../src/*` (o `tsc` resolve os tipos via `paths` sem
   recompilar). Compilar `src/**` sob outro tsconfig é a causa-raiz.
4. **Dockerfile (4f-5):** roda `tsx mcp/index.ts` em runtime. `tsx` faz
   transpile por arquivo, ignora `tsconfig` para checagem de tipo e **resolve
   `@/` só se o `tsconfig.json` mais próximo tiver os `paths`** — `tsx` lê
   `paths`, ok, mas o `npx tsc --noEmit -p mcp/tsconfig.json` dentro do build
   (Step 1) vai falhar pelos itens 1–3. O build quebra.

**Recomendação:** redesenhar a 4a.4. Opção A (mais limpa): `mcp/tsconfig.json`
**não** estende o raiz nem inclui `src/**`; define `module/moduleResolution:
nodenext`, `baseUrl: ".."`, `paths: { "@/*": ["src/*"] }`, `include:
["**/*.ts"]`. O `tsc` resolve os tipos de `@/...` via `paths` sem recompilar o
`src/` inteiro — só os arquivos de `src/` efetivamente importados entram, e
entram como dependências, não como raízes de compilação. Opção B: usar
`references`. A 4a.4 deve ter um step que **comprova** que `tsc -p
mcp/tsconfig.json` **não emite erro em arquivos `.tsx` de `src/`** (se emitir, o
`include` está errado). A 4a.5 Step 2 vira a primeira prova real. Sem isso, a
onda 4a inteira "passa" no papel e quebra na execução.

### N2 — Tasks 4c.1a–4c.1f ainda são tri-unidade: extração + reescrita do wrapper + migração de teste numa task só
**Task afetada:** 4c.1a, 4c.1b, 4c.1c, 4c.1d, 4c.1e, 4c.1f.
A Review #1 (I6) mandou "uma task por relatório". A v2 fez isso — mas cada uma
das 6 tasks resultantes contém **três operações distintas e de risco distinto**
no mesmo bloco:
- Step 1: criar a função-núcleo (mover o miolo de agregação) — risco médio.
- Step 2: **reescrever** a Server Action como wrapper, preservando comportamento
  externo (guard + freshness + `estadoDoFato` + shaping + `catch`) — risco
  **alto**: é onde a F3 quebra se errar.
- Step 3: **mover** o teste de agregação de `report-data.test.ts` para
  `estoque.test.ts` **e** podar o teste antigo — risco médio, e mexe em dois
  arquivos de teste.
O `CLAUDE.md §6` é explícito: *"Se uma task descreve 'portar a tela X' com lista
+ forms + actions juntos, ela é um épico — quebrar em uma task por arquivo ou
por ação."* Step 2 (reescrita do wrapper que não pode regredir a F3) é uma ação
que merece verificação isolada — hoje ela compartilha o `jest` final com a
extração e a migração de teste, então um PASS não diz **qual** das três coisas
está certa. Pior: o Step 2 de 4c.1a descreve o wrapper em prosa
(`"try { requireReport + guardDominio + ... } catch"`) **sem o código** — e o
`getRelatorioSaldoProduto` real tem nuances (o objeto `vazio` pré-montado nas
linhas 89-92, o `freshness` passado ao retorno, a distinção `estado: "vazio"`
vs `"ok"` conforme `linhas.length`). Um Sonnet reescrevendo isso "em prosa"
**vai** divergir do original.

**Recomendação:** cada 4c.1x vira **duas** tasks: (a) extração do núcleo + teste
do núcleo em `estoque.test.ts` (sem tocar `report-data.ts`); (b) reescrita do
wrapper + poda do teste antigo em `report-data.test.ts`. A task (b) deve citar
o **intervalo de linhas exato** do wrapper atual e listar, item a item, o que
preservar: o objeto `vazio`, o `freshness` no retorno, a regra
`estado: linhas.length ? "ok" : "vazio"`. Sem o código ou um checklist literal,
"comportamento externo idêntico" é o placeholder que o `CLAUDE.md §6` proíbe.

### N3 — O envelope de `withFreshness` (4c.2) e o estado `"preparando"` do wrapper F3 divergem; e o wrapper perde a checagem que a 4c.0 mandou manter
**Task afetada:** 4c.0, 4c.1a–4c.1f, 4c.2.
A 4c.0 Step 1 decreta que `estadoDoFato` **permanece no wrapper**. Correto. Mas:
1. O `withFreshness` do MCP (4c.2) **reimplementa** a mesma lógica
   (`FatoBuildState` ausente → `"preparando"`) por dentro. Então a checagem de
   "preparando" existe **em dois lugares com dois contratos**: no wrapper F3 ela
   devolve `{ estado: "preparando", dados: vazio, freshness }`; no MCP ela
   devolve `{ estado: "preparando" }` (sem `dados`). Aceitável que sejam
   formatos distintos — mas o plano **nunca diz que `estadoDoFato` e a parte de
   "preparando" de `withFreshness` são funções gêmeas que precisam concordar**.
   Se a regra multi-fato mudar (spec 3.9: "se *qualquer* fato não tem
   `FatoBuildState`"), os dois pontos divergem silenciosamente. O wrapper F3
   atual checa **um** fato por relatório; `withFreshness` checa uma lista. Não
   há task que reconcilie a semântica.
2. **Regressão concreta:** o `getRelatorioSaldoProduto` atual checa
   `estadoDoFato("fato_estoque_saldo")` — **um** fato. Quando a 4c.1c reescreve
   `getRelatorioEntradasSaidas` (que usa `fato_estoque_movimento`), o Step 2 diz
   só "guard + freshness + `estadoDoFato`" sem dizer **qual fato**. O subagente
   tem de inferir do código antigo. Para tools de financeiro multi-fato isso
   piora. O plano deve, em cada task de wrapper e em cada tool, **listar
   explicitamente o(s) nome(s) de fato** — hoje só as tasks de tool fazem
   (`withFreshness(…, ["fato_estoque_saldo"], …)`); as tasks de wrapper
   4c.1a–4c.1f **não nomeiam o fato**.

**Recomendação:** (a) 4c.2 deve ter um step que documenta que
`withFreshness`/"preparando" e `estadoDoFato`/`reportFreshness` são as duas
faces do mesmo conceito e que ambas seguem a regra multi-fato da spec 3.9 —
idealmente `withFreshness` reusa um helper compartilhado. (b) Cada task
4c.1a–4c.1f deve nomear, no Step 2, o fato exato que o `estadoDoFato` do wrapper
consulta (copiar do código atual: R1/R2/R6 = `fato_estoque_saldo`, R3/R5 =
`fato_estoque_movimento`, R4 = `fato_produto_parado`).

---

## IMPORTANTE

### N4 — `withFreshness` deriva `fonteStatus` do `SyncState`, mas fontes incrementais não preenchem `lastSnapshotAt`
**Task afetada:** 4c.2.
`SyncState` tem `lastIncrementalAt`, `lastSnapshotAt`, `lastReconcileAt`
**separados** por modo. `reportFreshness` (F3) só lê `lastSnapshotAt` — funciona
porque todos os fatos de estoque vêm de fontes `snapshot`. Mas `FATO_FONTE`
(4c.2 Step 1) mapeia `fato_financeiro_movimento → finan.fluxo.caixa` e
`fato_financeiro_titulo → finan.pagamento.divida`, ambas **`incremental`**
(tabela 3.4 da spec). Para essas, `lastSnapshotAt` é **sempre `null`** — o ciclo
que as atualiza grava `lastIncrementalAt`. O 4c.2 Step 2 diz `withFreshness`
anexa "`ultimaSyncEm` do `SyncState`" sem dizer **qual coluna**. Se o subagente
copiar `reportFreshness` e ler `lastSnapshotAt`, `fonteStatus.ultimaSyncEm` será
`null` para todo título/movimento financeiro — exatamente o sinal de
"Odoo caído" que a spec #IM-3 quer evitar mascarar.

**Recomendação:** 4c.2 Step 1/2 deve estender `FATO_FONTE` para carregar também
o **modo** da fonte (`{ model, mode }`), e `withFreshness` escolhe a coluna:
`mode === "snapshot" ? lastSnapshotAt : lastIncrementalAt`. Ou ler o campo
`mode` da própria linha de `SyncState` (existe — `SyncState.mode`) e decidir em
runtime. Escrever isso explicitamente.

### N5 — Builders de financeiro: o `atualizadoEm` por linha não está no padrão de `fato-estoque-saldo.ts`
**Task afetada:** 4b.2, 4b.3, 4b.4.
O schema de 4a.3 define `atualizadoEm DateTime @map("atualizado_em")` **sem
`@default`** nos 3 fatos de financeiro — igual a `FatoEstoqueSaldo`. O builder
real de estoque preenche esse campo **no `createMany`**: `data: mapped.map((m)
=> ({ ...m, atualizadoEm: new Date() }))` (visto em `fato-estoque-saldo.ts`). As
tasks 4b.2–4b.4 dizem que `mapSaldoFinanceiroRow`/`mapMovimentoRow`/`mapTituloRow`
produzem "a forma de `FatoFinanceiro*`" mas o Step 1 lista os campos do mapper
**sem incluir `atualizadoEm`**, e o Step 3 diz só "espelhando
`fato-estoque-saldo.ts`". Um Sonnet que não notar o `{ ...m, atualizadoEm }` no
`createMany` vai gerar `createMany` sem `atualizadoEm` → erro Prisma em runtime
(coluna obrigatória sem default). Não é teorizar: é o tipo de detalhe que o
"espelhando X" esconde.

**Recomendação:** 4b.2–4b.4 Step 3 devem dizer literalmente: "o `createMany`
injeta `atualizadoEm: new Date()` por linha, como `fato-estoque-saldo.ts:95`; o
mapper **não** produz `atualizadoEm`". Alternativa: dar `@default(now())` ao
campo no schema 4a.3 e remover a ambiguidade na origem — mais simples.

### N6 — 4a.12 deixa `mcp/catalog/index.ts` com imports comentados; nenhuma task de onda 4a "fecha" o catálogo, e 4a.16 importa um catálogo vazio sem teste
**Task afetada:** 4a.12, 4a.16, 4c.3, 4d.0, 4c.11.
4a.12 cria o catálogo com `export const catalogo: ToolEntry[] = []` e imports
comentados, a serem descomentados por 4c.3/4d.0/4c.11/4e.2. Funciona, mas:
1. **Nenhuma task verifica o catálogo montado.** Cada onda descomenta um import;
   se um subagente esquecer de descomentar (4c.3 Step 2, 4d.0 Step 2, 4c.11
   Step 3), o catálogo fica incompleto e **nada falha** — `tsc` passa, o
   servidor sobe, a tool só não aparece. O harness 4f-4 pegaria, mas é a última
   task. Recomendação: 4f-4 Step 2 deve assertar explicitamente a **contagem
   total** de tools no `catalogo` (6 estoque + 6 financeiro + `registrar_lacuna`
   + `bi_consulta_avancada` = 14) para flagrar import esquecido.
2. 4a.16 registra o `McpServer` com `visibleTools(catalogo, user)` e `catalogo`
   está vazio nessa onda. A task não tem teste (`tsc` só). Aceitável que o
   catálogo nasça vazio, mas a 4a.16 deveria ter um teste de fumaça: `tools/list`
   com catálogo vazio devolve lista vazia sem crashar.

### N7 — 4c.10 (paridade) usa `jest.spyOn` num módulo importado por ESM — o spy não intercepta a chamada interna
**Task afetada:** 4c.10.
4c.10 Step 1 manda `jest.spyOn` em `@/lib/reports/queries/estoque` para espionar
`querySaldoProduto`, depois chamar `getRelatorioSaldoProduto` (de
`report-data.ts`) e assertar que o spy foi chamado. **Problema:** o projeto é
ESM (`"module": "esnext"`, `isolatedModules: true`). `report-data.ts` importa
`querySaldoProduto` via `import { querySaldoProduto } from
"@/lib/reports/queries/estoque"`. Com ESM real, `jest.spyOn(mod,
"querySaldoProduto")` **não** redireciona a referência já vinculada dentro de
`report-data.ts` (live binding read-only). O teste como escrito vai assertar um
spy nunca chamado → falha que **não** é regressão de produto, e o Step 3 manda
"corrigir o wrapper que não delega" — o subagente vai mexer em código correto.
Depende da config Jest do projeto (transform CJS vs `--experimental-vm-modules`);
o plano não verifica isso.

**Recomendação:** 4c.10 deve declarar a técnica conforme a config Jest real do
projeto: se Jest roda com transform CJS (o usual em Next+ts-jest/babel-jest), o
`jest.spyOn` funciona; se for ESM nativo, usar `jest.unstable_mockModule` +
`await import` dinâmico. A task deve ter um Step 0 que confirma o modo do Jest
(`jest.config` / `transform`) e escolhe a técnica — senão o teste é frágil por
construção.

### N8 — `queryConcentracao` e `tabelaFamilia`/`tabelaMarca`: 4c.1f e 4c.9 discordam sobre onde o `percentual` é calculado
**Task afetada:** 4c.1f, 4c.9.
4c.1f Step 1 diz: o núcleo `queryConcentracao` devolve `{ familiasBruto,
marcasBruto, tabelaFamilia, tabelaMarca }` e que `tabelaFamilia`/`tabelaMarca`
"já têm `percentual`". 4c.9 Step 3 (tool) diz: `shape` devolve
`tabelaFamilia`/`tabelaMarca` "que já têm `percentual`". Mas a spec 3.5.1 diz que
o núcleo devolve **"dado de agregação cru, sem shaping"** — e `percentual` é
derivação de apresentação. Pior: 4c.1b (`queryValorArmazem`) tomou a decisão
**oposta** — "o `percentual` é calculado **no wrapper**". Duas tasks da mesma
onda, mesma natureza de dado (percentual sobre total), decisões contraditórias.
Um subagente seguindo 4c.1f coloca `percentual` no núcleo; seguindo 4c.1b,
no wrapper. Inconsistência que vaza para os testes (o `estoque.test.ts` de
concentração vai testar `percentual`; o de valor-armazém, não).

**Recomendação:** unificar a regra: ou **todo** `percentual` é shaping e fica
fora do núcleo (consistente com a spec 3.5.1), ou se aceita `percentual` no
núcleo como "agregação derivada". Recomendo a primeira: 4c.1f devolve só
`familiasBruto`/`marcasBruto` (ou contagens cruas) e o wrapper + a tool calculam
`percentual` e as tabelas. Alinhar 4c.1f e 4c.9 ao texto de 4c.1b.

### N9 — Onda 4c roda toda em paralelo (subagentes), mas 4c.1a–4c.1f e 4c.11 editam o mesmo `report-data.ts` / `mcp/catalog/types.ts`
**Task afetada:** 4c.1a–4c.1f, 4c.11; e o modelo de execução.
O plano declara `subagent-driven-development`. As tasks 4c.1a–4c.1f **todas
modificam `src/lib/actions/report-data.ts` e `src/lib/reports/queries/estoque.ts`
e seus dois testes**. Se a onda 4c despachar essas tasks em paralelo (o
`subagent-driven-development` pode), há conflito de escrita garantido no mesmo
arquivo. Além disso 4c.11 Step 3 **altera `mcp/catalog/types.ts`** (adiciona
`sempreVisivel?`) — arquivo criado em 4a.11 e consumido por 4a.13 e por todas as
tools; uma mudança de tipo no meio da onda 4c afeta tasks 4c.4–4c.9 que já podem
ter rodado. O plano não declara que 4c.1a→4c.1f são **estritamente sequenciais**
nem que 4c.11 deve vir **antes** de 4c.3 (porque mexe no tipo base).

**Recomendação:** o plano deve declarar explicitamente: (a) 4c.1a–4c.1f são
sequenciais, não paralelas (editam o mesmo arquivo); (b) a adição de
`sempreVisivel?` ao `ToolEntry` deve ser **movida para a onda 4a** (ex.: 4a.11),
não introduzida em 4c.11 — é parte do contrato do tipo, e o `visibleTools` de
4a.13 já deveria conhecê-la. Adiar isso para 4c.11 obriga reabrir 4a.13.

### N10 — Tasks de tool de financeiro têm 6 steps com 2 ciclos TDD comprimidos; o Step 2 e o Step 4 escondem implementação inteira
**Task afetada:** 4d.1, 4d.2, 4d.3, 4d.5, 4d.6, 4d.7.
Cada task de tool de financeiro faz, num único bloco: Step 1 teste de query →
Step 2 "Rodar — FAIL. Implementar `query*`. Rodar — PASS" → Step 3 teste de tool
→ Step 4 "Rodar — FAIL. Implementar `mcp/tools/.../*.ts`. Rodar — PASS". Dois
ciclos TDD (a função de query **e** o handler da tool, dois arquivos, dois
testes) numa task. As tasks de estoque (4c.4–4c.9) são mais granulares — uma
tool, um arquivo. As de financeiro empacotam query+tool. Não é catastrófico
(são correlatas), mas é assimétrico com a onda 4c e o Step 2/Step 4 colapsam
"Implementar X" numa frase — para `queryContasAReceber` (4d.5), "Implementar"
esconde: o `findMany` com `where` por `tipo`, o filtro "não pago" (cujo critério
vem de 4a.2 e o plano nem sabe ainda qual é), o loop de `diasAtraso`, a soma de
`totalAReceber`, a conversão `Number()`. É uma unidade de trabalho real
descrita como meio-step.

**Recomendação:** dividir cada 4d.x em duas tasks (query + tool), espelhando a
granularidade de 4c. No mínimo, expandir Step 2 e Step 4 em sub-bullets
concretos (o `where`, o critério de "não pago" referenciando 4a.2, a soma) em
vez de "Implementar `query*`".

---

## MENOR

### N11 — 4a.16/4a.17 editam `mcp/server.ts` sem teste de integração entre os middlewares
4a.14 testa o middleware de token, 4a.15 o de sessão, 4a.17 o pipeline — todos
isolados com mocks. **Nenhuma task testa os três encadeados** num `http.Server`
real antes do harness 4f-4. 4a.18 Step 3 faz um `curl` manual só do 401.
Aceitável (4f-4 cobre), mas registrar que a primeira prova ponta-a-ponta do
servidor é 4f-4 — muito tarde para a onda 4a "fechar".

### N12 — 4c.2: o envelope `{ estado: "ok" | "vazio" }` — quem decide "vazio"?
4c.2 Step 4 define o envelope com `estado: "ok" | "vazio"`, mas `withFreshness`
recebe `fn` que devolve `dados` e não sabe se está vazio. O texto não diz se
`withFreshness` inspeciona `dados` (ex.: `linhas.length === 0`) para marcar
`"vazio"`, ou se `fn` devolve o estado. A spec 3.9 distingue "preparando" de
"sem registros". Definir: `withFreshness` decide `"vazio"` como? Por
`rowCount`? O `fn` retorna `{ dados, vazio }`? Pequeno, mas é ambiguidade no
contrato central.

### N13 — `recordAudit` e `rowCount`: 4a.17 manda gravar `rowCount` mas nenhuma tool o produz
4a.17 Step 1 diz `recordAudit` grava `rowCount?`. As tools devolvem um envelope
`{ estado, dados, … }` — `dados` tem `linhas`/`titulos`/`serie` de tamanhos
variados. Nenhuma task de tool diz como `rowCount` é extraído do output para o
audit. Provavelmente `dados.linhas?.length`. Definir num step de 4a.17 ou marcar
`rowCount` como sempre `null` na F4 (e registrar o gap).

### N14 — 4b.1 Step 4 cita "linhas 97-125" e "linha 64" de `processors.ts` — números frágeis
O plano ancora a edição em números de linha (`processors.ts:99-125`,
`linha 64`). Confirmei contra o código: o bloco de builders está hoje em
~97-125 e `processIncrementalCycle` termina ~64 — **correto agora**, mas
qualquer commit anterior à execução desloca os números. Recomendação: ancorar
por marcador textual ("após o `for` que itera `catalog` em
`processIncrementalCycle`", "substituir os três blocos `await
import("../fatos/...")`"), não por número de linha.

### N15 — 4c.0 Step 2 tem redação truncada/confusa
O texto de 4c.0 Step 2 começa "Mover para este arquivo a função auxiliar
`limparNomeLocal` **já é importada de** `@/lib/reports/local-nome` — não mover" —
a frase se contradiz na própria sentença (manda mover e logo diz não mover). A
intenção (não mover `limparNomeLocal`, o núcleo só a importa; `agruparTopN` e
`TOP_*` ficam no wrapper) está correta, mas a redação vai confundir um Sonnet.
Reescrever o step de forma afirmativa e limpa.

### N16 — Verificação final manda `npx eslint src/ mcp/` mas nenhuma task roda eslint no `mcp/` durante as ondas
Só 4c.1f Step 4 roda `eslint src/`. Nenhuma task de onda 4a/4b/4d/4e roda
`eslint` no `mcp/`. O lint do `mcp/` aparece pela primeira vez na verificação
final — acúmulo de violações descoberto no fim. Recomendação: adicionar
`eslint` ao Step de verificação de algumas tasks `mcp/`, ou aceitar e registrar
que o lint do `mcp/` é validado só no fim.

---

## Conclusão

A v2 é uma melhora real e substancial sobre a v1: 20 dos 24 achados estão
genuinamente resolvidos, os três épicos (4c-2, 4a.9, 4c-1) foram decompostos, os
schemas Zod estão escritos, o `shape` foi definido, o mapa `FATO_FONTE` existe,
o teste de paridade ganhou task. **Mas o plano ainda não está pronto para
execução mecânica.** Três bloqueios críticos: o `mcp/tsconfig.json` como
desenhado **não compila** (N1 — `moduleResolution`/`include` errados, a onda 4a
"passa" no papel e quebra na prática); as tasks 4c.1a–4c.1f ainda são
tri-unidade com a reescrita de wrapper descrita em prosa, o ponto onde a F3
regride (N2); e a semântica "preparando" vive em dois lugares sem reconciliação,
com regressão concreta nas tasks de wrapper que não nomeiam o fato (N3). Há
ainda inconsistências de integração que um executor mecânico não resolve
sozinho: a coluna errada do `SyncState` para fontes incrementais (N4), o
`atualizadoEm` por linha omitido (N5), `percentual` ora no núcleo ora no wrapper
(N8), conflito de escrita paralela em `report-data.ts` (N9). **Necessária uma v3**
que: redesenhe a 4a.4 (não compilar `src/**`), quebre cada 4c.1x em
extração+wrapper com checklist literal do wrapper, reconcilie `withFreshness`×
`estadoDoFato`, corrija a coluna do `SyncState`, unifique a regra de
`percentual`, declare a sequencialidade da onda 4c e mova `sempreVisivel?` para
a onda 4a. Os 6 achados MENOR podem ser aplicados em conjunto. Após isso o plano
estará executável.
