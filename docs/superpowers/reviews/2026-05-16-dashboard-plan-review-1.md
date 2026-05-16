# Review Profunda #1 — PLAN v1 da F3 (Dashboard de Relatórios)

> Foco desta review (`CLAUDE.md` §6 [6]): **lacunas, ordem, premissas**.
> Documento revisado: `docs/superpowers/plans/2026-05-16-dashboard-relatorios.md` (PLAN v1).
> Spec de referência: `docs/superpowers/specs/2026-05-16-dashboard-relatorios-design.md` (SPEC v3).
> Esta é a review #1. A decomposição fina das tasks é trabalho da review #2 — aqui
> apenas se aponta **o que** decompor.

Auditoria adversarial. Achados ordenados por severidade.

---

## CRÍTICOS

### C1 — `logAudit` é fora do banco transacional; a Task 29 promete um `$transaction` que não pode incluí-lo

**Task/seção:** Task 29 (`createUser` transacional) / SPEC §4.4 decisão 5.

**Problema:** A spec e a Task 29 dizem que `createUser` abre `prisma.$transaction`
envolvendo `user.create` + `userDomainAccess.createMany` + **o `AuditLog` de
`user_created`**. Mas `logAudit` (`src/lib/audit.ts`) **não usa o Prisma client** —
escreve direto via `pgPool.query` (`INSERT INTO audit_logs ...`) numa conexão
separada do pool `pg`. Um `INSERT` feito por `pgPool` **não participa** da
transação aberta pelo `prisma.$transaction`. Se o plano seguir literalmente a
spec, o audit log ou (a) fica fora da transação (commit isola e a promessa de
atomicidade é falsa), ou (b) o autor terá que reescrever `logAudit` para aceitar
um `tx` Prisma — refactor não previsto em task nenhuma.

**Evidência:** `src/lib/audit.ts` — `await pgPool.query(...)`, sem parâmetro de
client/tx. `createUser` atual chama `logAudit({...})` *fora* de `prisma.create` e
sem `await` (fire-and-forget).

**Correção recomendada:** Decidir explicitamente no PLAN v2: ou (i) a transação
cobre apenas `user.create` + `userDomainAccess.createMany`, e o `logAudit`
permanece pós-commit, fire-and-forget como hoje — e a spec/Task 29 são corrigidas
para não prometer audit transacional; ou (ii) criar uma task de refactor de
`logAudit` para aceitar um executor Prisma opcional e inserir via
`tx.auditLog.create`. A opção (i) é a mais barata e consistente com o código
atual. De qualquer forma, o texto "envolvendo ... o `AuditLog`" precisa sair ou
ganhar task própria. O mesmo vale para `updateUserDomains` na Task 6.

### C2 — Task 9 assume um teste de contagem snapshot/incremental que não existe

**Task/seção:** Task 9 (`estoque.extrato` → snapshot).

**Problema:** A Task 9 instrui "Ajustar a contagem esperada no teste (snapshot
passa de 4 para 5; incremental cai 1)". Esse teste **não existe** em
`model-catalog.test.ts`. O arquivo só tem `it("todo modo é incremental, snapshot
ou estatico")` (varre `m.mode`) e um `rawTableFor`. Não há nenhuma asserção que
conte modelos por modo. A instrução da task é falsa quanto ao código real — quem
executar vai procurar um teste inexistente.

**Evidência:** `grep -n "snapshot|incremental|toBe|length|count"
src/worker/catalog/model-catalog.test.ts` retorna apenas a linha 27/29 (varredura
de modo) e a 34 (`rawTableFor`). Nenhum `expect(...).toHaveLength` por modo.

**Correção recomendada:** Reescrever a verificação da Task 9: a mudança de `mode`
em si não quebra nenhum teste atual; a verificação correta é `npx prisma format`
não aplicável (não é schema) e `npx tsc --noEmit && npx jest
src/worker/catalog`. Se o autor *quer* uma asserção de contagem, isso é uma
**task nova** ("adicionar teste de contagem por modo ao model-catalog"). Não
pode aparecer como "ajustar" algo que não está lá.

