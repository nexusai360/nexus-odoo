# Review Profunda #2 — PLAN v2 da F3 (Dashboard de Relatórios)

> Foco desta review (`CLAUDE.md` §6 [7]): **granularidade, integração, testabilidade**.
> Última review antes da execução. Documento revisado:
> `docs/superpowers/plans/2026-05-16-dashboard-relatorios.md` (PLAN v2).
> Spec: `docs/superpowers/specs/2026-05-16-dashboard-relatorios-design.md` (v3).
> Review #1: `docs/superpowers/reviews/2026-05-16-dashboard-plan-review-1.md`.

Auditoria adversarial. Esta review entrega: (a) verificação item a item da Review
#1; (b) achados novos por severidade; (c) a **Decomposição** — insumo direto do
PLAN v3.

---

## (a) Verificação da Review #1

Cada Crítico/Importante confrontado com o texto da v2 **e** com o código real.

### Críticos

| Item | Status | Evidência |
|---|---|---|
| **C1** — `logAudit` fora da transação | ✅ **Resolvido** | A v2 (linhas 20-25, Task 34) é explícita: `$transaction` cobre só `user.create` + `userDomainAccess.createMany`; `logAudit` permanece pós-commit, fire-and-forget. Confirmado contra `src/lib/audit.ts` — `logAudit` usa `pgPool.query`, sem parâmetro de tx. A v2 corrige a spec neste ponto e documenta a divergência. |
| **C2** — teste de contagem inexistente | ✅ **Resolvido** | Task 10 (linha 194): verificação = `tsc` + `jest src/worker/catalog`, sem menção a "ajustar contagem". Correto. |
| **C3** — ordem builders × sync; 1º ciclo | ✅ **Resolvido** | Task 13 anota "Depende da Task 10"; Task 15 anota dependência do snapshot no mesmo loop e o estado "preparando" no 1º ciclo. Coerente com `processSnapshotCycle` real (builders após o `for`). |
| **C4** — freshness sem task | ✅ **Resolvido** | Task 24 cria `freshness.ts`; lê `SyncState.lastSnapshotAt` + `FatoBuildState.ultimoBuildAt`, devolve o menor; regra multi-fato resolvida (menor de todos). Task 32 só exibe. `SyncState.lastSnapshotAt` confirmado no schema (linha 1084). |
| **C5** — `relNome` com `[id, false]` | ✅ **Resolvido** | Task 1 tipa `OdooM2O = [number, string \| false] \| false \| null \| undefined` e `relNome` faz `typeof v[1] === "string" ? v[1] : null`; TDD inclui `[14410, false] → null`. |

### Importantes

| Item | Status | Evidência / ressalva |
|---|---|---|
| **I1** — barra de filtros sem task | ✅ **Resolvido** | Tasks 28 (controles), 29 (barra declarativa), com fluxo de estado via `searchParams`. |
| **I2** — `preparando` vs `vazio` indistinguíveis | ✅ **Resolvido** | `FatoBuildState` (tabela, 1 linha por fato) criada na Task 3; Task 26 lê ausência da linha → "preparando", presente sem linhas no filtro → "vazio". Modelagem correta. |
| **I3** — dependências cruzadas Bloco 7 ↔ Bloco 2; coordenação edit | ⚠️ **Parcial — achado novo N1** | Task 36(h) define a sequência `updateUser` + `updateUserDomains` em série com toast de erro parcial. Mas a v2 **não anota nas tasks do Bloco 7 as dependências de artefato** (Task 34 depende do enum/tipo da Task 2/6; Task 35 de `grantableDomains`; Task 36 de `updateUserDomains` da Task 7). A ordem topológica está correta (Bloco 7 por último), mas a Review #1 pediu anotação explícita por task — não foi feita. Ver N1. |
| **I4** — stepper dinâmico esconde reescrita | ✅ **Resolvido** (decomposição pendente) | Task 36 enumera (a)–(h) as 8 mudanças, inclui o caso N10. A v2 marca [DECOMPOR]. Resolvido enquanto requisito; a decomposição fina é desta review (seção c). |
| **I5** — backfill no `seed.ts` vs migration | ✅ **Resolvido** | Task 4: backfill via `INSERT..SELECT` editado no `migration.sql`; `seed.ts` (Task 5) só para dev. |
| **I6** — aviso na confirmação | ✅ **Resolvido** | Task 36(g): `StepConfirm` lista domínios + aviso "zero domínios". |
| **I7** — item nav visível para todos | ✅ **Resolvido** | Task 30: decisão consciente registrada — item sempre visível, sem `visibleTo`/`section`, enforcement nas camadas 2/3. |
| **I8** — `raw_sped_produto` ciclo distinto | ✅ **Resolvido** | Task 12 anota a dependência e aceita null no 1º ciclo (auto-corrige). `sped.produto` é `incremental` no catálogo — confirmado (não aparece como snapshot). |
| **I9** — `AuthUser` sem domínios; usar `getMyDomains()` | ✅ **Resolvido** | Tasks 8, 26, 31 declaram uso de `getMyDomains()`. `AuthUser` confirmado sem domínios (`auth-helpers.ts`). |

