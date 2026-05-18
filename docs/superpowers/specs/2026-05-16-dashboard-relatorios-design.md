# F3 — Dashboard de Relatórios — Design (SPEC v3)

> Spec da Fase 3 do nexus-odoo. Brainstorm com o usuário em 2026-05-16.
> **v3 — versão final, vai para o plano.** Incorpora a Review #1
> (`.../reviews/2026-05-16-dashboard-spec-review-1.md`) e a Review #2
> (`.../reviews/2026-05-16-dashboard-spec-review-2.md`).

## 1. Objetivo

Entregar a **frente A** do nexus-odoo: o painel visual de relatórios. A F3 entrega
(a) a **infraestrutura do dashboard** — padrão "um relatório", shell de navegação,
RBAC por domínio, templates de visualização — e (b) um **lote de 6 relatórios de
estoque**. Relatórios futuros repetem o padrão. Tudo lê do cache da F2.

## 2. Escopo

**Dentro:** (1) arquitetura "um relatório" de 4 camadas + catálogo declarativo;
(2) RBAC por domínio em 3 camadas; (3) etapa "Acesso" no modal de usuário;
(4) 5 templates de visualização (Recharts); (5) shell `/relatorios` +
`/relatorios/[id]`; (6) 3 fatos; (7) 6 relatórios de estoque (§8).

**Fora:** relatórios de outros domínios; o construtor F6; relatórios de
faturamento/venda por NF (lote 2). **`natureza` do movimento** (venda vs.
transferência vs. inventário) **fica fora da F3** — ver §5.2 / decisão 12.

**Conserto de ingestão acoplado:** `estoque.extrato` muda de `incremental` para
`snapshot` no catálogo de modelos da F2 — o modelo quase não tem `write_date`
(3 de 13.548 linhas), o incremental está cego. R3/R5 dependem disso.

## 3. Arquitetura: o padrão "um relatório"

### 3.1 As 4 camadas

1. **Fato** (`fato_*`) — tabela Prisma tipada, derivada da camada `raw` por um
   builder no worker. **Nenhuma query de leitura toca `raw_*`** — toda agregação
   é pré-computada no builder.
2. **Query de leitura** — função server-side; lê o fato, devolve dado pronto,
   revalida o RBAC de domínio (§4), sinaliza o estado do fato (§3.4).
3. **Componente visual** — instancia template(s) (§6) com a definição declarativa.
4. **Entrada no catálogo** — registro declarativo (§3.3).

### 3.2 Regra geral dos builders — campos relacionais do Odoo (N1)

Todo campo `many2one` do Odoo chega no JSONB `raw` como **array `[id, "rótulo"]`**
ou, quando nulo, o **booleano `false`** (não `null`). Regra obrigatória de todo
builder de fato: ao ler um campo relacional, extrair `id` de `data->'campo'->>0`
e `rótulo` de `data->'campo'->>1`; quando o valor é `false`, normalizar ambos
para `null`. Cada coluna `*Id`/`*Nome` na §5 nomeia o campo-fonte exato.

### 3.3 Catálogo de relatórios — entrada declarativa (N8)

Uma entrada de catálogo tem: `id`, `título`, `domínio` (§4), `descrição`,
`ícone`, `modeloFonte` (modelo Odoo cuja sync data o "atualizado em"), e uma
lista de **`seções`** — cada seção com seu próprio `template` (§6), `fato`,
`config` e `filtros`. A maioria dos relatórios tem 1 seção; R4 e R6 têm 2. A
página `/relatorios/[id]` renderiza as seções em sequência. O catálogo alimenta
nav e RBAC.

### 3.4 Estado de build do fato (N7)

Cada tabela de fato ganha a coluna **`ultimoBuildAt DateTime?`** — escrita pelo
builder ao fim de cada rebuild. A query de leitura distingue três estados:
- `ultimoBuildAt` nulo → **"relatório ainda sendo preparado"** (builder nunca rodou);
- `ultimoBuildAt` preenchido e o fato sem linhas para o filtro → **"sem dado no período"**;
- exceção na leitura → **"erro"** (com ação de repetir).

### 3.5 Topologia de dependências (ordem obrigatória)

