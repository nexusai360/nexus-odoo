# F4 Onda 2, Correções Rodada 2, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Executar na
> sessão principal, inline, Opus 4.7, **sem subagentes** (instrução explícita do usuário).
> Todo trabalho de frontend (layout, componente, ícone, tipografia, cor, espaçamento)
> **obriga** consultar a skill `ui-ux-pro-max` antes e durante. Steps com checkbox `- [ ]`.
> Este arquivo é o ponto de retomada se o contexto for resumido.

**Goal:** Aplicar a segunda rodada de correções da F4 Onda 2 pedida pelo usuário em 2026-05-21,
com excelência de construção: documentação do MCP clonada do nexus-nfe, painel de Chaves de
Acesso redesenhado, Logs com filtro sensato, Plugar MCPs enxuto, bubble do Agente Nex
responsivo, perfil do sidebar maior, tour de onboarding nas telas de Integrações.

**Architecture:** Branch `feat/f4-onda2-mcp-escrita`. Stack Next.js 16 + React + TS + Tailwind v4
+ base-ui + framer-motion + Prisma v7. Tudo reusa componentes existentes do projeto. A doc do MCP
passa a ser um componente único no estilo do nexus-nfe (sidebar scrollspy, hero, blocos de seção,
CodeBlock com realce, callouts), substituindo o trio `docs-layout/docs-renderer/docs-catalog`. O
tour clona o sistema do nexus-insights (provider + overlay + botão + definições por tela), com a
"primeira visita" persistida por usuário no backend para sobreviver a logout e troca de conta.

**Projetos de referência (pasta-mãe `Nexus AI/Projetos Internos`):**
- `nexus-nfe/src/app/(protected)/api-docs/api-docs-content.tsx`, doc a clonar.
- `nexus-insights/src/components/tour/*` e `src/lib/tours/*`, tour a clonar.

**Regra de escrita (todo o plano e todo texto produzido):** proibido o caractere travessão
(`—`). Usar vírgula, parênteses, dois-pontos ou ponto. Linguagem humanizada, de produto.

**Estado já feito (Tarefa 0, commitada):** regra do travessão no `CLAUDE.md §2` + memória
`feedback_no-em-dash`. O arquivo `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`
já existe como **cópia crua** do `api-docs-content.tsx` do nexus-nfe (ponto de partida da Área A).

---

## File Structure

**Criar:**
- `src/components/tour/tour-provider.tsx`, `tour-overlay.tsx`, `tour-button.tsx` (clonados do nexus-insights).
- `src/lib/tours/webhook-tour.ts`, `servidor-mcp-tour.ts`, `canais-tour.ts`.
- `src/lib/actions/user-tour.ts` (marcar/consultar tour visto).
- `prisma/migrations/<ts>_user_tour_seen/migration.sql`.

**Modificar:**
- `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx` (adaptar a cópia para o MCP).
- `src/app/(protected)/integracoes/servidor-mcp/docs/page.tsx` (usar o novo componente).
- `src/components/integracoes/servidor-mcp/chaves-lista.tsx` (modais, capabilities, toggle).
- `src/components/integracoes/servidor-mcp/logs-timeline.tsx` (busca única, filtro sensato).
- `src/components/agent/plugar-mcps-content.tsx` (texto enxuto).
- `src/components/agent/agent-bubble.tsx` (dimensões responsivas).
- `src/components/layout/sidebar.tsx` (bloco de perfil maior).
- `prisma/schema.prisma` (model `UserTourSeen`).
- `src/lib/actions/mcp-api-keys.ts` (action de habilitar/desabilitar, se faltar).
- `STATUS.md`, `docs/agents/HISTORY.md`.

**Remover (após a Área A):**
- `src/components/integracoes/servidor-mcp/docs-layout.tsx`, `docs-renderer.tsx`, `docs-catalog.tsx`.

---

## Design Contract (vale para toda task de frontend)

