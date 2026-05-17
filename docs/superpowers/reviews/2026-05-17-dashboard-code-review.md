# F3 — Dashboard de Relatórios — Code Review

**Data:** 2026-05-17
**Branch:** `feat/ingestao`
**Profundidade:** standard
**Escopo:** arquivos-fonte da F3 (RBAC por domínio, builders de fato, queries de leitura, shell do dashboard, etapa "Acesso").

---

## Resumo

| Severidade | Contagem |
|---|---|
| Crítico | 3 |
| Importante | 7 |
| Info | 5 |

A arquitetura de 4 camadas está coerente e o RBAC em 3 camadas funciona no caminho feliz. Há, porém, **um furo de concessão de domínio** (manager pode escalar privilégio de domínio via `updateUser`/`createUser` quando o role muda no mesmo fluxo) e **dois bugs de correção de dado** (estado "preparando" vs. erro mascarado; freshness divergente do fato). Recomenda-se corrigir os 3 Críticos antes do merge.

---

## Críticos

### CR-01 — `estadoDoFato` lê a tabela errada: "preparando" nunca dispara e o estado de erro fica mascarado

**Arquivo:** `src/lib/actions/report-data.ts:28-31`

`estadoDoFato` consulta `prisma.fatoBuildState.findUnique({ where: { fato } })` e considera "preparando" quando a linha não existe. Mas o builder (`markFatoBuilt`, `fato-build-state.ts:10`) faz `upsert` em `FatoBuildState` — então a linha **passa a existir após o primeiro build** e nunca antes. Até aqui consistente.

O problema real: o estado **"preparando"** da spec §3.4 significa "o builder nunca rodou". Hoje, se o builder nunca rodou, `fatoEstoqueSaldo` está vazia *e* `fatoBuildState` não tem linha → retorna `preparando`. OK. Mas se o builder rodou e **falhou no meio** (transação revertida mas `markFatoBuilt` é chamado *fora* da transação, linha 99 de `fato-estoque-saldo.ts`), a linha de build é gravada mesmo com o fato possivelmente inconsistente. Pior: `markFatoBuilt` roda **depois** da `$transaction`; se a transação falhar, `markFatoBuilt` não roda — bom — mas se `markFatoBuilt` falhar isoladamente, o fato está populado e o estado fica "preparando" para sempre.

**Impacto:** acoplamento frágil entre `FatoBuildState` e a consistência real do fato; um build parcial pode ser servido como "ok".

**Recomendação:** mover `markFatoBuilt` para **dentro** da `$transaction` de cada builder (`fato-estoque-saldo.ts`, `fato-estoque-movimento.ts`, `fato-produto-parado.ts`), de modo que estado de build e dados commitem atomicamente.

### CR-02 — Furo de RBAC: `manager` pode conceder domínio que não possui ao trocar o role no modal

**Arquivos:** `src/lib/actions/users.ts:113-128`, `src/components/users/user-form-dialog.tsx:320-336`, `src/lib/actions/domain-access.ts:68-81`

A regra da spec §4.1 é: `manager` só concede domínios que ele próprio possui. As três actions checam `grantableDomains`, o que é correto. **Porém o cliente** (`updateUserDomains`) é chamado em `handleSubmit` (linha 327: `if (editavelDominio || true)`) **antes** de `updateUser`. Se um `manager` editar um usuário e o submit falhar parcialmente, `updateUserDomains` já gravou — comportamento de erro parcial documentado, aceitável.

O furo de verdade: `updateUserDomains` valida `grantable` apenas sobre `touched = added ∪ removed`. Se o usuário-alvo **já tem** o domínio `financeiro` (concedido por um admin) e um `manager` que só possui `estoque` edita esse usuário, ao salvar o modal envia `form.domains` carregado de `userDomains` (linha 192) — `financeiro` está em `current` e em `domains`, logo não entra em `touched`, e a validação passa. Isso é **correto** (manager não tocou em `financeiro`). Mas se o manager **desmarca e remarca** `financeiro` na UI, `removed` e `added` ficam vazios no diff final — também passa. Não há escalada aqui.

