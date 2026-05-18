# Review #1 — PLAN F4 (MCP Semântico) — auditoria adversarial

> Revisor adversarial sênior. Etapa [6] do workflow (`CLAUDE.md §6`).
> Alvo: `docs/superpowers/plans/2026-05-17-f4-mcp-semantico.md` (v1).
> Base: SPEC v3 (`docs/superpowers/specs/2026-05-17-f4-mcp-semantico-design.md`).
> Foco: decomposição máxima e zero ambiguidade. Verificado contra o código real
> (`processors.ts`, `fato-estoque-saldo.ts`, `report-data.ts`, `prisma/schema.prisma`).

Contagem: **6 CRÍTICO · 11 IMPORTANTE · 7 MENOR.**

---

## CRÍTICO

### C1 — Task 4c-2 é um épico disfarçado: 6 tools sem os steps escritos
**Task afetada:** 4c-2 (e por extensão 4d-1, 4d-2).
O plano define um "padrão de uma tool" com um snippet genérico e diz: *"Para cada
tool, uma task com 5 steps (teste falhando → fail → implementar → pass → commit)"*.
Isso **não** é decomposição — é um placeholder. O `CLAUDE.md §6` é explícito:
*"O plano usa muito 'uma task de 5 steps por tool' sem escrever os steps — isso
é placeholder."* Cada tool tem decisões reais e distintas que o snippet não
resolve:
- `estoque_saldo_produto` reusa `querySaldoProduto`, mas o `inputSchema` (filtros
  `armazemId?`, `familiaId?`) e o `outputSchema` (a forma `linhas`+`kpis` que o
  agente recebe — diferente do shape de Recharts) **não estão escritos**.
- `estoque_concentracao` não tem filtros (`_filtros` em `report-data.ts`) — input
  vazio; `estoque_entradas_saidas` tem `periodoDe/periodoAte/armazemId`. Cada uma
  é um schema diferente.
- A função `shape()` citada no snippet (`return shape(dados)`) **não existe e não
  é definida em lugar nenhum** — é o trabalho de tradução núcleo→agente, que é
  específico por tool. Um subagente Sonnet teria de inventá-la.
**Recomendação:** quebrar 4c-2 em **6 tasks** (uma por tool), cada uma com os 5
steps escritos por extenso: o `inputSchema` Zod literal, o `outputSchema` Zod
literal, a função de shaping, a lista de fatos passada a `withFreshness`, e o
teste. Mesmo tratamento para as 6 tools de 4d. O "padrão" pode ficar como
preâmbulo, mas não substitui os steps.

### C2 — `withFreshness` colide com a checagem `FatoBuildState` já existente nas Server Actions; semântica multi-fato indefinida na prática
**Task afetada:** 4c-2.0, 4c-1.
A spec 3.9 e a Task 4c-2.0 dizem: *"se algum fato não tem `FatoBuildState` →
resposta 'indicador não processado' (`outcome=ok`)"*. Mas `report-data.ts` já
faz `estadoDoFato()` **dentro** de cada `getRelatorio*` (linhas 68-71, 97, 304…).
A Task 4c-1 manda extrair o "núcleo de agregação" para `estoque.ts` "sem
`estado`/`freshness`". Pergunta não respondida pelo plano: a checagem
`estadoDoFato` fica no wrapper da F3 **e** é reimplementada em `withFreshness`
para o MCP? Ou `estoque.ts` ainda a contém? O plano não diz onde a checagem de
"preparando" mora após a extração. Pior: a Task 4c-1 Step 3 diz "Comportamento
externo idêntico" para os wrappers da F3, mas se a checagem `estadoDoFato`
migrar para fora, o wrapper precisa reintroduzi-la — e isso não está nos steps.
**Recomendação:** a Task 4c-1 deve declarar explicitamente, num step, que a
verificação `estadoDoFato` **permanece no wrapper `report-data.ts`** (não no
núcleo) e que `withFreshness` é a versão equivalente para o MCP. Definir o
contrato de retorno de `withFreshness` quando dispara "não processado": ele
ainda retorna `outputSchema` válido? O snippet de 4c-2 mostra `output` com
campos de negócio obrigatórios — se a tool responde "não processado", a forma
não bate com o `outputSchema`. Resolver: ou o `outputSchema` tem os campos de
negócio opcionais, ou há um envelope de resposta. O plano não escolhe.

