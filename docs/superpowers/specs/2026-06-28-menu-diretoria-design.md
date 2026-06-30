# Menu Diretoria , Spec de arquitetura (v3)

> Spec macro do novo menu **Diretoria**. Reproduz, de forma mais bonita, limpa e
> organizada, todo o conteúdo do painel HTML do cliente (inventário:
> `2026-06-28-menu-diretoria-inventario-html.md`), dentro do nosso design system,
> ligado ao dado real do cache. Liberdade criativa de layout/cor; referência
> visual: "Consumo do Agente Nex". Onde faltar dado, a gente agrega.
>
> v3 incorpora 2 reviews adversariais + verificação contra o dado real (banco dev
> conectado em 2026-06-28) + review de convergência. Entrega faseada em ondas.
> Modo autônomo, TDD, Opus, `ui-ux-pro-max` em toda UI.
>
> Correções da v3 (review de convergência): sync com acessor de fila lazy SEM
> side effects + branch explícito de `JOB_ONDEMAND` no worker (§6); caminho único
> do nav dinâmico (layout server resolve → prop → Sidebar) (§3); UfPicker é
> componente NOVO (não existe no projeto) (§4.5); Onda 0 decomposta com cadeia de
> dependência + tracks paralelos (§13); guard-rail de `db push` (§12); contrato de
> UF-scoping por onda (§9).

## 0. Mudanças da v1 para a v2 (achados aplicados)

- Sync manual reescrito (a v1 estava tecnicamente quebrada: lock no app, fila sem
  consumidor, ciclo global). Agora: `syncQueue.add` one-shot escopado, dedupe por
  jobId, sem tocar o scheduler.
- Tabela de **fidelidade** item-do-HTML → tratamento (nada some em silêncio).
- Gaps de dado confirmados contra o banco e marcados com plano (margem,
  hierarquia, reservado, seriais, compras-ativas).
- Período: presets do HTML não existem (só 4 hoje) + navegação por setas
  (period-navigator existe, não wired) + período por seção. Seção própria.
- RBAC: `admin` NÃO é bypass na Diretoria (só super_admin). Eixo de UF-scoping
  previsto. Refactor real do stepper orçado (hoje é fixo em 3 etapas).
- Nav dinâmico async (filterNav é síncrono/só-papel; não comporta capability).
- Ondas decompostas em tasks; mapa vai para a Onda 0; etapas de DADO explícitas.
- Seção "dados a agregar". Back-relations no schema. UX states/responsividade/a11y.

## 1. Objetivo e não-objetivos

**Objetivo.** Menu "Diretoria" na sidebar (acima de "Relatórios") reunindo, em
telas próprias e no nosso design system, tudo do HTML: Visão geral executiva,
Vendas, Pedidos & Entregas, Estoque & Compras, Agenda. Mais o RBAC granular por
usuário (configurado na tela de Usuários) que decide o que cada um vê.

**Não-objetivos / descartes explícitos (com motivo).**
- Não criar `PlatformRole` "diretoria" (é menu, não papel). Acesso por capability.
- Login do HTML: descartado (auth do sistema existe).
- Form de conexão/sync do Odoo: descartado (worker já sincroniza). Substituído por
  freshness + botão de sync manual isolado.
- **Contracheque** (HTML, painel de usuários): descartado nesta feature. É dado de
  RH sensível, não vem do Odoo, e foge de "relatórios executivos". Registrado como
  descarte; reabrir só se o usuário pedir.
- Temas dourado/prata do HTML: não portar paletas extras; usar o ThemeProvider
  existente + cores semânticas (§8).
- Não duplicar gestão de usuários nem config de Odoo.

## 2. Tabela de fidelidade (item do HTML → tratamento)

Legenda viabilidade de dado: **PRONTO** (fato+query existem), **QUERY** (fato
existe, criar query), **BUILDER** (dado em raw, criar fato+query), **SYNC** (campo
não está nem em raw, exige sincronizar do Odoo), **N/D** (não há fonte; decisão).

