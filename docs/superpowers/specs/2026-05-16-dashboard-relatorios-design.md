# F3 — Dashboard de Relatórios — Design (SPEC v1)

> Spec da Fase 3 do nexus-odoo. Brainstorm conduzido com o usuário em 2026-05-16.
> Versão: **v1** — passará por 2 reviews profundas (`CLAUDE.md` §6 [3]/[4]) → v2 → v3.

## 1. Objetivo

Entregar a **frente A** do nexus-odoo: o painel visual de relatórios. A F3 entrega
(a) a **infraestrutura do dashboard** — o padrão reutilizável de "um relatório",
o shell de navegação, o RBAC por domínio, os templates de visualização — e
(b) um **primeiro lote de 6 relatórios de estoque** sobre essa infraestrutura.
Relatórios futuros (outros domínios) entram depois repetindo o padrão, sem
reabrir arquitetura. Tudo lê do cache Postgres da F2; nada toca o Odoo ao vivo.

## 2. Escopo

**Dentro da F3:**

1. **Arquitetura "um relatório" de 4 camadas** + catálogo declarativo de relatórios.
2. **RBAC por domínio** — enforcement em 3 camadas (catálogo/nav, página, leitura).
3. **UI de concessão de domínios por usuário** — a etapa "Acesso" adiada da F1.
4. **5 templates de visualização** (Recharts): `KPICard`, `DataTable`, `BarChart`,
   `LineChart`, `PieChart`.
5. **Shell do dashboard** — rota `/relatorios` (grade de cards por domínio) e
   `/relatorios/[id]` (página de relatório).
6. **3 fatos** modelados/derivados no worker: `fato_estoque_saldo` (enriquecido),
   `fato_estoque_movimento` (novo), `fato_produto_parado` (novo).
7. **6 relatórios de estoque** — R1 a R6 (ver §8).

**Fora da F3 (registrado):**

- Relatórios de outros domínios (financeiro, fiscal, comercial) — lotes futuros.
- O construtor de relatórios in-app (F6, ver `docs/ideias/2026-05-16-construtor-relatorios.md`).
- Relatórios de faturamento por NF — viáveis agora (a F2 destravou os dados
  fiscais), mas ficam para o lote 2 da frente A.

## 3. Arquitetura: o padrão "um relatório"

Cada relatório é uma unidade isolada de **4 camadas**:

1. **Fato** (`fato_*`) — tabela tipada no cache, derivada da camada `raw` por um
   builder no worker (padrão da F2). Cada relatório declara o(s) fato(s) que consome.
2. **Query de leitura** — função server-side que lê o fato e devolve dados já
   agregados/prontos. Nenhuma lógica de negócio na UI. Revalida o RBAC (§4).
3. **Componente visual** — instancia um dos 5 templates de visualização (§6)
   com a definição declarativa do relatório.
4. **Entrada no catálogo de relatórios** — registro declarativo: `id`, `título`,
   `domínio`, `descrição`, `fato`, `template`, `ícone`. Alimenta nav e RBAC.

O dashboard é um **shell** que lê o catálogo, filtra pelos domínios do usuário e
monta a navegação. Adicionar o 7º relatório = nova entrada no catálogo + (se
preciso) um fato + uma query — sem mexer no shell nem na arquitetura.

**Modelo de templates (preparação para a F6):** os 6 relatórios são instâncias
parametrizadas dos 5 templates, não componentes sob medida. Cada template recebe
uma *definição de relatório* declarativa. Não se constrói um motor no-code
completo na F3 — mas a base declarativa fica pronta para a F6 estender.

## 4. RBAC por domínio

O acesso é por **domínio de negócio**, não relatório a relatório. Domínios:
`estoque`, `financeiro`, `fiscal`, `comercial`. Cada relatório declara seu domínio
no catálogo. Cada usuário tem um conjunto de domínios liberados. Regra única:
**o usuário vê um relatório se, e somente se, tem o domínio dele.**