### C3 — Task 4a.9 é um épico: middleware HTTP + transport + pipeline de `tools/call` + RBAC + audit num único Step 2
**Task afetada:** 4a.9.
O "Step 2" sozinho contém: criar `http.Server`, validar service token, ler
`X-Mcp-User-Id`, resolver `UserContext`, negar com 401/403, gravar em
session-store, montar `StreamableHTTPServerTransport`, registrar `McpServer`,
e — no `tools/call` — recarregar `UserContext`, `assertToolAllowed`, validar
Zod, executar handler, gravar audit, mapear erros aos `outcome`. Isso é **a
fase inteira de fundação comprimida em um step**. O `CLAUDE.md §6` proíbe
explicitamente: *"Se uma task descreve 'portar a tela X' com lista + forms +
actions juntos, ela é um épico — quebrar."* Um subagente Sonnet não consegue
executar isto sem múltiplas decisões de design (formato do erro JSON-RPC,
ordem das camadas, onde o `try/catch` de audit envolve). E não há teste — o
Step 5 só faz `tsc` + `curl` manual, sem cobertura do pipeline de `tools/call`.
**Recomendação:** decompor 4a.9 em pelo menos 4 tasks: (a) `mcp/server.ts`
servidor HTTP + middleware de service token (com teste de 401); (b) middleware
de resolução de sessão `X-Mcp-User-Id` → `UserContext` → session-store (com
teste); (c) montagem do transport + registro do `McpServer` a partir de
`visibleTools`; (d) pipeline de `tools/call` (recarga, `assertToolAllowed`,
Zod, handler, audit, mapeamento de erro) — esta com teste unitário do pipeline,
não só `curl`. O pipeline de `tools/call` é o coração do RBAC (camadas 2/6/7) e
não pode ficar sem teste.

### C4 — Ordem de dependência quebrada: Task 4a.9 registra `visibleTools(catalogo, user)` mas o catálogo só existe nas ondas 4c/4d
**Task afetada:** 4a.9, 4a.8, 4c-2.
A Task 4a.9 Step 2 diz "Registra o `McpServer` com as tools de
`visibleTools(catalogo, user)`". Mas `mcp/catalog/index.ts` (que "agrega os
catálogos de domínio") não é criado em nenhuma task da onda 4a — a lista de
arquivos a criar o menciona, mas nenhuma task o produz. As tools só nascem em
4c-2/4d. O plano admite no rodapé *"O catálogo começa vazio"*, mas **não existe
task que cria `mcp/catalog/index.ts` vazio**, nem task que o **atualiza** quando
cada tool é registrada. As tasks 4c-2/4d dizem "registra a entrada no catálogo
de estoque (`mcp/tools/estoque/index.ts`)" — mas `mcp/tools/estoque/index.ts` e
`mcp/catalog/index.ts` são arquivos diferentes, e a ligação entre eles
(quem importa quem) nunca é especificada.
**Recomendação:** criar uma task explícita na onda 4a que cria
`mcp/catalog/index.ts` exportando um array (inicialmente vazio) e definir o
contrato: cada `mcp/tools/<dominio>/index.ts` exporta um array de `ToolEntry`,
e `mcp/catalog/index.ts` os concatena. Cada task de tool deve ter um step
explícito "adicionar a tool ao array de `mcp/tools/<dominio>/index.ts`". Sem
isso, um subagente não sabe onde plugar a tool.

