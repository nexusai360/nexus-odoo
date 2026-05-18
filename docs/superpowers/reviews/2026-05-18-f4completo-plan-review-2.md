# Review adversarial #2 — PLAN v2 "F4 completo"

> Alvo: `docs/superpowers/plans/2026-05-18-f4-completo.md` (PLAN v2, 68 tasks,
> ondas 0/A–H/V). Foco `CLAUDE.md §6` [7]: granularidade, integração,
> testabilidade — cada task executável por um subagente Sonnet mecânico sem
> adivinhar. Último filtro antes da execução.
>
> Verificado contra o código real: `mcp/lib/failure.ts`, `mcp/lib/freshness.ts`,
> `src/worker/fatos/registry.ts`, `src/worker/fatos/fato-build-state.ts`,
> `src/worker/fatos/fato-financeiro-titulo.ts`, `mcp/catalog/index.ts`,
> `mcp/catalog/types.ts`, `mcp/__tests__/integration.test.ts`,
> `mcp/__tests__/harness.ts`, `mcp/tools/caminho3/bi-consulta-avancada.ts`,
> `mcp/tools/financeiro/contas-a-receber.ts`, `mcp/lib/dias-atraso.ts`,
> `src/worker/catalog/model-catalog.ts`, `prisma/sql/2026-05-17-mcp-role.sql`,
> `prisma/schema.prisma`.
>
> Resultado: **3 CRÍTICO, 7 IMPORTANTE, 5 MENOR.** Os 20 achados da Review #1
> estão majoritariamente resolvidos, mas **a v2 reintroduziu uma bifurcação que
> a SPEC v3 havia eliminado** (R2-C1) e há um conjunto de placeholders/contratos
> não cravados que um subagente Sonnet não resolve sem adivinhar. O plano
> **precisa de uma v3** antes da execução.

---

## Parte 1 — Status dos 20 achados da Review #1

| # | Achado | Status na v2 | Observação |
|---|---|---|---|
| P-C1 | `invalid_input` impossível com o pipeline | **RESOLVIDO** | Task H.1 cria `SqlGuardError` + estende `toOutcome`. Correto e com teste de regressão. Verificado contra `failure.ts` real. |
| P-C2 | 9 assertivas literais `14` no harness | **RESOLVIDO COM RESSALVA** | §"Catálogo de assertivas" cataloga as ocorrências e crava a progressão 14→19→25→28→30→33. Ressalva: a contagem real e o cálculo das assertivas de perfil têm erros — ver R2-C2 e R2-I1. |
| P-C3 | Precondições de banco da A.4 | **RESOLVIDO** | A.4 crava `\d fato_pedido`, mesma `DATABASE_URL`, ordem A.3→A.4. |
| P-C4 | E.2 condicional/épico; discovery após schema | **RESOLVIDO** | Onda 0 (O.1/O.2/O.3) move discovery para antes de A; E.2 eliminada; `FatoContaContabil` definitivo em A.3. |
| P-C5 | Sequencialidade B–F como "recomendação" | **RESOLVIDO** | §"Modelo de execução" crava B→C→D→E→F estritamente sequenciais; alternativa paralela removida. |
| P-I1 | Discovery B.1 dentro da onda B | **RESOLVIDO** | Movida para O.1 (onda 0). |
| P-I2 | `calcDiasAtraso` símbolo inexistente | **RESOLVIDO** | §"Padrões herdados" e B.8 usam `diasAtraso(Date\|null, Date)`. Confirmado contra `dias-atraso.ts` real. |
| P-I3 | `bi-pool`/`sql-guard` não conectados ao handler | **RESOLVIDO** | H.7 Step 3 crava os três imports literais. Ressalva menor: ver R2-M2 (caminho de `failure.js`). |
| P-I4 | `runBuilders` engole exceção; teste de rollback | **RESOLVIDO COM RESSALVA** | C.13 Step 2 manda invocar `rebuildFatoNotaFiscalItem` direto. Ressalva: só vale no Caminho A — ver R2-C1. |
| P-I5 | Transação 211k afirmada sem medição | **RESOLVIDO NA APARÊNCIA — REGRESSÃO** | C.2 cria spike. Mas a "contingência" Caminho B **contradiz a SPEC v3** que cravou transação única sem bifurcação. Ver **R2-C1**. |
| P-I6 | `tipoMovimento` nullable nunca recebe null | **RESOLVIDO** | A.3 declara `String @default("outro")`; C.1 testa os 3 ramos. |
| P-I7 | `prisma generate` por onda não cravado | **RESOLVIDO** | Step 0 de toda onda B–H. |
| P-I8 | `parceiro.email`/`telefone` sem fonte | **RESOLVIDO** | D.1 crava `email` de `raw.email`, `telefone` de `raw.phone ?? raw.mobile`. |
| P-I9 | `estrutura_conta` 3 casos de teste | **RESOLVIDO** | E.5 Step 1 crava os 3 casos. |
| P-M1 | Regra de array do `withFreshness` | **RESOLVIDO** | §"Padrões herdados" tem a regra única; cada tool declara o caso. |
| P-M2 | Contagem de tasks não fecha | **RESOLVIDO** | 68 tasks, soma confere (3+5+12+13+8+8+5+9+2=68). |
| P-M3 | `bi-pool` eager: técnica de re-import | **RESOLVIDO** | H.5 Step 1 crava `jest.isolateModules`. |
| P-M4 | Nome real da env `MCP_DATABASE_URL` | **RESOLVIDO** | Confirmado contra `.env.example` real (`MCP_DATABASE_URL` existe, L52). |
| P-M5 | `users`/`user_domain_access` no `nexus_mcp_bi` | **RESOLVIDO** | H.2 remove o GRANT; `\dp users` verifica. |
| P-M6 | V.2 self-review sem critério de saída | **RESOLVIDO** | V.2 reescrita como checklist factual PASS/FAIL bloqueante. |

