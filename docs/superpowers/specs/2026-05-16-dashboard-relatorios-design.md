# F3 — Dashboard de Relatórios — Design (SPEC v2)

> Spec da Fase 3 do nexus-odoo. Brainstorm com o usuário em 2026-05-16.
> **v2** — incorpora a Review Profunda #1 (`docs/superpowers/reviews/2026-05-16-dashboard-spec-review-1.md`):
> 6 Críticos + 9 Importantes + 6 Menores aplicados. Passará pela Review #2 → v3.

## 1. Objetivo

Entregar a **frente A** do nexus-odoo: o painel visual de relatórios. A F3 entrega
(a) a **infraestrutura do dashboard** — o padrão reutilizável "um relatório", o
shell de navegação, o RBAC por domínio, os templates de visualização — e
(b) um **primeiro lote de 6 relatórios de estoque**. Relatórios futuros entram
depois repetindo o padrão. Tudo lê do cache Postgres da F2; nada toca o Odoo ao vivo.

## 2. Escopo

**Dentro da F3:** (1) arquitetura "um relatório" de 4 camadas + catálogo
declarativo; (2) RBAC por domínio com enforcement em 3 camadas; (3) UI de
concessão de domínios (etapa "Acesso" no modal de usuário); (4) 5 templates de
visualização (Recharts); (5) shell `/relatorios` + `/relatorios/[id]`; (6) 3
fatos no worker; (7) 6 relatórios de estoque (§8).

**Fora da F3:** relatórios de outros domínios (lotes futuros); o construtor F6;
relatórios de faturamento por NF (lote 2 da frente A).

**Correção de ingestão acoplada (ver C2):** a F3 inclui **revisar o modo de sync
de `estoque.extrato`** — hoje classificado `incremental`, mas o modelo quase não
tem `write_date` (3 de 13.548 linhas), então o incremental está cego. Passa a
`snapshot` (full refresh). É um conserto da F2 que a F3 não pode ignorar, pois
R3/R5 dependem da confiabilidade desse modelo.

## 3. Arquitetura: o padrão "um relatório"

Cada relatório é uma unidade isolada de **4 camadas**:

1. **Fato** (`fato_*`) — tabela Prisma tipada no cache, derivada da camada `raw`
   por um builder no worker. **Nenhuma query de leitura toca `raw_*`** — toda
   agregação é pré-computada no builder (regra reafirmada — ver I8).
2. **Query de leitura** — função server-side que lê o fato e devolve dados já
   prontos. Revalida o RBAC de domínio (§4). Sinaliza o estado "fato não
   populado" distinto de "sem dado" (§6.1).
3. **Componente visual** — instancia um dos 5 templates (§6) com a definição
   declarativa do relatório.
4. **Entrada no catálogo** — registro declarativo: `id`, `título`, `domínio`,
   `descrição`, `fato`, `template`, `ícone`, **`filtros`** (§8). Alimenta nav e RBAC.

**Topologia de dependências (ordem obrigatória — ver I6):** para cada relatório:
`migration Prisma` → `prisma generate` → `builder do fato no worker` →
`query de leitura` → `componente visual` → `entrada no catálogo` → `RBAC`. Um
relatório só é testável de ponta a ponta após o fato estar populado. Os 3 fatos
são unidades de trabalho separadas das 6 telas.

**Modelo de templates (preparação para a F6):** os 6 relatórios são instâncias
parametrizadas dos 5 templates, não componentes sob medida. Não se constrói o
motor no-code completo na F3 — a base declarativa fica pronta para a F6 estender.

## 4. RBAC por domínio

Acesso por **domínio de negócio**. Domínios (enum Prisma `ReportDomain` —
decisão M2): `estoque`, `financeiro`, `fiscal`, `comercial`. Cada relatório
declara seu domínio. Regra única: **o usuário vê um relatório se, e somente se,
tem o domínio dele.**

### 4.1 Os dois eixos de permissão (reconciliação — C6)

A F1 tem **hierarquia** (`PLATFORM_ROLE_HIERARCHY` — quem gerencia quem). A F3
acrescenta **domínio** (o que cada um vê). Regras que reconciliam os eixos:

- **Quem vê o quê:** `super_admin` e `admin` veem **todos** os domínios
  (decisão consciente — ver I7: ao surgir um 5º domínio, eles o veem
  automaticamente; a etapa "Acesso" do modal é oculta para esses papéis).
  `manager` e `viewer` veem apenas domínios explicitamente concedidos.
- **Quem pode conceder domínio:** quem pode editar o usuário-alvo (regra
  hierárquica da F1, `canEditUser`) pode conceder/revogar domínios **e**:
  - `super_admin`/`admin` podem conceder **qualquer** domínio;
  - `manager` (quando gerencia usuários) só pode conceder domínios que **ele
    próprio possui** — mantém o princípio "só concede o que você tem".