| Item HTML | Tela Diretoria | Tratamento | Dado |
|---|---|---|---|
| C2 indicadores do período | Vendas | reproduz | PRONTO (fato_pedido/nota) |
| C3 vendas por estado (mapa) | Vendas + Visão geral | reproduz | QUERY (nota→parceiro.uf) |
| C4 vendas por marca | Vendas | reproduz | QUERY (nf_item→produto.marcaNome) |
| C5 pedidos fechados / ranking vendedor | Vendas | reproduz (vendedor plano) | PRONTO (queryPedidosPorVendedor) |
| C6 modalidades + maior pedido | Vendas | adapta (definir "modalidade"=operacaoNome) | QUERY |
| C7 itens vendidos | Vendas | reproduz | PRONTO (queryProdutosFaturados) |
| C8/C9 comparativo de 2 estados | Vendas (ligado ao mapa) | reproduz | QUERY |
| C10 formas de pagamento (donut) | Vendas | reproduz | QUERY (fato_pedido_parcela.formaPagamentoNome) |
| hierarquia comercial 5 níveis | Vendas | adapta: v1 vendedor plano; evoluir com de-para | BUILDER/SYNC (raw tem matéria-prima; níveis nomeados exigem de-para) |
| margem (C2/C5/B2) | Vendas/Pedidos | adapta: margem aproximada (receita − precoCusto×qtd) com rótulo "estimada"; margem real = onda de dado | BUILDER (custo por linha não existe em fato) |
| B1 a entregar / B2 pendentes | Pedidos | reproduz (sem coluna reserva física) | PRONTO/QUERY (etapa, atraso, cliente+uf) |
| B3 dívida com clientes | Pedidos | reproduz | PRONTO (queryContasAReceber) |
| B4 mapa de demandas por estado | Pedidos | reproduz | QUERY |
| B5 detalhe do pedido (drill-in) | Pedidos | reproduz | PRONTO (fato_pedido + parcelas + itens) |
| B6 visão geral demandas | Pedidos | reproduz | QUERY |
| B7 máquinas: disponível | Pedidos | reproduz só disponível | PRONTO (fato_estoque_saldo) |
| B7 "% reservado" / reserva física | Pedidos | adiar: sem fonte | SYNC (reserved_quantity do Odoo) |
| B8 itens em pedidos ativos (período próprio) | Pedidos | reproduz com período por seção | QUERY |
| A2 estoque por local (mapa) | Estoque | reproduz | PRONTO/QUERY |
| A3 catálogo + estoque ideal configurável | Estoque | reproduz; ideal = config nova | PRONTO + model config |
| A4 indicadores (idade, cobertura) | Estoque | reproduz | PRONTO (queries de estoque) |
| A5 distribuição (categoria/fornecedor) | Estoque | reproduz | PRONTO |
| A6 lista de seriais | Estoque | reproduz | BUILDER (raw_sped_produto_lote_serie=8721) |
| A7 compras (contagem regressiva/comprador) | Estoque | reproduz | BUILDER (raw_pedido_documento: data_prevista, comprador_id) |
| A8 compras por fornecedor (nota recebida) | Estoque | reproduz | PRONTO (queryNotasRecebidasPorFornecedor) |
| A8 lead time / atraso / alertas configuráveis | Estoque | reproduz; alertas = config nova | BUILDER + model config |
| Visão geral executiva | Visão geral | nova (agrega) | mix |
| Agenda (eventos/colab/anexos) | Agenda | reproduz | NOVO schema (não-Odoo) |
| Painel de Usuários (gestão) | (integra /usuarios) | não duplica; RBAC vai pro stepper | n/a |
| RBAC por UF (usuário vê só seus estados) | RBAC | reproduz como UF-scoping | model (§4) |
| contracheque / cargo / foto | , | descartado (contracheque) / cargo vira atributo de vendedor | N/D |
| FAB sparkle | global | já existe (lançador Nex); manter | n/a |
| navegação por setas nos gráficos | todas | reproduz (period-navigator) | componente existe |
| modais de período por seção (B8/C8) | Pedidos/Vendas | reproduz (período namespaced) | §5 |

## 3. Navegação

Item novo em `NAV_ITEMS` (`src/lib/constants/nav.ts`), **entre** Dashboard (L37) e
Relatórios (L38), submenu padrão "Agente Nex" (`href "/diretoria"` = prefixo):

```
Diretoria  (icon lucide Building2)
├── Visão geral         /diretoria/visao-geral
├── Vendas              /diretoria/vendas
├── Pedidos & Entregas  /diretoria/pedidos
├── Estoque & Compras   /diretoria/estoque
└── Agenda              /diretoria/agenda
```