**Agregado:** 20/20 endereçados; **17 plenamente resolvidos**, **3 resolvidos
com ressalva** (P-C2, P-I4, P-I5), sendo **P-I5 uma regressão material**
(detalhada em R2-C1). Nenhuma correção da v1 criou problema novo grave **exceto**
a bifurcação A/B reintroduzida pela "contingência" do spike.

---

## Parte 2 — Achados novos

## CRÍTICO

### R2-C1 — A v2 reintroduz a bifurcação Caminho A/B que a SPEC v3 (N1/N2) eliminou explicitamente
**Tasks:** C.2 Step 3, C.3 (todos os steps), C.13 Step 2.
**Problema.** A SPEC v3 §3.2 é categórica (achado N2, "decisão cravada que
substitui a v2"): o builder de `FatoNotaFiscalItem` é `deleteMany` + `createMany`
chunked + `markFatoBuilt(tx,…)` **dentro de um único `$transaction`** — e diz
literalmente "**Não há cláusula condicional 'se >60s migrar para incremental'**
— essa condicional da v1 foi removida na v2 e permanece removida. Caso futuro
[…] é uma **onda futura explícita** — não uma decisão adiada dentro da onda C."
A SPEC §3 cabeçalho repete: "todos os 6 builders seguem o padrão transacional".
O PLAN v2 **desobedece**: C.2 Step 3 cria um "Caminho B (contingência, build
incremental por `odooId`)" adotado "se a transação passou de 60 s", e C.3
descreve os dois caminhos com a escolha feita pelo spike. Isto é exatamente a
condicional ">60s" que a SPEC removeu, ressuscitada. Consequências em cascata:
(a) C.3 vira uma **task condicional/épico** — seu escopo, arquivos e lógica
dependem de um resultado de runtime do spike, violando a decomposição máxima do
`CLAUDE.md §6` (mesma falha que a Review #1 P-C4 apontou na antiga E.2);
(b) o "Caminho B" persiste a janela de inconsistência que a SPEC §3.2/§7 e o
achado N2 fecharam como decisão canônica — o PLAN não pode reabrir uma decisão
da SPEC; (c) C.13 Step 2 fica bifurcado ("se Caminho A… / se Caminho B…"), e o
teste de rollback (resposta ao P-I4) **só existe no Caminho A** — se o spike
escolher B, não há teste de consistência algum, e a regra de raiz §6 da SPEC
("teste que confirma o rebuild transacional") fica sem cumprimento.
**Recomendação.** Alinhar o PLAN à SPEC v3, que é a autoridade. Cravar C.3 como
**transação única, caminho único** — sem Caminho B. O spike C.2 **permanece
útil**, mas seu papel muda: deixa de ser um "go/no-go que escolhe o builder" e
passa a ser uma **medição de risco** — mede tempo/memória/erro de driver da
transação de 211k linhas e, **se** falhar (transação inviável, OOM, estouro de
parâmetros), isso é **erro/bloqueio que chama o humano** (`CLAUDE.md §5`), não
uma ramificação que o subagente decide sozinho. Reescrever C.2 Step 3 nesses
termos e remover toda a prosa de "Caminho A/B" de C.2, C.3 e C.13. O build
incremental por `odooId` continua sendo onda futura, como a SPEC diz.

### R2-C2 — A contagem de tools por onda no PLAN não bate com a SPEC v3; a progressão do harness está errada em uma onda
**Tasks:** §"Contagem de assertivas", §"Catálogo de assertivas", B.11, C.12,
D.7, E.6, F.4; SPEC v3 §2.4 / apêndice A.
**Problema.** A SPEC v3 §2.4 e o apêndice A são explícitos: a onda 1 entregou
**14** tools e a F4 completo **adiciona 19** (Comercial 5, Fiscal 6, Cadastros 3,
Contábil 2, RH/CRM/Produção 3) → total **33**. O PLAN v2 crava a progressão
"14→19→25→28→30→33". Some os deltas do PLAN: B +5 (→19), C +6 (→25), D +3 (→28),
E +2 (→30), F +3 (→33). A soma fecha **33** e os deltas batem com a SPEC — esta
parte está correta. **O erro real é outro e é grave:** o `integration.test.ts`
real **não tem 9 nem "6+6" assertivas** como o PLAN afirma. Contei no arquivo
real: há **4** `toHaveLength(14)` ligados ao catálogo total (linhas 106, 117,
131, 139), **1** `toHaveLength(14)` no teste HTTP (linha 326) → **5 assertivas**
de `14`; mais **3** assertivas de subconjunto de perfil que valem `13`/`7`/`7`
(linhas 149, 159, 168) e **2** no bloco HTTP (`13` na 350, `7` na 369). O PLAN
§"Catálogo de assertivas" diz "6 assertivas `toHaveLength(14)`" e depois "São 6…
uma está duplicada por contexto; o subagente conta as ocorrências reais" — isto
é **instrução ambígua**: o PLAN não sabe quantas são e delega a contagem ao
subagente, que é exatamente o tipo de adivinhação que o §6 proíbe. Pior: o PLAN
cataloga as assertivas de perfil como genericamente "`toHaveLength(13)`/
`toHaveLength(7)`" sem dizer **quais valores** cada `it()` tem, e manda
"recalcular… somar +N" sem dar o número de partida nem o de chegada por linha.
Um subagente Sonnet não tem como atualizar a linha 149 (`13`) corretamente sem o
PLAN dizer "linha 149 era 13, depois de B vira 13 (manager não tem `comercial`),
depois de F vira 16". O PLAN deixa esse cálculo inteiro implícito.
**Recomendação.** Reescrever a §"Catálogo de assertivas" com a contagem
**exata** verificada contra o arquivo real (5 assertivas de `14`; 3+2 de perfil
com valores nominais por linha) e, para cada task de harness, uma **tabela linha
a linha**: nº da assertiva, valor antigo, valor novo, justificativa. Como os
perfis de teste (`manager`/`viewer`/`viewer-fin` no mock de `integration.test.ts`)
**não recebem** os domínios novos (`comercial`/`fiscal`/`cadastros`/`contabil`)
— o mock de `resolveUserContext` fixa `domains: ["estoque","financeiro"]` etc. —,
as assertivas de perfil **só mudam na onda F** (RH/CRM/Produção são
`sempreVisivel`, +3 para todos) e **nas ondas B–E permanecem inalteradas**. O
PLAN diz o oposto em B.11 Step 2 ("o perfil… soma +5 se inclui `comercial`") —
nenhum perfil do fixture inclui `comercial`, então o +5 nunca se aplica. Isso
precisa ser cravado: B/C/D/E **não tocam** as assertivas de perfil; só F toca
(+3 em todas). Ver também R2-I1.

### R2-C3 — `FATO_FONTE` espera o `model` do `SyncState`, mas o PLAN manda confirmar contra `MODEL_CATALOG`, que usa `odooModel` — e os dois podem divergir
**Tasks:** B.3, C.4, D.2, E.2; SPEC v3 §4.
**Problema.** O `FATO_FONTE` real (`freshness.ts`) é `Record<string, { model,
mode }>` e o `model` é casado contra `SyncState.model` (a query
`syncState.findMany({ where: { model: { in: modelos } } })`). O `SyncState.model`
é a `@id` da tabela `sync_state`. O PLAN (B.3/C.4/D.2/E.2 Step 1) manda
"confirmar contra o `MODEL_CATALOG` (`src/worker/catalog/model-catalog.ts`) e o
`SyncState` real a string exata de `model`". Verifiquei o `model-catalog.ts`
real: a interface é `CatalogEntry { odooModel: string; mode: SyncMode }` — o
campo se chama **`odooModel`**, não `model`, e seus valores são
`"pedido.documento"`, `"sped.documento"`, `"sped.documento.item"`,
`"res.partner"`, `"contabil.conta"`, `"pedido.parcela"`. O PLAN não diz se a
string a gravar em `FATO_FONTE` é o `odooModel` do catálogo **ou** o
`SyncState.model` real do banco — e cita os dois como se fossem intercambiáveis.
Os builders existentes da onda 1 (`fato_estoque_movimento` →
`model: "estoque.extrato"`) sugerem que `SyncState.model` == nome do modelo Odoo,
mas o próprio comentário do `freshness.ts` avisa "Confirmar o `model` de
`estoque.extrato` contra `MODEL_CATALOG`" — ou seja, **nem o código da onda 1
tinha certeza**. Um subagente Sonnet vai gravar `odooModel` por padrão e, se o
`SyncState.model` real for diferente (ex.: prefixado, ou o nome lógico vs.
técnico), `fonteStatus` sai mudo — exatamente o bug N3 que a SPEC quis matar, e
os testes unitários (que mockam) **não pegam**; só o E2E pega.
**Recomendação.** Cravar em cada task B.3/C.4/D.2/E.2 Step 1 um comando concreto
e a fonte de verdade: `SELECT model FROM sync_state ORDER BY model;` no cache de
dev, e instruir: "a string gravada em `FATO_FONTE` é o valor da coluna
`sync_state.model` — não o `odooModel` do `MODEL_CATALOG`; o `MODEL_CATALOG` é
só referência cruzada. Se nenhuma linha de `sync_state` corresponder à fonte
esperada, é erro/bloqueio." E acrescentar ao E2E de cada onda a asserção de que
`fonteStatus.ultimaSyncEm` não é `null` (já está em B.12/C.13/D.8/E.7 — bom).

---

## IMPORTANTE

### R2-I1 — Os perfis do fixture do harness nunca recebem os domínios novos; vários `it()` "por perfil" do PLAN são impossíveis ou no-op
**Tasks:** B.11 Step 4, C.12 Step 5, D.7 Step 5, E.6 Step 5.
**Problema.** B.11 Step 4 manda "acrescentar um `it()` por perfil: um `admin`
(com domínio `comercial`) vê as 5 tools de comercial; um `viewer` **sem** domínio
`comercial` não as vê". Mas o mock de `resolveUserContext` em
`integration.test.ts` (linhas 29–41) é um **mapa estático fechado** de 6 usuários,
todos com `domains` fixos em `estoque`/`financeiro`/`[]`. **Não existe** um
usuário com domínio `comercial` no fixture. O `it()` "admin com domínio
`comercial`" não é executável sem **primeiro estender o mapa de mocks** — e
nenhuma task instrui isso. O mesmo vale para `harness.ts::PROFILES`. Como
`admin`/`super_admin` são privilegiados e veem tudo independentemente de domínio
(RBAC camada 1), o teste "admin vê as 5 de comercial" até funciona via os perfis
existentes — mas o teste "viewer **com** `comercial` vê / **sem** não vê" exige
um perfil novo que o PLAN não cria.
**Recomendação.** Adicionar a B.11 (e C.12/D.7/E.6) um step explícito:
"estender o mapa de `resolveUserContext` em `integration.test.ts` **e** o
`PROFILES` de `harness.ts` com um usuário `viewer` que tenha o domínio novo da
onda (ex.: `user-viewer-comercial` → `domains: ["comercial"]`)". Sem isso o
Step 4/5 é irrealizável. Alternativamente, cravar que o teste por perfil das
ondas B–E usa só `admin` vs. `viewer` sem domínio (ambos já existem) e que o
teste de "viewer COM o domínio" é deixado para um único step na onda F que
estende o fixture de uma vez.

### R2-I2 — `mapped.length === 0` + `createMany` condicional: o padrão da onda 1 não está cravado nos builders novos
**Tasks:** B.1, B.2, C.1, C.3, D.1, E.1.
**Problema.** O `rebuildFatoFinanceiroTitulo` real envolve o `createMany` num
`if (mapped.length)` — `createMany` com array vazio lança no Prisma/adapter-pg
em algumas versões, e o builder da onda 1 se protege disso. As tasks de builder
da v2 dizem "`$transaction` `deleteMany`+`createMany`+`markFatoBuilt`" sem
mencionar o guard `if (mapped.length)`. Para `fato_pedido` (71 linhas) nunca
será vazio na prática, mas o **mapper-espelho** que o subagente deve produzir
("espelhando `fato-financeiro-titulo.ts`") tem o guard, e o PLAN não diz se o
mantém. Ambiguidade pequena mas real: dois subagentes produzirão código
divergente.
**Recomendação.** Acrescentar ao §"Padrões herdados" uma linha: "o `createMany`
é sempre envolto em `if (mapped.length) { … }`, como em
`fato-financeiro-titulo.ts` — vale para todos os 6 builders e para cada chunk do
`FatoNotaFiscalItem`."

### R2-I3 — Spike C.2: o script lê "todo `raw_sped_documento_item`" mas o builder C.3 final precisa de `notaInfoMap`; o spike não mede o caminho real
**Tasks:** C.2 Step 1, C.3.
**Problema.** O spike C.2 Step 1 mapeia `raw_sped_documento_item` "para a forma
de `FatoNotaFiscalItem`" e roda a transação. Mas a forma final de
`FatoNotaFiscalItem` (decisão N8) inclui `dataEmissao`/`entradaSaida`
desnormalizados, que vêm de um `notaInfoMap` construído lendo
`raw_sped_documento`. O spike, como descrito, **não constrói o `notaInfoMap`** —
mede uma transação com um payload por linha menor que o real (faltam 2 colunas)
e sem o custo da leitura+Map de `raw_sped_documento`. A medição de tempo/memória
do spike não corresponde ao builder C.3 efetivo. Subdimensiona o risco que o
spike deveria medir.
**Recomendação.** Cravar em C.2 Step 1 que o script de spike replica o pipeline
**completo** do builder C.3: lê `raw_sped_documento`, monta o `notaInfoMap`,
mapeia os itens **com** `dataEmissao`/`entradaSaida`, e só então roda a
transação — para a medição refletir o builder real.

### R2-I4 — Onda H: o handler do 3c precisa gravar a SQL em `McpAuditLog.params`, mas nenhuma task verifica/implementa esse caminho de auditoria
**Tasks:** H.7, H.9 Step 4; SPEC v3 §3.7 C6.
**Problema.** A SPEC §3.7 C6 crava: toda execução do 3c grava em `McpAuditLog`
com a SQL no campo **`params`**, e o `INSERT` é feito pela conexão `nexus_mcp`
(não pelo pool `nexus_mcp_bi`). H.7 reescreve `bi-consulta-avancada.ts` e
descreve o handler em 4 passos (validar, pool, executar, devolver) — **nenhum
passo menciona gravar a SQL em `params`**. O audit do MCP é feito pelo pipeline
(`server.ts`), não pelo handler — então a questão é: o pipeline já grava
`params` com o input da tool? Se sim, a SQL cai em `params` automaticamente
(porque `input = { sql }`), e a SPEC está satisfeita sem código novo — mas o
PLAN **não afirma isso nem manda verificar**. Se não, falta uma task. H.9 Step 4
manda "confirmar que toda execução gravou em `McpAuditLog` com a SQL no campo
`params`" — verifica um comportamento que nenhuma task de implementação garante.
Verificação sem implementação correspondente.
**Recomendação.** Adicionar a H.7 um Step que **confirme contra `server.ts`/
`audit.ts`** se o pipeline já persiste o input em `params`. Se já persiste:
cravar no PLAN "o audit de `params` é automático — o input `{ sql }` já é
gravado pelo pipeline; nenhum código de audit no handler". Se não persiste:
abrir uma task de onda H para isso. Sem essa verificação, H.9 Step 4 pode falhar
sem culpado.

### R2-I5 — `inputSchemaShape` é campo obrigatório do `ToolEntry`; nenhuma task de tool o menciona explicitamente
**Tasks:** todas as tasks de criação de tool — B.5–B.9, C.6–C.11, D.4–D.6,
E.4–E.5, F.1–F.3, H.7.
**Problema.** O `ToolEntry` real (`mcp/catalog/types.ts` L41) exige
`inputSchemaShape: ZodRawShape` **além** de `inputSchema`. A tool de referência
`contas-a-receber.ts` tem `inputSchemaShape: inputSchema.shape`. As tasks de
tool do PLAN especificam `inputSchema` (`z.object({…})`) e `outputSchema`, e
dizem "espelhando `contas-a-receber.ts`", mas **nenhuma** lista `inputSchemaShape`
entre os campos a preencher. Para tools com `inputSchema = z.object({})` (várias:
`pedidos-por-etapa`, `contar-parceiros`, as 3 de domínio-vazio) o subagente
precisa saber que `inputSchemaShape` é `{}` (o `.shape` de um objeto vazio).
"Espelhar" cobre na prática, mas o §6 exige zero ambiguidade — o campo
obrigatório deve estar nomeado.
**Recomendação.** Acrescentar ao §"Padrões herdados" (item da tool MCP): "toda
`ToolEntry` declara `inputSchemaShape: inputSchema.shape` **e** `inputSchema` —
ambos obrigatórios, conforme `mcp/catalog/types.ts` e `contas-a-receber.ts`."

### R2-I6 — H.7: o handler de `bi_consulta_avancada` retorna output tabular cru, mas a tool da onda 1 valida com `outputSchema.parse()` — o contrato de retorno do handler não é cravado
**Tasks:** H.7 Step 3.
**Problema.** O `bi-consulta-avancada.ts` atual termina o handler com
`return outputSchema.parse(output)`. As tools de freshness (`contas-a-receber`)
retornam direto o `withFreshness(...)` — um envelope `preparando|ok|vazio`. A
tool 3c reescrita **não usa `withFreshness`** (não tem fato). H.7 Step 1 define o
`outputSchema` tabular mas o Step 3 só diz "implementar o handler conforme o
Step 1". Não crava se o handler retorna `outputSchema.parse(output)` (como o stub
faz hoje) ou o objeto cru, nem como o erro "modo BI não configurado" é
estruturado no `outputSchema` — o `outputSchema` definido no Step 1 **só tem a
forma tabular de sucesso**; não há variante para o erro "modo BI não
configurado". Se o handler lança `Error` para esse caso (Step 1 diz "lança um
`Error` comum → `outcome="error"`"), então o `outputSchema` tabular nunca
precisa de variante de erro — coerente — mas o PLAN deveria dizer isso
explicitamente, porque o `outputSchema` de uma tool sem união de erro é
incomum no codebase (todas as outras têm `z.union([preparando, ok])`).
**Recomendação.** Cravar em H.7 Step 3: "o handler retorna
`outputSchema.parse(output)` no caminho de sucesso; os caminhos de recusa
(`SqlGuardError`) e de indisponibilidade (`Error` 'modo BI não configurado')
**lançam** — não retornam — logo `outputSchema` não tem variante de erro, é só a
forma tabular. Isso é intencional e diferente das tools de freshness."