### 4.2 Enforcement em 3 camadas

1. **Catálogo/nav** — o shell monta a grade já filtrada pelos domínios do usuário.
2. **Página do relatório** (`/relatorios/[id]`) — o server component valida o
   domínio antes de renderizar; URL direta fora do alcance → redirect `/relatorios`.
3. **Query de leitura** — revalida o domínio antes de devolver dado. Mesmo que
   1 e 2 falhem, nada vaza.

### 4.3 Modelo de dados

- **Enum Prisma `ReportDomain`** (`estoque`/`financeiro`/`fiscal`/`comercial`).
- **Tabela `UserDomainAccess`** (`id`, `userId`, `domain ReportDomain`,
  `grantedById`, `createdAt`; única por `(userId, domain)`). `super_admin`/`admin`
  não têm linhas (veem tudo). `manager`/`viewer` têm uma linha por domínio.
- **Enum `AuditAction`** ganha o valor **`user_domains_changed`** (C1) — a
  migration do enum é uma task; o `AuditLog.details Json` carrega o diff de
  domínios (`{ added: [...], removed: [...] }`).
- **Backfill (I9):** a migration/seed concede o domínio `estoque` a **todos os
  `manager`/`viewer` já existentes** — senão eles abririam a F3 com dashboard
  vazio. Documentado como passo da migration de dados.

### 4.4 UI de concessão — etapa "Acesso" no modal de usuário (C5)

O `user-form-dialog.tsx` hoje tem **2 etapas** (`Step = 1 | 2`: Identidade →
Confirmação). A F3 **constrói uma 3ª etapa "Acesso"** (`Step = 1 | 2 | 3`:
Identidade → Acesso → Confirmação). Especificação:

- A etapa "Acesso" **só aparece quando o papel selecionado é `manager` ou
  `viewer`**. Para `super_admin`/`admin` a etapa é pulada (eles veem tudo).
- Conteúdo: seleção (checkboxes) dos domínios `ReportDomain` que o usuário pode
  ver. Para um `manager` concedente, só os domínios que ele possui ficam
  habilitados.