### Menores

M1 (coluna crua `grantedById`), M2 (PK `odooId` snapshot), M3 (`npm ls` em vez
de build), M4 (`icone: LucideIcon`), M5 (`DataTable` formata negativos), M6
(`ShieldCheck`): todos endereçados no texto da v2 (Tasks 2, 3, 16, 23, 18-22,
36). ✅.

**Veredito da verificação:** dos 5 Críticos + 9 Importantes, **13 plenamente
resolvidos, 1 parcial (I3)** — o parcial vira o achado novo N1 abaixo.

---

## (b) Achados novos

### Crítico

Nenhum achado de severidade crítica. A v2 corrigiu os 5 Críticos da #1 sem
introduzir novos bloqueios estruturais.

### Importante

**N1 — Dependências de artefato do Bloco 7 não anotadas; e a Task 36(h) deixa um
estado inconsistente possível no modo edit.**
Duas partes:
(i) Como a Review #1 (I3) pediu, cada task do Bloco 7 deve listar seus
pré-requisitos de artefato — não está feito. O PLAN v3 deve anotar: Task 34
depende de `ReportDomain`/`ReportDomainId` (Tasks 2, 6); Task 35 de
`grantableDomains` (Task 6) e `access-step` precisa do enum; Task 36 de
`updateUserDomains` (Task 7), `access-step` (Task 35) e `domains.ts` (Task 6).
(ii) **Risco funcional real:** Task 36(h) — no modo edit, `updateUser` roda
primeiro, `updateUserDomains` depois; se a 2ª falha, "toast de erro parcial, sem
rollback". Mas se a 1ª (`updateUser`) **muda o role** de manager→admin e a 2ª
falha, o usuário fica admin **com linhas órfãs em `UserDomainAccess`** (admin não
deveria ter linhas — §4.3). Inverso: role admin→manager e a 2ª falha → manager
**sem nenhuma linha**. O PLAN v3 deve definir a ordem segura: aplicar
`updateUserDomains` **antes** de mudar role para privilegiado, ou anotar que
`updateUserDomains` é idempotente e o próximo save reconcilia. Decidir e
escrever — não deixar para a execução.

**N2 — Contrato `ReportFilterValues` não declarado; risco de drift entre Task 26 e Task 29/32.**
A Task 26 diz "cada função recebe um objeto de filtros tipado
(`ReportFilterValues`)". A Task 29 propaga filtros via `searchParams`
(string→string). A Task 32 lê `searchParams` e "chama as queries". **Ninguém
declara onde `ReportFilterValues` é definido nem quem faz o parse
`searchParams` (`Record<string,string>`) → `ReportFilterValues` (tipado, com
`number`/datas/enums).** Sem isso, três tasks consomem um tipo fantasma. O PLAN
v3 deve: (a) definir `ReportFilterValues` em `types.ts` (Task 23); (b) criar uma
função `parseFilters(section, searchParams)` — provavelmente em
`src/lib/reports/filters.ts` — que valida via Zod e devolve `ReportFilterValues`
com defaults da seção; (c) Task 32 chama `parseFilters` e repassa a Task 26.
Sem essa peça o fluxo filtro→query está quebrado.