### R2-I7 — A regra de "uma onda só começa quando a anterior fechou o E2E" colide com tasks que dependem de dado de cache que pode não existir em dev
**Tasks:** B.12, C.13, D.8, E.7 — todos os E2E.
**Problema.** Cada onda B–E tem um E2E obrigatório (regra de raiz §6 [9]) que
**roda os builders contra o cache real** e confere contagens fixas
(`fato_pedido` ≈ 71, `fato_nota_fiscal_item` ≈ 211385, `fato_parceiro` ≈ 6545,
`fato_conta_contabil` ≈ 934). Isso pressupõe que o cache de dev está **populado
e sincronizado** com esses domínios. O PLAN nunca crava essa precondição. Se o
ambiente de dev onde a execução roda tem o cache só parcialmente sincronizado
(ex.: F2 sincronizou estoque/financeiro mas o cron ainda não rodou para
`sped.documento.item`), o E2E falha com contagem 0 — e o subagente não saberá se
é bug do builder ou cache vazio. A SPEC §2.2 afirma que as fontes "já estão no
`MODEL_CATALOG` e sincronizadas no cache", mas "estar no catálogo" ≠ "ter linhas
no `raw_*` do banco de dev atual".
**Recomendação.** Adicionar ao Step 0 das ondas B–E (ou a uma precondição da
onda) uma verificação: `SELECT count(*) FROM raw_pedido_documento WHERE
raw_deleted=false;` etc. — confirmar que o `raw_*` da onda tem linhas antes de
rodar o builder. Cache vazio = erro/bloqueio que chama o humano (cron precisa
rodar primeiro), não falha de builder.

