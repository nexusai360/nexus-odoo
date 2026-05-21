# F4 Onda 2, Correcoes Rodada 5, Implementation Plan

> **For agentic workers:** sessao principal, inline, Opus 4.7, sem subagentes. Todo
> frontend obriga `ui-ux-pro-max`. Sem o caractere travessao. Branch
> `feat/f4-onda2-mcp-escrita`. Commit por area (`f4-onda2-fix-r5`). Ponto de retomada:
> ler este arquivo + a secao Progresso.

**Goal:** Quinta rodada de correcoes da F4 Onda 2 (feedback por audio + 16 prints,
2026-05-21). Foco: travessao no card de Integracoes, motivo do erro nos Logs, ajustes
do wizard de Chaves (stepper, tenant, modal que cresce, seletor de acessos poluido,
calendario, separar Origens do Resumo), trava de rolagem e titulo da Documentacao,
redesenho dos cards de Webhook + edicao + metodo HEAD + path unico, e redesenho do
Plugar MCPs como wizard com teste antes de conectar.

**Versao:** v3 (apos review #1 e #2). Historico de review no fim.

---

## Contexto investigado

- **`McpAuditLog` tem `errorCode` e `errorMessage`** (campos opcionais da F4 Onda 2).
  O motivo do erro ja e gravado; falta o `queryAuditLogs` retornar e o `LogDetail`
  exibir. Conferir `AuditLogItem` em `mcp-audit-query.ts`.
- **Nao existe rota `/api/hooks` nem `/api/webhooks`** em `src/app/api`. O
  `inboundBaseUrl` e so texto exibido; trocar `/api/hooks/` por `/api/webhooks/` e
  cosmetico (helper `resolveWebhookInboundBase`).
- **`webhooks.ts`:** `WebhookMethod` e `methodSchema` sem `HEAD`; sem checagem de
  `path` duplicado; sem `updateWebhook`. `path` no model `WhatsappWebhook` nao tem
  unique constraint.
- **`Calendar`** (`src/components/ui/calendar.tsx`, react-day-picker v9) usa
  `captionLayout="dropdown"` que renderiza dropdowns nativos do react-day-picker, fora
  do padrao visual; o de ano vai ate o fim da tela.
- **Wizard:** `StepIndicator` (`src/components/ui/step-indicator.tsx`) usa `size-6`,
  numero pode ficar descentralizado. Compartilhado por Chaves e Webhook.

---

## AREA A, Integracoes: travessao no card do Servidor MCP

## Task A1 [UI]: Remover o travessao da descricao do card

- [ ] Em `src/components/integracoes/integracoes-grid.tsx`, a descricao do card
  "Servidor MCP" tem um travessao ("Painel do MCP semantico, status, chaves de acesso
  e metricas." hoje com travessao). Reescrever sem travessao, linguagem natural.
- [ ] Varrer o arquivo inteiro por outros travessoes nas descricoes dos demais cards.
- [ ] `tsc`/`build` verdes. Commit.

---

## AREA B, Logs: mostrar o motivo do erro

## Task B1: `queryAuditLogs` retorna errorCode e errorMessage

- [ ] Conferir `src/lib/actions/mcp-audit-query.ts`: o tipo `AuditLogItem` e o `select`
  precisam incluir `errorCode` e `errorMessage`. Adicionar se faltarem.
- [ ] `tsc` verde.

## Task B2 [UI]: `LogDetail` exibe o motivo do erro

- [ ] Em `logs-timeline.tsx`, no `LogDetail`, quando `errorCode`/`errorMessage`
  existirem (status Erro/Inválido/Negado), exibir um bloco destacado (borda/realce
  de erro, vermelho/ambar) com o codigo e a mensagem do erro, no topo do detalhe,
  antes dos parametros. Para sucesso, nao mostrar.
- [ ] Verificar contra o app: um log de erro/inválido mostra o porque.
- [ ] `tsc`/`build` verdes. Commit.

---

## AREA C, Chaves de Acesso: ajustes do wizard

## Task C1 [UI]: Stepper com bolinha maior e numero centralizado

- [ ] Consultar `ui-ux-pro-max`. Em `step-indicator.tsx`: aumentar o circulo de
  `size-6` para `size-7`, garantir o numero centralizado (`leading-none`,
  `tabular-nums`, flex center), aumento sutil da fonte. Vale para Chaves e Webhook.
- [ ] `tsc`/`build` verdes. Commit.

## Task C2 [UI]: Tenant com exemplo

- [ ] No passo 1 do `ChaveDialog`, o campo Tenant: o `placeholder` ou a ajuda ganha
  um exemplo entre parenteses (ex.: "Ex.: cliente-001, matrix-sp"). Mantem a descricao
  atual sobre acesso global.
- [ ] `tsc` verde. Commit.

## Task C3 [UI]: Modal nao cresce, conteudo rola dentro

- [ ] O `DialogContent` do wizard tem `max-h-[88vh] overflow-y-auto` no container
  inteiro, mas o passo 2 (Acessos), ao expandir modulos, empurra o footer e o modal
  cresce ate vazar. Corrigir: estrutura de altura fixa, header e footer fixos, e
  **apenas o corpo do passo rola** (`overflow-y-auto` no corpo, `max-h` calculado).
  O modal mantem altura estavel independente de quantos modulos estao expandidos.
- [ ] `tsc`/`build` verdes. Commit.

## Task C4 [UI]: Seletor de acessos menos poluido

- [ ] Consultar `ui-ux-pro-max`. O card de modulo expandido fica "roxo dentro de roxo"
  e a acao de escrita ocupa muito espaco. Redesenhar:
  - Reduzir o uso de violeta: card com acesso usa realce sutil (borda), nao preenche
    tudo de violeta; o card aninhado da acao nao repete o mesmo tom forte.
  - O seletor de nivel (Sem acesso / Leitura / Leitura e escrita): trocar o
    `CustomSelect` de largura cheia por um controle mais compacto, ex.: um grupo de 3
    botoes-segmento (segmented control) na propria linha do cabecalho do modulo, ou
    inline, aproveitando o espaco horizontal em vez de uma barra grande embaixo.
  - As acoes de escrita: chips/itens compactos, nao cartoes grandes; o id da tool em
    fonte mono pequena, sem repetir realce violeta.
- [ ] Manter o modelo de dados (`ModuleAccessMap`) intacto.
- [ ] `tsc`/`build` verdes. Commit.

## Task C5 [UI]: Separar Origens (passo 4) do Resumo (passo 5)

- [ ] O wizard passa de 4 para **5 passos**: Identificacao, Acessos, Limites, Origens,
  Resumo. O passo 4 tem **so** as origens permitidas. O passo 5 e um Resumo dedicado.
- [ ] O Resumo (passo 5) e completo e simples: rotulo, limite, expiracao, origens, e
  **por modulo com acesso**: o nivel (Leitura / Leitura e escrita) e, quando escrita,
  as acoes habilitadas. Quem nao tem acesso nao aparece. Sem texto explicativo longo.
- [ ] O botao final (Criar chave / Salvar) fica no passo 5. `StepIndicator` com 5.
- [ ] `tsc`/`build`/`jest` verdes. Commit.

---

## AREA D, Calendario (DateField) no padrao do sistema

> Vale para o `DateField` (Chaves passo Limites) e para os campos Data inicial /
> Data final dos Logs, que usam o mesmo componente.

## Task D1 [UI]: Popover do calendario com a largura do gatilho

- [ ] Consultar `ui-ux-pro-max`. O `PopoverContent` do `DateField` abre menor que o
  botao-gatilho. Fazer o popover ter no minimo a largura do gatilho (medir o trigger
  via ref e aplicar `min-width`, ou `--radix/base-ui` anchor width var). Conferir o
  componente `Popover` do projeto para a tecnica suportada.

## Task D2 [UI]: Dropdowns de mes e ano no padrao do projeto

- [ ] O `captionLayout="dropdown"` do react-day-picker renderiza `<select>` nativos
  fora do padrao. Substituir pela navegacao do projeto: usar `components.Dropdown`
  (ou `MonthsDropdown`/`YearsDropdown`) do react-day-picker v9 para renderizar com o
  `CustomSelect` do projeto, OU manter `captionLayout="label"` e adicionar botoes/menus
  proprios de mes e ano no caption (`components.MonthCaption`).
  Decisao na execucao conforme o que a versao do react-day-picker permite; o resultado:
  menu de mes e ano com o visual do `CustomSelect` (lista suspensa padrao do sistema).
- [ ] Mes exibido com nome completo (janeiro, fevereiro), nao abreviado.
- [ ] Ano: janela limitada. Mostrar ~10 anos por vez, rolavel; faixa total do ano
  atual ate +30 anos (2026 a 2056). Sem lista que vai ate o fim da tela.
- [ ] `tsc`/`build` verdes. Commit.

---

## AREA E, Documentacao do Servidor MCP

## Task E1 [UI]: Trava de rolagem real ate a ultima secao

- [ ] A r4 trocou `pb-[60vh]` por `pb-16`, e agora a ultima secao (Rate limits) nao
  consegue subir ate o topo: clicar nela no menu marca o item mas nao posiciona.
  Corrigir com um **espacador de fundo dinamico**: medir a altura do container de
  rolagem (`<main>`) e a altura da ultima secao; o espacador abaixo do conteudo tem
  `height = max(0, containerHeight - lastSectionHeight - topOffset)`. Assim a ultima
  secao consegue chegar exatamente ao topo (posicao padrao, `scroll-mt`) e nao ha
  rolagem alem disso.
- [ ] Recalcular o espacador em resize. Manter o scrollspy marcando a ultima secao
  ao atingir o fim (logica da r4).
- [ ] Verificar: clicar em "Codigos de erro" e "Rate limits" posiciona cada um no
  topo; o nav destaca o item certo; nao rola alem da ultima secao.
- [ ] `tsc`/`build` verdes. Commit.

## Task E2 [UI]: Titulo do hero da doc

- [ ] No `McpDocsContent`, o `h1` do hero diz "Servidor MCP, Documentacao". Trocar por
  **"Documentacao do Servidor MCP"**. A fonte do hero deve ter o **mesmo tamanho** dos
  titulos de secao (`SectionTitle`, hoje `text-xl font-semibold`). Hoje o hero usa
  `text-base`; subir para `text-xl` igual as secoes.
- [ ] `tsc`/`build` verdes. Commit.

---

## AREA F, Webhooks: cards, edicao, metodo HEAD, path unico

## Task F1: Metodo HEAD

- [ ] Em `webhooks.ts`: adicionar `HEAD` ao tipo `WebhookMethod` e ao `methodSchema`.
  No `WebhookWizard`, adicionar `HEAD` a `HTTP_METHODS`.
- [ ] `tsc` verde.

## Task F2 [UI]: Base de URL de entrada `/api/webhooks/`

- [ ] Em `resolveWebhookInboundBase` (`src/lib/mcp-public-url.ts`), trocar `/api/hooks/`
  por `/api/webhooks/`. (Nao ha rota real; e o texto exibido como prefixo do path.)
- [ ] `tsc` verde.

## Task F3: Path duplicado bloqueado (create e update)

- [ ] Em `createWebhook` (e no `updateWebhook` da F5): para `direction inbound`,
  antes de gravar, `findFirst` por `path` igual (excluindo o proprio id no update);
  se existir, retornar erro claro ("Ja existe um webhook com esse caminho").
- [ ] Testes em `webhooks.test.ts` para o caso de path duplicado.
- [ ] `tsc`/`jest` verdes. Commit (F1+F2+F3 juntos).

## Task F4: Server Action `updateWebhook`

- [ ] Criar `updateWebhook(id, input)` em `webhooks.ts`: altera `name`, `methods`,
  `path`/`targetUrl` conforme a direcao (a direcao em si nao muda). Reaproveita o
  `createSchema` (ou um `updateSchema` analogo) e a checagem de path duplicado (F3).
  Gate super_admin. `revalidatePath`.
- [ ] `WebhookListItem` ja expoe os campos necessarios para hidratar a edicao.
- [ ] Testes do `updateWebhook` em `webhooks.test.ts`.
- [ ] `tsc`/`jest` verdes. Commit.

## Task F5 [UI]: Card de webhook redesenhado

- [ ] Consultar `ui-ux-pro-max`. Redesenhar `WebhookRow` em `webhooks-content.tsx`,
  mais compacto:
  - O path aparece como **tag** (ex.: `/teste` em chip com fonte mono), nao texto solto.
  - Os metodos HTTP aparecem como **tags** pequenas, nao texto separado por virgula.
  - Remover a linha de rodape com os botoes de texto "Rotacionar secret" e "Remover".
    No lugar, abaixo do `Switch` de habilitar, dois icones: **lapis (editar)** e
    **lixeira (remover)**. Rotacionar secret passa a ser uma acao **dentro da edicao**.
  - Card ocupa menos espaco vertical.
- [ ] `tsc`/`build` verdes. Commit.

## Task F6 [UI]: Modal de edicao de webhook

- [ ] Modal de edicao (pode reusar/estender o `WebhookWizard` em modo edicao, ou um
  `WebhookEditDialog` proprio): permite alterar nome, metodos (ativar/desativar),
  path (entrada) ou targetUrl (saida) com a checagem de path unico, e **rotacionar o
  secret**. Botoes Cancelar e Salvar. A direcao nao e editavel.
- [ ] Ao salvar, chama `updateWebhook`; rotacionar secret chama `rotateWebhookSecret`
  e revela o novo secret 1x (banner existente).
- [ ] `tsc`/`build`/`jest` verdes. Commit.

---

## AREA G, Plugar MCPs: wizard com teste antes de conectar

## Task G1 [UI]: Conectar MCP vira wizard em modal

- [ ] Consultar `ui-ux-pro-max`. Trocar o formulario inline (abre para baixo) por um
  **modal wizard** no mesmo padrao de Webhook/Chave: `Dialog` + `StepIndicator`.
  Passos sugeridos: 1 Identificacao (nome, descricao), 2 Conexao (transporte, URL),
  3 Autenticacao (header, token), 4 Resumo. Reusa `createExternalMcpServer`.
- [ ] `tsc`/`build` verdes. Commit.

## Task G2 [UI]: Resumo testa antes de conectar

- [ ] No passo Resumo: mostra o que foi preenchido e tem um botao **Testar conexao**.
  O botao **Conectar/Concluir** comeca desabilitado. Ao testar com sucesso
  (`testExternalMcpServer` ou um teste pre-criacao equivalente), o botao Testar
  desativa e o Conectar ativa. Se o teste falha, mostra a mensagem de erro e mantem
  Conectar desabilitado.
- [ ] Investigar `testExternalMcpServer`: hoje testa por `id` (servidor ja criado).
  Para testar **antes** de criar, ou (a) criar uma action de teste que recebe os
  campos crus (URL/header/token/transporte), ou (b) criar o servidor desabilitado,
  testar e so entao habilitar. Preferir (a) se for barato; decidir na execucao e
  documentar.
- [ ] `tsc`/`build`/`jest` verdes. Commit.

## Task G3 [UI]: Status do card claro (Conectado/Desconectado)

- [ ] O card mostra "Alcancavel" mesmo desabilitado. Trocar o vocabulario:
  - Servidor habilitado e ultimo teste ok: "Conectado" (verde).
  - Servidor habilitado e ultimo teste falho/nao testado: "Sem conexao" / "Nao testado".
  - Servidor desabilitado: "Desativado" (cinza), independente do teste.
  O texto reflete `enabled` + `lastStatus`. Sem o termo "Alcancavel".
- [ ] `tsc`/`build` verdes. Commit.

## Task G4 [UI]: Card de MCP redesenhado

- [ ] Consultar `ui-ux-pro-max`. `McpServerRow` mais compacto: remover os botoes de
  texto "Testar conexao" e "Remover" do rodape. Abaixo do `Switch`, dois icones:
  **lapis (editar)** e **lixeira (remover)**. O teste de conexao passa a viver dentro
  do fluxo de criar/editar (G2/G5).
- [ ] `tsc`/`build` verdes. Commit.

## Task G5 [UI]: Modal de edicao de MCP

- [ ] Modal de edicao (reusa o wizard de G1 em modo edicao, ou dialog proprio):
  altera nome, descricao, transporte, URL, header, token. Botoes Cancelar e Concluir.
- [ ] Regra de re-teste: se **URL, header ou token** mudarem, o botao Testar reativa e
  o Concluir so libera apos um teste com sucesso. Mudar so nome/descricao nao exige
  re-teste.
- [ ] `tsc`/`build`/`jest` verdes. Commit.

---

## AREA H, Tours acompanham as telas novas

## Task H1 [UI]: Atualizar os tours

- [ ] Rever todos os tours tocados pela r5 e atualizar textos e ancoras:
  - `servidorMcpChavesTour`: o wizard agora tem 5 passos; o passo do wizard descreve
    Identificacao, Acessos, Limites, Origens, Resumo.
  - `webhookTour`: cita o card com path e metodos em tags, e a edicao (lapis).
  - `plugarMcpsTour`: agora e wizard em modal; o tour abre o modal e descreve os passos
    e o teste antes de conectar. Ancoras nos elementos novos.
  - `servidorMcpLogsTour`: cita que o detalhe do log mostra o motivo do erro.
- [ ] Garantir que cada `data-tour` referenciado existe na tela nova.
- [ ] `tsc`/`build` verdes. Commit.

---

## AREA I, Verificacao e fechamento

- [ ] `npm run gen:mcp-catalog` se aplicavel (nao deve mudar nesta rodada).
- [ ] `tsc`, `eslint` (arquivos tocados), `jest`, `next build` verdes.
- [ ] Varredura de travessao nos arquivos tocados.
- [ ] Smoke test das rotas no dev server.
- [ ] Code review + UI review inline (`ui-ux-pro-max`).
- [ ] Atualizar `STATUS.md`, `HISTORY.md`, plano (Progresso); remover
  `docs/agents/active/claude-f4-onda2-correcoes-r5.md`; commit; push.

## Ordem

A -> B -> C -> D -> E -> F -> G -> H -> I.

---

## Progresso

- [ ] Area A, travessao do card Servidor MCP.
- [ ] Area B, motivo do erro nos Logs.
- [ ] Area C, ajustes do wizard de Chaves (stepper, tenant, modal travado, seletor,
  separar Origens/Resumo).
- [ ] Area D, calendario no padrao (largura, mes/ano, faixa de anos).
- [ ] Area E, trava de rolagem e titulo da Documentacao.
- [ ] Area F, Webhooks (HEAD, /api/webhooks/, path unico, updateWebhook, card, edicao).
- [ ] Area G, Plugar MCPs (wizard, testar antes de conectar, status, card, edicao).
- [ ] Area H, tours atualizados.
- [ ] Area I, verificacao e fechamento.

---

## Historico de review

### Review #1 (v1 -> v2), achados materiais aplicados

1. **B nao verificava se o dado existe.** `McpAuditLog` tem `errorCode`/`errorMessage`,
   mas `queryAuditLogs`/`AuditLogItem` podem nao retorna-los. B1 agora manda conferir
   e adicionar ao select e ao tipo antes de exibir.
2. **F2 assumia rota a renomear.** Nao ha rota `/api/hooks`; F2 esclarece que e so o
   texto exibido (helper), sem migracao de rota.
3. **G2 nao tinha como testar antes de criar.** `testExternalMcpServer` testa por id.
   G2 agora manda investigar e escolher entre uma action de teste com campos crus ou
   criar-desabilitado-testar-habilitar, documentando a decisao.
4. **E1 ("trava de rolagem") repetia a abordagem da r4 que falhou.** v2 troca para um
   espacador de fundo dinamico medido (container - secao - offset), que e a unica forma
   de a ultima secao chegar ao topo sem rolagem morta.

### Review #2 (v2 -> v3), achados materiais aplicados

1. **C era um epico.** Quebrado em C1 (stepper), C2 (tenant), C3 (modal travado),
   C4 (seletor), C5 (separar Origens/Resumo), cada um com escopo unico e commit.
2. **F misturava model, action e UI.** Quebrado em F1 (HEAD), F2 (base URL), F3 (path
   unico), F4 (updateWebhook), F5 (card), F6 (modal de edicao).
3. **G nao dizia como o teste pre-criacao integra com `lastStatus`.** G3 agora define
   os 3 estados (Conectado / Sem conexao / Desativado) derivados de `enabled` +
   `lastStatus`, e G5 define a regra de re-teste por campo alterado.
4. **D2 dependia da versao do react-day-picker.** D2 agora aceita duas implementacoes
   (components.Dropdown custom OU caption proprio) e manda decidir na execucao, com o
   resultado fixado: visual do `CustomSelect`, mes por extenso, ano em janela de ~10
   ate 2056.
5. **C3 e C5 interagem.** Com 5 passos e modal travado, o corpo que rola e por passo;
   C3 fixa header/footer e rola so o corpo, e C5 acrescenta o passo sem reabrir C3.
6. **H precisa vir depois de C-G.** Ordem confirmada: tours por ultimo, ja sobre as
   telas finais.
