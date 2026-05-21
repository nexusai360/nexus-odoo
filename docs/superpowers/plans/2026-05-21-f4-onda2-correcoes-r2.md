# F4 Onda 2 — Correções Rodada 2 — Implementation Plan

> **For agentic workers:** executar na sessão principal, inline, Opus 4.7, **sem subagentes**
> (instrução explícita do usuário). UI exige `ui-ux-pro-max`. Steps com checkbox `- [ ]`.
> Este plano é o ponto de retomada se o contexto for resumido.

**Goal:** Aplicar a segunda rodada de correções da F4 Onda 2 pedida pelo usuário em 2026-05-21:
documentação do MCP clonada do nexus-nfe, painel de Chaves de Acesso redesenhado, Logs com
filtro sensato, Plugar MCPs enxuto, bubble do Agente Nex responsivo, perfil no sidebar maior,
tour de onboarding nas telas de Integrações, e banimento do travessão na escrita.

**Branch:** `feat/f4-onda2-mcp-escrita`. **Projetos de referência (mesma pasta-mãe `Nexus AI`):**
- `Projetos Internos/nexus-nfe` — `src/app/(protected)/api-docs/api-docs-content.tsx` (doc a clonar).
- `Projetos Internos/nexus-insights` — `src/components/tour/*` + `src/lib/tours/*` (tour a clonar).

**Regra de escrita (vale para tudo, inclusive este plano):** proibido o caractere travessão
`—`. Usar vírgula, parênteses, dois-pontos ou ponto. Linguagem humanizada, de produto.

---

## Tarefa 0 — Banir o travessão (rápido)

**Files:** `CLAUDE.md`, memória `feedback_*`.

- [ ] Adicionar ao `CLAUDE.md §2` uma regra: nunca usar o caractere `—` (travessão/em dash)
  em nenhum texto, UI, comentário, doc ou commit. Usar vírgula/parênteses/dois-pontos/ponto.
- [ ] Salvar memória `feedback_no-em-dash.md` + linha no `MEMORY.md`.
- [ ] Commit: `docs: bane o travessão da escrita do projeto`.

---

## Tarefa 1 — Documentação do MCP clonada do nexus-nfe (PRIORIDADE)

O usuário reprovou a doc atual (markdown-renderer). Quer a **mesma base e estrutura** da doc
do nexus-nfe (`api-docs-content.tsx`, 2550 linhas): sidebar com ícones e scrollspy, header com
título + URL base + chips de seção, blocos de seção com ícone, tabelas de parâmetros, `CodeBlock`
com abas de linguagem e realce de sintaxe JSON, `Tip`/`Warning` callouts, cards de endpoint com
badge de método, rodapé. Clonar a estrutura, trocar o conteúdo para a realidade do MCP.

**Estrutura-alvo (arquivos novos em `src/components/integracoes/servidor-mcp/docs/`):**
- `mcp-docs-content.tsx` — componente principal client, equivalente ao `ApiDocsContent` do NFE.
- Sub-componentes clonados do NFE: `CodeBlock` (abas + highlight), `SideNav` (scrollspy),
  `Tip`, `Warning`, `EndpointCard`/`ToolCard`, `highlightJson`/`highlightCode`.
- Conteúdo do MCP como dados no próprio arquivo (seções + tools), no lugar dos `endpointGroups`.

**Seções do MCP (adaptar do conteúdo já existente em `src/content/mcp-docs/*.ts`):**
Início, Autenticação (Bearer = ApiKey), Conceitos (capabilities, idempotência, external-id),
Fluxo de uma chamada, Catálogo de Tools (por módulo, read/write), Rate limits, Códigos de erro.

- [ ] Ler `nexus-nfe/src/app/(protected)/api-docs/api-docs-content.tsx` por inteiro (em blocos).
- [ ] Criar `mcp-docs-content.tsx` clonando layout/sidebar/header/CodeBlock/Tip/Warning/footer.
- [ ] Verificar deps: `framer-motion` existe no projeto? `grep framer-motion package.json`.
  Se não existir, instalar (`npm i framer-motion`) ou substituir as animações por CSS/Tailwind
  equivalente (decisão na execução; preferir instalar para clone fiel).
