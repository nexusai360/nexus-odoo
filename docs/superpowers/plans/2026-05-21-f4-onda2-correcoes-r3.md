# F4 Onda 2, Correções Rodada 3, Implementation Plan

> **For agentic workers:** sessão principal, inline, Opus 4.7, sem subagentes. Frontend
> obriga `ui-ux-pro-max`. Sem o caractere travessão. Ponto de retomada se o contexto resumir.
> Branch `feat/f4-onda2-mcp-escrita`. Cada task com commit próprio.

**Goal:** Terceira rodada de correções da F4 Onda 2 pedida pelo usuário em 2026-05-21,
focada em logs úteis, modal de chaves refeito, documentação clara, tour em todas as telas de
Integrações, e um padrão visual consistente entre Servidor MCP, Plugar MCPs e Webhooks.

**Erros de runtime já resolvidos:** o erro de hydration (sidebar) e o `prisma.userTourSeen
undefined` eram do dev server rodando código/cliente Prisma antigos. O código commitado está
correto; o dev server foi reiniciado limpo. Sem mudança de código necessária.

## Progresso (atualizar conforme avança; commits com prefixo `f4-onda2-fix-r3`)

- [x] Task 0, perfil do sidebar afinado.
- [x] Área A, logs (A1 filtro de status por `outcome`, A2 status Inválido, A3 detalhe com descrição da tool).
- [x] D1, helper `resolveMcpPublicUrl` e URL completa na Visão Geral e Documentação. Falta o bump de fontes da Visão Geral.
- [ ] Área B, modal de Chaves de Acesso refeito.
- [ ] Área C, documentação (C1 catálogo, C2 clareza/fontes/scrollspy/passo a passo, C3 nav funcional + hero sem ícone + título menor).
- [ ] Área D, restante, bump sutil de fontes da Visão Geral.
- [ ] Área E, botão de tour em todas as abas, reposicionado.
- [ ] Área F, Plugar MCPs redesenhado.
- [ ] Área G, Webhooks redesenhado + tour que ensina a criar.
- [ ] Área H, verificação e fechamento.

---

## Task 0 [UI]: Ajuste fino do perfil no sidebar

- [ ] Diminuir um pouco o nome e o nível de acesso do usuário no sidebar, mantendo ainda assim
  um tamanho maior que o original. Estado atual: nome `text-[15px]`, nível `text-xs` (12px);
  originais: nome 14px, nível 11px. Novo alvo, no meio do caminho: nome `text-[14.5px]`, nível
  `text-[11.5px]`. O círculo do avatar (34px) fica como está.
- [ ] `tsc` verde. Commit.

---

## ÁREA A — Logs do MCP úteis

## Task A1: Corrigir o filtro de status

- [ ] Investigar os valores reais de `status`/`outcome` gravados em `McpAuditLog` (consultar o
  banco: `SELECT DISTINCT status, outcome FROM mcp_audit_logs`). O filtro "Sucesso" não retorna
  nada, logo o valor enviado (`success`) não bate com o gravado.
- [ ] Ajustar `queryAuditLogs` para filtrar pelo valor correto (pode precisar filtrar por
  `outcome` em vez de `status`, ou normalizar). Garantir que cada opção do select funciona.
- [ ] Verificar contra o banco real (dev server no ar) que filtrar Sucesso retorna registros.

## Task A2: Status "Inválido" em português

- [ ] Os logs mostram um status tipo "input inválido" que não está no select. Mapear todos os
  status reais para rótulos em pt-br: Sucesso, Erro, Negado, Inválido. Sem termos em inglês.
- [ ] O select de status oferece exatamente esses rótulos; o filtro traduz o rótulo para o(s)
  valor(es) reais do banco. Inválido cobre os erros de validação de input.

## Task A3 [UI]: Detalhe de log informativo

- [ ] O detalhe expandido hoje mostra só duração e data quando não há parâmetros. Tornar útil:
  no topo do detalhe, uma frase humana do que aquela tool faz, obtida da `descricao` do catálogo
  (`getMcpCatalogSchema`) cruzando pelo nome da tool. Assim "estoque_produtos_parados" mostra
  "Consulta os produtos parados em estoque", respondendo ao "sucesso de quê".
- [ ] Mostrar o `result` (resumo do retorno) sempre que houver. Se o `McpAuditLog` não captura
  `result` para reads, exibir com clareza o que existe (tool, descrição, módulo, capability,
  status, duração) e a frase explicativa. Avaliar incluir um resumo no registro de audit se for
  barato; senão, registrar a limitação no RADAR.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA B — Modal de Chaves de Acesso refeito

> O modal está comprido e estreito, não aproveita o espaço. Refazer completamente.

## Task B1 [UI]: Redesenhar o layout do modal

- [ ] Consultar `ui-ux-pro-max`. Modal mais largo (ex.: `max-w-3xl`/`max-w-4xl`), com layout em
  duas colunas onde fizer sentido (dados da chave de um lado, acessos do outro), aproveitando o
  espaço horizontal. Sem ficar comprido e estreito.

## Task B2 [UI]: Capabilities por módulo com as 4 ações visíveis

- [ ] Deixar evidente, por módulo, o nível de acesso e as 4 ações de escrita (Criar, Atualizar,
  Excluir, Mover) quando o nível é Leitura e escrita. O usuário precisa VER as 4 seções, não
  descobrir. Rótulos em pt-br e humanizados.

## Task B3 [UI]: Origens permitidas com adicionar item a item

- [ ] Trocar a textarea crua por: um campo de URL + botão Adicionar; cada URL adicionada vira um
  chip/linha na lista, com botão de remover. Validar URL ao adicionar.
- [ ] `tsc`/`build`/`jest` verdes. Commit.