### C3 — `processSnapshotCycle` reconstrói `fato_estoque_saldo` *fora* do loop, mas `estoque.extrato` agora é snapshot — ordem dos builders frente ao sync não está garantida

**Task/seção:** Task 13 (disparar builders novos) / SPEC §3.5 (topologia) e §5.2.

**Problema:** Hoje `processSnapshotCycle` roda o loop de sync de **todos** os
modelos snapshot e só depois chama `rebuildFatoEstoqueSaldo`. A Task 13 manda
acrescentar `rebuildFatoEstoqueMovimento` e `rebuildFatoProdutoParado` "após o
rebuild de `fato_estoque_saldo`". Tudo bem em ordem — **mas** o plano não
verifica uma premissa essencial: o builder de movimento lê `raw_estoque_extrato`,
que **só passa a ser populado pelo ciclo de snapshot a partir da Task 9**. Antes
da Task 9, `estoque.extrato` é incremental e `raw_estoque_extrato` é alimentado
por `processIncrementalCycle`, um ciclo **distinto** que pode rodar em cadência
diferente. Depois da Task 9, o `raw_estoque_extrato` passa a ser recriado
inteiro a cada snapshot (o `syncSnapshot` faz delete+recreate). O plano não
discute: (a) o builder de movimento roda no `processSnapshotCycle` logo após o
snapshot de `estoque.extrato` ter rodado no mesmo loop — ok, garantido pela
ordem do loop; mas (b) a Task 13 não diz que `estoque.extrato` **precisa** já
estar como snapshot (depende da Task 9) e (c) não há nota de que, na primeira
execução pós-deploy, o `raw_estoque_extrato` pode estar vazio até o primeiro
ciclo snapshot completar — o builder de movimento gera fato vazio e o relatório
cai em estado "preparando"/"vazio". Isso é aceitável, mas precisa estar escrito.

**Evidência:** `src/worker/sync/processors.ts` — `rebuildFatoEstoqueSaldo` é
chamado após o `for` do snapshot, e o reconcile-cycle ignora modelos snapshot.
`estoque.extrato` está como `incremental` no catálogo (linha 13).

**Correção recomendada:** A Task 13 deve declarar explicitamente a dependência
da Task 9 (movimento só funciona com `estoque.extrato` em snapshot) e a ordem
das tasks no Bloco 3 deve garantir Task 9 antes da Task 11/13 — hoje a Task 9 vem
antes, ok, mas a dependência não está anotada. Acrescentar nota sobre o estado
"preparando" no primeiro ciclo. Confirmar também que `rebuildFatoProdutoParado`
depende do snapshot de `estoque.saldo.hoje.duracao.dias` **e** de
`estoque.saldo.hoje` — ambos snapshot, ambos no mesmo loop, ok, mas deixar
escrito.

### C4 — Indicador de freshness (§7) não tem task que o implemente de fato

**Task/seção:** SPEC §7 / decisão 11 ↔ Task 27.

**Problema:** A spec é explícita (§7, decisão 11): o indicador "atualizado em"
exibe o **menor** entre `SyncState.lastSnapshotAt` do `modeloFonte` e o
`ultimoBuildAt` do fato. Isso exige: (a) o catálogo declarar `modeloFonte` por
relatório — a Task 22 menciona `modeloFonte` mas o tipo `ReportEntry` da Task 21
**não inclui esse campo na lista de campos enumerada** (Task 21 lista `id`,
`titulo`, `dominio`, `descricao`, `icone`, `modeloFonte`, `secoes` — ok, está lá);
(b) uma função que leia `SyncState` por modelo e cruze com o `ultimoBuildAt`; (c)
quando um relatório tem **2 seções com fatos diferentes** (R4: `fato_produto_parado`;
R6: `fato_estoque_saldo` nas duas seções; R3/R5: `fato_estoque_movimento`), qual
`ultimoBuildAt` entra no `min`? A spec não resolve isso e o plano também não. A
Task 27 só diz "o indicador 'atualizado em'" sem detalhar a fonte do dado nem
quem calcula o `min`. **Não há task que leia `SyncState`.** É um placeholder.