- **Caminho único (cravado na v3).** Hoje a `Sidebar` é **client** (`"use
  client"`), importa `NAV_ITEMS` como const e o usa em dois pontos:
  `filterNav(NAV_ITEMS, user)` (`sidebar.tsx:93`) e o init de `openGroups` que
  itera `NAV_ITEMS` (`:100`). O layout passa **só** `user` à Sidebar (`layout.tsx:106`).
  Como capability é async (`UserDiretoriaAccess`), `filterNav` síncrono não serve.
  Decisão única (sem alternativas): o **layout server** `(protected)/layout.tsx`
  resolve o nav final no servidor , `filterNav(NAV_ITEMS, user)` por papel **+**
  `diretoriaNavFor(user)` para os children da Diretoria por capability , e passa o
  resultado como **prop `nav`** à `Sidebar`. A `Sidebar` **deixa de importar
  `NAV_ITEMS`** e de chamar `filterNav` no cliente: consome `props.nav` nos dois
  pontos (`:93` e `:100`). Pontos tocados: `layout.tsx` (resolver+prop),
  `sidebar.tsx` (remover import de `NAV_ITEMS`, trocar `:93` e `:100` para usar a
  prop). Nota de perf: `diretoriaNavFor` adiciona uma query por carregamento de
  página protegida (o layout é compartilhado); cachear por request.
- `/diretoria` redireciona para a 1ª área permitida (Visão geral por padrão).
- Layout interno por área: **abas internas** quando a área tem >4 sub-relatórios
  (Vendas, Pedidos, Estoque); seções empilhadas quando ≤4. Regra objetiva, não
  "decisão na onda".

## 4. RBAC granular da Diretoria

### 4.1 Princípios
- `super_admin` ⇒ bypass total (sem config, sem query). Helper
  `seesAllDiretoria(role) = role === "super_admin"` , **diferente** de `seesAll`
  de relatórios (que inclui admin). Para a Diretoria, `admin` é configurável.
- `admin`/`manager`/`viewer`: capabilities = `union(default por papel, grants do
  usuário)`. Grants são overrides explícitos.
- Eixo de **UF-scoping**: um usuário pode ser limitado a UFs (um regional vê só
  seus estados). As queries da Diretoria recebem o filtro de UFs do usuário.

### 4.2 Persistência (models novos, aditivos)
```prisma
model UserDiretoriaAccess {
  id          String   @id @default(cuid())
  userId      String
  capability  String                 // ex "diretoria.vendas.view"
  grantedById String?
  createdAt   DateTime @default(now())
  user        User     @relation("UserDiretoriaAccess", fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, capability])
  @@index([userId])
}
model UserDiretoriaUf {
  id     String @id @default(cuid())
  userId String
  uf     String                       // sigla; ausência = todas as UFs
  user   User   @relation("UserDiretoriaUf", fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, uf])
}
```
`User` ganha back-relations: `diretoriaAccess UserDiretoriaAccess[] @relation("UserDiretoriaAccess")` e `diretoriaUfs UserDiretoriaUf[] @relation("UserDiretoriaUf")`.

### 4.3 Catálogo de capabilities (extensível)
`diretoria.{visao_geral,vendas,pedidos,estoque,agenda}.view`,
`diretoria.{vendas,pedidos,estoque}.export` (reusa `export-csv` do DataTable),
`diretoria.agenda.manage`, `diretoria.sync.force`. Sub-relatório pode descer
(`diretoria.vendas.pagamentos.view`); conjunto fino fechado na Onda 6.

### 4.4 Backend (`src/lib/diretoria/access.ts`)
`DIRETORIA_CAPABILITIES`, `defaultCapabilitiesFor(role)`, `userCapabilities(user)`
(super_admin ⇒ todas), `userUfs(user)` (vazio ⇒ todas), `canDiretoria(user, cap)`,
guards `requireDiretoriaArea(area)` (redirect 1ª permitida / `/dashboard`),
`diretoriaNavFor(user)`. Defaults v1 (ajuste fino na Onda 6): super_admin todas;
admin todas as `.view`+`.export`+`.sync.force`; manager `.view` das áreas
operacionais (escopado por UF); viewer `.view` de visão geral apenas (evita vazar
detalhe comercial a perfil baixo). Toda checagem é **server-side** nos guards de
página + nas server actions; UI só esconde.