- [ ] Migrar o conteúdo das 7 seções do MCP para dados do componente (sem travessão).
- [ ] O catálogo de tools (read/write por módulo) vira uma seção, reaproveitando
  `getMcpCatalogSchema()`.
- [ ] Substituir `McpDocsLayout`/`docs-renderer`/`docs-catalog` pelo novo componente na rota
  `/integracoes/servidor-mcp/docs/page.tsx`. Remover os 3 arquivos antigos
  (`docs-layout.tsx`, `docs-renderer.tsx`, `docs-catalog.tsx`) se ficarem sem uso.
- [ ] `tsc` + `build` verdes. Commit.

---

## Tarefa 2 — Chaves de Acesso redesenhada

Problemas apontados: criar nova chave abre um bloco inline gigante (deveria ser **modal**);
editar deveria abrir algo diferenciado; "Capabilities" é incompreensível; "Rate limit" não diz
a unidade; o componente de data não é o padrão do sistema; campos obrigatórios não usam o padrão
(título + asterisco vermelho); os cards de chave têm um "check verdinho" no lugar de um
**botão de habilitar/desabilitar**; menu de três pontinhos (editar/rotacionar/revogar) está OK.

- [ ] **Apagar do banco as 2 chaves MCP existentes** (`Teste 1`/`Teste 2` ou equivalentes):
  `prisma` delete em `ApiKey` filtrando as de MCP. Fazer via script pontual ou `prisma db execute`.
- [ ] **Nova chave: modal.** Usar o componente de modal/dialog padrão do projeto
  (`src/components/ui/dialog.tsx`). Não bloco inline.
- [ ] **Editar: modal diferenciado** (mesmo Dialog, título "Editar chave", sem campos de criação
  que não se aplicam).
- [ ] **Capabilities legível.** Repensar a apresentação: explicar em 1 linha o que é (o que a
  chave pode fazer em cada módulo). Em vez da matriz crua, usar um modelo claro: por módulo, um
  controle de nível de acesso (ex.: Sem acesso / Ler / Ler e escrever) e, quando "escrever",
  revelar as ações. Texto de ajuda humanizado. Validar com `ui-ux-pro-max`.
- [ ] **Rate limit com unidade.** Label explícito: "Limite de requisições por minuto".
- [ ] **Componente de data padrão.** Trocar o `<input type="date">` pelo date picker padrão do
  sistema. Localizar o componente de calendário do projeto (`grep -ri "calendar\|datepicker"
  src/components/ui`) e usá-lo. Referência de UX: nexus-insights (filtro personalizado de datas).
- [ ] **Campo obrigatório no padrão.** Localizar o padrão do projeto para campo obrigatório
  (label + asterisco vermelho) e aplicar. `grep` por asterisco/`required` nos forms existentes.
- [ ] **Card de chave com toggle.** Trocar o ícone de check verde por um `Switch`
  habilitar/desabilitar num canto do card (mantém a chave, só desativa). Reaproveitar a action
  de ativar/desativar `ApiKey` (criar se não existir).
- [ ] Menu de 3 pontinhos: manter editar/rotacionar/revogar.
- [ ] `tsc` + `build` + `jest` verdes. Commit.

---

## Tarefa 3 — Logs do MCP com filtro sensato

Problemas: o select "Todos os status" abre uma lista fora do padrão; existem **dois campos de
busca** (busca geral + campo "Tool"), deveria ser **um só** que busca tudo, inclusive tool; o
filtro avançado (modo/data/etc) não faz sentido nesta tela. Usar o padrão de filtro do menu de
**Relatórios** deste projeto como referência; o filtro de data deve seguir o nexus-insights
(opção "personalizado" abre calendário). Ordenação de colunas é desejável.

- [ ] Estudar o padrão de filtros de `/relatorios` deste projeto (componentes em
  `src/components/relatorios/` ou similar) e o filtro de período (`PeriodBar`).
- [ ] Unificar a busca: **um** campo que busca por requestId, idempotencyKey e tool.
- [ ] Trocar o `<select>` cru por componente de select padrão do projeto (`CustomSelect`).
- [ ] Repensar o filtro avançado: manter só o que faz sentido para logs (status, período).
  Período com o padrão do projeto/nexus-insights.