**Evidência:** Task 27 — "passa para `report-view.tsx` ... o indicador 'atualizado
em'". Nenhuma menção a `SyncState`, a `lastSnapshotAt`, nem ao cálculo do menor.
Task 23 (`report-data.ts`) só "checa `ultimoBuildAt` do fato" para estado, não
para freshness. `SyncState` tem `lastSnapshotAt` (schema linha 1084) — ninguém
o lê no plano.

**Correção recomendada:** Criar uma sub-task (ou estender a Task 23) que produza
o timestamp de freshness: ler `SyncState.lastSnapshotAt` do `modeloFonte`,
calcular `min(lastSnapshotAt, ultimoBuildAt_do_fato)`. Decidir a regra para
relatórios multi-fato (provavelmente o **menor entre todos os fatos das seções**).
A Task 27 deve consumir esse valor pronto, não "calcular o indicador".

### C5 — `relNome` pode retornar `string` para um campo que o tipo declara como `[number, string]` mas o Odoo às vezes manda `[id, false]`

**Task/seção:** Task 1 (`odoo-relational.ts`) / SPEC §3.2.

**Problema:** O helper da Task 1 tipa `OdooM2O = [number, string] | false | null
| undefined` e `relNome` faz `Array.isArray(v) ? v[1] : null`. Mas há um caso
real no Odoo: campos `many2one` cujo registro-alvo existe mas não tem nome
exibível chegam como `[id, false]` (segundo elemento `false`, não string). O
helper devolveria `false` tipado como `string` — bug de tipo silencioso e dado
sujo no fato (`familiaNome = false`). O builder `fato-estoque-saldo` atual já tem
esse mesmo helper e o mesmo defeito, então o plano apenas propaga um bug
existente, mas a Task 1 é a oportunidade de corrigi-lo e o plano não o faz.

**Evidência:** `src/worker/fatos/fato-estoque-saldo.ts` — `relNome` idêntico.
Comportamento conhecido do XML-RPC do Odoo para `name_get` vazio.

**Correção recomendada:** `relNome` deve devolver `typeof v[1] === "string" ? v[1]
: null`. A Task 1 deve listar esse caso no TDD (`[14410, false] → nome null`).
Sem isso, o teste declarado ("`false→{null,null}`") não cobre o caso `[id,false]`.

---

## IMPORTANTES

### I1 — A barra de filtros das páginas não tem task de implementação real

**Task/seção:** SPEC §7 / §8 (coluna "Filtros") ↔ Task 27.

**Problema:** A spec lista filtros concretos por relatório (R1: produto, armazém,
família, busca; R3: período default 3 meses, armazém; R4: faixa de dias 30/60/90+;
R5: período, sentido). A Task 21 define o tipo `ReportFilter`. A Task 27 diz que
`report-view.tsx` "renderiza ... a barra de filtros". Mas **não existe task que
construa os componentes de filtro** (um seletor de produto, um seletor de
armazém, um seletor de período, um seletor de faixa de dias, um campo de busca),
nem que defina como o estado do filtro se propaga até a query de leitura (Task
23: as queries "leem e agregam o fato" — recebem parâmetros de filtro? a
assinatura não está declarada). "Renderiza a barra de filtros" é um placeholder
que esconde 5–6 componentes + o fluxo de estado filtro→query.

**Correção recomendada:** Criar tasks específicas: (a) componentes de filtro
(provavelmente em `src/components/charts/` ou `src/components/reports/`), (b)
contrato das funções de `report-data.ts` recebendo um objeto de filtros tipado,
(c) o mecanismo (URL searchParams? estado client + re-fetch via server action?).
A spec não fixa isso — pode merecer uma mini-decisão. A review #2 decompõe, mas
a #1 registra: **a barra de filtros é um épico disfarçado de meia-frase.**