**Enforcement em 3 camadas (nenhuma sozinha é suficiente):**
1. **Catálogo/nav** — o shell monta a grade já filtrada pelos domínios do usuário.
2. **Página do relatório** — o server component (`/relatorios/[id]`) valida o
   domínio antes de renderizar; URL direta fora do alcance → redirect/403.
3. **Query de leitura** — a função que lê o fato revalida o domínio antes de
   devolver dado. Mesmo que 1 e 2 falhem, nenhum dado vaza.

**Modelo de dados:**
- Novo enum/constante `ReportDomain` (`estoque`/`financeiro`/`fiscal`/`comercial`).
- Concessão usuário→domínios: tabela `UserDomainAccess` (`userId`, `domain`),
  ou um campo `Json`/array no `User`. **Decisão da spec:** tabela `UserDomainAccess`
  (relacional, auditável, consultável). `super_admin` e `admin` veem todos os
  domínios por padrão (não precisam de linhas). `manager`/`viewer` só veem
  domínios explicitamente concedidos.
- Toda alteração de concessão registra `AuditLog`.

**UI de concessão (etapa "Acesso" da F1):** no modal de usuário (`user-form-dialog`)
volta a etapa "Acesso" — agora com conteúdo real: seleção dos domínios que o
usuário pode ver. Disponível para quem gerencia usuários (regra da F1). O modal
volta a ter 3 etapas (Identidade → Acesso → Confirmação).

## 5. Fatos a modelar

| Fato | Origem (raw) | Alimenta | Status |
|---|---|---|---|
| `fato_estoque_saldo` | `raw_estoque_saldo_hoje` + join `raw_sped_produto` (família/marca) | R1, R2, R6 | existe na F2; **enriquecer** com família/marca |
| `fato_estoque_movimento` | `raw_estoque_extrato` | R3, R5 | **novo** |
| `fato_produto_parado` | `raw_estoque_saldo_hoje_duracao_dias` (+ saldo) | R4 | **novo** |

Cada fato é tabela Prisma tipada, com um builder no worker disparado após o sync
dos modelos-fonte (padrão da F2 — `src/worker/fatos/`). Schema exato de cada
fato sai da leitura dos field-maps na fase de planejamento.

## 6. Templates de visualização

Biblioteca: **Recharts**. Cinco templates reutilizáveis em `src/components/charts/`:

- **`KPICard`** — número único + rótulo + (opcional) variação.
- **`DataTable`** — tabela ordenável e pesquisável (estende o padrão `audits-table`).
- **`BarChart`** — comparação/ranking; barras horizontais ou verticais.
- **`LineChart`** — série temporal.
- **`PieChart`** — proporção/concentração (donut); ≤6 fatias, senão sugere barra.

Requisitos transversais (regras `ui-ux-pro-max` §10): `ResponsiveContainer`
para responsividade; **skeleton** no carregamento; **empty-state** quando não há
dado; **estado de erro** com ação de repetir; tooltips no hover; legendas
visíveis; gridlines de baixo contraste (token de borda); paleta de cores
categórica acessível e testada no dark mode (derivada do violet da marca +
conjunto categórico); números formatados em **pt-BR**; `tabular-nums` em colunas
numéricas; tabelas com `aria-sort`. Cada template recebe uma definição
declarativa (dados + config) — é o que a F6 vai parametrizar.

## 7. Shell do dashboard