### C5 — `mcp/tsconfig.json` e a resolução de imports cruzados `mcp/ → src/` não estão verificados; risco de não compilar
**Task afetada:** 4a.9 Step 1, 4a.2, 4a.7, 4c-2.
Múltiplos arquivos do `mcp/` importam de `src/`: `mcp/lib/prisma.ts` faz
`import { PrismaClient } from "../../src/generated/prisma/client"`;
`mcp/catalog/types.ts` importa `ReportDomain` de `../../src/generated/prisma/client`;
as tools importam `querySaldoProduto` de `../../../src/lib/reports/queries/estoque`.
O `report-data.ts` e os módulos `src/lib/reports/*` usam o alias `@/` (ex.:
`import { prisma } from "@/lib/prisma"`). O novo `estoque.ts` viverá em
`src/lib/reports/queries/` e provavelmente usará `@/` também. **O
`mcp/tsconfig.json` precisa resolver o alias `@/` da mesma forma que o tsconfig
raiz, senão `estoque.ts` (que importa `@/...` transitivamente) não compila no
build do `mcp`.** A Task 4a.9 Step 1 só diz "estendendo o raiz, `module`/`target`
para Node puro" — não menciona `paths`/`baseUrl`, nem que o `mcp/` precisa
incluir `src/` no `include`. O `tsx` resolve em runtime, mas `tsc --noEmit` e o
Dockerfile podem quebrar. Isto é exatamente o tipo de coisa que um Sonnet
"adivinha" errado.
**Recomendação:** Task 4a.9 Step 1 deve especificar: `mcp/tsconfig.json` herda
`paths`/`baseUrl` do raiz (ou redefine `@/* → ../src/*`), e `include` cobre
`mcp/**` + `src/**` (ou referencia o projeto). Adicionar um step de verificação
que compila um arquivo `mcp/` que importa `@/lib/...` transitivamente. Idem para
o `mcp/Dockerfile` (4f-5): ele precisa copiar `src/` e `prisma/generated`, não
só `mcp/` — o Dockerfile "espelhando o do worker" não é suficiente porque o
worker vive dentro de `src/`.

### C6 — Teste de paridade #IM-8 não tem task; a verificação final não o cobre
**Task afetada:** nenhuma (lacuna de cobertura da spec).
A spec §6 define explicitamente o **teste de paridade dashboard×MCP** (decisão
#IM-8): *"O teste verifica que ambos os wrappers delegam ao núcleo (não
recomputam agregação)"*. O plano **não tem nenhuma task que escreve esse teste**.
A seção "Self-review" do plano nem o menciona. A "Verificação final" lista
`npx jest` genérico, mas isso não garante que o teste de paridade exista. Esta é
uma decisão canônica da spec (#IM-8) simplesmente perdida.
**Recomendação:** adicionar uma task explícita (em 4c-2 ou 4c-1) que cria um
teste verificando que `getRelatorioSaldoProduto` e a tool `estoque_saldo_produto`
ambos invocam `querySaldoProduto` — via spy/mock no módulo de query. Ou
documentar que a paridade-por-construção dispensa teste, mas isso contradiz a
spec, que pede o teste explicitamente.

---

## IMPORTANTE

### I1 — Task 4a.1: `FatoFinanceiroSaldo` define `bancoId Int @id`, mas a fonte snapshot rotaciona ids
**Task afetada:** 4a.1, 4b.2.
Os fatos de estoque (`FatoEstoqueSaldo`) usam `id String @id @default(uuid())`
com `odooSaldoId Int @unique` — **não** o id do Odoo como PK. O comentário do
schema em `FatoEstoqueMovimento` explica: "odooId é PK porque o builder recria a
tabela inteira" — só vale para fontes incrementais. `FatoFinanceiroSaldo` vem de
`raw_finan_banco_saldo_hoje`, uma fonte **snapshot**, e o próprio `processors.ts`
(comentário linhas 134-137) alerta: *"modelos snapshot são recriados por
completo a cada ciclo e seus ids no Odoo rotacionam"*. Usar `bancoId` (que é o
`relId(banco_id)`, não o id da linha raw) como PK pode ser estável **se** cada
banco aparece uma vez por snapshot — mas o plano não verifica isso. Se duas
linhas do snapshot tiverem o mesmo `banco_id` (ex.: banco + caixa do mesmo
registro, ou múltiplas datas), o `createMany` quebra com violação de PK.
**Recomendação:** Task 4b.0 deve incluir um step que confirma que `banco_id` é
único por linha em `raw_finan_banco_saldo_hoje`. Se não for, `FatoFinanceiroSaldo`
precisa de `id String @id @default(uuid())` + `@@unique` no que for a chave
real — alinhando ao padrão de `FatoEstoqueSaldo`. A Task 4a.1 está modelando uma
PK não verificada.

