# Review — F4 Onda 4c (Estoque)

**Data:** 2026-05-18
**Escopo:** commits `0ab5f42`..`6cbf6f4` (23 tasks) na branch `feat/mcp-semantico`.
**Plano:** `docs/superpowers/plans/2026-05-17-f4-mcp-semantico.md` (Onda 4c).
**Spec:** `docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md` (§3.5, §3.6, §3.9).

## Veredito

**APROVADO COM RESSALVAS.**

Verificação verde: `tsc` (app), `tsc -p mcp/tsconfig.json` e `jest` (77 suites,
526 testes) passam, sem regressão na F3 (`report-data.test.ts` cresceu de 16
para 25 casos). A reestruturação núcleo/wrapper está conforme a spec §3.5.1, o
`percentual` ficou fora do núcleo e consistente entre as duas tools, as 6 tools
de estoque + `registrar_lacuna` reusam a função-núcleo e estão registradas no
catálogo. As ressalvas abaixo não bloqueiam o merge mas devem ser tratadas
antes do fechamento da F4.

## Contagem por severidade

- CRÍTICO: 0
- IMPORTANTE: 2
- MENOR: 4

## Achados

### IMPORTANTE

#### I-1 — Divergência na regra "vazio" do R6 (concentração) entre dashboard e MCP
**Arquivos:** `mcp/lib/freshness.ts` (`ARRAY_KEYS_PRIORITY`, `extractFirstArray`),
`mcp/tools/estoque/concentracao.ts`, `src/lib/actions/report-data.ts:268-269`.

O wrapper F3 decide "vazio" para concentração com `familia.length === 0 &&
marca.length === 0` (regra E-conjuntiva — só é vazio se ambos vazios). A tool
MCP delega a decisão ao `withFreshness`, que via `extractFirstArray` inspeciona
**apenas o primeiro array** segundo `ARRAY_KEYS_PRIORITY` — `familia` vem antes
de `marca`. Resultado: se `familia` estiver vazia mas `marca` tiver dados, a
tool MCP retorna `estado: "vazio"` enquanto o dashboard retornaria `"ok"`.

Não há paridade real de estado para R6. A onda promete que dashboard e MCP
"delegam ao mesmo núcleo" — o núcleo de agregação sim, mas a derivação de
`estado` é independente e diverge. Cenário plausível em produção (estoque com
marcas preenchidas mas famílias não classificadas).

**Recomendação:** alinhar a semântica. Opção A: `withFreshness` aceita um
predicado de "vazio" opcional por tool, e `concentracao` passa
`(d) => d.familia.length === 0 && d.marca.length === 0`. Opção B: o shape da
tool concatena num único array inspecionável. A Opção A preserva o contrato
sem mexer no payload. Adicionar teste de paridade de `estado` para o caso misto.

#### I-2 — `registrar_lacuna` usa `dominio: "estoque"` como valor falso
**Arquivo:** `mcp/tools/caminho3/registrar-lacuna.ts:19-24`.

O campo `dominio` do `ToolEntry` é tipado como `ReportDomain` (não admite um
valor neutro). A tool é domínio-neutra e depende de `sempreVisivel: true` para
visibilidade/autorização — o que funciona, pois `visibleTools` e
`assertToolAllowed` checam `sempreVisivel` antes do domínio. Mas gravar
`"estoque"` num campo que o resto do sistema lê como domínio real é uma mentira
estrutural: o `McpAuditLog`/relatórios de catálogo por domínio passam a contar
`registrar_lacuna` como tool de estoque, e qualquer consumidor futuro de
`tool.dominio` herda o erro. O comentário no código admite o hack ("achado
N9"), mas admitir não conserta.

**Recomendação:** tornar `dominio` opcional em `ToolEntry` (ou criar um membro
`"_neutro"` no enum, ou um tipo `ReportDomain | null`) e ajustar
`visibleTools`/`assertToolAllowed` para tratar `dominio` ausente como neutro
explícito. Custa um arquivo a mais de toque mas elimina o dado falso. Se a
decisão for manter, registrar como dívida explícita no STATUS, não só em
comentário inline.

### MENOR

#### M-1 — `ValorArmazemRow.percentual` no núcleo contradiz a doc do próprio núcleo
**Arquivo:** `src/lib/reports/queries/estoque.ts:167-174`.

O comentário diz "Linha da tabela de R2 (sem percentual — calculado no
wrapper/tool)" mas a interface `ValorArmazemRow` **declara** `percentual: number`.
A função `queryValorArmazem` corretamente devolve `linhasBruto` sem percentual,
então o tipo `ValorArmazemRow` só é usado no shape final do wrapper — está no
lugar errado conceitualmente (é tipo de saída do wrapper F3, não do núcleo).
Não causa bug, mas contradiz o princípio "núcleo não faz shaping" e confunde
quem lê. Mesma observação vale para `ConcentracaoFamiliaRow`/`ConcentracaoMarcaRow`
(declaram `percentual` e vivem no núcleo).