### 4.5 Integração na tela de Usuários (Onda 6) , refactor real
A tela é um **dialog com stepper fixo** (`user-form-dialog.tsx`): tipo `Step =
1|2|3`, `temEtapaAcesso = manager||viewer` (`:214`), `AccessStep` só p/ manager/
viewer. Para a Diretoria: (a) generalizar `Step` para lista dinâmica de etapas;
(b) nova etapa "Diretoria" visível para admin/manager/viewer (não super_admin);
(c) subcomponente `diretoria-access-step.tsx` (checkboxes por área/ação + seletor
de UFs , **componente NOVO** `uf-picker.tsx`: o "UfPicker" do inventário é do HTML
do cliente, não existe no nosso código, logo é construção, não reuso); (d) server
action `updateUserDiretoriaAccess` (paralela a `updateUserDomains`: diff add/
remove, validação, `$transaction`, audit). Pontos do refactor do stepper a
enumerar no plano da Onda 6: tipo `Step` (hoje `1|2|3`), `temEtapaAcesso`
(`:214`, exclui admin , a etapa Diretoria INCLUI admin, então precisa de predicado
próprio `temEtapaDiretoria`), `ultimaEtapa` (`:215`), `handleRoleChange`
(internals), `stepperItems` (`:402`), render condicional por etapa (`:474`), clamp
next/prev (`:291`/`:295`). Não tratar como cópia trivial do `AccessStep`.

## 5. Período e navegação temporal

- **Presets do HTML** (Hoje, Esta semana, Este mês, Mês atual, Ano atual, Ano
  anterior, Últimos 7/30/90 dias, Personalizado) NÃO existem: hoje `PeriodoPreset
  = mes|3meses|ano|tudo|custom` (`src/lib/reports/periodo.ts`). Para não regredir o
  menu Relatórios, criar um **`DiretoriaPeriodBar`** próprio + `resolverPeriodoDir`
  com os presets do HTML, sem tocar o `periodo.ts` compartilhado. ("Este mês" e
  "Mês atual" são o mesmo conceito: expor um só rótulo, "Este mês".)
- **Navegação por setas** (avançar/voltar dia/mês), destacada pelo cliente:
  reusar/adaptar `src/components/dashboard/period-navigator.tsx` (existe, navega
  dia/semana/mês, ainda não wired). Aplicar nos gráficos de série (Visão geral,
  C7, B8) e onde o HTML navega.
- **Período por seção**: período é global por tela na URL (`periodo/de/ate`);
  seções com período próprio (B8, comparativo C8/C9) usam chave **namespaced**
  (`b8_periodo`, `cmp_de`/`cmp_ate`) para não colidir com o global.

## 6. Sync manual isolado (reescrito)

- Indicador `FreshnessIndicator` no header de cada tela (reuso).
- **Encanamento (corrigido na v3, era o furo da v2).** Importar `syncQueue` de
  `src/worker/index.ts` é PROIBIDO: aquele módulo, no load, instancia 5 `new
  Worker(...)` e chama `bootstrap()` (reagenda crons). Importá-lo no app subiria
  workers fantasma e reagendaria schedulers (justamente o bug que queremos evitar).
  - Criar um **acessor de fila lazy SEM side effects** para `ODOO_SYNC_QUEUE`,
    espelhando `mcp/sync/queue.ts` (`getDirectedSyncQueue()`: cria `new Queue`
    lazy com conexão Redis própria, zero `Worker`). Ex.:
    `src/worker/sync/ondemand-queue.ts` exporta `getOndemandSyncQueue()`.
  - A constante `JOB_ONDEMAND` mora em `src/worker/jobs.ts` (módulo PURO, só
    constantes, sem side effect) ao lado de `JOB_INCREMENTAL`.
  - A server action `forcarSyncDiretoria(escopo)` importa **apenas** o acessor +
    a constante e faz:
    `getOndemandSyncQueue().add(JOB_ONDEMAND, { models }, { jobId: "ondemand:"+hash(models), removeOnComplete: true, removeOnFail: true })`.
    **Nunca** `upsertJobScheduler`/`every`. `jobId` determinístico ⇒ dedupe
    nativo (cliques repetidos não empilham). `removeOnFail` evita job preso no
    failed set bloqueando re-add.
- **Branch explícito no worker (não é "adicionar no rodarCiclo" trivial).** O
  handler de `ODOO_SYNC_QUEUE` (`src/worker/index.ts:351-418`) hoje faz, para
  qualquer job, `adquirirLock(job.name)` → `rodarCiclo(job.name)`, e `rodarCiclo`
  só conhece incremental/snapshot/reconcile (logo `ondemand` seria no-op). Adicionar:
  - branch `if (job.name === JOB_ONDEMAND)` que adquire **de propósito**
    `lockKey(JOB_INCREMENTAL)` (serializa com o cron incremental; se ocupado,
    `skipped`), lê `job.data.models` e chama
    `processIncrementalCycle(ctx, MODEL_CATALOG.filter(e => models.includes(e.odooModel)))`.
    Confirmado que `processIncrementalCycle` aceita catálogo pré-filtrado
    (`processors.ts:69-74`) , escopo sem refactor profundo. Registrar que
    `runBuilders` roda todos os builders incrementais (idempotente, ok).
  - Como o lock usado é o do incremental, a server action pode **ler** `GET
    odoo-sync:lock:incremental` para o feedback "sincronização já em andamento"
    (best-effort, coerente com o lock de fato usado).