O furo concreto está em `createUser`: a checagem `grantableDomains` em `users.ts:119-128` só roda **`if (domains.length > 0)`** e usa `me.platformRole`. Correto. Mas note `users.ts:113-116`: `domains` é zerado para roles privilegiados. Um `manager` **não pode criar** admin/super_admin (`canCreateRole`), então não há escalada por essa via. **Reclassificar:** após releitura, a concessão está protegida no servidor nas três actions. **Mantenho como Crítico apenas o item de `AccessStep`/`grantable` no cliente** — ver CR-02b abaixo.

### CR-02b — `AccessStep` desabilita o checkbox mas o estado pode conter domínios não-concedíveis pré-carregados; a UI permite mantê-los mas não há reforço de que `updateUserDomains` os preserve corretamente

**Arquivo:** `src/components/users/access-step.tsx:28-47`, `domain-access.ts:73-81`

Em modo `edit`, `form.domains` é pré-carregado com `userDomains` (todos os domínios atuais do alvo). `AccessStep` desabilita o checkbox de um domínio fora de `grantable`, **mas mantém `checked` se já selecionado** — bom para não-revogar. Porém um checkbox `disabled` ainda permite que o domínio permaneça em `selected`. Ao salvar, `updateUserDomains` recebe esse domínio em `domains`; como está em `current`, não entra em `touched` → preservado. Correto no caminho normal.

**O risco:** se o alvo perdeu o domínio entre a abertura do modal e o submit (concorrência), `current` no servidor não contém mais `financeiro`, mas `domains` enviado sim → `financeiro` entra em `added` → `manager` sem `financeiro` recebe erro "Sem permissão". Falha barulhenta, não escalada. **Aceitável**, mas a mensagem confunde o manager (ele não selecionou nada novo). Recomenda-se: no servidor, ao detectar esse caso, ignorar adds que o alvo perdeu por concorrência ou exibir mensagem específica.

**Recomendação geral CR-02:** a cadeia de concessão está protegida no servidor. Rebaixar a preocupação para **Importante** e tratar a UX de concorrência. **Crítico real remanescente:** CR-03 abaixo.

### CR-03 — `requireDomainAccess` (camada 2) e `guardEstoque` (camada 3) divergem do catálogo: relatório de domínio não-estoque seria liberado sem checagem real

**Arquivos:** `src/lib/reports/guard.ts:9-16`, `src/lib/actions/report-data.ts:34-39`

`requireDomainAccess` recebe `report.dominio` do catálogo e checa contra `getMyDomains()` — correto e genérico. Mas **`guardEstoque` (camada 3) é hardcoded para `"estoque"`**. Hoje os 6 relatórios são todos de `estoque`, então funciona. Quando a F4/lote 2 acrescentar um relatório `financeiro`, a query de leitura dele precisará de um guard próprio; se alguém copiar uma query existente e esquecer de trocar o guard, **a camada 3 validará o domínio errado** — um usuário com `estoque` mas sem `financeiro` passaria. A camada 2 (`requireDomainAccess`) ainda barraria via página, mas a query de leitura é a defesa-em-profundidade que a spec §4.2 exige e ela ficaria furada.

Além disso, `report-data.ts` chama `getReport(id)!` com **non-null assertion** — se um id de catálogo for renomeado e a query não, `entry` é `undefined` e `reportFreshness(prisma, undefined)` quebra dentro do `try`, retornando `estado: "erro"` silenciosamente.

**Recomendação:** parametrizar o guard — `guardDominio(dominio: ReportDomainId)` derivado de `entry.dominio` —, e cada query passar `getReport(id)?.dominio`. Eliminar o `!` e tratar `entry` ausente com erro explícito.

---

## Importantes