### I2 — Task 4a.1: tipos monetários como `Float`, divergindo do padrão `Decimal` do projeto
**Task afetada:** 4a.1.
`FatoEstoqueSaldo`/`FatoProdutoParado` usam `Decimal @db.Decimal(18,2)` para
valores monetários e `Decimal(18,4)` para quantidades. A Task 4a.1 define
**todos** os campos monetários dos 3 fatos de financeiro como `Float`
(`saldo Float`, `vrDocumento Float`, `entrada Float`…). `Float` é ponto
flutuante IEEE-754 — impróprio para dinheiro, e **inconsistente com o resto do
schema**. Para um domínio financeiro, isto é um erro material: somas de centavos
acumulam erro.
**Recomendação:** trocar todos os campos monetários dos 3 modelos para
`Decimal @db.Decimal(18,2)`, alinhando a `FatoEstoqueSaldo`. Ajustar os builders
(4b.2-4b.4) e as queries das tools (4d) para lidar com `Decimal` via `Number()`,
exatamente como `report-data.ts` já faz (`r.vrSaldo ? Number(r.vrSaldo) : 0`).

### I3 — Task 4a.1: `FatoBuildState` não é mencionado e o plano assume um `markFatoBuilt` que precisa do `tx`
**Task afetada:** 4a.1, 4b.2-4b.4.
O snippet de 4b.2 diz "`deleteMany`+`createMany` em transação + `markFatoBuilt`".
O código real (`fato-estoque-saldo.ts` linha 99) chama `markFatoBuilt(tx, ...)`
**dentro** do `$transaction`, passando o cliente transacional. O plano não
explicita isso para os builders de financeiro — um subagente pode chamar
`markFatoBuilt(prisma, ...)` fora da transação, perdendo a atomicidade
"estado commitado junto com os dados (CR-01)" que o código de estoque garante.
**Recomendação:** os steps de 4b.2-4b.4 devem dizer explicitamente
"`markFatoBuilt(tx, "fato_financeiro_*")` dentro do `$transaction`, após o
`createMany`" — citar o padrão exato de `fato-estoque-saldo.ts:91-100`.

### I4 — Task 4b.1: o registry quebra o tratamento de erro **por builder** que o código atual tem
**Task afetada:** 4b.1.
Hoje `processSnapshotCycle` envolve **cada** `rebuildFato*` num `try/catch`
próprio (linhas 99-125) — uma falha no `fato_estoque_movimento` não impede o
`fato_produto_parado`. A Task 4b.1 Step 1 diz que `runBuilders` "isola falha por
builder", o que é correto — mas o Step 4 manda substituir os 3 `await import` por
**um único** `await runBuilders(ctx.prisma, "snapshot")`. Se `runBuilders`
internamente não replicar o `try/catch` por builder + os `console.log`/
`console.error` por builder, há regressão de observabilidade. O plano descreve a
intenção no Step 1 mas não garante no Step 3 que `runBuilders` loga
`[worker] fato_X reconstruído: N linhas` / `falha ao reconstruir` por builder.
**Recomendação:** Step 3 de 4b.1 deve especificar que `runBuilders` itera, e por
builder: `try { const n = await run(prisma); console.log(...) } catch(err) {
console.error(...) }` — replicando exatamente o comportamento atual de
`processors.ts:99-125`. O teste de não-regressão (Step 5) deve verificar que uma
exceção num builder não impede os demais **e** que o log sai.