**N3 — `FatoEstoqueSaldo` já tem dados; a Task 3 enriquece colunas `NOT NULL`-incompatíveis.**
O schema atual (linha 1097-1111) tem `FatoEstoqueSaldo` **já populado** pela F2
(o builder roda a cada snapshot). A Task 3 adiciona `vrSaldo Decimal?`,
`familiaId Int?` etc. — todas opcionais, ok. Mas a spec §5.1 diz `vrSaldo Decimal`
(sem `?`) no texto, e a v2 Task 3 escreve `+vrSaldo Decimal?`. Há divergência
spec×plano. **A coluna precisa ser `Decimal?`** (nullable) para a migration
aplicar sem default sobre as linhas existentes — o plano está certo, a spec é que
diverge. O PLAN v3 deve fixar `vrSaldo Decimal?` e anotar que a primeira migration
deixa as linhas pré-existentes com `vrSaldo = null` até o próximo rebuild do
builder (Task 12) repopular. Mesma observação para `FatoEstoqueSaldo.quantidade`,
que já é `Decimal?` no schema — `FatoSaldoRow.quantidade` é `number` no builder
atual; ao enriquecer, manter coerência de nulabilidade.

### Menor

**N4 — `atualizadoEm` do `FatoEstoqueSaldo` vira redundante com `FatoBuildState`.**
O `FatoEstoqueSaldo` atual tem `atualizadoEm DateTime @default(now())` por linha
(escrito pelo builder). Com `FatoBuildState` assumindo o sinal de "build", a
coluna `atualizadoEm` por linha fica órfã de função. Não é bug — mas o PLAN v3
deve decidir: manter (inócua) ou remover na migration F3. Recomendado: manter
para não inflar a migration; apenas registrar que `freshness.ts` **não** a usa.

**N5 — Task 16 (`npm install recharts`) sem commit de `package-lock.json` anotado.**
A Task 16 commita `package.json`; o `package-lock.json` muda junto e precisa
entrar no mesmo commit. Trivial, mas anotar evita um commit sujo.

**N6 — Verificação `next build` repetida em Tasks 31, 32 e nos blocos.**
Tasks 31 e 32 pedem `npx next build` individualmente, e a Task 33 repete no
fechamento do bloco. `next build` é caro (~min). PLAN v3: nas tasks individuais
usar `tsc --noEmit` + `jest`; `next build` só no fechamento do Bloco 6 (Task 33).

---

## (c) Decomposição — sub-tasks bite-sized por task [DECOMPOR]

Convenção: cada sub-task = um arquivo ou uma ação, ciclo TDD (teste que falha →
implementação → verde → commit). Componentes visuais sem lógica pura testável
(charts) usam render-test com dados de fixture. As sub-tasks abaixo são o insumo
literal do PLAN v3.

### Task 3 → Schema dos fatos (4 sub-tasks)

- **3.1** `FatoBuildState` — modelo (`fato String @id`, `ultimoBuildAt DateTime`,
  `@@map("fato_build_state")`). Verif: `npx prisma format`. Commit:
  `feat(prisma): modelo FatoBuildState`.
- **3.2** `FatoEstoqueSaldo` enriquecido — `+vrSaldo Decimal?`, `+familiaId Int?`,
  `+familiaNome String?`, `+marcaId Int?`, `+marcaNome String?`; `@@index([familiaId])`,
  `@@index([marcaId])`; remover comentário `/// PROVISÓRIO`. Verif: `prisma format`.
  Commit: `feat(prisma): enriquece FatoEstoqueSaldo`.
- **3.3** `FatoEstoqueMovimento` — modelo (colunas spec §5.2: `odooId Int @id`,
  `produtoId/Nome`, `localId/Nome`, `data DateTime`, `mes String`,
  `quantidade Decimal`, `sentido String`, `localInversoId Int?`, `origem String?`;
  índices `mes`, `produtoId`, `localId`, `sentido`). Verif: `prisma format`.
  Commit: `feat(prisma): modelo FatoEstoqueMovimento`.