### IM-01 — `mapMovimentoRow`: `quantidade > 0 ? "entrada" : "saida"` classifica `quantidade = 0` como "saida"

**Arquivo:** `src/worker/fatos/fato-estoque-movimento.ts:43`

`sentido` é derivado antes do filtro `temEfeito`. Linhas com `quantidade = 0` recebem `sentido: "saida"` e só depois são descartadas por `temEfeito` (linha 60). Funciona porque o filtro vem depois — mas é frágil: qualquer reordenação ou reuso de `mapMovimentoRow` fora de `rebuild` produz classificação errada. Tornar explícito: `sentido = quantidade > 0 ? "entrada" : quantidade < 0 ? "saida" : "neutro"`, ou filtrar antes de mapear.

### IM-02 — `new Date(String(raw.data))` sem validação; data inválida produz `mes = "NaN-NaN"`

**Arquivo:** `src/worker/fatos/fato-estoque-movimento.ts:30-33`

Se `raw.data` for `false`, `null` ou string malformada, `new Date(...)` retorna `Invalid Date`; `getUTCFullYear()`/`getUTCMonth()` retornam `NaN` e `mes` vira `"NaN-NaN"`. Essa linha entra no fato e nas agregações de R3/R5 como um bucket fantasma. Validar `Number.isNaN(data.getTime())` e descartar (ou logar) a linha.

### IM-03 — Freshness pode mostrar dado mais novo do que o fato realmente reflete

**Arquivo:** `src/lib/reports/freshness.ts:30`

`reportFreshness` retorna o **menor** entre `lastSnapshotAt` e `ultimoBuildAt` — correto conforme spec §11. Mas o `ultimoBuildAt` é gravado por `markFatoBuilt` com `new Date()` no momento do build, **independente de o snapshot-fonte ter mudado**. Se o snapshot falhar mas o builder rodar sobre dados antigos, `ultimoBuildAt` avança e o "menor" passa a ser `lastSnapshotAt` antigo — ok. Porém o caso inverso (CR-01) continua: build parcial marca `ultimoBuildAt` recente. Depende da correção de CR-01.

### IM-04 — `getReport(id)!` e `QUERIES[id]` sem fallback em `[id]/page.tsx`

**Arquivo:** `src/app/(protected)/relatorios/[id]/page.tsx:48`, `report-data.ts` (todas as queries)

`const query = QUERIES[id]` pode ser `undefined` se o catálogo tiver um id sem query mapeada. A página já fez `notFound()` se `!report`, mas não verifica `QUERIES[id]`. Um id presente no catálogo e ausente em `QUERIES` causa `query is not a function` em runtime (linha 54). Adicionar `if (!query) notFound()`.

### IM-05 — `report-view.tsx`: `renderSecao` discrimina seções multi-fato por chave de objeto, não por `secao.id`

**Arquivo:** `src/app/(protected)/relatorios/[id]/report-view.tsx:51-80`

Para R6, ambas as seções (`familia` PieChart, `marca` BarChart) recebem o **mesmo** `ConcentracaoData`. `renderSecao` decide qual fatia usar inspecionando se o objeto tem `.marca` ou `.familia` (`d?.marca ?? []`, `d?.familia ?? []`). Funciona por coincidência de nomes de chave, mas é frágil: se uma seção `BarChart` futura receber dados que também tenham `.marca`, pega o ramo errado. Discriminar explicitamente por `secao.id` ou por um campo declarado no `config`.

### IM-06 — `createUser`: senha temporária trafega no `ActionResult` e fica em estado React do cliente

**Arquivo:** `src/lib/actions/users.ts:166-168`, `user-form-dialog.tsx:160,307`

`tempPassword` é retornada em texto puro e guardada em `useState` (`createdPassword`). É o comportamento desejado (mostrar a senha uma vez), mas a senha fica no heap do cliente até o modal fechar e pode aparecer em React DevTools / dumps de memória. Mitigação: limpar `createdPassword` no `onOpenChange`/`close` (hoje só limpa no `useEffect` de reabertura) e considerar marcar a action como não-cacheável. Baixo risco, mas vale registrar.