---

## MENOR

### R2-M1 — Onda 0: O.1 grava as constantes em `2026-05-18-f4-completo-dominios.md`, O.2 cria `2026-05-18-f4-discovery-pre-schema.md`, O.3 consolida — dois docs para a mesma discovery
A discovery comercial (O.1) anexa a `…-completo-dominios.md`; a contábil (O.2)
cria `…-discovery-pre-schema.md`; O.3 copia as constantes de comercial para o
doc de pre-schema também. Resultado: a constante `CAMPO_ETAPA_FINAL` vive em
dois arquivos. Se a onda A consultar um e o builder B.1 o outro, e os dois
divergirem por um erro de cópia, ninguém pega. Recomenda-se O.1 escrever
**direto** no `…-discovery-pre-schema.md` (fonte única), e a anexação ao
`…-completo-dominios.md` ser opcional/referência.

### R2-M2 — H.7: o caminho relativo de `failure.js` é cravado como `../../lib/failure.js` mas isso depende da profundidade real
H.7 Step 3 crava `import { SqlGuardError } from "../../lib/failure.js"` e
parenteticamente diz "ajustar o caminho à profundidade real de
`mcp/tools/caminho3/`". De `mcp/tools/caminho3/` para `mcp/lib/` o caminho
correto é `../../lib/failure.js` — está certo. Mas o "ajustar… se necessário"
reintroduz ambiguidade. Verificado: `bi-consulta-avancada.ts` importa
`../../catalog/types.js` — confirma profundidade 2. Cravar o caminho como
definitivo (`../../lib/failure.js`) e remover o "ajustar se necessário".