---

## ÁREA C — Documentação do MCP

## Task C1: Corrigir o catálogo de tools que não carrega

- [ ] Investigar por que `getMcpCatalogSchema()` retorna `unavailable`/erro. Ler a action e a
  fonte do catálogo. Causa provável: o catálogo depende do servidor `mcp` separado, que não roda
  em dev. Se for isso, a correção é derivar o catálogo de uma fonte in-app (o registro de tools
  do `mcp/catalog`) para funcionar sem depender do container. Corrigir para o catálogo carregar.
- [ ] Verificar contra o app no ar que a seção Tools mostra o catálogo com exemplos.

## Task C2 [UI]: Documentação mais clara

- [ ] Explicar entre parênteses os termos técnicos (RBAC, RLS, Zod, etc.) na primeira menção.
- [ ] Bump sutil (+1 unidade) nas fontes pequenas: texto dos cards de Conceitos e descrições do
  Fluxo de uma chamada. A fonte da Autenticação está boa, usar como referência.
- [ ] Bump +1 no rótulo "Navegação" da sidebar da doc.
- [ ] Remover a fileira de atalhos do hero (duplica a navegação lateral, não serve).
- [ ] Corrigir o scrollspy: hoje a última seção (Rate limits) nunca é selecionada por falta de
  scroll. Adicionar espaço de rolagem ao final (fundo preto estendido, sem mudar espaçamento nem
  rodapé) para a última seção poder ficar ativa.
- [ ] Adicionar um passo a passo claro de uso (autenticar, consumir, onde estão as tools e os
  exemplos) num lugar fácil. Mostrar a URL completa do MCP de forma destacada e copiável.
- [ ] `tsc`/`build` verdes. Commit.

## Task C3 [UI]: Navegação lateral funcional e ícone consistente

- [ ] A navegação lateral da doc precisa funcionar como atalho: clicar em um item rola a tela
  até a seção. Hoje `scrollToSection` usa `window.scrollTo`, mas o scroll real acontece no
  `<main>` do layout protegido (`overflow-y-auto`). Corrigir: usar `scrollIntoView` no elemento
  alvo (com `scroll-margin-top`) ou rolar o container correto. Clicar deve mover a tela.
- [ ] Correção de rota (instrução do usuário, substitui o pedido anterior sobre ícones): manter
  o ícone do `PageHeader` da rota de documentação (representa a seção Documentação). No hero
  dentro do `McpDocsContent`, **remover o ícone** (`Code2`). O título do hero "Servidor MCP",
  hoje grande demais (`text-3xl`), deve **diminuir de tamanho** e passar a incluir Documentação,
  ex.: "Servidor MCP, Documentação". A fonte da **descrição** abaixo do título não muda.
  Manter no hero a URL completa, os badges e o passo a passo.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA D — Visão Geral

## Task D1 [UI]: Aproveitar a tela e mostrar a URL completa

- [ ] Consultar `ui-ux-pro-max`. Visão Geral usa pouco a tela; deixar mais larga, bump +1 em
  todas as fontes, sutil.
- [ ] A URL pública mostrada e copiada deve ser a URL completa real (não abreviada). Criar um
  helper compartilhado `resolveMcpPublicUrl()` (server-side: `await headers()`, host + proto,
  com fallback para `NEXT_PUBLIC_APP_URL`) e usá-lo tanto na Visão Geral quanto na Documentação
  (Área C), para a URL ser idêntica e real nas duas telas.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA E — Tour em todas as abas e reposicionado

## Task E1 [UI]: Botão de tour em todas as abas do Servidor MCP

- [ ] Adicionar `TourTriggerButton` no cabeçalho de Chaves, Logs e Documentação (hoje só Visão
  Geral tem). Cada aba tem seu próprio mini-tour (2 a 3 passos) ancorado aos elementos daquela
  aba, para os passos sempre encontrarem alvo. `servidorMcpTour` continua o da Visão Geral.
- [ ] Reposicionar o "?" para perto do título, num lugar visível. Aumento sutil (+1) no tamanho.
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA F — Plugar MCPs redesenhado

## Task F1 [UI]: Redesenhar a tela de Plugar MCPs

- [ ] Consultar `ui-ux-pro-max`. Redesenhar a experiência no mesmo padrão das telas de
  Integrações (cabeçalho, cards, modal de cadastro se fizer sentido).
- [ ] Adicionar tour à tela (definição + `TourTriggerButton` + `TourAutoStart` + âncoras).
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA G — Webhooks redesenhado

## Task G1 [UI]: Redesenhar a criação de Webhook no padrão

- [ ] Consultar `ui-ux-pro-max`. Alinhar a tela ao mesmo padrão das demais de Integrações.
- [ ] Remover o texto específico de n8n da opção de direção ("Callback do n8n" vira genérico).
- [ ] Reposicionar o "?" para perto do título.

## Task G2: Tour de Webhook que mostra como criar

- [ ] Reescrever o `webhook-tour` para realmente guiar a criação: abrir o formulário, explicar o
  que vai em cada campo (direção, URL, etc.), não só dizer "crie aqui".
- [ ] `tsc`/`build` verdes. Commit.

---

## ÁREA H — Verificação e fechamento

- [ ] `tsc`, `eslint`, `jest`, `next build` verdes.
- [ ] Varredura de travessão nos arquivos tocados.
- [ ] Smoke test das rotas no dev server.
- [ ] Code review + UI review inline.
- [ ] Atualizar `STATUS.md`, `HISTORY.md`; commit; push.

## Ordem

A (logs) -> B (chaves) -> C (docs) -> D (visão geral) -> E (tour) -> F (plugar) -> G (webhooks)
-> H (verificação).