Por relatório: `migration Prisma` → `prisma generate` → `builder do fato` →
`query de leitura` → `componente` → `entrada no catálogo` → `RBAC`. Os 3 fatos
são unidades de trabalho separadas das 6 telas.

### 3.6 Modelo de templates (preparação para a F6)

Os 6 relatórios são instâncias parametrizadas dos 5 templates, não componentes
sob medida. Não se constrói o motor no-code da F6 agora — a base declarativa
(catálogo + seções + templates) fica pronta para a F6 estender.

## 4. RBAC por domínio

Acesso por **domínio** (enum Prisma `ReportDomain`: `estoque`/`financeiro`/
`fiscal`/`comercial`). Cada relatório declara seu domínio. Regra: o usuário vê
um relatório **sse, e somente se,** tem o domínio dele.

### 4.1 Reconciliação dos dois eixos (hierarquia F1 × domínio F3)

- **Quem vê:** `super_admin`/`admin` veem **todos** os domínios (decisão
  consciente — novo domínio futuro é visto automaticamente; a etapa "Acesso" é
  oculta para esses papéis). `manager`/`viewer` veem só domínios concedidos.
- **Quem concede:** quem pode editar o usuário-alvo (`canEditUser`, F1) concede/
  revoga domínios; `super_admin`/`admin` concedem qualquer domínio; `manager`
  (se gerencia usuários) só concede domínios que **ele próprio possui**.

### 4.2 Enforcement em 3 camadas

1. **Catálogo/nav** — o shell monta a grade filtrada pelos domínios do usuário.
2. **Página `/relatorios/[id]`** — server component valida o domínio; URL direta
   fora do alcance → redirect `/relatorios`.
3. **Query de leitura** — revalida o domínio antes de devolver dado.

### 4.3 Modelo de dados

- Enum Prisma **`ReportDomain`**.
- Tabela **`UserDomainAccess`** (`id`, `userId`, `domain ReportDomain`,
  `grantedById`, `createdAt`; único por `(userId, domain)`). `super_admin`/
  `admin` não têm linhas. `manager`/`viewer` têm uma linha por domínio.
- Enum **`AuditAction`** ganha `user_domains_changed` (migration do enum é task);
  `AuditLog.details Json` carrega `{ added: [...], removed: [...] }`.
- **Backfill:** a migration concede o domínio `estoque` a todos os `manager`/
  `viewer` já existentes.

### 4.4 Etapa "Acesso" no modal de usuário (construção nova)

O `user-form-dialog.tsx` hoje tem 2 etapas (`Step = 1 | 2`). A F3 constrói uma
3ª etapa "Acesso" → `Step = 1 | 2 | 3` (Identidade → Acesso → Confirmação):

- A etapa "Acesso" só vale para papel `manager`/`viewer`. **`stepperItems` é
  computado a partir do role atual**: para `super_admin`/`admin` o stepper tem 2
  itens (sem "Acesso"); para `manager`/`viewer`, 3.
- **Troca de role no meio do fluxo (N10):** ao mudar o role para um privilegiado,
  os domínios selecionados são **zerados**; ao voltar para `manager`/`viewer`, a
  etapa "Acesso" reaparece vazia.
- Conteúdo: checkboxes dos `ReportDomain`. Para um `manager` concedente, só os
  domínios que ele possui ficam habilitados.
- **Modo `create` (N9):** `createUser` (`src/lib/actions/users.ts`) passa a
  receber os domínios e é **refatorado** para abrir `prisma.$transaction`
  envolvendo `user.create` + `userDomainAccess.createMany` + o `AuditLog` de
  `user_created`. Listar como task de refactor explícita.
- **Default de usuário novo:** zero domínios, com aviso na etapa de confirmação
  ("este usuário ainda não verá nenhum relatório até receber acesso a um domínio").
- **Modo `update`:** alterar domínios chama a server action de concessão;
  registra `AuditLog` `user_domains_changed`.

## 5. Fatos a modelar

Regra geral: cada fato é tabela Prisma tipada, com **`odooId`** (ou chave
declarada), **`ultimoBuildAt DateTime?`** (§3.4), índices declarados, e um
builder no worker (`src/worker/fatos/`) que faz **rebuild completo** disparado
após o sync do modelo-fonte. Extração relacional segue §3.2.