**Recomendação:** mover os tipos com `percentual` para `report-data.ts` (são
tipos de wrapper), ou renomeá-los para deixar claro que são o contrato pós-shaping.

#### M-2 — `extractRowCount` e o envelope de freshness
**Arquivo:** `mcp/server.ts` (`extractRowCount`) + envelope `withFreshness`.

O `withFreshness` envolve `dados` num envelope `{ estado, dados, atualizadoEm,
fonteStatus }`. O `extractRowCount` do server precisa enxergar o array dentro de
`dados` para o audit. Não foi possível confirmar nesta revisão que
`extractRowCount` desce um nível no envelope; se ele inspeciona o objeto raiz,
toda invocação de tool de estoque grava `rowCount` indefinido no `McpAuditLog`.

**Recomendação:** confirmar com um teste que `extractRowCount(envelope)` extrai
o comprimento do array de `dados`, não do objeto raiz. Se não desce, ajustar.

#### M-3 — `withFreshness`: `atualizadoEm` ignora o modo da fonte
**Arquivo:** `mcp/lib/freshness.ts:122-127`.

`atualizadoEm` usa o máximo de `ultimoBuildAt` (quando o builder de fato rodou),
enquanto `fonteStatus.ultimaSyncEm` usa a coluna do `SyncState` conforme o
`mode`. São dois conceitos distintos (build do fato × sync da fonte) e isso
está correto, mas não há comentário explicando a diferença — fácil alguém achar
que um dos dois está errado. Documentar a distinção no JSDoc.

#### M-4 — Desvio de processo: 4c.1x em lote
As tasks 4c.1a–4c.1f foram feitas em commits separados (`3712a15`..`85361aa`,
12 commits — extração + wrapper por relatório, sequenciais e atômicos). O
desvio relatado ("feitas em lote") **não se confirma no histórico**: cada
relatório teve seu par extrai-núcleo / vira-wrapper commitado isoladamente, o
que é exatamente a granularidade que o plano pede. **Aceitável — na prática não
houve desvio.** Se "lote" se referir a terem sido executadas numa única sessão
sem checkpoint humano, isso é o modo autônomo padrão do projeto (§5 do CLAUDE.md)
e também é aceitável.

## Itens verificados sem achado

- **Núcleo framework-neutro:** `estoque.ts` não tem `"use server"`, não importa
  `guardDominio`/`getReport`/`reportFreshness`, não captura exceção (deixa
  propagar). Conforme spec §3.5.1.
- **Wrappers preservam contrato F3:** objeto `vazio`, `freshness`, regra
  `estado: linhas.length ? "ok" : "vazio"` e `estadoDoFato` com o fato certo
  por relatório — idênticos ao original (`git show 0ab5f42~1:report-data.ts`
  confere, inclusive a regra conjuntiva do R6). Sem regressão.
- **`percentual` fora do núcleo:** calculado no wrapper (`report-data.ts`) e na
  tool (`valor-armazem.ts`, `concentracao.ts`) com a mesma fórmula
  `total > 0 ? (v/total)*100 : 0`. Consistente.
- **6 tools reusam o núcleo:** todas chamam `query*` e só fazem `shape()`; o
  teste de paridade (`paridade.test.ts`) verifica via `jest.spyOn` no módulo do
  núcleo que wrapper e tool delegam à mesma função (R1 e R6 cobertos).
- **`inputSchema`/`outputSchema`/`inputSchemaShape`:** presentes e coerentes em
  todas as 6 tools + `registrar_lacuna`; `inputSchemaShape` derivado de
  `inputSchema.shape`.
- **`withFreshness` aplicado:** em todas as 6 tools de estoque, com a lista de
  fatos correta por tool.
- **`FATO_FONTE`:** escolhe `lastSnapshotAt` para snapshot e `lastIncrementalAt`
  para incremental (testado, achado N4); dedup de modelos; "pior fonte" = sync
  mais antiga, `null` vence. Regra multi-fato e "vazio" testadas.
- **RBAC:** `assertToolAllowed` (camada 2) chamado em `handleToolCall` antes do
  Zod e do handler; honra `sempreVisivel` antes do gate de domínio — logo
  `registrar_lacuna` funciona para qualquer usuário apesar do `dominio` falso.
- **`registrar_lacuna`:** grava em `feature_requests` via
  `prisma.featureRequest.create`, sem gate de domínio, com `userId` do contexto.
- **Cast `as ToolEntry`/`as never`:** o `as ToolEntry` em `estoque/index.ts` e
  `caminho3/index.ts` apaga os parâmetros genéricos `<I,O>` para encaixar no
  array homogêneo `ToolEntry[]` — idiomático em catálogos heterogêneos de tools,
  não esconde erro de tipo. O `as never` para `prisma` nos testes de paridade é
  o padrão de mock do projeto (mock parcial do `PrismaClient`) — aceitável em
  contexto de teste.
- **Catálogo:** `estoqueTools` e `caminho3Tools` importados e espalhados em
  `mcp/catalog/index.ts`. Validação do catálogo completo fica para 4f-4
  (achado N6) — fora do escopo desta onda.