### R2-M3 — V.1 Step 6 verifica que "nenhum literal `toHaveLength(14|19|25|28|30)` sobrou" — mas `13`, `7` e os recalculados podem colidir
A verificação final caça os literais antigos de catálogo total. Mas se uma
assertiva de perfil recalculada acabar valendo, por coincidência, `19` ou `25`
(ex.: um perfil que vê 25 tools após F), o grep de V.1 Step 6 gera falso
positivo. Recomenda-se que V.1 Step 6 verifique pela **igualdade de conjuntos de
ids** (que já está mandada) e trate o grep de literais como heurística
secundária, não como critério de PASS/FAIL.

### R2-M4 — C.3 Step 1: o teste do `chunk(arr, size)` é bom, mas o helper não tem arquivo cravado
C.3 Step 1 define `chunk(arr, size)` como "helper puro" testado, mas não diz se
ele vive em `fato-nota-fiscal-item.ts`, num utilitário compartilhado, ou em
`src/worker/fatos/`. Se uma onda futura precisar de `chunk`, haverá duplicação.
Menor — cravar "exportado de `fato-nota-fiscal-item.ts`" resolve.

### R2-M5 — As tasks de tool dizem "criar/modificar `index.ts`" mas a primeira tool de cada domínio cria e as demais modificam — a fronteira está só implícita
Em Comercial, B.5 diz "Create/Modify: `mcp/tools/comercial/index.ts`" e B.6–B.9
dizem "Modify". Funciona, mas "Create/Modify" numa mesma task é ambíguo (o
subagente de B.5 cria; se rodar de novo, modifica). Cravar: "B.5 **cria**
`index.ts` com a primeira tool; B.6+ **modificam**". Idem Fiscal C.6, Cadastros
D.4, Contábil E.4, domínios-vazios F.1. Trivial, mas é o tipo de precisão que o
§6 pede.