### I2 — Estado `preparando` vs. `vazio` na Task 23: a query precisa de dois sinais distintos e o plano não define a assinatura de retorno

**Task/seção:** Task 23 / SPEC §3.4.

**Problema:** A spec §3.4 define 3 estados: `ultimoBuildAt` nulo → "preparando";
preenchido + sem linhas no filtro → "vazio"; exceção → "erro". A Task 23 diz que
a query devolve `{ estado: "ok"|"preparando"|"vazio"|"erro", dados }`. Mas o
`ultimoBuildAt` é coluna **de cada linha do fato** (a Task 3 e 10 gravam
`ultimoBuildAt` "em todas as linhas"). Se o fato está vazio (zero linhas), **não
há linha de onde ler `ultimoBuildAt`** — então como a query distingue "builder
nunca rodou" (preparando) de "builder rodou e não produziu linhas" (vazio)? Não
dá, com `ultimoBuildAt` só nas linhas. Esse é um furo de modelagem herdado da
spec, mas o plano deveria pegá-lo: precisa de uma fonte de `ultimoBuildAt`
independente da existência de linhas (ex.: `SyncState`, ou uma tabela de
metadados de build, ou usar `lastSnapshotAt` do modelo-fonte como proxy de
"builder teve chance de rodar").

**Correção recomendada:** Resolver na review/PLAN v2: definir de onde vem o sinal
"builder nunca rodou" quando o fato está vazio. Opção pragmática: se o
`SyncState` do `modeloFonte` nunca teve `lastSnapshotAt`, é "preparando"; se teve
mas o fato está vazio, é "vazio". A Task 23 precisa declarar a assinatura exata
(`tipo dos dados` por relatório) — hoje `{ estado, dados }` com `dados`
indefinido é placeholder.

### I3 — Ordem: Bloco 7 (Task 29) depende do enum `ReportDomain` e do tipo `ReportDomainId`, mas também do componente da etapa "Acesso" que usa `grantableDomains` — dependência cruzada não anotada

**Task/seção:** Bloco 7 (Tasks 29–31) vs. Bloco 2.

**Problema:** A Task 29 (`createUser` aceita `domains: ReportDomainId[]`) depende
de: enum `ReportDomain` (Task 2), tipo `ReportDomainId` (Task 5). A Task 30
(`access-step.tsx`) depende de `grantableDomains` (Task 5) e do enum. A Task 31
depende de `updateUserDomains` (Task 6). Tudo isso é Bloco 2. O plano coloca o
Bloco 7 por último — correto em topologia — mas **nenhuma task do Bloco 7 anota
essas dependências**, e a nota de granularidade do topo só fala de "verificar a
ordem". Mais grave: a Task 31 menciona que `create` "envia domínios ao
`createUser`" e `update` "chama `updateUserDomains`" — mas o `user-form-dialog`
atual **separa** create e update no mesmo `handleSubmit`; o modo `update` hoje
chama `updateUser`, que **não** mexe em domínios. Logo a etapa "Acesso" no modo
edit precisa de DUAS chamadas (uma a `updateUser` para identidade, outra a
`updateUserDomains`) ou de uma orquestração — a Task 31 não diz qual, é
placeholder ("`update` chama `updateUserDomains`" não explica a coordenação com
o `updateUser` de identidade).

**Correção recomendada:** Anotar dependências explícitas em cada task do Bloco 7.
Definir na Task 31 a sequência exata do submit no modo edit: chamar `updateUser`
e `updateUserDomains` — em série, e o que fazer se a segunda falhar (rollback?
toast parcial?). Considerar se `updateUser` deveria receber domínios também, para
simetria com `createUser` — mas isso é decisão, não detalhe de step.

### I4 — `stepperItems` dinâmico: a Task 31 muda `Step` para `1|2|3` mas o stepper atual e o `StepConfirm` assumem 2 etapas — quebra não enumerada

**Task/seção:** Task 31 / SPEC §4.4.