### IM-07 — `DataTable`: `key={i}` no `map` de linhas causa estado de ordenação/render inconsistente

**Arquivo:** `src/components/charts/data-table.tsx:132`

As linhas usam o índice do array ordenado/filtrado como `key`. Ao ordenar ou pesquisar, o React reassocia DOM por posição — não é bug funcional grave numa tabela read-only, mas quebra animações e qualquer estado por linha futuro. Usar uma chave estável (`produtoId`/`odooId` quando presente).

---

## Info

### IN-01 — `if (editavelDominio || true)` é dead code

**Arquivo:** `src/components/users/user-form-dialog.tsx:327` — a condição é sempre verdadeira. O `editavelDominio` calculado na linha 325 só serve ao operador ternário interno. Simplificar para sempre chamar `updateUserDomains(user.id, editavelDominio ? form.domains : [])` sem o `if`.

### IN-02 — `relId` não normaliza `[id, false]` quando o id é válido mas o tipo de `v[0]` não é número

**Arquivo:** `src/worker/fatos/odoo-relational.ts:7-9` — `relId` devolve `v[0]` sem checar `typeof === "number"`. Odoo sempre manda número, mas `relNome` checa o tipo de `v[1]` e `relId` não — inconsistência. Adicionar guard simétrico.

### IN-03 — Texto fixo "em 2 etapas" no diálogo, mesmo quando há 3

**Arquivo:** `src/components/users/user-form-dialog.tsx:398-399` — a `DialogDescription` diz "em 2 etapas" sempre; para `manager`/`viewer` o stepper tem 3. Derivar do `stepperItems.length`.

### IN-04 — `agruparOutros` mantém top-5 + "Outros" (6 fatias) mas `MAX_FATIAS = 6`

**Arquivo:** `src/components/charts/pie-chart.tsx:36-39` — `slice(0, MAX_FATIAS - 1)` = top-5; com "Outros" são 6. Coerente com a spec (≤6). Apenas confirmar que a intenção é exibir 6 e não 5+Outros=6; o nome `MAX_FATIAS` sugere teto, está ok. Sem ação — documentar o cálculo num comentário ajudaria.

### IN-05 — `processSnapshotCycle` reconstrói os 3 fatos sequencialmente sem isolar falha por fato

**Arquivo:** `src/worker/sync/processors.ts:97-125` — cada rebuild tem seu próprio `try/catch` (bom), mas comentário linha 97 ainda diz "Fato provisório" — resíduo da F2; a spec §5.1 pediu remover o "PROVISÓRIO". Atualizar o comentário.

---

## Avaliação geral

A F3 está **bem estruturada** — o padrão declarativo de catálogo + seções + templates cumpre a spec e prepara a F6, e o RBAC por domínio está, no fim das contas, **protegido no servidor nas três camadas de escrita**. As 80 tasks renderam código consistente.

Os bloqueios para merge são **3**: (CR-01) `markFatoBuilt` fora da transação do builder — risco de servir build parcial como "ok"; (CR-03) `guardEstoque` hardcoded e `getReport(id)!` sem fallback — defesa-em-profundidade da camada 3 fica frágil para domínios futuros e quebra silenciosa em erro de catálogo; e o conjunto IM-02/IM-04 (datas inválidas viram buckets fantasma; id de catálogo sem query derruba a página). O furo de concessão de domínio investigado em CR-02 **não se confirmou como escalada** — a validação `grantableDomains` no servidor cobre `createUser`, `updateUser` e `updateUserDomains`; resta apenas a UX de concorrência (IM rebaixado). Recomendo corrigir CR-01 e CR-03, tratar IM-02 e IM-04, e seguir para a etapa [10] `/ultrareview`.