---

## Achados mais graves (resumo para o autor do plano)

1. **R2-C1** — o PLAN reintroduziu a bifurcação Caminho A/B no builder de
   `FatoNotaFiscalItem` que a SPEC v3 (N1/N2) **eliminou explicitamente**. C.3
   virou task condicional/épico; o "Caminho B" reabre a janela de
   inconsistência que a SPEC fechou como decisão canônica. O PLAN não pode
   revogar decisão da SPEC — cravar transação única, caminho único; o spike
   vira medição de risco com bloqueio-ao-humano, não go/no-go.
2. **R2-C2 + R2-I1** — a §"Catálogo de assertivas" não tem a contagem exata das
   assertivas do `integration.test.ts` real (delega ao subagente "contar as
   ocorrências reais") e erra ao mandar B–E recalcularem assertivas de perfil:
   os perfis do fixture **não recebem** os domínios novos, então B–E não tocam
   essas assertivas — só F (+3, `sempreVisivel`). Falta também estender o mapa
   de mocks para os `it()` "viewer com domínio X".
3. **R2-C3** — `FATO_FONTE.model` casa com `SyncState.model`, mas o PLAN manda
   confirmar contra `MODEL_CATALOG`, cujo campo é `odooModel` — os dois podem
   divergir; o subagente vai gravar o valor errado e `fonteStatus` sai mudo
   (o próprio bug N3). Cravar `SELECT model FROM sync_state` como fonte de
   verdade.
4. **R2-I4** — H.9 verifica que a SQL é gravada em `McpAuditLog.params`, mas
   nenhuma task implementa nem confirma esse caminho contra `server.ts`.
5. **R2-I3 / R2-I7** — o spike C.2 mede um pipeline incompleto (sem
   `notaInfoMap`); e os E2E pressupõem cache de dev populado sem cravar a
   precondição.

**Contagem: 3 CRÍTICO, 7 IMPORTANTE, 5 MENOR.** Status dos 20 da Review #1:
17 plenamente resolvidos, 3 com ressalva (P-I5 é regressão material — vira
R2-C1). O plano precisa de uma **v3** que feche os 3 CRÍTICO — sobretudo
realinhar C.2/C.3/C.13 à SPEC v3 — antes de ir para a execução.