**Problema:** O `user-form-dialog.tsx` real tem `type Step = 1 | 2`, `stepperItems`
**hardcoded** com 2 itens (Identidade, Confirmação), e a navegação `goNext`
faz `setStep(2)` literal, `step < 2`, `step > 1` espalhados pelo JSX do
`DialogFooter`. A Task 31 diz "`Step` vira `1|2|3`; `stepperItems` computado pelo
role". Isso não é uma mudança de uma linha: exige reescrever (a) `goNext`/`goBack`
para navegação genérica entre N etapas, (b) toda a lógica `step < 2`/`step > 1`
do footer para `step < últimaEtapa`/`step > 1`, (c) o `StepConfirm` que hoje é
sempre a etapa 2 e passa a ser a 2 ou a 3 conforme o role, (d) renderizar a etapa
"Acesso" entre Identidade e Confirmação. A Task 31 é uma única task escondendo ~5
unidades de trabalho num componente de 1035 linhas. Além disso a regra N10
(trocar para role privilegiado zera domínios e *remove* a etapa — e se o usuário
está **na** etapa 3 quando troca o role?) precisa de tratamento de estado que a
task não menciona.

**Correção recomendada:** Quebrar a Task 31 (ver §Granularidade abaixo). Anotar
o caso de borda: estar na etapa "Acesso" e mudar para super_admin/admin — o
`step` precisa recuar para a etapa válida. A review #2 detalha; a #1 marca o
risco de regressão na navegação do stepper.

### I5 — Backfill no `seed.ts` ≠ backfill na migration; a spec pede backfill na **migration**

**Task/seção:** Task 4 / SPEC §4.3 ("a **migration** concede o domínio estoque").

**Problema:** A spec diz, em §4.3 e na decisão 6, que **a migration** faz o
backfill. A Task 4 implementa o backfill no `prisma/seed.ts` (`upsert` de
`UserDomainAccess`). São coisas diferentes: o `seed.ts` só roda quando alguém
executa `prisma db seed` (ambiente dev, ou um passo manual de deploy); uma
migration roda automaticamente em **todo** ambiente no `migrate deploy`. Se
produção já tem `manager`/`viewer` cadastrados (a F1 criou usuários), e o deploy
da F3 roda só `migrate deploy` sem `db seed`, **esses usuários ficam sem o
domínio estoque** — exatamente o que o backfill deveria evitar. O plano divergiu
da spec num ponto com consequência operacional real.

**Evidência:** `prisma/seed.ts` é o arquivo de seed padrão (roda só sob `db
seed`). A Task 4 não cria um SQL de backfill dentro da pasta de migration.

**Correção recomendada:** O backfill deve ser um `INSERT ... SELECT` dentro do
arquivo SQL da migration F3 (ou uma migration de dados separada), não no
`seed.ts`. Ex.: após criar `user_domain_access`, `INSERT INTO user_domain_access
(id, user_id, domain, created_at) SELECT gen_random_uuid(), id, 'estoque', now()
FROM users WHERE platform_role IN ('manager','viewer')`. Manter (ou não) o
`seed.ts` para ambiente dev é secundário — o que a spec exige é que o backfill
viaje com a migration. Corrigir a Task 4.

### I6 — Cobertura: a regra "novo usuário nasce com aviso na confirmação" (§4.4) não tem task