- **3.4** `FatoProdutoParado` — modelo (colunas spec §5.3: `saldoHojeId Int @id`,
  `produtoId/Nome`, `localId/Nome`, `saldo Decimal`, `dias Int`,
  `vrSaldo Decimal`, `unidade String?`; índices `dias`, `produtoId`). Verif:
  `prisma format`. Commit: `feat(prisma): modelo FatoProdutoParado`.

### Task 7 → server actions de concessão de domínio (4 sub-tasks)

- **7.1** `getUserDomains(userId)` — query a `UserDomainAccess` por `userId`,
  devolve `ReportDomainId[]`. TDD: usuário com 2 domínios; usuário sem nenhum →
  `[]`. Mock de Prisma. Commit: `feat(reports): getUserDomains`.
- **7.2** `getMyDomains()` — guard de auth (`getCurrentUser`), delega a
  `getUserDomains(me.id)`; `super_admin`/`admin` → todos os domínios sem query.
  TDD: admin → todos; manager → granted; sem sessão → erro. Commit:
  `feat(reports): getMyDomains`.
- **7.3** Schema Zod `UpdateUserDomainsInput` (`userId uuid`,
  `domains: ReportDomainId[]`). TDD: aceita lista válida; rejeita domínio fora do
  enum. Commit: `feat(reports): schema Zod de concessão`.
- **7.4** `updateUserDomains(userId, domains)` — guard → `canEditUser` →
  `grantableDomains` (rejeita domínio não-concedível) → diff contra
  `UserDomainAccess` atual → `createMany`/`deleteMany` do diff →
  `logAudit("user_domains_changed", {added, removed})` pós-escrita
  fire-and-forget. TDD: concede novo; revoga; manager não concede o que não tem;
  audit chamado com diff. Mock de Prisma + `logAudit`. Commit:
  `feat(reports): updateUserDomains`.

### Task 12 → enriquecer `fato-estoque-saldo` (4 sub-tasks)

- **12.1** Estender `relId`/`relNome` locais — substituir pelos helpers de
  `odoo-relational.ts` (Task 1); `Many2One` local removido. TDD: regressão dos
  campos já existentes (`produtoId`, `localNome`). Commit:
  `refactor(worker): fato-estoque-saldo usa odoo-relational`.
- **12.2** `loadProdutoClassMap(prisma)` — função que lê `raw_sped_produto`
  (`rawDeleted:false`) e devolve `Map<produtoId, {familiaId,familiaNome,marcaId,marcaNome}>`
  via `relId`/`relNome` de `familia_id`/`marca_id`. TDD: produto com família;
  produto com `familia_id:false` → null; map vazio quando raw vazio. Commit:
  `feat(worker): mapa de classificação de produto`.
- **12.3** `mapSaldoRow` enriquecido — recebe o map, adiciona `vrSaldo`
  (`Number(data.vr_saldo ?? 0)`, carrega 0), `familiaId/Nome`, `marcaId/Nome`.
  TDD: vrSaldo zero carregado; produto ausente do map → família/marca null;
  produto sem família → null. Commit: `feat(worker): mapSaldoRow enriquecido`.
- **12.4** `rebuildFatoEstoqueSaldo` chama `loadProdutoClassMap` e
  `markFatoBuilt(prisma,"fato_estoque_saldo")` ao fim. TDD: `markFatoBuilt`
  chamado uma vez; linhas gravadas com colunas novas. Commit:
  `feat(worker): rebuild de fato_estoque_saldo enriquecido`.

### Task 13 → builder `fato-estoque-movimento` (4 sub-tasks)

- **13.1** `mapMovimentoRow(raw)` — extrai campos §5.2; deriva `sentido` por
  sinal de `quantidade`; deriva `mes` (`YYYY-MM` de `data`). TDD: sentido
  entrada/saída; `mes` formatado; `localInversoId`/`origem` crus. Commit:
  `feat(worker): mapMovimentoRow`.
- **13.2** Filtro `quantidade === 0` — função/predicado que descarta linhas zero.
  TDD: linha qtd 0 descartada; qtd negativa mantida. Commit:
  `feat(worker): filtro de movimento sem efeito`.
