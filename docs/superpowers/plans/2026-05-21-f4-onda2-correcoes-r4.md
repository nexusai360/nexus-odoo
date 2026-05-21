# F4 Onda 2, Correções Rodada 4, Implementation Plan

> **For agentic workers:** sessão principal, inline, Opus 4.7, sem subagentes. Todo
> frontend obriga `ui-ux-pro-max`. Sem o caractere travessão. Branch
> `feat/f4-onda2-mcp-escrita`. Cada task com commit próprio (`f4-onda2-fix-r4`).
> Ponto de retomada se o contexto resumir: ler este arquivo + a seção Progresso.

**Goal:** Quarta rodada de correções da F4 Onda 2 pedida pelo usuário em 2026-05-21
(feedback por áudio + 13 prints). Foco: trava de rolagem da doc, tools de escrita no
catálogo, clareza dos logs, redesenho da criação de Chaves de Acesso (wizard em etapas +
seletor de acessos estilo roteador de webhook + calendário navegável), tour reposicionado
e mais completo, redesenho da criação de Webhooks (métodos HTTP, direção clara), e polimento
do Plugar MCPs.

**Versão:** v3 (após review #1 e review #2). Histórico de review no fim do arquivo.

---

## Contexto investigado (antes do plano)

- **Write tool existe mas não está registrada.** `mcp/tools/crm/res-partner-create.ts`
  define `crmResPartnerCreate` (`WriteToolEntry`, capability `{module:"crm",action:"create"}`),
  mas `mcp/tools/crm/index.ts` exporta só `crmResPartnerGet`. Por isso o catálogo mostra
  "0 de escrita" em todos os módulos. É o único write tool do projeto hoje (onda POC).
- **`serializeCatalog`** já trata `WriteToolEntry` (via `isWriteToolEntry`) e serializa
  `operation:"write"`, `capability`, `sensitive`. O snapshot só não tem write tool porque
  o catálogo (`mcp/catalog/index.ts` → `crmTools`) não inclui ela.
- **Webhook:** o model `WhatsappWebhook` já tem `methods String[]`, `path`, `targetUrl`,
  `direction`. A Server Action `createWebhook` já aceita `methods`. Já existe um
  `WebhookWizard` completo (3 passos, seletor de métodos HTTP, cards de direção) em
  `src/components/integrations/webhook-wizard.tsx` — só não está plugado: `webhooks-content.tsx`
  usa um form cru que manda `methods: ["POST"]` fixo.
- **Calendário:** `src/components/ui/calendar.tsx` (react-day-picker v9) aceita
  `captionLayout` e renderiza dropdowns de mês/ano. `DateField` hoje não passa isso.
- **Capabilities:** `McpCapabilities.write` é `Partial<Record<McpModule, WriteAction[]>>`
  com `WriteAction = "Create"|"Update"|"Delete"|"Transition"` (enum fixo). O catálogo de
  write tools por módulo é a fonte real do que cada módulo pode escrever.

---

## ÁREA A — Documentação MCP: travar a rolagem no fim

> Hoje o `pb-[60vh]` (adicionado na r3 para o scrollspy) deixa rolar muito além da
> última seção. O usuário quer: ao clicar em "Rate limits" no menu, a tela posiciona
> a seção no topo (scroll-margin) e esse é o limite, não rola mais.

## Task A1: Trocar o padding final por um espaço mínimo

- [ ] Em `mcp-docs-content.tsx`, no `motion.div` do conteúdo, trocar `pb-[60vh]` por um
  padding pequeno (`pb-16`) — suficiente para respiro, sem criar área morta de rolagem.
- [ ] `tsc` verde.

## Task A2: Scrollspy marca a última seção ao chegar ao fim

- [ ] Sem o `pb-[60vh]`, a última seção ("Rate limits") nunca cruza a faixa do
  `IntersectionObserver` (`rootMargin -80px 0px -60% 0px`). Adicionar, no mesmo `useEffect`
  do observer, um listener de `scroll` no container de rolagem (`<main>` do layout protegido,
  o ancestral com `overflow-y-auto`) que, quando `scrollTop + clientHeight >= scrollHeight - 4`
  (fim), força `setActiveSection(sections[sections.length - 1].id)`.
- [ ] Resolver o container: subir pelo `closest` a partir de um elemento âncora do conteúdo,
  ou `document.querySelector("main")`. Usar o mesmo container que `scrollToSection` usa de
  fato (hoje `scrollIntoView` rola o ancestral certo automaticamente).
- [ ] Verificar contra o app no ar: clicar em "Rate limits" rola até a seção, ela fica
  marcada ativa, e não há rolagem extra além disso.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA B — Tools de escrita no catálogo

## Task B1: Registrar a write tool de CRM no catálogo

- [ ] Em `mcp/tools/crm/index.ts`: importar `crmResPartnerCreate` e adicioná-la ao array
  `crmTools`. O array é tipado `ToolEntry[]`; `WriteToolEntry` é compatível via cast como
  os outros (`as ToolEntry`) ou ajustar o tipo do array para `(ToolEntry | WriteToolEntry)[]`
  se o `tsc` exigir. Conferir o tipo de `catalogo` em `mcp/catalog/index.ts`.
- [ ] Rodar `npm run gen:mcp-catalog` e confirmar no snapshot que `crm.res_partner.create`
  aparece com `operation:"write"`.
- [ ] Rodar a suíte de integração do MCP (`mcp/__tests__/integration.test.ts`) ou ao menos
  `tsc` do projeto e os testes de catálogo, para garantir que registrar a tool não quebrou
  nada (a tool já era testada isoladamente).

## Task B2 [UI]: Rótulos de módulo corretos na documentação

- [ ] Na seção Tools de `mcp-docs-content.tsx`, o nome do módulo usa `capitalize` cru
  ("Crm"). Criar um mapa `MODULE_LABELS` (CRM, Estoque, Financeiro, Fiscal, Comercial,
  Cadastros, Contábil, Produção, RH, Projeto, Outros) e usar para o título de cada grupo.
  "CRM" todo maiúsculo.
- [ ] Aplicar o mesmo mapa onde o módulo aparece nos Logs (`logs-timeline.tsx`, se exibir
  módulo) para consistência.
- [ ] `tsc`/`build` verdes. Commit.

## Task B3 [UI]: Conferir leitura vs escrita na seção Tools

- [ ] Confirmar que `ToolCard` distingue READ (verde) de WRITE (violeta) com badge claro,
  e que o cabeçalho do módulo mostra a contagem certa ("1 de leitura, 1 de escrita" para
  CRM após B1). Ajustar o texto se necessário. Sem mudança de dado, só visual.

---

## ÁREA C — Logs: deixar claro o que são

> O usuário não entendeu de que são os logs e estranhou logs sem chave de acesso.

## Task C1 [UI]: Texto explicativo no topo dos Logs

- [ ] Consultar `ui-ux-pro-max`. Adicionar no topo de `logs-timeline.tsx` (acima da
  `FilterBar`) um card/nota explicativa curta: estes são os registros de auditoria de
  **toda chamada ao servidor MCP** — tanto as do Agente Nex interno (autenticação por
  token de serviço, sem chave de API, por isso a coluna de chave fica vazia) quanto as de
  integrações externas (autenticadas por chave de API). Cada linha = uma chamada de tool.
- [ ] Explicar também, em uma linha, que a lista reflete chamadas reais: se não houve
  chamada num dia, não há log naquele dia (responde ao "parou de alimentar?").
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA D — Chaves de Acesso: redesenho da criação e da lista

> O modal atual é largo mas pouco usável. Refazer a criação como **wizard em etapas**
> (padrão dos prints da NFE: stepper numerado, uma etapa por vez, Voltar/Próximo), com um
> seletor de acessos por módulo no padrão do roteador de webhook (prints), calendário
> navegável, e auto-prefixo `https://` nas origens. A lista de chaves passa a cards
> compactos.

## Task D1 [UI]: Componente `StepWizard` / stepper reutilizável

- [ ] Consultar `ui-ux-pro-max`. Verificar se já existe um indicador de passos
  reutilizável (o `WebhookWizard` tem um `StepIndicator` interno; a NFE tem um stepper).
  Criar um componente compartilhado `src/components/ui/step-indicator.tsx` (círculos
  numerados, conector, passo atual destacado, passos concluídos com check) se ainda não
  houver um genérico. Caso o `StepIndicator` do `WebhookWizard` sirva, extrair para esse
  arquivo compartilhado e reusar nos dois lugares.
- [ ] `tsc` verde. Commit.

## Task D2 [UI]: Wizard de Chave de Acesso, estrutura e Passo 1 (Identificação)

- [ ] Reescrever `ChaveDialog` em `chaves-lista.tsx` como wizard de 4 passos dentro do
  `Dialog` (largura `sm:max-w-2xl`, **não** um retângulo gigante; altura controlada,
  conteúdo rola dentro). Usar o `StepIndicator` da D1 no topo.
- [ ] Passo 1, **Identificação**: campo Rótulo (obrigatório, `RequiredMark` vermelho),
  Descrição (opcional), e Tenant. Abaixo do Tenant, um texto de ajuda como o do rate limit
  explicando o que é: identificador da organização/cliente para isolar dados em cenário
  multi-cliente; deixar vazio para acesso global (é o caso atual da Matrix).
- [ ] Navegação: botões Voltar (oculto no passo 1) e Próximo; Cancelar sempre disponível.
  Próximo do passo 1 exige Rótulo preenchido.
- [ ] `tsc` verde. Commit.

## Task D3 [UI]: Seletor de Acessos por módulo (Passo 2) estilo roteador de webhook

- [ ] Consultar `ui-ux-pro-max`. Passo 2, **Acessos por módulo**: lista de cards de módulo,
  um por `MCP_MODULES`, inspirada nos prints do roteador de webhook:
  - Cada card colapsado: ícone + nome do módulo (label correto, "CRM" maiúsculo), um badge
    de contagem do que está concedido (ex.: "Leitura" / "Leitura + 1 ação" / "Sem acesso"),
    e um chevron para expandir.
  - O card ganha destaque de cor quando tem acesso (tom violeta para leitura, realce âmbar
    quando há ação de escrita marcada), igual o print fica colorido conforme seleção.
  - Card expandido: seletor de nível (Sem acesso / Somente leitura / Leitura e escrita) e,
    quando "Leitura e escrita", a lista de **ações de escrita disponíveis para aquele
    módulo** (ver D4).
  - No topo da lista, um contador geral ("X de N módulos com acesso") e uma ação
    "Conceder leitura a todos" / "Limpar tudo" (equivalente ao "Selecionar todos" do print).
- [ ] Manter o modelo de dados `ModuleAccessMap` / `capabilitiesToLevels` /
  `levelsToCapabilities` intacto — muda só a apresentação.
- [ ] `tsc` verde. Commit.

## Task D4 [UI]: Ações de escrita derivadas das write tools reais

- [ ] As ações de escrita por módulo deixam de ser 4 fixas (Criar/Atualizar/Excluir/Mover).
  Passam a ser **derivadas do catálogo**: para cada módulo, as ações disponíveis são os
  `capability.action` distintos das write tools daquele módulo no snapshot
  (`getMcpCatalogSchema`/`mcp-catalog-snapshot.json`). Hoje: só `crm` tem `create`.
- [ ] Mapa de rótulo das ações em pt-br: `create→Criar`, `update→Atualizar`,
  `delete→Excluir`, `transition→Mover`. Cada ação mostra, em texto pequeno, a(s) tool(s)
  que ela cobre (ex.: "Criar — `crm.res_partner.create`") para o usuário saber o que está
  liberando. Ações sensíveis (delete/transition) mantêm o realce âmbar.
- [ ] Módulo **sem** write tool: ao escolher "Leitura e escrita", mostrar um aviso curto
  "Nenhuma ação de escrita disponível neste módulo ainda" em vez de checkboxes falsos.
  O nível "Leitura e escrita" continua selecionável (capability fica só com leitura).
- [ ] O wizard recebe o catálogo: a página `chaves/page.tsx` passa a chamar
  `getMcpCatalogSchema()` e injeta as write actions por módulo em `ChavesLista`.
- [ ] `tsc`/`build` verdes. Commit.

## Task D5 [UI]: Passo 3 (Limites e validade) com calendário navegável

- [ ] Passo 3, **Limites e validade**: campo Limite de requisições por minuto (com a ajuda
  atual) e campo Expiração.
- [ ] Melhorar o `DateField` (`src/components/ui/date-field.tsx`): passar
  `captionLayout="dropdown"` ao `Calendar` e definir `startMonth`/`endMonth` (ou
  `fromYear`/`toYear`) cobrindo de hoje até +30 anos, para o usuário pular ano e mês por
  dropdown em vez de avançar mês a mês na setinha. Conferir as props que a versão do
  react-day-picker do projeto aceita (`calendar.tsx` já expõe `captionLayout`).
- [ ] Expiração e Tenant continuam só na criação (modo create); no modo edição o passo 3
  mostra o limite editável e a expiração como informação read-only (ou ausente), como hoje.
- [ ] `tsc`/`build` verdes. Commit.

## Task D6 [UI]: Passo 4 (Origens e revisão) com auto-https

- [ ] Passo 4, **Origens e revisão**: o campo de origens permitidas (chips com X, já bom)
  ganha **auto-prefixo**: ao Adicionar, se o texto não começa com `http://` ou `https://`,
  prefixar `https://` antes de validar com `new URL()`. Manter a dedução de duplicadas.
- [ ] Abaixo das origens, um resumo do que será criado/salvo (rótulo, nº de módulos com
  acesso, rate limit, expiração) e o botão final Criar chave / Salvar alterações.
- [ ] `tsc`/`build`/`jest` verdes. Commit.

## Task D7 [UI]: Lista de chaves em cards compactos

- [ ] Consultar `ui-ux-pro-max`. Refazer `ChaveRow` no padrão dos cards do roteador de
  webhook (print): card compacto (não retângulo gigante) com ícone, rótulo, badges de
  estado (Sistema/Tenant/Desabilitada/Revogada), resumo de acessos ("N módulos",
  "X de leitura, Y de escrita"), data e último uso em texto pequeno, o `Switch`
  ativar/desativar, um botão de lápis para editar (abre o wizard em modo edição) e um
  botão de lixeira para revogar. Menu "..." pode permanecer para Rotacionar/Marcar perdida,
  ou virar botões; manter as ações existentes acessíveis.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA E — Tour: reposicionar o "?" e completar o conteúdo

## Task E1 [UI]: Reposicionar o botão de tour para perto do título

- [ ] Consultar `ui-ux-pro-max`. Hoje o `TourTriggerButton` vai em `PageHeader.actions`,
  encostado na borda direita, isolado e longe do título. Mudar: o "?" passa a ficar
  **colado ao título**, logo após o texto do `h1` no grupo do título.
- [ ] Em `page-header.tsx`, adicionar uma prop opcional `titleAccessory?: ReactNode`
  renderizada ao lado do `h1` (alinhada à baseline/centro). Manter `actions` para outros
  usos. Migrar todas as telas do Servidor MCP, Webhooks e Plugar MCPs para passar o
  `TourTriggerButton` em `titleAccessory` em vez de `actions`.
- [ ] `tsc`/`build` verdes. Commit.

## Task E2 [UI]: Tour da Visão Geral cobre "Tools mais usadas"

- [ ] Adicionar `data-tour="mcp-top-tools"` no card "Tools mais usadas" de `visao-geral.tsx`
  e um passo no `servidorMcpTour` descrevendo-o. O passo deve existir condicionalmente
  só faz sentido se o card existir; como o card só aparece quando há uso, o passo pode
  ficar sempre no tour e, se o alvo não existir, o overlay já centraliza sem halo. Aceitar
  esse comportamento (ou ancorar no card "Uso 24h" como fallback). Documentar a escolha.
- [ ] `tsc`/`build` verdes. Commit.

## Task E3 [UI]: Tour de Chaves abre o wizard e percorre as etapas

- [ ] Reescrever `servidorMcpChavesTour`: começa em "suas chaves" (lista), depois aponta o
  botão "Nova chave"; ao avançar, o tour **abre o wizard** (mesmo padrão do force-open de
  webhook/plugar: `ChavesLista` observa `useTour()` e, com o tour de chaves ativo a partir
  do passo do wizard, abre o `createOpen`). Os passos seguintes descrevem cada etapa do
  wizard (Identificação, Acessos por módulo, Limites, Origens). Ao concluir o tour, fechar
  o wizard.
- [ ] Âncoras `data-tour` nos elementos do wizard (stepper, cada passo). Como o wizard
  troca de passo, ancorar nos contêineres que existem no passo corrente; passos do tour que
  dependem de uma etapa específica devem, idealmente, também avançar o wizard. Implementação
  pragmática: o tour foca o `StepIndicator` e o corpo do passo atual; descrição textual
  explica os 4 passos. Se for viável avançar o wizard junto, fazer; senão, manter o tour
  sobre a etapa 1 + descrição geral. Documentar a decisão na execução.
- [ ] `tsc`/`build` verdes. Commit.

## Task E4 [UI]: Tour de Logs abre uma linha e cita exportar

- [ ] `servidorMcpLogsTour`: além de filtros e lista, ao avançar, **expandir a primeira
  linha de log** (se houver) para o tour explicar o detalhe; `LogsTimeline` observa o tour
  e seta `expandedId` para o primeiro item. Passo final cita o botão Exportar. Âncoras
  `data-tour` na primeira linha e no botão de exportar.
- [ ] `tsc`/`build` verdes. Commit.

## Task E5 [UI]: Tour da Documentação não destaca todas as tools

- [ ] `servidorMcpDocsTour`: o passo de tools hoje ancora no `motion.div#tools` inteiro,
  que engloba dezenas de cards e fica um halo gigante. Mudar a âncora para apenas o
  **cabeçalho da seção Tools** (`SectionTitle` + parágrafo) — adicionar
  `data-tour="mcp-docs-tools-head"` num wrapper só do título/intro. A descrição explica que
  há tools de leitura (verde) e de escrita (violeta), agrupadas por módulo.
- [ ] Acrescentar passos para as seções Autenticação, Códigos de erro e Rate limits
  (âncoras `data-tour` nesses blocos), tornando o tour da doc mais completo.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA F — Webhooks: redesenho da criação

> O form atual é cru (manda `methods:["POST"]` fixo, direção "Entrada/Saída" confusa,
> URL "opcional"). Já existe um `WebhookWizard` completo não plugado.

## Task F1 [UI]: Plugar o `WebhookWizard` na tela de Webhooks

- [ ] Consultar `ui-ux-pro-max`. Em `webhooks-content.tsx`, trocar o form inline cru pelo
  `WebhookWizard` (`src/components/integrations/webhook-wizard.tsx`), renderizado no lugar
  do `{formVisible && <form>}`. O wizard já tem 3 passos, seleção de métodos HTTP e cards
  de direção. Ligar `onCreated` ao fluxo de `revealedSecret` existente (o wizard tem
  `SecretRevealStep` próprio no passo 3 — decidir: usar o do wizard e só dar refresh, ou
  manter o banner. Preferir o do wizard e remover o banner duplicado se ficar redundante).
- [ ] `onCancel` fecha o wizard. Manter o force-open pelo tour.
- [ ] `tsc`/`build` verdes. Commit.

## Task F2 [UI]: Direção com nomes claros (escutar vs enviar)

- [ ] No `WebhookWizard`, renomear os cards de direção para deixar o conceito claro:
  - `inbound` → "Receber eventos" (a plataforma escuta um endpoint; outro sistema chama).
  - `outbound` → "Enviar eventos" (a plataforma dispara uma chamada para um sistema externo).
  - Ajustar descrições e o resto do wizard (labels "Caminho" para receber, "URL de destino"
    para enviar). Manter os valores `inbound`/`outbound` no model/Server Action — muda só o
    texto exibido. Conferir e alinhar os rótulos em `DIRECTION_LABELS` de `webhooks-content.tsx`
    e no `WebhookRow`.
- [ ] `tsc`/`build` verdes. Commit.

## Task F3 [UI]: Métodos e campos por direção, completos

- [ ] Garantir que o passo de configuração do wizard expõe, de forma legível:
  - **Receber:** Caminho (path) com a base read-only, e os métodos HTTP aceitos
    (multi-seleção GET/POST/PUT/PATCH/DELETE — o wizard já tem `toggleMethod`).
  - **Enviar:** URL de destino e o(s) método(s) HTTP usados no disparo.
  - Nome do webhook nos dois casos.
- [ ] Conferir que `createWebhook` persiste `methods` corretamente (já aceita). Sem
  inventar autenticação nova: o `secret` HMAC continua sendo o mecanismo; explicar no
  wizard, em texto curto, que cada webhook recebe um secret de assinatura (exibido 1×).
- [ ] Rever a `inboundBaseUrl` default do wizard (`https://app.nexus-odoo.com/api/hooks/`)
  e usar a URL pública real via `resolveMcpPublicUrl` ou a base do app, passada pela página.
- [ ] `tsc`/`build`/`jest` verdes. Commit.

## Task F4 [UI]: Tour de Webhooks alinhado ao wizard

- [ ] Reescrever `webhookTour` para o wizard: passo no botão "Novo webhook" (force-open já
  existe), passos descrevendo escolher a direção, configurar método/caminho/URL, e o
  secret exibido uma vez. Âncoras `data-tour` nos elementos do wizard.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA G — Plugar MCPs: polimento

## Task G1 [UI]: Asteriscos vermelhos e texto enxuto

- [ ] Em `plugar-mcps-content.tsx`: os campos obrigatórios (Nome, URL do endpoint) usam
  `*` cru; trocar pelo `RequiredMark` vermelho (ou um `<span className="text-red-500">`),
  consistente com o resto do sistema.
- [ ] Enxugar o parágrafo introdutório para caber em 2 linhas (hoje quebra em 3, deixando
  "MCP." sozinho na terceira). Reescrever mais curto mantendo o sentido.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA H — Verificação e fechamento

- [ ] `npm run gen:mcp-catalog` rodado e snapshot commitado (se B1 mudou tools).
- [ ] `tsc`, `eslint` (nos arquivos tocados), `jest`, `next build` verdes.
- [ ] Varredura de travessão nos arquivos tocados.
- [ ] Smoke test das rotas no dev server (`/integracoes/servidor-mcp` e abas,
  `/integracoes/webhooks`, `/agente/plugar-mcps`).
- [ ] Code review + UI review inline (`ui-ux-pro-max` como referência dos 6 pilares).
- [ ] Atualizar `STATUS.md`, `docs/agents/HISTORY.md`, plano (Progresso); remover o
  arquivo `docs/agents/active/claude-f4-onda2-correcoes-r4.md`; commit; push.

## Ordem

A → B → C → D → E → F → G → H. (D depende de B para as write actions derivadas.)

---

## Progresso (atualizar conforme avança)

- [ ] Área A — trava de rolagem da doc.
- [ ] Área B — write tools no catálogo + rótulos de módulo.
- [ ] Área C — texto explicativo dos Logs.
- [ ] Área D — wizard de Chaves de Acesso + seletor de acessos + calendário + lista.
- [ ] Área E — tour reposicionado e completo.
- [ ] Área F — redesenho dos Webhooks.
- [ ] Área G — polimento do Plugar MCPs.
- [ ] Área H — verificação e fechamento.

---

## Histórico de review

### Review #1 (v1 → v2)

Achados materiais aplicados na v2:
1. **D dependia de B e não estava na ordem.** As ações de escrita por módulo (D4) derivam
   do catálogo, que só tem write tool depois de B1. Ordem corrigida para A→B→C→D… e
   anotada a dependência.
2. **D4 não dizia de onde a UI tira o catálogo no client.** Acrescentado: a página
   `chaves/page.tsx` chama `getMcpCatalogSchema()` e injeta as write actions em `ChavesLista`.
3. **A2 não dizia qual container rolar.** O scroll real é no `<main>` do layout protegido;
   a task agora manda resolver o container e usar o mesmo que o `scrollIntoView` usa.
4. **E3/E4 (force-open no tour) tinham risco de alvo inexistente.** Adicionada a instrução
   de o componente observar `useTour()` e abrir o wizard / expandir a linha, com decisão
   pragmática documentada na execução.
5. **F1 tinha banner de secret duplicado** (o wizard tem `SecretRevealStep` próprio e a
   tela tem o banner `revealedSecret`). Task agora manda escolher um e remover a duplicação.

### Review #2 (v2 → v3)

Achados materiais aplicados na v3:
1. **D era um épico.** "Refazer o modal" foi quebrado em 7 tasks (D1 stepper, D2 passo 1,
   D3 seletor de acessos, D4 ações derivadas, D5 calendário, D6 origens+revisão, D7 lista),
   cada uma com escopo único e verificável.
2. **D1 podia duplicar componente de stepper.** O `WebhookWizard` já tem um `StepIndicator`;
   a task agora manda extrair para um componente compartilhado e reusar, em vez de criar
   outro.
3. **E2 tinha alvo que pode não existir** (o card "Tools mais usadas" só aparece com uso).
   A task agora explicita o comportamento aceito e o fallback.
4. **F3 usava `inboundBaseUrl` chumbada** (`app.nexus-odoo.com`). Task agora manda usar a
   URL pública real via helper, passada pela página.
5. **B1 podia quebrar tipo do array `catalogo`.** Task agora manda conferir o tipo de
   `catalogo`/`crmTools` e ajustar para aceitar `WriteToolEntry` (cast ou união de tipos),
   e rodar os testes de integração do MCP.
6. **Faltava regenerar o snapshot na verificação.** Área H agora inclui `gen:mcp-catalog`
   e o commit do snapshot.