- **Escopo por modelo** desde a v1 (vendas→`sale.order`/`pedido.*`/`sped.documento`;
  estoque→`estoque.*`), evitando varredura global por clique. Cooldown no botão
  (30s) + feedback por polling do `SyncState`. Rebuild do `app` (gera a imagem do
  worker) após tocar `src/worker/**`.
- **Testes**: (a) não-regressão , `forcarSyncDiretoria` não importa
  `worker/index.ts` nem chama `upsertJobScheduler`; schedulers repeat seguem
  agendados após o disparo; (b) dedupe por jobId não duplica ciclo; (c) o branch
  `JOB_ONDEMAND` escopa o catálogo aos `models` e adquire o lock incremental.

## 7. Mapa do Brasil (spike na Onda 0)

Componente novo `src/components/diretoria/brazil-map/`, reusável (Vendas C3/C8/C9,
Pedidos B4, Estoque A2, Visão geral). Tratado como **spike/protótipo na Onda 0**
com critérios de aceite:
- Fonte: paths SVG dos 27 estados **locais** (geojson de domínio público
  embutido; sem rede). `viewBox` fixo; sem dependência externa.
- Choropleth valor→cor pela paleta semântica (§8); legenda de faixas.
- Interações: hover+tooltip, clique para selecionar; **seleção de 2 estados**
  alimenta o comparativo C8/C9 (amarração explícita). Ranking lateral por UF.
- **Animação caprichada**: entrada por UF (stagger), transição suave ao trocar
  métrica/período, micro-interação no hover. Técnica (Framer Motion vs CSS/SVG)
  decidida no spike por perf (27 paths animando a 60fps em tela grande).
- API: `data: Array<{ uf, valor, label? }>`, `metric`, `onSelect(ufs)`. Cego à
  origem. Acessível (teclado/aria), responsivo (degrada para lista/ranking em
  telas estreitas).
- Critério de saída do spike: protótipo aprovado (perf + interação + a11y) antes
  de plugar dado real na Onda 1.

## 8. Cores semânticas

Tokens próprios (Tailwind v4 theme / CSS vars) coerentes com o dark: verde
(positivo), vermelho (negativo/atraso), azul (informativo), amarelo (atenção),
além do roxo de accent. Alimentam deltas de KPI (▲/▼), badges de status (no prazo
/ atrasado), faixas do mapa e a contagem regressiva. `ui-ux-pro-max` fixa a paleta
exata na Onda 0, sem quebrar o design system.

## 9. Padrão de tela (reuso máximo)

Esqueleto de `relatorios/[id]/page.tsx`: `force-dynamic` → `requireDiretoriaArea`
→ `reportFreshness` → resolver período → montar dados no server (com filtro de UF
do usuário) → `<PageShell>` + `<PageHeader>` + client. Reuso direto: `PageShell`,
`PageHeader`, `FreshnessIndicator`, `KPICard`, `ChartCard`, `DataTable` (paginação
+ export CSV já embutidos), `BarChart`/`LineChart`/`PieChart`, `AppliedFiltersChips`,
`PresetsPopover`. Novos: `DiretoriaPeriodBar`, mapa, comparativo de estados, card
de contagem regressiva, calendário. Filtros dropdown por tela (estados, status,
fornecedores, modelos, UFs) definidos por uma matriz tela×filtros na onda de cada
área, com fonte de dado e aplicação server-side.

**Contrato de UF-scoping (retrofit por onda 1-4).** As queries atuais
(`src/lib/reports/queries/*`) não recebem filtro de UF. A Onda 0 entrega só
`userUfs(user)` em `access.ts` (não bloqueia). Cada onda de área (1-4) que monta
seções com recorte geográfico aplica o filtro: as queries novas nascem com um
parâmetro opcional `ufs?: string[]` e as seções server passam `userUfs(user)`
(vazio ⇒ todas). Para fatos sem UF direta (pedido/nota), o filtro é por
`participanteId ∈ parceiros com uf ∈ ufs`. Marcado como trabalho de cada onda,
não retrabalho surpresa.