### I5 — Task 4b.1: `processIncrementalCycle` não tem ponto de chamada de `runBuilders` hoje — o Step 4 inventa um
**Task afetada:** 4b.1.
O Step 4 diz "Adicionar `await runBuilders(ctx.prisma, "incremental")` ao fim de
`processIncrementalCycle`". Mas `processIncrementalCycle` (linhas 33-65) hoje
**não chama builder nenhum** — só roda os ciclos de sync. Os builders de
financeiro `movimento`/`titulo` são `cycle: "incremental"`. Adicionar a chamada
é correto, mas: (a) ela deve vir **depois** do loop de sync (após linha 64),
para que o `raw` esteja atualizado antes do rebuild; (b) precisa do mesmo
`try/catch` defensivo. O plano não diz "após o loop" explicitamente nem trata o
erro. Além disso: o builder de `FatoFinanceiroSaldo` é `cycle: "snapshot"`, mas
sua fonte `raw_finan_banco_saldo_hoje` é sincronizada no ciclo snapshot — ok;
porém o plano deve confirmar que o ciclo snapshot **sincroniza** essa fonte
antes de chamar `runBuilders("snapshot")`. A ordem fonte-sync → builder é
crítica e o plano a trata de forma vaga.
**Recomendação:** Step 4 deve dizer: "inserir após o `for` de
`processIncrementalCycle` (após a linha 64), envolto em `try/catch` com log".
Adicionar um step que confirma, no `MODEL_CATALOG`, que `finan.fluxo.caixa`,
`finan.pagamento.divida` e `finan.banco.saldo.hoje` estão presentes e marcados
com o `mode` que a tabela 3.4 da spec afirma.

### I6 — Task 4c-1 Step 1/2 é um épico: "extrair o núcleo de 6 relatórios" numa task só
**Task afetada:** 4c-1.
A Task 4c-1 manda, num único bloco de 7 steps, extrair **6** funções-núcleo
(`querySaldoProduto`, `queryValorArmazem`, `queryEntradasSaidas`,
`queryProdutoParado`, `queryTopMovimentados`, `queryConcentracao`), reescrever
**6** Server Actions como wrappers, e migrar **6** blocos de teste. Isso é uma
reestruturação grande de um arquivo de 609 linhas — exatamente o "épico
disfarçado" que o `CLAUDE.md §6` manda quebrar ("uma task por arquivo ou por
ação"). Cada `getRelatorio*` tem um shape de filtros e de retorno diferente;
extrair `getRelatorioConcentracao` (que tem `agruparTopN`, função auxiliar — vai
para o núcleo ou fica no wrapper?) é decisão distinta de extrair
`getRelatorioSaldoProduto`. O Step 2 ("Mover o miolo") esconde 6 unidades de
trabalho.
**Recomendação:** quebrar 4c-1 em **6 tasks** (uma por relatório): cada uma
extrai uma função-núcleo, reescreve um wrapper, migra um bloco de teste, roda
`jest` + `tsc`, commita. Mais uma task inicial que cria o arquivo
`src/lib/reports/queries/estoque.ts` vazio e decide onde mora `limparNomeLocal`
(usado pela agregação — vai para o núcleo) e `agruparTopN` (shaping de gráfico —
fica no wrapper? a spec diz núcleo devolve "dado cru sem shaping"; `agruparTopN`
é shaping → fica no wrapper). Essa decisão precisa estar escrita.