- **13.3** `rebuildFatoEstoqueMovimento(prisma)` — lê `raw_estoque_extrato`
  (`rawDeleted:false`), mapeia, filtra, `$transaction` `deleteMany`+`createMany`
  em lotes, `markFatoBuilt`. TDD: rebuild completo; `markFatoBuilt` chamado.
  Mock de Prisma. Commit: `feat(worker): builder do fato_estoque_movimento`.
- **13.4** Verificação de integração — `tsc` + `jest src/worker/fatos`. (Sem
  commit próprio; gate.)

### Task 14 → builder `fato-produto-parado` (3 sub-tasks)

- **14.1** `loadSaldoHojeMap(prisma)` — lê `raw_estoque_saldo_hoje`, `Map` por
  `data.id` → `{vrSaldo, unidade, saldo, produtoId/Nome, localId/Nome}`. TDD:
  map por id; campos extraídos. Commit: `feat(worker): mapa de saldo hoje`.
- **14.2** `mapProdutoParadoRow(raw, saldoMap)` — join por
  `saldo_hoje_id[0]`; extrai `dias` cru; pega `vrSaldo`/`unidade`/`saldo` do
  map. TDD: join encontra; `dias` saturado em 179 gravado cru. Commit:
  `feat(worker): mapProdutoParadoRow`.
- **14.3** `rebuildFatoProdutoParado(prisma)` — lê
  `raw_estoque_saldo_hoje_duracao_dias`, mapeia, **filtra `saldo > 0`**,
  `$transaction` deleteMany+createMany, `markFatoBuilt`. TDD: filtro saldo>0;
  `markFatoBuilt` chamado. Commit: `feat(worker): builder do fato_produto_parado`.

### Tasks 18-22 → templates de gráfico (8 sub-tasks)

- **18** `KPICard` — `{valor, rótulo, formato}`; usa estados do Task 17. TDD:
  render com valor; estado preparando/vazio/erro. Commit: `feat(charts): KPICard`.
- **19.1** `DataTable` render — colunas declarativas, `tabular-nums`, formata
  negativos. TDD: render de linhas; negativo formatado. Commit:
  `feat(charts): DataTable render`.
- **19.2** `DataTable` ordenação — clique no header, `aria-sort`, asc/desc. TDD:
  ordena coluna numérica e textual; `aria-sort` reflete estado. Commit:
  `feat(charts): DataTable ordenação`.
- **19.3** `DataTable` busca — input filtra linhas por texto. TDD: filtra;
  estado vazio quando nada casa. Commit: `feat(charts): DataTable busca`.
- **20** `BarChart` — Recharts `ResponsiveContainer`, tooltip, legenda,
  gridlines baixo contraste, paleta dark, números pt-BR. TDD (render-test):
  render com dados; estados. Commit: `feat(charts): BarChart`.
- **21** `LineChart` — idem BarChart, multi-série (entrada/saída). TDD: render
  multi-série; estados. Commit: `feat(charts): LineChart`.
- **22.1** `PieChart` render — ≤6 fatias, tooltip, legenda. TDD: render;
  estados. Commit: `feat(charts): PieChart render`.
- **22.2** `PieChart` agrupamento "Outros" — top-5 + "Outros" acima de 6 fatias.
  TDD: 7 fatias → 6 (top-5 + Outros); 5 fatias intactas. Commit:
  `feat(charts): PieChart agrupa Outros`.

### Task 25 → catálogo dos 6 relatórios (8 sub-tasks)

- **25.1**–**25.6** uma sub-task por `ReportEntry` (R1–R6) — cada uma define
  `id`, `titulo`, `dominio:"estoque"`, `descricao`, `icone` (LucideIcon),
  `modeloFonte`, `secoes` (R4/R6 com 2 seções). TDD: a entrada tem os campos
  obrigatórios; R4/R6 têm 2 seções. Commit por entrada:
  `feat(reports): catálogo R{n}`.
- **25.7** `reportsForUser(role, domains)` — filtra `REPORT_CATALOG` por domínio
  visível. TDD: admin vê 6; manager com `estoque` vê 6; manager sem domínio vê 0.
  Commit: `feat(reports): reportsForUser`.
- **25.8** `getReport(id)` — busca por id, `undefined` se ausente. TDD: acha R1;
  id inválido → undefined. Commit: `feat(reports): getReport`.