- **`/relatorios`** — landing: grade responsiva de **cards de relatório**
  (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`), agrupada por domínio com cabeçalho
  de seção. Cada card: ícone, título, descrição curta, badge do domínio. Filtrada
  pelos domínios do usuário (RBAC camada 1). Estado vazio se o usuário não tem
  nenhum domínio.
- **`/relatorios/[id]`** — página do relatório: `PageShell` + `PageHeader` (com
  breadcrumb/voltar para `/relatorios`), controles de filtro/período no topo, e o
  template de visualização cheio dentro de um `Card`.
- Item **"Relatórios"** adicionado ao `NAV_ITEMS` (visível a todo usuário
  autenticado; o conteúdo é que filtra por domínio).
- Tudo no design system da F1 (`PageShell`, `PageHeader`, `Card`, tokens, dark
  mode, ícones lucide, `motion` fade-in).

## 8. Os 6 relatórios de estoque (lote 1)

Derivados do catálogo do agente-gestor (`docs/superpowers/research/2026-05-16-estoque-relatorios-gestor.md`).
Todos no domínio `estoque`.

| # | Relatório | Pergunta | Template | Fato |
|---|---|---|---|---|
| R1 | Saldo por produto e armazém | Quanto tenho de cada produto e onde? | `DataTable` | `fato_estoque_saldo` |
| R2 | Valor de estoque por armazém | Onde está concentrado o capital imobilizado? | `BarChart` | `fato_estoque_saldo` |
| R3 | Entradas vs. saídas por mês | Qual o pulso da movimentação? | `LineChart` | `fato_estoque_movimento` |
| R4 | Produtos parados | Que capital está encalhado? | `DataTable` + `KPICard` | `fato_produto_parado` |
| R5 | Top produtos movimentados | O que mais saiu/entrou? | `BarChart` | `fato_estoque_movimento` |
| R6 | Concentração por família e marca | Como é o mix do portfólio? | `PieChart` | `fato_estoque_saldo` |

> Numeração R1–R6 (consolidada; o catálogo do gestor citava R1–R8 com lacunas —
> aqui são 6 relatórios sequenciais).

## 9. Componentes e arquivos (visão macro)

```
src/worker/fatos/                 builders: fato-estoque-movimento, fato-produto-parado;
                                  fato-estoque-saldo enriquecido
prisma/schema.prisma              +FatoEstoqueMovimento +FatoProdutoParado
                                  +UserDomainAccess; FatoEstoqueSaldo enriquecido
src/lib/reports/catalog.ts        catálogo declarativo dos relatórios
src/lib/reports/domains.ts        ReportDomain + helpers de RBAC por domínio
src/lib/actions/report-data.ts    queries de leitura dos relatórios (revalidam RBAC)
src/lib/actions/domain-access.ts  server actions de concessão de domínio
src/components/charts/            KPICard, DataTable, BarChart, LineChart, PieChart
src/app/(protected)/relatorios/   page.tsx (landing) + [id]/page.tsx (relatório)
src/components/users/             etapa "Acesso" no user-form-dialog
src/lib/constants/nav.ts          +item Relatórios
```

## 10. Testes

- Builders de fato — testes de derivação `raw → fato`.
- RBAC por domínio — testes das 3 camadas; foco em garantir que `viewer`/`manager`
  sem o domínio não acessam (nem nav, nem página, nem dados).
- Templates de visualização — testes de render com dado, vazio, e erro.
- Queries de leitura — testes de agregação correta + revalidação de RBAC.
- Verificação: `tsc`, `lint`, `next build`, `jest`; UAT visual dos 6 relatórios.

## 11. Resumo das decisões

| # | Decisão |
|---|---|
| 1 | Relatório = unidade de 4 camadas (fato, query, componente, catálogo). |
| 2 | RBAC por **domínio**, enforcement em 3 camadas; `super_admin`/`admin` veem tudo. |
| 3 | Concessão usuário→domínio em tabela `UserDomainAccess`; UI na etapa "Acesso" do modal de usuário. |
| 4 | 5 templates de visualização (Recharts), parametrizáveis — base da F6. |
| 5 | F3 entrega 6 relatórios de estoque (lote 1); demais domínios em lotes futuros. |
| 6 | 3 fatos: `fato_estoque_saldo` (enriquecido), `fato_estoque_movimento` e `fato_produto_parado` (novos). |
| 7 | Shell `/relatorios` (grade por domínio) + `/relatorios/[id]` (página de relatório). |