### I7 — `report-data.ts` engole erros com `catch {}` — o núcleo extraído herda ou perde isso?
**Task afetada:** 4c-1, 4c-2.
Todo `getRelatorio*` tem `try { ... } catch { return { estado: "erro" } }`. Se o
núcleo `estoque.ts` for "puro" e não capturar, o wrapper da F3 mantém o
`catch`. Mas a tool do MCP precisa do erro **propagado** para o pipeline de
`tools/call` mapear `outcome=error` (spec 3.9). O plano não diz que o núcleo
`estoque.ts` **deixa a exceção subir** (correto) e que é o wrapper de cada
camada que decide tratar. Se o subagente copiar o `try/catch` para dentro do
núcleo, a tool nunca verá o erro e sempre responderá "vazio" — mascarando falha
de Postgres, violando a spec 3.9.
**Recomendação:** Task 4c-1 deve ter um step explícito: "as funções-núcleo de
`estoque.ts` **não** capturam exceção — deixam propagar; o `try/catch` de
`estado:erro` permanece **só** no wrapper `report-data.ts`". E a Task de
pipeline de `tools/call` mapeia exceção→`outcome=error` via `failure.ts`.

### I8 — `freshness.ts` (`reportFreshness`) usa `entry.modeloFonte`/`entry.secoes`; `withFreshness` do MCP recebe `fatos[]` — fonte do `SyncState` indefinida
**Task afetada:** 4c-2.0.
`reportFreshness` (F3) deriva o `SyncState` de `entry.modeloFonte` (o modelo
Odoo do catálogo de UI). O `withFreshness(prisma, fatos[], fn)` do MCP recebe
**nomes de fato** (`["fato_estoque_saldo"]`), não modelos Odoo. Para anexar
`fonteStatus` (spec 3.9 — `SyncState` da **fonte**), `withFreshness` precisa
mapear `fato → modelo Odoo fonte`. Esse mapa **não existe** e nenhuma task o
cria. `fato_estoque_saldo` vem de `estoque.saldo.hoje`; `fato_estoque_movimento`
de `estoque.extrato`; `fato_financeiro_titulo` de `finan.pagamento.divida` — é
conhecimento que precisa ser materializado em algum lugar.
**Recomendação:** Task 4c-2.0 deve criar explicitamente uma constante de
mapeamento `FATO_FONTE: Record<string, string>` (fato → `SyncState.model`) e
`withFreshness` a usa para buscar o `SyncState`. Definir o comportamento quando
um fato tem mais de uma fonte (ex.: `fato_estoque_movimento` deriva de extrato +
duração) — o `fonteStatus` reporta a pior/mais antiga? O plano não decide.