### 5.1 `fato_estoque_saldo` — enriquecer

Modelo `FatoEstoqueSaldo` da F2 tem `odooSaldoId`, `produtoId/Nome`,
`localId/Nome`, `quantidade`, `unidade`. A F3 acrescenta:
- `vrSaldo Decimal` — de `raw_estoque_saldo_hoje.data->>'vr_saldo'`; carregar
  mesmo quando 0.
- `familiaId Int?`, `familiaNome String?` — de `data->'familia_id'` do produto
  correspondente em `raw_sped_produto` (`familia_id[0]`/`[1]`).
- `marcaId Int?`, `marcaNome String?` — de `data->'marca_id'` (idem).
- **Nulos (N4):** o produto vem de `produto_id[0]`; para as ~32 linhas cujo
  `produtoId` não existe em `raw_sped_produto`, e para produtos com
  `familia_id`/`marca_id` = `false`, gravar `null`. **Não há join extra** com
  `raw_sped_produto_familia` — `familia_id[1]` já traz o rótulo (§3.2).
- Remover o comentário "PROVISÓRIO" do modelo.
- **Não** incluir `disponivel`/`reservado`/`programado` agora (decisão M1 —
  re-migrar é barato; entram quando um relatório os usar).
Índices: `produtoId`, `localId`, `familiaId`, `marcaId`.
Builder: rebuild após o snapshot de `estoque.saldo.hoje`.

### 5.2 `fato_estoque_movimento` — novo

Fonte: `raw_estoque_extrato` (13.548 linhas). O modelo passa a `snapshot`
(§2); builder faz rebuild completo após o snapshot de `estoque.extrato`.
Colunas:
- `odooId Int @id` — `data->>'id'`.
- `produtoId Int?`, `produtoNome String?` — de `data->'produto_id'`.
- `localId Int?`, `localNome String?` — de `data->'local_id'`.
- `data DateTime` — `data->>'data'`.
- `mes String` — `YYYY-MM` derivado de `data` (para agregação mensal).
- `quantidade Decimal` — `data->>'quantidade'`.
- `sentido String` — `entrada` se `quantidade > 0`, `saida` se `< 0`.
- `localInversoId Int?` — de `data->'local_inverso_id'` (coluna **crua**, para
  o lote 2 classificar `natureza` no futuro).
- `origem String?` — `data->>'origem'` (coluna crua, idem).
- **Excluir linhas com `quantidade = 0`** (≈11% do extrato — ajustes sem efeito).
- **`natureza` NÃO entra na F3 (decisão 12):** a classificação venda/
  transferência/inventário não é derivável de forma confiável dos dados (o
  prefixo `NF-` cobre entrada e saída; `local_inverso_id=5` diverge de `PV-` em
  ~640 linhas). Carregamos `localInversoId` e `origem` crus; a classificação
  fica para o lote 2, quando houver um relatório de venda que a exija e a regra
  puder ser validada. `tipo` (código cru `00`/`04`/`07`) **não** é carregado —
  nenhum relatório do lote 1 o usa.
Índices: `mes`, `produtoId`, `localId`, `sentido`.

### 5.3 `fato_produto_parado` — novo