**Task/seção:** SPEC §4.4 ("Default de usuário novo: zero domínios, com aviso na
etapa de confirmação").

**Problema:** A spec pede que a etapa de **confirmação** mostre o aviso "este
usuário ainda não verá nenhum relatório até receber acesso a um domínio" quando
nenhum domínio foi selecionado. A Task 30 cobre o aviso **dentro da etapa
Acesso** ("aviso quando nenhum selecionado"). Mas o `StepConfirm` (a etapa de
confirmação) **não** é tocado por task nenhuma para exibir esse aviso nem para
listar os domínios concedidos. A Task 31 não menciona o `StepConfirm`. Lacuna de
cobertura.

**Correção recomendada:** Acrescentar à Task 31 (ou criar sub-task) a atualização
do `StepConfirm` para: (a) listar os domínios selecionados (papel manager/viewer),
(b) exibir o aviso de "zero domínios" quando aplicável.

### I7 — RBAC do nav: o item "Relatórios" sem `visibleTo` aparece para todos, inclusive `viewer` sem domínio

**Task/seção:** Task 25 / SPEC §7 (item "sem `visibleTo`").

**Problema:** A spec manda o item "Relatórios" entrar **sem `visibleTo`** — e isso
é coerente, porque a visibilidade real é por domínio, não por role. Mas o efeito
é que um `viewer` sem nenhum domínio **vê o item "Relatórios" no menu**, clica, e
cai na landing com estado vazio ("você não tem domínio"). O plano aceita isso
implicitamente (a landing tem estado vazio, Task 26). Não é bug — é uma decisão de
UX — mas o plano **não a registra como decisão consciente** e a review #2 poderia
"corrigir" indevidamente escondendo o item. Vale também checar: `filterNav` em
`nav.ts` não tem como filtrar por domínio (ele só conhece `platformRole`/`isOwner`).
Se algum dia se quiser esconder o item de quem não tem domínio, `filterNav`
precisaria receber os domínios — fora do escopo, mas o plano deveria dizer
"item sempre visível, enforcement é na página/landing — decisão consciente".

**Correção recomendada:** Adicionar uma frase na Task 25 confirmando que a
visibilidade incondicional do item é intencional (enforcement nas camadas 2 e 3),
para a review #2 não reverter.

### I8 — Task 10: o `Map` produto→família lê `raw_sped_produto`, mas o plano não confirma que esse modelo é sincronizado nem em que ciclo

**Task/seção:** Task 10 / SPEC §5.1.

**Problema:** A Task 10 faz o builder de saldo carregar família/marca de
`raw_sped_produto`. `sped.produto` existe no catálogo como `incremental` (visto no
`model-catalog.ts`). O builder de saldo roda no `processSnapshotCycle`. Logo o
`raw_sped_produto` é populado por um ciclo **diferente** (incremental) — na
primeira execução pós-deploy pode estar vazio ou desatualizado quando o builder
de saldo rodar, e **todas** as linhas de saldo sairão com família/marca `null`. A
spec §5.1 prevê null para produto ausente do map (~32 linhas), mas não prevê o
cenário "map inteiro vazio porque o incremental ainda não rodou". O plano não
menciona isso.

**Correção recomendada:** Anotar na Task 10 a dependência de `raw_sped_produto`
estar populado, e aceitar explicitamente que no primeiro ciclo família/marca
podem vir null até o incremental rodar (degrada para "Não classificado" nos
relatórios — tolerável, mas precisa estar escrito). Não é crítico porque
auto-corrige no ciclo seguinte.

### I9 — `getCurrentUser` devolve `AuthUser`, que **não** tem `id` de tipo garantido para `canEditUser`? — verificar; e `AuthUser` não traz domínios

**Task/seção:** Tasks 6, 7, 23, 26, 27.

**Problema:** `AuthUser` (`auth-helpers.ts`) tem `id`, `platformRole`, `isOwner` —
ok, suficiente para `canEditUser` (que pede `MinimalTargetUser` para o alvo e
`AuthUser` para o ator). Mas várias tasks (7 `requireDomainAccess`, 23 revalidação,
26 landing) precisam dos **domínios do usuário atual**, e `AuthUser` **não os
carrega**. Cada uma dessas tasks terá que fazer uma query a `UserDomainAccess`
toda vez. O plano não centraliza isso (ex.: um `getMyDomains()` cacheado — a Task
6 cria `getMyDomains()`, bom, mas as Tasks 7/23/26 não dizem que o usam). Risco de
N queries dispersas e inconsistência. Menor que crítico, mas é premissa de
arquitetura não amarrada.

**Correção recomendada:** As Tasks 7, 23 e 26 devem declarar explicitamente que
obtêm os domínios via `getMyDomains()` (Task 6). Considerar se vale anexar os
domínios ao `AuthUser`/sessão (decisão de performance — fora do escopo desta
review, mas registrar).

---

## MENORES

### M1 — Task 2: relação inversa `User.domainAccess` — `onDelete: Cascade` está no lado de `UserDomainAccess`, ok; mas falta `grantedBy` como relação

A Task 2 define `grantedById String?` como coluna solta, sem relação Prisma para
`User`. Funciona (é só uma coluna), mas perde integridade referencial e o
`include`. Decidir conscientemente: coluna crua (aceitável, evita um segundo
`@relation` no `User`) ou relação nomeada. Registrar a escolha.

### M2 — Task 3: `FatoEstoqueMovimento` usa `odooId Int @id` — o `odooId` de um modelo snapshot **rotaciona** entre ciclos

O comentário do próprio `processReconcileCycle` diz que "ids no Odoo rotacionam"
em modelos snapshot. Se `estoque.extrato` vira snapshot e o fato usa `odooId` como
PK, isso é ok **porque o builder faz `deleteMany`+`createMany` (rebuild completo)**
— a PK só precisa ser única dentro de um snapshot. Confirmar que é o caso (a Task
11 diz "transação deleteMany + createMany", então ok). Apenas registrar que a PK
não tem significado estável entre ciclos — irrelevante para leitura, mas bom
documentar para a F4/MCP não assumir estabilidade.

### M3 — Task 14: "Verificar `npx next build` ainda passa" após instalar Recharts é caro como verificação de uma task de `npm install`

`npm install recharts` não justifica um build completo. Verificação suficiente:
`npm ls recharts` + `npx tsc --noEmit`. O build fica para a verificação de bloco.
Menor — ajuste de eficiência.

### M4 — Task 22: o catálogo declara `icone` — de que tipo? `LucideIcon`? string de nome?

A Task 21 lista `icone` no `ReportEntry` sem tipo. `nav.ts` usa `LucideIcon`
(componente). O catálogo é um módulo `.ts` (não JSON), então pode carregar o
componente direto. Confirmar na Task 21 que `icone: LucideIcon` — senão a review
#2 vai ter que adivinhar. Placeholder de tipo.

### M5 — Task 4: a verificação `npx prisma db seed` falha se o seed exige `DATABASE_URL` e o ambiente do agente não o tiver

`seed.ts` faz `throw` se `DATABASE_URL` ausente. A Task 4 assume "DB dev no ar".
Apenas garantir que a pré-condição esteja anotada na task (DB dev rodando + env
carregado), senão a verificação falha por motivo alheio ao código.

### M6 — Stepper dinâmico: o tipo do `Stepper` (`items: Array<{ n: Step; ... }>`) tem `n: Step` que vira `1|2|3` — checar o ícone da etapa "Acesso"

Detalhe de implementação para a Task 31: a etapa "Acesso" precisa de um ícone
lucide (a spec não nomeia um). Sugerir `ShieldCheck` ou `KeyRound`. Menor, mas a
review #2 deve fixar para não deixar TODO.

---

## Granularidade — tasks que escondem mais de uma unidade (para a review #2 decompor)

O plano já declara estar em nível de bloco. Esta review lista **exatamente** o que
a review #2 deve quebrar:

- **Task 3** — esconde 3 unidades: enriquecer `FatoEstoqueSaldo`, criar
  `FatoEstoqueMovimento`, criar `FatoProdutoParado`. Uma task por modelo.
- **Tasks 16–20** — o próprio plano admite; cada template é uma task com TDD e
  código completo. O `DataTable` genérico (ordenável/pesquisável/`aria-sort`) é
  por si só várias unidades (render, ordenação, busca, formatação de negativos).
- **Task 22** — catálogo dos 6 relatórios: cada `ReportEntry` (R1–R6) é uma
  unidade declarativa; R4 e R6 têm 2 seções. São 6+ unidades + as funções
  `reportsForUser`/`getReport`.
- **Task 23** — uma função de leitura por relatório (R1–R6) = 6 unidades, cada
  uma com agregação própria. Mais a infra de estado (§3.4) e revalidação de RBAC.
- **Task 26** — `page.tsx` (server) + `relatorios-grid.tsx` (client) + estado
  vazio + agrupamento por domínio = 3–4 unidades.
- **Task 27** — `page.tsx` + `report-view.tsx` + barra de filtros (épico, ver
  I1) + indicador de freshness (ver C4) + render sequencial de seções. A task
  mais subdimensionada do plano depois da 31.
- **Task 31** — integração do stepper dinâmico (ver I4): mudança de `Step`,
  navegação genérica, footer, `StepConfirm`, render da etapa Acesso, caso N10 de
  troca de role. 5–6 unidades num arquivo de 1035 linhas.
- **Task 6** — `getUserDomains` + `getMyDomains` + `updateUserDomains` (com diff,
  audit, Zod) = 3+ unidades.
- **Task 10** — carregar o Map de família/marca, mapear vrSaldo, gravar
  `ultimoBuildAt`, tratar nulos = 3–4 unidades de teste.

## Placeholders proibidos identificados

- **Task 27** — "renderiza ... a barra de filtros e o indicador 'atualizado em'":
  o "como" não existe (I1, C4).
- **Task 23** — `{ estado, dados }` com `dados` sem tipo: contrato incompleto (I2).
- **Task 9** — "ajustar a contagem esperada no teste": refere-se a teste
  inexistente (C2).
- **Task 21** — `icone` sem tipo declarado (M4).
- **Task 31** — "`update` chama `updateUserDomains`" sem dizer como coordena com
  `updateUser` (I3).
- **SPEC/Task 29** — "$transaction envolvendo o AuditLog": tecnicamente impossível
  com o `logAudit` atual (C1) — não é placeholder de redação, é premissa falsa.

---

## Resumo

| Severidade | Contagem |
|---|---|
| Crítico | 5 |
| Importante | 9 |
| Menor | 6 |

**Críticos:**
- C1 — `logAudit` é fora do banco transacional; a Task 29 promete um `$transaction` que não pode incluí-lo
- C2 — Task 9 assume um teste de contagem snapshot/incremental que não existe
- C3 — Ordem dos builders frente ao sync de `estoque.extrato` (dependência Task 9→13) não anotada; estado de primeiro ciclo não tratado
- C4 — Indicador de freshness (§7) não tem task que o implemente; ninguém lê `SyncState`
- C5 — `relNome` devolve `false` tipado como `string` no caso `[id, false]`

**Importantes:**
- I1 — A barra de filtros das páginas não tem task de implementação real
- I2 — Estado `preparando` vs. `vazio` na Task 23: impossível distinguir com `ultimoBuildAt` só nas linhas quando o fato está vazio
- I3 — Bloco 7: dependências cruzadas com o Bloco 2 não anotadas; coordenação `updateUser`+`updateUserDomains` no modo edit indefinida
- I4 — `stepperItems` dinâmico: Task 31 esconde a reescrita da navegação do stepper num arquivo de 1035 linhas
- I5 — Backfill no `seed.ts` diverge da spec, que pede backfill na migration (consequência: prod fica sem backfill)
- I6 — A regra "aviso na etapa de confirmação para usuário sem domínio" (§4.4) não tem task
- I7 — Item de nav "Relatórios" visível para `viewer` sem domínio: decisão consciente não registrada
- I8 — Task 10 lê `raw_sped_produto` (ciclo incremental) de um builder snapshot; primeiro ciclo pode sair tudo null
- I9 — `AuthUser` não carrega domínios; Tasks 7/23/26 não declaram usar `getMyDomains()`

**Conclusão:** o plano cobre a estrutura macro da spec e nomeia arquivos/contratos,
mas tem **2 premissas falsas sobre o código real** (C1, C2), **1 requisito da spec
sem task** (C4 — freshness) e **1 divergência operacionalmente perigosa** (I5 —
backfill). Não deve ir para execução; deve voltar para PLAN v2 corrigindo os
Críticos e os Importantes, e seguir para a review #2 para a decomposição fina.