## 10. Dados: pronto, criar, gap

- **Populado e pronto**: fato_pedido, fato_nota_fiscal(_item), fato_pedido_parcela,
  fato_parceiro, fato_produto, fato_estoque_saldo, fato_financeiro_titulo, fato_dfe.
- **Vazios** (ativar builder/sync antes de prometer a seção): `fato_comissao`
  (comissões), `fato_cotacao`, `raw_crm_pipeline`. Onda 0 confirma e ativa o que
  for viável; comissão pode virar gap se não houver dado no Odoo.
- **Queries a criar** (fato existe): C3 (vendas/UF), C4 (vendas/marca), C6
  (modalidades), C8/C9 (comparativo), C10 (pagamentos), B2 (cliente+UF), B6.
- **Builders a criar** (dado em raw, populado): `fato_serial` (A6, de
  `raw_sped_produto_lote_serie`), `fato_compra` (A7/A8 ativas, de
  `raw_pedido_documento`: data_prevista, comprador_id, valores), margem por linha
  (de `raw_sped_produto_lote_serie.valor_custo` ou `raw_pedido_documento.al_margem`).
- **Gap sem fonte (SYNC novo do Odoo)**: quantidade reservada de estoque
  (`reserved_quantity`) para "% reservado" (B7); hierarquia comercial nomeada de 5
  níveis (raw tem nível/superior de departamento + gerente por pedido, mas o
  de-para dos rótulos do cliente exige sync/config). Tratados como evolução, com a
  versão viável entregue (disponível sem reservado; vendedor plano).

## 11. Dados a agregar além do HTML (diretriz do usuário)

Itens viáveis com o cache atual, a oferecer como valor extra (cada um com dono em
uma onda; ativáveis conforme o usuário priorizar):
- **Comparativo ano a ano (YoY)** usando o preset "Ano anterior" (faturamento,
  pedidos, ticket) , viável com os fatos atuais.
- **Aging de recebíveis/pagáveis** (faixas de vencimento) , `fato_financeiro_titulo`.
- **Ticket médio por UF e por vendedor**, mix por marca , fatos atuais.
- **Sazonalidade / série mensal** com navegação por setas , fatos atuais.
- **Metas x realizado** (exige model novo `DiretoriaMeta`) , decidir na Visão
  geral se entra (depende do usuário fornecer metas).

## 12. Modelo de dados novo (aditivo, com back-relations)

- RBAC: `UserDiretoriaAccess`, `UserDiretoriaUf` (§4.2) + back-relations em `User`.
- Config: `DiretoriaEstoqueIdeal` (produto/local → quantidade ideal, A3/A4) e
  `DiretoriaAlertaFornecedor` (limiares de alerta A8), ou consolidar em `AppSetting`
  JSON (decidir na Onda 3 pela complexidade de query).
- Agenda (Onda 5):
```prisma
enum DiretoriaEventoTipo { reuniao entrega inventario prospeccao carregamento organizacao_estoque assembleia visita }
model DiretoriaEvento {
  id String @id @default(cuid())
  titulo String
  tipo DiretoriaEventoTipo
  inicio DateTime
  fim DateTime?
  diaInteiro Boolean @default(false)
  descricao String?
  local String?
  criadoPorId String
  criadoPor User @relation("DiretoriaEventoCriador", fields: [criadoPorId], references: [id])
  colaboradores DiretoriaEventoColaborador[]
  anexos DiretoriaEventoAnexo[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([inicio])
}
model DiretoriaEventoColaborador {
  id String @id @default(cuid())
  eventoId String
  userId String
  evento DiretoriaEvento @relation(fields: [eventoId], references: [id], onDelete: Cascade)
  user User @relation("DiretoriaEventoColaborador", fields: [userId], references: [id])
  @@unique([eventoId, userId])
}
model DiretoriaEventoAnexo {
  id String @id @default(cuid())
  eventoId String
  nome String
  url String
  mime String?
  tamanho Int?
  evento DiretoriaEvento @relation(fields: [eventoId], references: [id], onDelete: Cascade)
}
```
`User` ganha as back-relations nomeadas correspondentes. Anexos: storage a definir
(começar por URL/referência; upload real fica para o fim da Onda 5).