- [ ] Avaliar ordenação de colunas (timestamp, duração) se for barato; senão, registrar como
  follow-up no RADAR.
- [ ] `tsc` + `build` verdes. Commit.

---

## Tarefa 4 — Plugar MCPs enxuto

O texto introdutório está grande demais. Deixar objetivo e resumido, mantendo a informação
essencial. Sem travessão.

- [ ] Encurtar o texto introdutório de `plugar-mcps-content.tsx` para 1 a 2 frases diretas.
- [ ] `tsc` verde. Commit.

---

## Tarefa 5 — Bubble do Agente Nex responsivo

O bubble está grande demais. Reduzir largura e um pouco a altura. Responsividade:
- **Mobile:** ao abrir, ocupa a tela inteira; ao fechar, volta a ser o bubble flutuante.
- **Tablet/Desktop:** tamanho adaptativo ao viewport (telas maiores, um pouco maior; menores,
  menor). Em 27" o tamanho atual está bom; em 16" está grande demais.

- [ ] Localizar o componente do bubble/janela do Agente Nex (`src/components/agent/*`).
- [ ] Ajustar dimensões: largura e altura menores como base; classes responsivas Tailwind
  (`sm:`/`md:`/`lg:`/`xl:`) para adaptar; mobile fullscreen (`inset-0`) quando aberto.
- [ ] `tsc` + `build` verdes. Commit.

---

## Tarefa 6 — Perfil no sidebar

No bloco de perfil do sidebar (foto, nome, nível): aumentar o círculo da foto em ~10 a 15%
(sem quebrar o estado recolhido do sidebar); aumentar a fonte do nome do usuário em **1 unidade**
da escala; aumentar a fonte do nível em **1 unidade**.

- [ ] Localizar o componente de perfil no `src/components/layout/sidebar.tsx`.
- [ ] Aumentar o avatar (~10 a 15%), conferir o estado recolhido.
- [ ] Nome: +1 degrau na escala tipográfica. Nível: +1 degrau.
- [ ] `tsc` + `build` verdes. Commit.

---

## Tarefa 7 — Tour de onboarding nas telas de Integrações

Clonar o sistema de tour do nexus-insights (`src/components/tour/*` + `src/lib/tours/*`):
botão de interrogação no canto superior direito, overlay que circula elementos, linguagem
humanizada, barra de progresso/sequência, responsivo. Regra: **abre automático só na primeira
vez** que o usuário acessa aquela tela após o primeiro login; depois disso nunca mais abre
sozinho (mesmo deslogando, trocando de conta, relogando); só abre ao clicar na interrogação.
A primeira-visita é por usuário e por tela, persistida.

Telas-alvo desta rodada: criação de **Webhook**, **Servidor MCP**, **Canais**.

- [ ] Ler `nexus-insights/src/components/tour/{tour-provider,tour-button,tour-overlay,tour-trigger-button}.tsx`
  e um exemplo de `src/lib/tours/*.ts`.
- [ ] Clonar os componentes de tour para `src/components/tour/`, adaptando imports.
- [ ] Verificar como o nexus-insights persiste "primeira visita" (localStorage? tabela? por
  usuário?). Replicar: precisa sobreviver a logout/troca de conta, então persistir por usuário
  no backend (ex.: `AppSetting` ou tabela `UserTourSeen`) e não só localStorage.
- [ ] Criar definições de tour para Webhook, Servidor MCP e Canais (`src/lib/tours/*.ts`).
- [ ] Montar o botão de interrogação + auto-abertura na primeira visita nas 3 telas.
- [ ] `tsc` + `build` verdes. Commit.

---

## Tarefa 8 — Verificação e fechamento

- [ ] `tsc`, `eslint`, `jest`, `next build` verdes (evidência).
- [ ] Varredura final de travessão nos arquivos tocados: `grep -rn "—" src/components/...`.
- [ ] Code review + UI review inline (sessão principal, sem subagente).
- [ ] Atualizar `STATUS.md`, `docs/agents/HISTORY.md`; commit; push da branch.

---

## Ordem de execução

0 (travessão) → 1 (docs, prioridade) → 2 (chaves) → 3 (logs) → 4 (plugar) → 5 (bubble) →
6 (sidebar) → 7 (tour) → 8 (verificação). Cada tarefa com commit próprio.