Antes de qualquer task com `[UI]` no título: **consultar `ui-ux-pro-max`** (checklist de
qualidade visual, tipografia, espaçamento, acessibilidade). Princípios fixos:
- Reusar os componentes do projeto: `Dialog`, `Switch`, `CustomSelect`, `Input`, `Label`, `Button`.
- Tipografia na escala do sistema; nada de fonte fora do padrão.
- Sem emoji como ícone; ícones Lucide.
- Sem o caractere travessão em nenhum texto.
- Campo obrigatório: label com asterisco vermelho (padrão do projeto, a ser localizado na B2).
- Estados: loading, vazio, erro sempre tratados.
- A doc do MCP clona a **estrutura e o layout** do nexus-nfe (sidebar scrollspy, hero, blocos,
  CodeBlock, callouts, cards), mas usa os **tokens de tema do nexus-odoo** (`bg-card`,
  `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, acento `violet-500`)
  no lugar das cores `zinc-*` cravadas do nexus-nfe. Motivo: a doc é uma aba dentro do painel
  Servidor MCP (não uma página isolada) e precisa respeitar tema claro/escuro e integrar com o
  `PageShell`/`PageHeader`/`ServidorMcpNav`. Blocos de código podem manter superfície escura
  consistente (`bg-zinc-950` é aceitável só dentro do `CodeBlock`).

---

# ÁREA A — Documentação do MCP clonada do nexus-nfe

> Prioridade do usuário. A doc atual (markdown render) foi reprovada. O alvo é a estrutura
> do `api-docs-content.tsx` do nexus-nfe: sidebar com scrollspy, hero com título + URL +
> badges + atalhos, blocos de seção com ícone, `CodeBlock` com abas e realce, `Tip`/`Warning`,
> tabelas de parâmetros, cards expansíveis, rodapé. Clonar estrutura, trocar conteúdo para o MCP.

## Task A1 [UI]: Preparar a base e mapear o conteúdo MCP

**Files:** `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx` (a cópia crua já existe).

- [ ] Consultar `ui-ux-pro-max` para a revisão de doc/página de referência.
- [ ] Confirmar que `framer-motion` está no `package.json` (já confirmado: `^11.18.2`).
- [ ] Ler o conteúdo atual de `src/content/mcp-docs/*.ts` (quickstart, autenticacao, permissoes,
  idempotencia, external-id, rate-limits, changelog) para reaproveitar texto real do MCP.
- [ ] Ler `src/lib/actions/mcp-catalog-schema.ts` (`getMcpCatalogSchema`, tipos `CatalogByModule`,
  `CatalogToolItem`) para saber o formato do catálogo de tools.
- [ ] Não escrever código nesta task; é levantamento. Sem commit.

## Task A2: Componentes estruturais (manter verbatim do clone)

**Files:** `mcp-docs-content.tsx`.

- [ ] Manter a lógica de `highlightJson`, `highlightCode`, `CodeBlock`, `Tip`, `Warning`,
  `containerVariants`, `itemVariants`, `scrollToSection` (são a assinatura visual). O `CodeBlock`
  pode manter superfície escura. Nos demais componentes, **trocar as cores `zinc-*` cravadas
  pelos tokens de tema** do nexus-odoo (ver Design Contract), para a doc integrar ao painel e
  respeitar tema claro/escuro.
- [ ] Renomear o export `ApiDocsContent` para `McpDocsContent`.
- [ ] Ajustar o tipo `Endpoint`: o MCP não tem método HTTP por tool; renomear para `ToolDoc` com
  campos `{ kind: "read" | "write"; name: string; title: string; description: string;
  tip?: string; params?: Param[]; args?: string; example: string; response: string }`.
  Adaptar `methodColors` para `kindColors` (`read` esmeralda, `write` violeta).
- [ ] `EndpointCard` vira `ToolCard`: badge mostra `READ`/`WRITE` em vez de método HTTP; o
  cabeçalho mostra o `name` da tool em `code`; corpo mostra descrição, tip, params, args (JSON),
  exemplo de chamada e resposta. Manter o visual (expansível, animação).
- [ ] `tsc` parcial não roda ainda (arquivo incompleto); seguir para A3.

## Task A3: Dados, navegação e seções textuais

**Files:** `mcp-docs-content.tsx`.

- [ ] Trocar `BASE` por `const BASE = "<URL pública do MCP>/api/mcp"` (derivar de
  `NEXT_PUBLIC_APP_URL`; aceitar string fixa de exemplo se ausente).
- [ ] Reescrever os helpers `curl/js/py`: o MCP usa **um** endpoint `POST /api/mcp` com corpo
  JSON-RPC (`{"jsonrpc":"2.0","method":"tools/call","params":{"name":...,"arguments":{...}}}`)
  e header `Authorization: Bearer mcp_live_...`. Gerar exemplos curl/JavaScript/Python coerentes.
- [ ] Reescrever o array `sections` para o MCP: Início, Autenticação, Conceitos, Fluxo de uma
  chamada, Tools (catálogo), Códigos de erro, Rate limits. Ícones Lucide adequados.
- [ ] Reescrever `concepts` (cards) para o MCP: Capabilities, Idempotência, External ID,
  RBAC em 7 camadas, Cache e frescor do dado. Texto reaproveitado de `src/content/mcp-docs`.
- [ ] Reescrever `errorCodes` para os erros reais do MCP (códigos JSON-RPC / HTTP usados pelo
  pipeline: 401 auth, 403 capability negada, 409 idempotência, 422 validação, 429 rate limit,
  500). Conferir contra `mcp/dispatcher` e classes de erro do `OdooClient` se necessário.

## Task A4: Catálogo de tools como dados

**Files:** `mcp-docs-content.tsx`, `src/app/(protected)/integracoes/servidor-mcp/docs/page.tsx`.

- [ ] O catálogo de tools vira a seção "Tools". Reaproveitar `getMcpCatalogSchema()` chamado no
  server component `docs/page.tsx` e passado como prop ao `McpDocsContent`.
- [ ] Mapear `CatalogByModule`/`CatalogToolItem` para `ToolDoc[]` agrupado por módulo.
- [ ] Renderizar um grupo por módulo, com `ToolCard` por tool (read e write).

## Task A5 [UI]: Montar o componente `McpDocsContent`

**Files:** `mcp-docs-content.tsx`.

- [ ] Consultar `ui-ux-pro-max` antes de montar a tela.
- [ ] Reescrever o corpo do componente (ex-`ApiDocsContent`) clonando o layout do nexus-nfe:
  sidebar sticky com `SideNav` + scrollspy (IntersectionObserver), hero (ícone, título
  "Servidor MCP", subtítulo, pill da URL, badges "v1"/"Streamable HTTP", atalhos), divisores,
  seção Autenticação (Bearer + ApiKey, como gerar a chave em Servidor MCP > Chaves de Acesso),
  seção Conceitos (grade de `concepts`), seção Fluxo de uma chamada (passos), seção Tools
  (grupos + `ToolCard`), seção Códigos de erro (tabela), seção Rate limits (tabela + headers),
  rodapé. Texto humanizado, sem travessão.
- [ ] A doc é gated a super_admin (já garantido pelo `docs/page.tsx`).

## Task A6 [UI]: Integrar a rota e remover a doc antiga

**Files:** `docs/page.tsx`; remover `docs-layout.tsx`, `docs-renderer.tsx`, `docs-catalog.tsx`.

- [ ] `docs/page.tsx`: importar `McpDocsContent`, passar o catálogo; manter `PageShell`,
  `Breadcrumb`, `PageHeader`, `ServidorMcpNav`, gate super_admin.
- [ ] Remover os 3 arquivos antigos da doc se ficarem sem referência (`grep` antes). Verificar
  se há testes (`__tests__`) que referenciam `docs-layout/docs-renderer/docs-catalog`; se houver,
  removê-los junto. Verificar também se `src/content/mcp-docs/*.ts` continua usado; se o texto
  foi todo migrado para o componente, remover ou manter como fonte (decidir e registrar).
- [ ] `npx tsc --noEmit` limpo; `npx next build` ok.
- [ ] Consultar `ui-ux-pro-max` para o checklist final de qualidade visual.
- [ ] Commit: `feat(f4-onda2-fix-r2): documentacao do MCP clonada do padrao nexus-nfe`.

---

# ÁREA B — Chaves de Acesso redesenhada

> Problemas do usuário: criar chave abre bloco inline gigante (deve ser **modal**); editar deve
> abrir algo diferenciado; "Capabilities" é incompreensível; rate limit não diz a unidade; o
> campo de data não é o padrão do sistema; campo obrigatório não usa o asterisco vermelho padrão;
> os cards de chave têm "check verdinho" em vez de um **botão habilitar/desabilitar**; o menu de
> três pontinhos (editar/rotacionar/revogar) está bom. Apagar do banco as 2 chaves de teste.

## Task B1: Apagar as 2 chaves de teste do banco

**Files:** script pontual.

- [ ] Listar as `ApiKey` de MCP no banco local (`prisma` query ou `psql`), confirmar que são as
  de teste do usuário ("Teste 1"/"Teste 2" ou equivalentes). Não apagar chaves de sistema
  (`isSystemKey`).
- [ ] Antes de apagar, verificar dependências de FK: `McpIdempotencyRecord.api_key_id`,
  `McpAuditLog` (campo de apiKey). Se o `onDelete` não for cascade, apagar primeiro os registros
  dependentes dessas chaves, depois a `ApiKey`. Conferir o schema antes.
- [ ] Apagar via `prisma db execute` ou script `tsx` pontual (carregar `.env.local`).
- [ ] Sem commit de código; é operação de dados. Registrar no resumo final.

## Task B2: Levantar os padrões do projeto

**Files:** leitura apenas.

- [ ] Ler `src/components/ui/dialog.tsx` (API do modal).
- [ ] Localizar o padrão de **campo obrigatório** (label + asterisco vermelho): `grep -rn
  "text-red\|required\|\\*" src/components` nos forms existentes (ex.: cadastro de usuário,
  webhooks). Anotar o padrão exato.
- [ ] Localizar o **date picker padrão**: procurar `PeriodBar` (F3.5b) e qualquer componente de
  calendário do projeto. Se houver um componente de calendário/data reutilizável no nexus-odoo,
  usar. Se não houver um de campo único, **clonar o componente de data do nexus-insights** (o
  usuário apontou o nexus-insights como referência de datas) para `src/components/ui/`, adaptando
  imports. Alvo: nunca usar `<input type="date">` cru. Anotar o componente escolhido.
- [ ] Confirmar `Switch` (`src/components/ui/switch.tsx`).
- [ ] Sem commit.

## Task B3: Action de habilitar/desabilitar chave

**Files:** `src/lib/actions/mcp-api-keys.ts`.

- [ ] Verificar se já existe action para alternar `active` da `ApiKey`. Se não, criar
  `setMcpApiKeyEnabled(id: string, enabled: boolean)` no padrão das demais actions do arquivo
  (gate super_admin, `DataResult`, `revalidatePath`, `logAudit`).
- [ ] `tsc` limpo. Commit: `feat(f4-onda2-fix-r2): action de habilitar/desabilitar chave MCP`.

## Task B4 [UI]: Modal de criar chave

**Files:** `chaves-lista.tsx`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] Trocar o form inline de criação por um `Dialog` (modal). Largura confortável, com rolagem
  interna só se necessário. Campos: Rótulo (obrigatório, asterisco vermelho), Descrição,
  Tenant ID, Rate limit (com unidade explícita), Capabilities (ver B6), Expiração (date picker
  padrão, ver B2), Origens permitidas. Botões Criar/Cancelar.
- [ ] Campos obrigatórios no padrão do projeto (asterisco vermelho).
- [ ] `tsc` limpo.

## Task B5 [UI]: Modal de editar chave diferenciado

**Files:** `chaves-lista.tsx`.

- [ ] Editar abre um `Dialog` com título "Editar chave" e identidade visual distinta da criação
  (ex.: cabeçalho com o nome da chave, sem os campos que não se editam). Reusa o form de campos.
- [ ] `tsc` limpo.

## Task B6 [UI]: Capabilities legível e rate limit com unidade

**Files:** `chaves-lista.tsx`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] Repensar a apresentação das capabilities. Em vez da matriz crua de checkboxes: um texto de
  ajuda de uma linha explicando o que é ("defina o que esta chave pode fazer em cada módulo"),
  e por módulo um controle de **nível de acesso** claro (`Sem acesso` / `Somente leitura` /
  `Leitura e escrita`). Ao escolher "Leitura e escrita", revelar as ações de escrita
  (`Create/Update/Delete/Transition`) com as sensíveis sinalizadas. O estado serializa no mesmo
  `McpCapabilities` (`{version,read,write}`) já esperado pelas actions.
- [ ] Rate limit: label explícito "Limite de requisições por minuto"; manter input numérico.
- [ ] Extrair a conversão nível de acesso para `McpCapabilities` (e o inverso) em funções puras
  (ex.: `capabilitiesToLevels` / `levelsToCapabilities`) e cobri-las com teste unitário Jest
  (`superpowers:test-driven-development`): escrever o teste antes, ver falhar, implementar.
- [ ] `tsc` limpo; `jest` verde para o novo teste.

## Task B7 [UI]: Cards de chave com toggle habilitar/desabilitar

**Files:** `chaves-lista.tsx`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] No card de cada chave, trocar o ícone de check verde por um `Switch` num canto, que
  habilita/desabilita a chave (chama `setMcpApiKeyEnabled`). Chave desabilitada fica com
  aparência esmaecida mas permanece na lista.
- [ ] Manter o menu de três pontinhos (editar, rotacionar, revogar).
- [ ] `npx tsc --noEmit` limpo; `npx jest` verde; `npx next build` ok.
- [ ] Consultar `ui-ux-pro-max` para o checklist final.
- [ ] Commit: `feat(f4-onda2-fix-r2): Chaves de Acesso redesenhada, modais, toggle, capabilities clara`.

---

# ÁREA C — Logs do MCP com filtro sensato

> Problemas: o select de status abre lista fora do padrão; há **dois campos de busca** (geral e
> "Tool"), deve ser **um só** que busca tudo inclusive tool; o filtro avançado (modo/data) não
> faz sentido. Usar como referência o padrão de filtros do menu de Relatórios deste projeto e o
> filtro de período do nexus-insights (opção "personalizado" abre calendário).

## Task C1: Levantar o padrão de filtros de Relatórios

**Files:** leitura apenas.

- [ ] Localizar e ler os componentes de filtro de `/relatorios` deste projeto (`PeriodBar`,
  filtros, date range). Anotar o padrão de período e de busca.
- [ ] Sem commit.

## Task C2 [UI]: Redesenhar a barra de filtros dos logs

**Files:** `logs-timeline.tsx`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] Unificar a busca em **um** campo só, que filtra por requestId, idempotencyKey e nome da
  tool. Remover o segundo campo ("Tool").
- [ ] Trocar o `<select>` cru de status pelo `CustomSelect` do projeto.
- [ ] Substituir o filtro avançado atual (modo/data soltos) por um filtro de **período** no
  padrão de Relatórios/nexus-insights (predefinições + opção personalizada com calendário) mais
  o filtro de status. Remover filtros sem sentido para logs.
- [ ] Manter exportar CSV e a paginação.
- [ ] `npx tsc --noEmit` limpo; `npx next build` ok.
- [ ] Consultar `ui-ux-pro-max` para o checklist final.
- [ ] Commit: `feat(f4-onda2-fix-r2): logs do MCP com busca unica e filtro de periodo padrao`.

---

# ÁREA D — Plugar MCPs enxuto

## Task D1 [UI]: Encurtar o texto introdutório

**Files:** `src/components/agent/plugar-mcps-content.tsx`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] Reduzir o bloco de introdução para uma ou duas frases diretas, mantendo só o essencial
  (o que é, e onde fica o caminho para expor o nosso MCP). Sem travessão.
- [ ] `npx tsc --noEmit` limpo. Commit: `feat(f4-onda2-fix-r2): texto de Plugar MCPs enxuto`.

---

# ÁREA E — Bubble do Agente Nex responsivo

> O bubble está grande demais. Reduzir largura e um pouco a altura. Mobile: ao abrir ocupa a
> tela inteira, ao fechar volta a ser o bubble flutuante. Tablet/Desktop: tamanho adaptativo ao
> viewport. Em 27" o atual está bom; em 16" está grande demais.

## Task E1: Levantar o componente do bubble

**Files:** leitura apenas.

- [ ] Ler `src/components/agent/agent-bubble.tsx` e `chat-panel.tsx`. Anotar como o tamanho da
  janela aberta é definido (classes/estilos), e como o estado aberto/fechado é controlado.
- [ ] Sem commit.

## Task E2 [UI]: Tornar o bubble responsivo

**Files:** `agent-bubble.tsx` (e `chat-panel.tsx` se necessário).

- [ ] Consultar `ui-ux-pro-max` (responsividade, breakpoints, safe-area mobile).
- [ ] Definir um tamanho base menor (largura e altura) para a janela aberta.
- [ ] Mobile (`< sm`): a janela aberta ocupa a tela inteira (`inset-0`, sem cantos
  arredondados); ao fechar, volta ao bubble flutuante.
- [ ] Tablet/Desktop: dimensões adaptativas por breakpoint Tailwind (`md:`/`lg:`/`xl:`/`2xl:`),
  crescendo suavemente com a tela. Calibrar para que 16" não fique grande e 27" continue bom.
- [ ] `npx tsc --noEmit` limpo; `npx next build` ok.
- [ ] Consultar `ui-ux-pro-max` para o checklist final.
- [ ] Commit: `feat(f4-onda2-fix-r2): bubble do Agente Nex responsivo e mais compacto`.

---

# ÁREA F — Perfil no sidebar

## Task F1 [UI]: Aumentar avatar e fontes do perfil

**Files:** `src/components/layout/sidebar.tsx`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] No bloco de perfil (foto, nome, nível): aumentar o círculo do avatar em torno de 10 a 15%,
  conferindo que o estado **recolhido** do sidebar continua correto.
- [ ] Aumentar a fonte do nome do usuário em 1 degrau da escala tipográfica.
- [ ] Aumentar a fonte do nível do usuário em 1 degrau da escala tipográfica.
- [ ] `npx tsc --noEmit` limpo; `npx next build` ok.
- [ ] Consultar `ui-ux-pro-max` para o checklist final.
- [ ] Commit: `feat(f4-onda2-fix-r2): perfil do sidebar com avatar e fontes maiores`.

---

# ÁREA G — Tour de onboarding nas telas de Integrações

> Clonar o tour do nexus-insights: botão de interrogação no canto superior direito, overlay que
> circula elementos, linguagem humanizada, barra de progresso, responsivo. Abre automático
> **só na primeira vez** que o usuário acessa aquela tela após o primeiro login; depois nunca
> mais sozinho (mesmo deslogando, trocando de conta, relogando). A primeira-visita é por usuário
> e por tela, persistida no backend. Telas desta rodada: Webhook, Servidor MCP, Canais.

## Task G1: Estudar o tour do nexus-insights

**Files:** leitura apenas.

- [ ] Ler `nexus-insights/src/components/tour/{tour-provider,tour-overlay,tour-button,tour-trigger-button}.tsx`.
- [ ] Ler um exemplo de `nexus-insights/src/lib/tours/*.ts` (ex.: `dashboard-tour.ts`).
- [ ] Descobrir como o nexus-insights persiste "tela já vista" (localStorage, tabela, qual chave).
- [ ] Anotar dependências (ex.: biblioteca de tour, ou implementação própria).
- [ ] Sem commit.

## Task G2: Persistência de tour visto por usuário

**Files:** `prisma/schema.prisma`, migration, `src/lib/actions/user-tour.ts`.

- [ ] Adicionar model `UserTourSeen { id, userId, tourKey, seenAt, @@unique([userId, tourKey]) }`.
- [ ] Gerar a migration (`prisma migrate diff` + arquivo manual + `migrate deploy`, padrão já
  usado nesta branch para evitar reset do banco).
- [ ] Criar `user-tour.ts` com `hasSeenTour(tourKey)` e `markTourSeen(tourKey)` (gate por usuário
  autenticado, não só super_admin, pois qualquer usuário pode ver tour). `markTourSeen` é
  idempotente (`upsert` por `@@unique([userId, tourKey])`).
- [ ] Teste unitário Jest das actions (mock do prisma), no padrão dos testes existentes do projeto.
- [ ] `tsc` limpo; `jest` verde. Commit: `feat(f4-onda2-fix-r2): persistencia de tour visto por usuario`.

## Task G3 [UI]: Clonar os componentes de tour

**Files:** `src/components/tour/*`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] Clonar `tour-provider`, `tour-overlay`, `tour-button` do nexus-insights para
  `src/components/tour/`, adaptando imports (`@/` do nexus-odoo) e dependências. Se o
  nexus-insights usa uma lib de tour, instalar a mesma; se é implementação própria, copiar.
- [ ] Manter fielmente: o destaque que circula o elemento, a barra de progresso, a navegação
  (anterior/próximo/fechar), responsividade.
- [ ] `tsc` limpo.

## Task G4: Definições de tour das 3 telas

**Files:** `src/lib/tours/webhook-tour.ts`, `servidor-mcp-tour.ts`, `canais-tour.ts`.

- [ ] Escrever as definições de passos (seletor do elemento, título, texto humanizado) para a
  tela de criação de Webhook, o painel Servidor MCP e a tela de Canais. Texto sem travessão.
- [ ] Garantir que os elementos-alvo tenham `id`/`data-tour` correspondentes nas telas (ajustar
  as telas se faltar âncora).

## Task G5 [UI]: Botão de interrogação e auto-abertura

**Files:** telas de Webhook, Servidor MCP, Canais; `tour-button`.

- [ ] Consultar `ui-ux-pro-max`.
- [ ] Adicionar o botão de interrogação no canto superior direito das 3 telas.
- [ ] Na montagem da tela: consultar `hasSeenTour`; se for a primeira visita, abrir o tour
  automaticamente e em seguida `markTourSeen`. Clicar no botão reabre o tour a qualquer momento.
- [ ] Verificar responsividade (mobile entrega a mesma qualidade).
- [ ] `npx tsc --noEmit` limpo; `npx next build` ok.
- [ ] Consultar `ui-ux-pro-max` para o checklist final.
- [ ] Commit: `feat(f4-onda2-fix-r2): tour de onboarding nas telas de Integracoes`.

---

# ÁREA H — Verificação e fechamento

## Task H1: Verificação completa

- [ ] `npx tsc --noEmit` limpo.
- [ ] `npx eslint src/` sem erros novos.
- [ ] `npx jest` verde (mesmo número de testes, nada quebrado).
- [ ] `npx next build` ok.
- [ ] Varredura de travessão: `grep -rn "—" src/components/integracoes/servidor-mcp
  src/components/agent src/components/tour src/components/layout/sidebar.tsx`, zero ocorrências.
- [ ] Smoke test: subir o dev server, conferir que as rotas tocadas respondem sem erro de SSR.

## Task H2: Code review e UI review inline

- [ ] Revisão crítica inline (sessão principal, sem subagente) dos arquivos alterados: bugs,
  segurança, qualidade. Registrar em `docs/superpowers/reviews/`.
- [ ] UI review inline (6 pilares) das telas tocadas, aplicando `ui-ux-pro-max`.
- [ ] Aplicar correções materiais; commitar.

## Task H3: Fechamento

- [ ] Atualizar `STATUS.md` e `docs/agents/HISTORY.md`.
- [ ] Remover `docs/agents/active/claude-f4-onda2-correcoes-r2.md`.
- [ ] Commit final; push da branch `feat/f4-onda2-mcp-escrita`.

---

## Ordem de execução

A (docs, prioridade) → B (chaves) → C (logs) → D (plugar) → E (bubble) → F (sidebar) →
G (tour) → H (verificação). Cada task com commit próprio quando indicado.

## Self-Review (preenchida nas revisões críticas, abaixo)

Cobertura do feedback do usuário (2026-05-21):
- Doc MCP clonada do nexus-nfe: Área A.
- Travessão banido: Tarefa 0 (feita).
- Chaves: modal criar (B4), editar diferenciado (B5), capabilities clara (B6), rate limit com
  unidade (B6), date picker padrão (B2/B4), campo obrigatório padrão (B2/B4), toggle no card
  (B3/B7), apagar as 2 chaves (B1).
- Logs: busca única, select padrão, filtro sensato (C1/C2).
- Plugar MCPs texto enxuto: Área D.
- Bubble responsivo: Área E.
- Perfil do sidebar: Área F.
- Tour de onboarding: Área G.