Fonte: `raw_estoque_saldo_hoje_duracao_dias` + join com `raw_estoque_saldo_hoje`.
- **Join (N2):** por **FK direta** — `raw_estoque_saldo_hoje_duracao_dias.data->'saldo_hoje_id'->>0`
  → `raw_estoque_saldo_hoje.data->>'id'` (cobertura 100%; **não** usar "par
  produto×local", que não é único).
- **Filtro `saldo > 0`** — sem ele, R4 infla ~2,7×.
- `dias Int` — `data->>'dias'`; **satura em 179** no Odoo (o fato grava o valor
  cru; R4 exibe a faixa "+90 dias" como teto, sem prometer mais).
- `vrSaldo Decimal` — vem da linha de saldo correspondente (via a FK acima).
- `unidade String?` — incluída (M3 — R4 é `DataTable` de saldo, consistente com R1).
Colunas: `saldoHojeId Int @id` (a chave única; duração é 1:1 com saldo),
`produtoId/Nome`, `localId/Nome`, `saldo`, `dias`, `vrSaldo`, `unidade`.
Índices: `dias`, `produtoId`.
Builder: rebuild após o snapshot de `estoque.saldo.hoje.duracao.dias`.

## 6. Templates de visualização

Biblioteca: **Recharts** (dependência de produção nova; compatível Next 16 /
React 19). Cinco templates em `src/components/charts/`:
- **`KPICard`** — número único + rótulo.
- **`DataTable`** — tabela ordenável/pesquisável. **Componente novo genérico**
  (não é extensão do `audits-table`); recebe colunas declarativas; formata
  números com sinal e `tabular-nums` (incl. saldos negativos — M5).
- **`BarChart`**, **`LineChart`**, **`PieChart`** (≤6 fatias; acima → top-5 + "Outros").

**Transversais:** `ResponsiveContainer`; **skeleton** no loading; os **3 estados**
de §3.4 ("preparando", "sem dado", "erro" com repetir); tooltips; legendas;
gridlines de baixo contraste; paleta categórica acessível testada no dark mode;
números pt-BR; tabelas com `aria-sort`. Cada template recebe definição
declarativa (dados + config) — base da F6.

## 7. Shell do dashboard

- **`/relatorios`** — landing: grade responsiva de cards
  (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`), agrupada por domínio com
  cabeçalho de seção, filtrada pelos domínios do usuário. Card: ícone, título,
  descrição, badge do domínio. Estado vazio se o usuário não tem domínio.
- **`/relatorios/[id]`** — `PageShell` + `PageHeader` (breadcrumb para
  `/relatorios`), barra de filtros/período (declarados pela seção do catálogo),
  as seções do relatório em sequência, e o indicador **"atualizado em <data/hora>"**.
  Freshness (N6): o catálogo declara `modeloFonte` por relatório; o indicador usa
  o `lastSnapshotAt` desse modelo no `SyncState` combinado com o `ultimoBuildAt`
  do fato (§3.4) — exibe o **menor** dos dois (o dado é tão fresco quanto a etapa
  mais atrasada). Nunca usa `record_count`.
- Item **"Relatórios"** no `NAV_ITEMS`: sem `section`, sem `visibleTo`.
- Design system da F1 (`PageShell`, `PageHeader`, `Card`, tokens, dark mode,
  ícones lucide, `motion` fade-in).

## 8. Os 6 relatórios de estoque (lote 1)

Todos no domínio `estoque`. De-para com a research: R5 spec = R6 research;
R6 spec = R8 research; demais coincidem.

| # | Relatório | Seções (template · fato) | Filtros | Query |
|---|---|---|---|---|
| R1 | Saldo por produto e armazém | `DataTable` · `fato_estoque_saldo` | produto, armazém, família, busca | exibe todas as linhas; saldos negativos aparecem normalmente |
| R2 | Valor de estoque por armazém | `BarChart` · `fato_estoque_saldo` | — | agrega `vrSaldo` por local; filtra `vrSaldo > 0` |
| R3 | Entradas vs. saídas por mês | `LineChart` · `fato_estoque_movimento` | período (default últimos 3 meses), armazém | soma `quantidade` por `mes`×`sentido`; movimento físico total |
| R4 | Produtos parados | `KPICard` + `DataTable` · `fato_produto_parado` | faixa de dias (30/60/90+), armazém | `saldo > 0`; teto exibido "+90 dias" |
| R5 | Top produtos movimentados | `BarChart` · `fato_estoque_movimento` | período, sentido | top-N por soma de `quantidade`; movimento físico |
| R6 | Concentração do estoque | `PieChart` (família) + `BarChart` (marca) · `fato_estoque_saldo` | — | agrega `vrSaldo`; filtra `vrSaldo > 0`; família/marca nulas → fatia **"Não classificado"** |

Notas: **R3** — janela útil fev/2026+; o aviso compara o período escolhido com
essa janela conhecida. **R3/R5** medem movimento físico total (sem `natureza`).
**R6** — 9 famílias (top-5 + "Outros" no PieChart), 31 marcas (top-N no
BarChart), categoria "Não classificado" para nulos (§5.1).

## 9. Componentes e arquivos (visão macro)

```
prisma/schema.prisma              +enum ReportDomain; +AuditAction.user_domains_changed;
                                  +UserDomainAccess; +FatoEstoqueMovimento;
                                  +FatoProdutoParado; FatoEstoqueSaldo enriquecido;
                                  +ultimoBuildAt nas 3 tabelas de fato
prisma/migrations/                migration F3 + backfill UserDomainAccess (estoque
                                  p/ manager/viewer existentes)
src/worker/catalog/model-catalog.ts  estoque.extrato: incremental → snapshot
src/worker/fatos/                 fato-estoque-saldo (enriquecido), fato-estoque-movimento,
                                  fato-produto-parado — todos gravam ultimoBuildAt
src/lib/reports/domains.ts        ReportDomain + helpers de RBAC por domínio
src/lib/reports/catalog.ts        catálogo declarativo (entrada com seções)
src/lib/actions/report-data.ts    queries de leitura (revalidam RBAC; sinalizam estado)
src/lib/actions/domain-access.ts  server actions de concessão de domínio + auditoria
src/components/charts/            KPICard, DataTable, BarChart, LineChart, PieChart
src/app/(protected)/relatorios/   page.tsx (landing) + [id]/page.tsx (relatório)
src/components/users/user-form-dialog.tsx  +etapa "Acesso"; stepper dinâmico por role
src/lib/actions/users.ts          createUser refatorado: $transaction (user + domínios + audit)
src/lib/constants/nav.ts          +item Relatórios
```

## 10. Testes

- Builders de fato — derivação `raw → fato`: extração `[id,nome]`/`false→null`
  (§3.2), filtro `saldo>0` (parado), exclusão `quantidade=0` (movimento), join
  por `saldo_hoje_id` (parado), nulos de família/marca (saldo), `ultimoBuildAt`.
- RBAC por domínio — 3 camadas; `manager`/`viewer` sem o domínio não acessam
  (nav, página, dados); regra de concessão (§4.1); transação de `createUser`.
- Templates — render com dado, "preparando", "sem dado", "erro".
- Queries de leitura — agregação correta, filtros (`vrSaldo>0` em R2/R6),
  revalidação de RBAC, sinalização de estado de fato.
- Verificação: `tsc`, `lint`, `next build`, `jest`; UAT visual dos 6 relatórios.

## 11. Resumo das decisões

| # | Decisão |
|---|---|
| 1 | Relatório = 4 camadas; nenhuma query lê `raw_*`; builders extraem `[id,nome]`/`false→null`. |
| 2 | RBAC por domínio, 3 camadas; `super_admin`/`admin` veem tudo (consciente). |
| 3 | Concessão: quem edita o usuário concede; `manager` só concede o que possui. |
| 4 | `UserDomainAccess` (tabela); `ReportDomain` e `AuditAction.user_domains_changed` são enums Prisma. |
| 5 | Etapa "Acesso" nova no modal (stepper dinâmico por role); `create` persiste domínios em `$transaction`; novo usuário nasce com zero domínios. |
| 6 | Backfill: `manager`/`viewer` existentes recebem o domínio `estoque`. |
| 7 | 3 fatos com colunas/índices/joins/`ultimoBuildAt` definidos em §5; rebuild completo. |
| 8 | `estoque.extrato` muda de `incremental` para `snapshot` (conserto da F2). |
| 9 | 5 templates Recharts; `DataTable` é componente novo genérico. |
| 10 | 6 relatórios de estoque (lote 1); R4/R6 multi-seção; R6 = pizza família + barra marca. |
| 11 | Freshness = menor entre `lastSnapshotAt` (raw) e `ultimoBuildAt` (fato); nunca `record_count`. |
| 12 | `natureza` do movimento (venda/transferência/inventário) fica fora da F3 — dado não permite classificação confiável; carregam-se `localInversoId` e `origem` crus para o lote 2. |
| 13 | Catálogo declarativo: entrada com lista de `seções` (template+fato+config+filtros) — comporta relatórios multi-template e prepara a F6. |