**Estratégia de migration (Postgres dev compartilhado, branch longa).** O
`docker/entrypoint.sh` roda `prisma migrate deploy` em prod (db push é local-only,
compatível). Guard-rails para não corromper o banco dev compartilhado:
- `prisma db push` apenas dos models NOVOS (`Diretoria*`, `UserDiretoria*`);
  **nunca** alterar tabelas existentes via push.
- Rodar `agente schema-changed` no **primeiro** push (não só no fim), para as
  outras worktrees verem o aviso. Coordenar com `feat/nex-reconstrucao` (ativa).
- Consolidar a(s) migration(s) formais (`prisma migrate dev`) só perto do merge,
  validando contra o histórico para evitar drift.

## 13. Faseamento decomposto (cada onda vira N tasks pequenas)

Regra de granularidade (do protocolo): cada sub-relatório = tasks separadas
(query/builder → adapter → seção UI → teste). Cada onda: TDD, `tsc` limpo, `jest`
verde, **E2E contra dado real** quando entrega relatório, rebuild de container
quando toca caminho consumido por container, commit atômico por bloco, STATUS/
HISTORY atualizados, PR ao fim (merge com confirmação do usuário). Sem trava F6.

### Onda 0 , Fundação
Onda multi-frente (a única sem sub-relatórios para guiar o corte). Decomposta em
uma **cadeia sequencial** (cada elo depende do anterior) e **tracks paralelos**
independentes.

**Cadeia sequencial (ordem obrigatória):**
1. Models `UserDiretoriaAccess` + `UserDiretoriaUf` + back-relations em `User`
   (db push, guard-rail §12). `agente schema-changed`.
2. `src/lib/diretoria/access.ts`: `DIRETORIA_CAPABILITIES`,
   `defaultCapabilitiesFor`, `userCapabilities` (super_admin bypass),
   `seesAllDiretoria` (só super_admin), `userUfs`, `canDiretoria`. (TDD primeiro.)
3. Guards: `requireDiretoriaArea(area)` + `diretoriaNavFor(user)`.
4. Integração do nav: `(protected)/layout.tsx` resolve nav final (papel +
   capability) e passa prop `nav`; `Sidebar` consome a prop e para de importar
   `NAV_ITEMS`/rodar `filterNav` no cliente (§3). Item Diretoria aparece.
5. Rotas e shell das 5 telas (`/diretoria/*` + redirect de `/diretoria`), cada
   uma com header + `DiretoriaPeriodBar` + `FreshnessIndicator` (placeholder de
   conteúdo), já protegidas pelos guards.

**Tracks paralelos (independentes da cadeia, podem ir a qualquer momento):**
- A. `DiretoriaPeriodBar` (presets do HTML, §5) + `resolverPeriodoDir` + wiring do
  `period-navigator` (setas).
- B. Tokens de cores semânticas + helpers de delta/status/contagem regressiva (§8).
- C. **Spike do Mapa do Brasil** (critérios §7) com dados mock + harness de teste.
- D. **Sync manual isolado**: `JOB_ONDEMAND` em `jobs.ts` + acessor de fila lazy +
  branch no worker + `forcarSyncDiretoria` + botão no header (§6).
- E. Confirmar fatos vazios via `SELECT count(*)` (comissão/cotação) e registrar
  quais builders ativar (§10).

**Testes da Onda 0:** access (bypass super_admin / defaults por papel / union de
grants / UF), `diretoriaNavFor` + nav por prop, redirect de `/diretoria`, mapa
(render/binding/estados vazio-erro/a11y), sync isolado (não importa worker/index,
não toca scheduler, dedupe por jobId, branch escopa catálogo). `tsc` + `jest`
verdes; rebuild do `app` (toca `src/worker/**`).

### Onda 1 , Vendas (módulo C)
Tasks por seção: C2 (PRONTO), C3 (criar query UF + ligar mapa), C4 (criar query
marca), C5 (ranking vendedor, PRONTO), C6 (modalidade=operacaoNome), C7 (PRONTO),
C8/C9 (comparativo via seleção dupla no mapa), C10 (criar query pagamentos),
margem estimada com rótulo. E2E real contra fato_pedido/nota/parcela. Gating por
capability + UF-scoping.

### Onda 2 , Pedidos & Entregas (módulo B)
B1/B2 (etapa/atraso + cliente+UF), B3 (a receber, PRONTO), B4 (mapa demandas), B5
(drill-in do pedido: contrato de navegação + estado), B6 (visão geral), B7
(disponível; reservado fica como gap sinalizado), B8 (itens ativos com período por
seção). E2E real. Gating.