### I9 — Task 4d-1/4d-2: nenhuma camada de query de financeiro extraída; as tools consultam o fato diretamente?
**Task afetada:** 4d-1, 4d-2.
Para estoque há a reestruturação 4c-1 que cria `src/lib/reports/queries/estoque.ts`
como núcleo neutro. Para financeiro **não há fato_* pré-existente nem Server
Action a reusar** — então as tools de financeiro consultam `prisma.fatoFinanceiro*`
direto no handler. Mas o snippet "padrão de 4c-2" mostra o handler chamando uma
`query*` de `src/lib/reports/queries/estoque.ts`. Para financeiro o plano diz só
"consumindo os fatos de financeiro" — **onde mora a lógica de agregação das tools
de financeiro?** Dentro do handler da tool? Num módulo `mcp/tools/financeiro/`?
Num `src/lib/reports/queries/financeiro.ts`? O plano não define. Isso é
ambiguidade pura: `financeiro_caixa_periodo` ("soma `entrada`/`saida`/`valor`
realizados") tem agregação real que precisa de casa e de teste.
**Recomendação:** decidir e escrever: a agregação das tools de financeiro vive
em módulos de query testáveis (`mcp/tools/financeiro/queries.ts` ou
`src/lib/reports/queries/financeiro.ts`), separados do handler — espelhando o
padrão de estoque — e cada task de tool de 4d extrai/cria a função de query
correspondente com seu próprio teste unitário de agregação.

### I10 — `diasAtraso`: a spec manda calcular "na query"; o plano cria `mcp/lib/dias-atraso.ts` — mas onde a query mora?
**Task afetada:** 4d-2.
A Task 4d-2 cria `mcp/lib/dias-atraso.ts` (função pura de cálculo) e diz "usada
pelas 3 tools". Ok para a função pura. Mas a spec 3.4 diz `diasAtraso` é
"calculado **na query da tool**". As tools `financeiro_contas_a_receber/_a_pagar/
_titulos_vencidos` precisam, por linha de `fato_financeiro_titulo`, computar
`diasAtraso = dias(dataVencimento, hoje)` e (para a_receber/a_pagar) filtrar
"não pago". O plano não define o `inputSchema` (filtro de período? de
participante?), nem o `outputSchema`, nem se "não pago" é `dataPagamento == null`
ou `situacaoSimples`-baseado — e `situacaoSimples` só é conhecido após a
descoberta 4b.0. Há uma dependência implícita 4d-2 → 4b.0 não declarada na
tabela de ondas.
**Recomendação:** 4d-2 deve depender explicitamente de 4b.0 (descoberta dos
valores de `situacao`/`situacaoSimples`) e cada tool ter seus schemas escritos.
Definir o critério "não pago" com base no que 4b.0 descobrir, não deixar o
subagente adivinhar entre `dataPagamento` e `situacao`.

### I11 — `.env.example` mencionado só na verificação final; nenhuma task o atualiza, e nada cria `.env.local`
**Task afetada:** verificação final, 4a.3, 4a.9, 4f-1.
A spec exige `MCP_SERVICE_TOKEN` e `MCP_DATABASE_URL`. O plano só menciona
atualizar `.env.example` no item final da "Verificação final" — não há task
dedicada, e atualizar `.env.example` no fim é tarde: a Task 4a.3 já precisa de
`MCP_SERVICE_TOKEN` para o teste, a 4a.9 para subir o servidor, a 4a.2/4f-1 de
`MCP_DATABASE_URL`. Além disso o script `mcp` (4a.9 Step 4) é
`tsx --env-file=.env.local` — se `.env.local` não tiver `MCP_SERVICE_TOKEN`, o
servidor sobe sem token e o middleware compara contra `undefined`.
**Recomendação:** mover a atualização do `.env.example` para a Task 4a.0 (ou
criar uma 4a.0b), incluindo `MCP_SERVICE_TOKEN` e `MCP_DATABASE_URL` com
comentário. Adicionar nota de que `.env.local` (não versionado) precisa receber
os mesmos valores antes de 4a.3/4a.9, e que `validateServiceToken` deve falhar
seguro (negar) se `MCP_SERVICE_TOKEN` estiver ausente — não comparar contra
`undefined`.

---

## MENOR

### M1 — Task 4a.7: `import type { prisma } from "../lib/prisma"` e depois `typeof prisma`
**Task afetada:** 4a.7.
`import type { prisma }` importa o **valor** `prisma` como tipo — funciona com
`typeof prisma` mas é uma construção frágil/incomum. O padrão limpo é
`import type { PrismaClient }` e usar `PrismaClient` direto. Não quebra, mas é
ruído. Recomendação: tipar `ToolHandlerCtx.prisma` como `PrismaClient`.

### M2 — Task 4a.5: session-store em `Map` é incompatível com múltiplas instâncias do container
**Task afetada:** 4a.5.
O `Map` em memória funciona para uma instância. Se o `mcp` escalar para 2+
réplicas atrás de um load balancer, uma sessão aberta numa réplica não é
encontrada na outra. A spec 3.2 diz "stateless quanto a conversa" e a F4 tem um
único cliente (o agente F5), então provavelmente é aceitável — mas o plano
deveria registrar a premissa "instância única" como nota explícita, igual fez
com tenant único. Recomendação: adicionar comentário no código e nota no plano.

### M3 — Task 4f-3: rate limiter integrado em `server.ts` que a 4a.9 já "fechou"
**Task afetada:** 4f-3, 4a.9.
4f-3 manda "integrar no pipeline de `tools/call` de `server.ts`" — mas 4a.9 já
entregou e commitou esse pipeline. É edição retroativa de arquivo de onda
anterior. Aceitável (ondas posteriores estendem), mas o plano deveria declarar
que `server.ts` é tocado de novo em 4f-3, para o subagente não estranhar. Idem
4f-1 que cria `MCP_DATABASE_URL` que a 4a.2 já consumia com fallback.

### M4 — Task 4b.0 muda 4a.1 retroativamente — ordem das ondas conflita
**Task afetada:** 4b.0, 4a.1.
A tabela de ondas diz "4b depende de 4a (schema)". Mas 4b.0 Step 2 pode forçar
uma migration adicional na coluna `natureza` de `FatoFinanceiroMovimento` —
alterando o que 4a.1 produziu. Funcionalmente ok (migration incremental), mas a
sequência "4a.1 cria o modelo → 4b.0 descobre que falta coluna → nova migration"
significa duas migrations para um modelo na mesma fase. Recomendação: considerar
**mover 4b.0 para antes de 4a.1** (descoberta primeiro, schema depois) — a
descoberta não depende do schema, e assim 4a.1 nasce correto. O plano colocou a
descoberta na onda 4b, mas ela é logicamente pré-4a.1.

### M5 — Task 4c-2.0 está fisicamente dentro da onda 4c **depois** de 4c-2 que a usa
**Task afetada:** 4c-2, 4c-2.0.
O texto de 4c-2 já usa `withFreshness` no snippet, mas `withFreshness` só é
criado em 4c-2.0, listada **abaixo** de 4c-2 no documento. A numeração "4c-2.0"
sugere "antes de 4c-2", mas a ordem de leitura está invertida. Recomendação:
mover 4c-2.0 para antes de 4c-2 no documento e renomeá-la (ex.: 4c-1.5) para a
ordem ficar inequívoca.

### M6 — Task 4f-4 (harness) testa `bi_consulta_avancada` mas depende de 4e; tabela de ondas confirma, texto não reforça
**Task afetada:** 4f-4.
O Step 2 de 4f-4 testa "`bi_consulta_avancada` invisível para `manager`/`viewer`"
— tool criada em 4e. A tabela de ondas lista a dependência (4f-4 ← 4e), mas o
texto da task não a repete. Menor; só consistência.

### M7 — Verificação final lista `npx next build` mas o `mcp/` não tem `next build` — ok, mas o item "worker roda um ciclo" não tem como ser automatizado
**Task afetada:** verificação final.
"Worker roda um ciclo: os 3 fatos de financeiro são construídos" exige Odoo
acessível e dados — não é um teste de CI, é validação manual/de integração. O
plano deveria marcar quais itens da verificação final são automáticos (CI) e
quais são manuais (deploy assistido). Menor, mas evita confusão na etapa [9].

---

## Conclusão

O plano tem boa cobertura de arquitetura e mapeia bem a spec no "Self-review",
mas **falha no critério central da etapa [6]: decomposição máxima e zero
ambiguidade**. Três tasks são épicos disfarçados (4c-2, 4a.9, 4c-1 — C1/C3/I6),
o "padrão de 5 steps por tool" é um placeholder proibido pelo `CLAUDE.md §6`
(C1), a função `shape()` é invocada sem nunca ser definida, e há lacunas de
cobertura da spec (teste de paridade #IM-8 ausente — C6; `.env.example`
órfão — I11). Há ainda um erro material de modelagem (`Float` para dinheiro —
I2) e uma PK não verificada (`bancoId` — I1). O plano **não está pronto para
execução** por subagentes Sonnet: vários pontos exigem decisões de design que
um executor mecânico teria de adivinhar. Necessária uma v2 que decomponha
4c-2/4d em uma task por tool com schemas escritos, quebre 4a.9 e 4c-1, defina
onde mora a agregação de financeiro (I9), o mapa fato→fonte (I8), e corrija o
schema (I1/I2/I3).