- **Modo `create`:** os domínios entram no payload de `createUser`
  (`src/lib/actions/users.ts`) e são persistidos na **mesma transação** que cria
  o usuário. Default de usuário novo: **zero domínios**, com aviso visível na
  etapa de confirmação ("este usuário ainda não verá nenhum relatório até receber
  acesso a um domínio").
- **Modo `update`:** alterar os domínios chama a server action de concessão;
  registra `AuditLog` com `user_domains_changed`.
- Mudança concreta: `Step` vira `1|2|3`, o `stepperItems` ganha o item "Acesso".

## 5. Fatos a modelar

Regra geral: cada fato é tabela Prisma tipada, com **índices declarados** (I8),
construída por um builder no worker disparado após o sync dos modelos-fonte.

### 5.1 `fato_estoque_saldo` — enriquecer (C4)

O `FatoEstoqueSaldo` da F2 tem `produtoId/Nome`, `localId/Nome`, `quantidade`,
`unidade`. **Falta o valor R$**, que R2 e R6 exigem. A F3 acrescenta:
- `vrSaldo Decimal` — valor do saldo (de `raw_estoque_saldo_hoje.vr_saldo`;
  carregar mesmo quando 0 — 1.293 de 3.218 linhas têm valor).
- `familiaId Int?`, `familiaNome String?`, `marcaId Int?`, `marcaNome String?`
  — via join com `raw_sped_produto` (a família/marca do produto).
Remover o comentário "PROVISÓRIO" do modelo — a F3 o promove a definitivo.
Índices: `produtoId`, `localId`, `familiaId`, `marcaId`.
Builder: rebuild após o snapshot de `estoque.saldo.hoje`.

### 5.2 `fato_estoque_movimento` — novo

Fonte: `raw_estoque_extrato` (13.548 linhas). **Sync incremental cego** —
`write_date` ausente (C2): o modo de `estoque.extrato` passa a `snapshot`, e o
**builder faz rebuild completo** a cada ciclo (não incremental), disparado após
o snapshot de `estoque.extrato`.
Colunas: `odooId`, `produtoId/Nome`, `localId/Nome`, `data DateTime`,
`mes String` (YYYY-MM, para agregação), `quantidade Decimal`,
`sentido String` (`entrada`/`saida`, derivado do sinal de `quantidade`),
`tipo String?`, `localInversoId Int?`, `natureza String` (classificação:
`venda`/`transferencia`/`inventario`/`producao`/`outro`, derivada do prefixo de
`origem` e de `local_inverso_id` — ver I2). **Linhas com `quantidade = 0` são
excluídas** (≈11% do extrato — ajustes sem efeito).
Índices: `mes`, `produtoId`, `localId`, `natureza`, `sentido`.

### 5.3 `fato_produto_parado` — novo (C3)

Fonte: `raw_estoque_saldo_hoje_duracao_dias` + join com `raw_estoque_saldo_hoje`
(por par produto×local) para o `vrSaldo`.
- **Filtro `saldo > 0`** — produto×local com saldo zerado não é capital
  encalhado; sem o filtro, R4 infla ~2,7×.
- `dias Int` — **satura em 179** no Odoo. O fato carrega o valor cru; o
  relatório R4 exibe a faixa "+90 dias" como teto, **sem prometer "+6 meses"**.
- `vrSaldo Decimal` — vem do join com `raw_estoque_saldo_hoje`.
Colunas: `produtoId/Nome`, `localId/Nome`, `saldo`, `dias`, `vrSaldo`.
Índices: `dias`, `produtoId`.
Builder: rebuild após o snapshot de `estoque.saldo.hoje.duracao.dias`.

### 5.4 Estado de build do fato (I4)

Para distinguir "fato vazio porque ainda não foi construído" de "fato sem dado
no período", cada builder registra um timestamp de último build. Reusa-se o
`SyncState` do modelo-fonte (`lastSnapshotAt`) como sinal: se o modelo-fonte
nunca sincronizou, o fato é "ainda sendo preparado"; se sincronizou e o fato
está vazio para o filtro, é "sem dado". A query de leitura devolve um dos dois
estados; o componente mostra mensagens distintas.

## 6. Templates de visualização

Biblioteca: **Recharts** (decisão M3 — nova dependência de produção; compatível
com Next 16 / React 19; declarativa). Cinco templates em `src/components/charts/`:

- **`KPICard`** — número único + rótulo.
- **`DataTable`** — tabela ordenável e pesquisável. **Componente novo genérico**
  (M4) — não é extensão do `audits-table`; o `audits-table` é específico de
  auditoria. O `DataTable` recebe colunas declarativas.
- **`BarChart`** — comparação/ranking.
- **`LineChart`** — série temporal.
- **`PieChart`** — proporção; ≤6 fatias (acima disso, top-5 + "Outros").

### 6.1 Requisitos transversais

`ResponsiveContainer`; **skeleton** no carregamento; **três estados distintos**:
"fato ainda sendo preparado" (I4), "sem dado no período", e "erro de leitura"
(com ação de repetir); tooltips no hover; legendas visíveis; gridlines de baixo
contraste; paleta categórica acessível testada no dark mode; números em **pt-BR**;
`tabular-nums` em colunas numéricas; tabelas com `aria-sort`. Cada template
recebe uma definição declarativa (dados + config) — base da F6.

## 7. Shell do dashboard

- **`/relatorios`** — landing: grade responsiva de **cards de relatório**
  (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`), agrupada por domínio com cabeçalho
  de seção. Card: ícone, título, descrição curta, badge do domínio. Filtrada
  pelos domínios do usuário. Estado vazio se o usuário não tem domínio nenhum
  ("você ainda não tem acesso a nenhum domínio de relatórios").
- **`/relatorios/[id]`** — página do relatório: `PageShell` + `PageHeader`
  (breadcrumb/voltar para `/relatorios`), barra de **filtros/período** no topo
  (declarados pelo catálogo — §8), o template cheio dentro de um `Card`, e o
  indicador **"atualizado em <data/hora>"** (a partir de `last_snapshot_at`/
  `last_incremental_at` do modelo-fonte — **não** de `record_count`, que é
  contado ao vivo e não serve de timestamp — ver I1).
- Item **"Relatórios"** no `NAV_ITEMS`: sem `section` (grupo default, junto de
  "Dashboard"), sem `visibleTo` (visível a todo autenticado; o conteúdo filtra) — M1.
- Tudo no design system da F1 (`PageShell`, `PageHeader`, `Card`, tokens, dark
  mode, ícones lucide, `motion` fade-in).

## 8. Os 6 relatórios de estoque (lote 1)

Todos no domínio `estoque`. De-para com a research (M5): R5 spec = R6 research;
R6 spec = R8 research; os demais coincidem.

| # | Relatório | Pergunta | Template | Fato | Filtros |
|---|---|---|---|---|---|
| R1 | Saldo por produto e armazém | Quanto tenho de cada produto e onde? | `DataTable` | `fato_estoque_saldo` | produto, armazém, família, busca textual |
| R2 | Valor de estoque por armazém | Onde está o capital imobilizado? | `BarChart` | `fato_estoque_saldo` | — (visão global) |
| R3 | Entradas vs. saídas por mês | Qual o pulso da movimentação física? | `LineChart` | `fato_estoque_movimento` | período (default últimos 3 meses), armazém |
| R4 | Produtos parados (saldo > 0) | Que capital está encalhado? | `KPICard` + `DataTable` | `fato_produto_parado` | faixa de dias (30/60/90+), armazém |
| R5 | Top produtos movimentados | O que mais movimentou? | `BarChart` | `fato_estoque_movimento` | período, sentido (entrada/saída) |
| R6 | Concentração do estoque | Como é o mix do portfólio? | `PieChart` família + `BarChart` marca | `fato_estoque_saldo` | — |

Notas que vêm da Review #1:
- **R3/R5** medem **movimento físico total** (todas as naturezas). Excluem
  `quantidade = 0`. O fato carrega `natureza` para um relatório de venda futuro
  (lote 2) filtrar — não se mistura venda com transferência no lote 1.
- **R3:** janela útil de dados é fev–mai/2026 (antes disso o volume é residual);
  o seletor de período usa default "últimos 3 meses" e exibe aviso se o intervalo
  cair em meses sem volume.
- **R4:** "produtos parados" = `saldo > 0 AND dias > limiar`; o teto exibido é
  "+90 dias" (saturação do dado em 179) — sem prometer faixas maiores.
- **R6:** "concentração" resolve a ambiguidade "família e marca" — são **dois
  gráficos** na mesma página: `PieChart` por família (9 famílias → top-5 +
  "Outros") e `BarChart` por marca (31 marcas → top-N).

## 9. Componentes e arquivos (visão macro)

```
prisma/schema.prisma              +enum ReportDomain; +AuditAction.user_domains_changed;
                                  +UserDomainAccess; +FatoEstoqueMovimento;
                                  +FatoProdutoParado; FatoEstoqueSaldo enriquecido
prisma/migrations/                migration F3 + seed/backfill UserDomainAccess
src/worker/catalog/model-catalog.ts  estoque.extrato: incremental → snapshot (C2)
src/worker/fatos/                 fato-estoque-saldo (enriquecido), fato-estoque-movimento,
                                  fato-produto-parado
src/lib/reports/domains.ts        ReportDomain + helpers de RBAC por domínio
src/lib/reports/catalog.ts        catálogo declarativo dos 6 relatórios (com filtros)
src/lib/actions/report-data.ts    queries de leitura (revalidam RBAC; sinalizam estado de fato)
src/lib/actions/domain-access.ts  server actions de concessão de domínio (+ auditoria)
src/components/charts/            KPICard, DataTable, BarChart, LineChart, PieChart
src/app/(protected)/relatorios/   page.tsx (landing) + [id]/page.tsx (relatório)
src/components/users/user-form-dialog.tsx  +etapa "Acesso" (Step 1|2|3)
src/lib/actions/users.ts          createUser aceita domínios (persistência transacional)
src/lib/constants/nav.ts          +item Relatórios
```

## 10. Testes

- Builders de fato — derivação `raw → fato` (incl. filtro `saldo>0` em parado,
  exclusão `quantidade=0` em movimento, join de família/marca/vrSaldo).
- RBAC por domínio — as 3 camadas; foco: `manager`/`viewer` sem o domínio não
  acessam (nem nav, nem página, nem dados); regra de concessão (§4.1).
- Templates — render com dado, "sem dado", "fato não preparado", e erro.
- Queries de leitura — agregação correta + revalidação de RBAC + sinalização de
  estado de fato.
- Verificação: `tsc`, `lint`, `next build`, `jest`; UAT visual dos 6 relatórios.

## 11. Resumo das decisões

| # | Decisão |
|---|---|
| 1 | Relatório = unidade de 4 camadas; nenhuma query lê `raw_*` direto. |
| 2 | RBAC por domínio, 3 camadas; `super_admin`/`admin` veem tudo (decisão consciente). |
| 3 | Concessão: quem edita o usuário concede; `manager` só concede o que possui. |
| 4 | `UserDomainAccess` (tabela); `ReportDomain` e o novo `AuditAction.user_domains_changed` são enums Prisma (migration). |
| 5 | Etapa "Acesso" é construção nova no modal (Step 1|2|3); só para `manager`/`viewer`; `create` persiste domínios na mesma transação; novo usuário nasce com zero domínios. |
| 6 | Backfill: `manager`/`viewer` existentes recebem o domínio `estoque` na migration. |
| 7 | 3 fatos com colunas/índices/joins definidos em §5; builders fazem rebuild completo. |
| 8 | `estoque.extrato` muda de `incremental` para `snapshot` (conserto de ingestão da F2). |
| 9 | 5 templates Recharts (dependência de produção nova); `DataTable` é componente novo genérico. |
| 10 | 6 relatórios de estoque (lote 1); R6 = pizza família + barra marca; R3/R5 = movimento físico. |
| 11 | Freshness dos relatórios vem de `last_*At` do `SyncState`, não de `record_count`. |