### Onda 3 , Estoque & Compras (módulo A)
Reusa as 6 queries de estoque. Novos: `fato_serial` (A6) + query; `fato_compra`
(A7/A8 ativas) + query (contagem regressiva, lead time, dias de atraso, comprador);
config de estoque ideal (A3/A4) e alertas A8 (model/AppSetting). A8 é sub-onda
(tabela 13 colunas + matriz + alertas). E2E real. Gating.

### Onda 4 , Visão geral (home executiva)
KPIs globais (faturamento, pedidos, a receber, a pagar, valor de estoque), mapa em
destaque (alterna vendas/demandas), tendência com setas, cards de drill-in,
agregados YoY (§11). E2E real. Gating.

### Onda 5 , Agenda
Schema (§12) via db push, server actions CRUD, calendário (mês/dia), eventos
tipados, colaboradores, anexos (URL→upload no fim), filtros, gating view×manage.
Testes de actions/regras/render.

### Onda 6 , RBAC Diretoria na tela de Usuários
Refactor do stepper (§4.5), `diretoria-access-step` (capabilities + UFs),
`updateUserDiretoriaAccess`, defaults refinados com o detalhamento do usuário,
audit, migration formal consolidada (db push → migration), `agente schema-changed`.
E2E de conceder/revogar refletindo no menu e nas telas.

## 14. Estratégia de testes (TDD)

- Unit (jest): `access.ts` (bypass/defaults/union/UF), guards, queries/adapters
  novos (fixtures), helpers (delta/cor/contagem regressiva/lead time), server
  actions (sync, agenda, diretoria-access), `diretoriaNavFor`.
- Component/render: seções de cada tela, mapa (binding + vazio/erro + a11y),
  calendário, comparativo de estados.
- E2E contra dado real (regra de raiz): subir serviço, exercer cada tela contra o
  cache, conferir números (margem estimada coerente, totais por UF batendo).
- Não-regressão: scheduler intacto pós sync manual; menu/telas respeitam
  capability+UF; super_admin vê tudo; Relatórios existente não regride.

## 15. UX states, responsividade, acessibilidade

Padrão sistemático (não só mapa): cada seção tem estados vazio/loading/erro
(reusar `chart-states`); skeletons no carregamento; toasts de erro com retry.
Responsivo: dashboards usáveis em tablet (mapa degrada para ranking em telas
estreitas; tabelas com scroll horizontal controlado). A11y: navegação por teclado,
aria nos gráficos/mapa, contraste das cores semânticas no dark validado.

## 16. Relação Diretoria × Relatórios

Coexistem, com propósitos distintos: **Relatórios** = operacional por domínio
(detalhe, drill, export por relatório); **Diretoria** = visão executiva
consolidada e cross-domínio com o mapa e agregados. Estoque aparece nos dois sem
duplicar lógica: ambos consomem as mesmas queries; a Diretoria compõe visões
executivas. Nada é deprecado nesta feature.

## 17. Riscos e mitigação

- Mapa performático com animação: spike na Onda 0 com critério de perf.
- Sync manual × cron: fila própria one-shot + dedupe jobId + lock no worker +
  teste de não-regressão (§6).
- Margem/reservado/hierarquia/seriais/compras: gaps de dado confirmados; plano
  por categoria (§10); validar cada número contra o banco antes de cravar.
- Branch longa em Postgres compartilhado: `db push` local + migration só no fim +
  aviso (§12). Coordenar com `feat/nex-reconstrucao`.
- Fatos vazios (comissão/cotação): confirmar/ativar na Onda 0; rebaixar a gap se
  o Odoo não expõe.
- Ondas-épico: decompostas em tasks por sub-relatório (§13); A8 e o mapa isolados.

## 18. Decisões canônicas desta feature

1. Diretoria é menu, não papel; acesso por capability + UF-scoping; só super_admin
   bypassa (admin é configurável aqui, ao contrário de Relatórios).
2. Reuso máximo do design system e dos componentes de charts/reports.
3. Mapa do Brasil é componente novo, reusável, com animação caprichada (spike).
4. Sync manual é one-shot escopado isolado; jamais altera o scheduler do cron.
5. Não duplicar gestão de usuários nem config de Odoo; contracheque descartado.
6. Dado real sempre; gaps confirmados têm plano (criar query/builder ou sync novo);
   E2E contra o cache antes de declarar pronto. Verdade contra o dado.
7. Onde faltar dado e for viável, agregar valor (YoY, aging, ticket por UF).