### Task 26 → queries de leitura (8 sub-tasks)

Pré-requisito: `ReportFilterValues` e tipos de retorno por relatório definidos em
`types.ts` (ver N2). Cada função: guard → revalida domínio via `getMyDomains()` →
determina estado (`FatoBuildState` ausente → "preparando"; presente sem linhas →
"vazio"; exceção → "erro") → devolve `{estado, dados:<TipoRn>, freshness}`.

- **26.0** `parseFilters(section, searchParams)` em
  `src/lib/reports/filters.ts` — converte `Record<string,string>` →
  `ReportFilterValues` tipado com Zod + defaults da seção. TDD: parse de período;
  default aplicado; valor inválido cai no default. Commit:
  `feat(reports): parser de filtros`.
- **26.1** `getRelatorioSaldoProduto` (R1) — lê `fato_estoque_saldo`, filtra
  produto/armazém/família/busca, devolve linhas. TDD: filtro por família;
  estado preparando sem `FatoBuildState`. Commit: `feat(reports): query R1`.
- **26.2** `getRelatorioValorPorArmazem` (R2) — agrega `vrSaldo` por local,
  `vrSaldo>0`. TDD: agregação; `vrSaldo>0` aplicado. Commit: `feat(reports): query R2`.
- **26.3** `getRelatorioEntradasSaidas` (R3) — soma `quantidade` por
  `mes`×`sentido`, filtro período (default 3 meses)/armazém. TDD: soma por mês;
  janela default. Commit: `feat(reports): query R3`.
- **26.4** `getRelatorioProdutoParado` (R4) — lê `fato_produto_parado`,
  `saldo>0`, filtro faixa de dias/armazém; devolve KPI + tabela. TDD: faixa
  30/60/90+; `saldo>0`. Commit: `feat(reports): query R4`.
- **26.5** `getRelatorioTopMovimentados` (R5) — top-N por soma de `quantidade`,
  filtro período/sentido. TDD: top-N; filtro sentido. Commit: `feat(reports): query R5`.
- **26.6** `getRelatorioConcentracao` (R6) — agrega `vrSaldo` por família e por
  marca, `vrSaldo>0`, nulos → "Não classificado". TDD: agregação dupla; nulos
  agrupados. Commit: `feat(reports): query R6`.
- **26.7** Verificação — `tsc` + `jest src/lib/actions/report-data.test.ts`.
  (Gate, sem commit.)

### Task 28 → componentes de filtro (7 sub-tasks)

Cada controle é um componente controlado (`value` + `onChange`). Uma sub-task
cada, TDD render + interação:

- **28.1** `ProductFilter` (busca + select). Commit: `feat(reports): filtro de produto`.
- **28.2** `WarehouseFilter` (select). Commit: `feat(reports): filtro de armazém`.
- **28.3** `FamilyFilter` (select). Commit: `feat(reports): filtro de família`.
- **28.4** `PeriodFilter` (range de meses). Commit: `feat(reports): filtro de período`.
- **28.5** `DirectionFilter` (entrada/saída). Commit: `feat(reports): filtro de sentido`.
- **28.6** `DaysRangeFilter` (30/60/90+). Commit: `feat(reports): filtro de faixa de dias`.
- **28.7** `SearchFilter` (texto). Commit: `feat(reports): filtro de busca`.

### Task 31 → landing `/relatorios` (3 sub-tasks)

- **31.1** `relatorios-grid.tsx` (client) — recebe relatórios já filtrados,
  renderiza grade agrupada por domínio (`Card`, `motion`); estado vazio. TDD
  (render-test): agrupa por domínio; estado vazio sem relatórios. Commit:
  `feat(relatorios): grade de relatórios`.
- **31.2** `page.tsx` (server) — `getCurrentUser` + `getMyDomains()` →
  `reportsForUser` → passa ao grid. Commit: `feat(relatorios): landing`.
- **31.3** Verificação — `tsc` + `lint`. Commit: nenhum.

### Task 32 → página `/relatorios/[id]` (3 sub-tasks)

- **32.1** `report-view.tsx` (client) — recebe `{report, secoesComDados,
  freshness}`; renderiza `report-filters`, as seções em sequência (template +
  estado), indicador "atualizado em". TDD (render-test): render multi-seção;
  estado por seção; freshness exibido. Commit: `feat(relatorios): report-view`.
- **32.2** `page.tsx` (server) — `requireDomainAccess` → `getReport(id)` →
  `parseFilters` → chama queries de `report-data.ts` por seção → passa ao
  `report-view`. Commit: `feat(relatorios): página de relatório`.
- **32.3** Verificação — `tsc` + `lint`. Commit: nenhum.

### Task 36 → etapa "Acesso" no `user-form-dialog` (7 sub-tasks)

Arquivo de ~1035 linhas — cada sub-task isola uma mudança verificável por `tsc`:

- **36.1** `type Step = 1 | 2 | 3` + propagar o tipo no `Stepper`/`stepperItems`.
  Verif: `tsc`. Commit: `refactor(users): Step com 3 etapas`.
- **36.2** Navegação genérica — `goNext`/`goBack` operam sobre N etapas
  (`setStep(s => s+1)`/`s-1`), respeitando `últimaEtapa`. Verif: `tsc`. Commit:
  `refactor(users): navegação genérica do stepper`.
- **36.3** Footer — substituir `step < 2`/`step > 1` literais por
  `step < últimaEtapa`/`step > 1`. Verif: `tsc`. Commit: `refactor(users): footer dinâmico`.
- **36.4** `stepperItems` computado pelo role — 3 itens (Identidade, Acesso
  `ShieldCheck`, Confirmação) para manager/viewer; 2 para privilegiados. Verif:
  `tsc`. Commit: `feat(users): stepper por role`.
- **36.5** Renderizar `access-step` entre Identidade e Confirmação; estado
  `domains` no `FormState`. Verif: `tsc`. Commit: `feat(users): renderiza etapa Acesso`.
- **36.6** Caso N10 — ao trocar para role privilegiado: zerar `domains`; se
  `step` está na etapa Acesso, recuar para etapa válida. TDD (componente):
  troca de role na etapa 3 recua para 2. Commit: `feat(users): trata troca de role`.
- **36.7** `StepConfirm` + submit — `StepConfirm` lista domínios + aviso "zero
  domínios" (I6); submit `create` passa `domains` a `createUser`; submit `edit`
  chama `updateUser` **depois** `updateUserDomains` (ver N1 — ordenar para não
  deixar role privilegiado com linhas órfãs), toast de erro parcial. Commit:
  `feat(users): submit com domínios`.

---

## Resumo

**Verificação da Review #1:** 5 Críticos + 9 Importantes → **13 resolvidos, 1
parcial** (I3, virou N1).

**Achados novos desta review:**

| Severidade | Contagem | Itens |
|---|---|---|
| Crítico | 0 | — |
| Importante | 3 | N1 (dependências Bloco 7 + ordem segura edit), N2 (`ReportFilterValues`/parser de filtros não declarados), N3 (`vrSaldo` nullable + linhas pré-existentes) |
| Menor | 3 | N4 (`atualizadoEm` redundante), N5 (`package-lock`), N6 (`next build` repetido) |

**Decomposição entregue:** 11 tasks [DECOMPOR] quebradas em **63 sub-tasks
bite-sized** com TDD e commits nomeados (Task 3→4, 7→4, 12→4, 13→4, 14→3,
18-22→8, 25→8, 26→8, 28→7, 31→3, 32→3, 36→7).

**Veredito:** a v2 está arquiteturalmente sólida — corrigiu os 5 Críticos sem
introduzir bloqueios. Os 3 Importantes novos **não são bloqueios estruturais**,
mas **precisam ser decididos e escritos no PLAN v3 antes da execução**: N2
(definir `ReportFilterValues` + `parseFilters` — sem isso o fluxo filtro→query
está fantasma) é o mais relevante; N1 (ordem segura do submit edit) e N3
(`vrSaldo` nullable) são correções pontuais de texto. **Recomendação: a v2 + esta
decomposição vão para PLAN v3 incorporando N1-N6; o PLAN v3 está liberado para
execução assim que N2 estiver com `ReportFilterValues` e `parseFilters`
explicitados.** Sem bloqueio que exija nova rodada de review.
