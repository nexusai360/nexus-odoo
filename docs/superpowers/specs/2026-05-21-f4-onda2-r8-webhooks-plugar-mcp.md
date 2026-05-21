# SPEC, F4 Onda 2 Rodada 8: Webhooks no padrao + Plugar MCP com abas

> Spec de requisitos, capturados do feedback do usuario (audio + prints,
> 2026-05-21) e revisada uma vez por investigacao de codigo (ver secao 6).
> Sessao principal, Opus 4.7. `ui-ux-pro-max` em toda UI. Sem travessao.
> Branch `feat/f4-onda2-mcp-escrita`.

## 1. Contexto e objetivo

Feedback do usuario (audio + prints, 2026-05-21), duas frentes:

- **Frente 1, Webhooks** (`/integracoes/webhooks`): alinhar a tela de Webhooks ao
  padrao visual ja consolidado no painel Servidor MCP (cards com acoes em linha,
  criacao em modal-wizard, revelacao de segredo in-modal sem duplicidade).
- **Frente 2, Plugar MCP** (`/agente/plugar-mcps`): dar a esta tela a mesma
  estrutura de abas do painel Servidor MCP (Visao Geral, a tela atual, Logs), e
  alinhar o card de servidor ao mesmo padrao. A aba Logs exige um subsistema
  novo: registro das chamadas que o Agente Nex FAZ aos servidores MCP externos.

**Distincao critica (esclarecida pelo usuario):** os logs da aba Logs do Plugar
MCP sao das chamadas a **MCPs externos** que municiam o Agente Nex (recursos que
acoplamos a ele). NAO sao os logs do nosso MCP interno, que ja existem em
Integracoes > Servidor MCP > Logs. Sao subsistemas distintos.

## 2. Frente 1: Webhooks

### W1. Card de webhook no padrao
Hoje o `WebhookRow` poe o switch numa linha e os icones lapis/lixeira em outra
linha abaixo (`flex-col items-end`). Deve seguir o padrao do `ChaveRow` do
Servidor MCP: **switch, lapis, lixeira na mesma linha horizontal**, alinhados ao
centro vertical, nesta ordem. Sem mudanca de comportamento, so layout.

### W2. Criacao de webhook em modal
Hoje "Novo webhook" expande um painel inline (`WebhookWizard` embed na pagina).
Deve abrir um **modal (Dialog)** contendo o wizard, no mesmo padrao do
`ChaveDialog` (criacao de chave do Servidor MCP): passos dentro do modal, navega
ate concluir. O `WebhookWizard` ja e um wizard de 3 passos (Tipo, Configuracao,
Conclusao) e ja aceita `embedded`; sera renderizado dentro de um `Dialog`.

### W3. Conclusao e refresh
No passo final (Conclusao), o `SecretRevealStep` ja exibe o segredo com o botao
"Concluir" (default desde a r7). Ao **Concluir ou fechar pelo X**, o modal fecha
e a lista de webhooks atualiza sem reload, mostrando o webhook recem-criado.
Mesma logica aplicada a criacao de chave na r7 (refresh no `onOpenChange`).

### W4. Edicao de webhook: termo, botao duplicado, posicionamento
- **Termo:** padronizar "secret"/"Secret do webhook"/"Secret de assinatura"
  para **"token"** / **"token do webhook"**, coerente com a decisao da r7 (so
  "token"). Vale para o `WebhookEditDialog` e textos relacionados.
- **Bug do botao duplicado:** no `WebhookEditDialog`, quando o segredo e
  revelado apos rotacionar, aparecem DOIS botoes "Concluir": o do
  `SecretRevealStep` e o do rodape (`revealedSecret ? <Button>Concluir</Button>`).
  Correcao: quando revelando, NAO renderizar o rodape; o botao do
  `SecretRevealStep` e o unico (mesmo padrao do `ChaveDialog`).
- **Posicionamento:** o componente laranja (`SecretRevealStep`) deve ocupar a
  largura util do modal com margens simetricas. Hoje, com o rodape extra, o
  bloco fica desalinhado a direita. Remover o rodape na revelacao resolve;
  garantir o wrapper no mesmo padrao do `ChaveDialog` (`space-y-4`, sem footer).

### W5. Tour do Webhook adaptado ao modal
Como a criacao passa a ser modal, o `webhookTour` precisa ser revisto: o passo
do assistente passa a destacar o **modal inteiro** (selector no conteudo do
Dialog), com o card do tour ao lado, explicando os passos. O componente que
controla a abertura do modal durante o tour segue o padrao do `ChavesLista`
(`tourWizardOpen` por `currentStepIndex`). O `tour-overlay` ja re-tenta
localizar alvos que montam apos a troca de passo (fix da r7).

## 3. Frente 2: Plugar MCP

### P1. Card de servidor no padrao
Igual a W1: o `McpServerRow` poe switch numa linha e lapis/lixeira em outra.
Passar para **switch, lapis, lixeira na mesma linha**, centralizados, nesta
ordem. So layout.

### P2. Estrutura de abas
A pagina `/agente/plugar-mcps` ganha a mesma estrutura de abas do Servidor MCP
(visual `ServidorMcpNav`: pilulas numa barra `bg-muted`). Tres abas:

1. **Visao Geral** — resumo do estado dos MCPs externos.
2. **Servidores** — a tela atual (lista de servidores + wizard de conexao).
3. **Logs** — registro das chamadas do Agente Nex aos MCPs externos.

> **Decisao de nomenclatura:** o usuario chamou a aba do meio de "Chave de
> acesso" por analogia ao Servidor MCP, mas Plugar MCP nao tem chaves: conecta
> servidores. A aba se chama **"Servidores"** (nome correto do que a tela faz).
> Decisao registrada; se o usuario quiser outro nome, e troca de string.

Implementacao por **rotas** (nao tabs client-side), espelhando o Servidor MCP:
`layout.tsx` com header + nav; `page.tsx` (Visao Geral), `servidores/page.tsx`,
`logs/page.tsx`. Nav novo `PlugarMcpsNav` no padrao do `ServidorMcpNav`.

### P3. Aba Visao Geral
Resumo no padrao do `visao-geral.tsx` do Servidor MCP, adaptado ao dominio:
- **Servidores conectados:** total, e a quebra por estado (Conectado / Sem
  conexao / Nao testado / Desativado).
- **Uso nas ultimas 24h:** numero de chamadas a MCPs externos, taxa de erro,
  latencia tipica (do novo log).
- **Servidores mais usados:** top por numero de chamadas no periodo.
- Vazio honesto quando nao ha servidores ou nao ha chamadas.

### P4. Aba Servidores
A tela atual de `PlugarMcpsContent` (lista + `McpWizardDialog`), sem mudanca de
escopo alem de P1. O card ja foi coberto por P1.

### P5. Integracao agente -> MCP externo (capacidade nova, nao so UI)

**Achado de codigo (bloqueio resolvido pelo usuario):** hoje a tela Plugar MCP
so grava registros `ExternalMcpServer`; o Agente Nex NAO se conecta a eles. O
`run-agent.ts` abre sessao apenas com o MCP interno (`createMcpSession`). A
funcionalidade central do Plugar MCP nunca foi construida.

**Decisao do usuario:** construir a integracao. O Agente Nex passa a ser
**cliente** dos servidores MCP externos cadastrados e habilitados (ex.: MCP do
GitHub, do Slack). As tools desses servidores **municiam** o agente: somam-se
ao catalogo de tools que ele pode chamar. O agente nao e exposto via MCP; ele
consome MCPs externos.

**Desenho:**
- Modulo novo `src/lib/agent/external-mcp.ts`: dada a lista de
  `ExternalMcpServer` habilitados, abre uma sessao por servidor (transport
  `http` -> `StreamableHTTPClientTransport`; `sse` -> `SSEClientTransport`),
  com auth por servidor (`authHeader`/`authToken` decifrado). Lista as tools de
  cada um. Retorna: catalogo de tools externas + um roteador nome->servidor.
- **Namespacing:** tool externa e exposta ao LLM como `ext__<slug>__<tool>`,
  `slug` derivado do nome do servidor. Evita colisao com tools internas e entre
  servidores. Na chamada, o roteador remove o prefixo e despacha para a sessao
  certa. Tools internas continuam sem prefixo.
- `run-agent.ts`: alem de `createMcpSession` (interno), carrega as sessoes
  externas; o catalogo de tools entregue ao LLM e a uniao (internas +
  externas). Tool call: se o nome tem prefixo `ext__`, roteia para a sessao
  externa; senao, MCP interno.
- **Isolamento de falha:** servidor externo inalcancavel ou que falha o
  `listTools` e **pulado** (logado, nao derruba o run). Falha de uma `callTool`
  externa vira `tool_result` de erro para o LLM, como ja acontece com a
  interna. Toda sessao externa e fechada no `finally`.
- **Seguranca:** so servidores `enabled` entram. O `authToken` e decifrado no
  servidor (Node), nunca exposto ao cliente. A integracao roda no contexto do
  Agente Nex (modo interno), que ja e gated; nao abre rota nova.

### P6. Aba Logs do Plugar MCP

**Modelo de dados, `ExternalMcpCallLog`:**
- `id`, `serverId` (FK `ExternalMcpServer`, `onDelete: SetNull`), `serverName`
  (denormalizado, sobrevive a exclusao do servidor), `toolName`, `outcome`
  (`ok` | `error`), `durationMs`, `errorMessage` (nullable), `argsPreview`
  (json, parametros da chamada), `userId` (quem disparou o run), `criadoEm`.
  Indices em `criadoEm`, `serverId`.

**Captura:** no roteador de `external-mcp.ts`, cada `callTool` a um servidor
externo grava uma linha. Best-effort: falha de log nunca derruba a chamada
(try/catch, console.error em caso de falha).

**Consulta:** Server Action `queryExternalMcpCallLogs` (gate super_admin),
paginacao cursor-based por `criadoEm`, filtros por servidor, status e periodo,
no mesmo molde de `queryAuditLogs`.

**UI:** timeline no mesmo padrao visual de `logs-timeline.tsx` (linha com
horario, nome da tool, tag do servidor, status, duracao; detalhe expansivel com
parametros e, em erro, o motivo). Reuso do padrao visual, componente proprio
(`external-mcp-logs.tsx`), dominios distintos.

## 2.6. Frente 3: Ajustes finos (Servidor MCP > Logs)

### F3-1. Calendario: meses passados travados no ano minimo
No `DateField`, quando o ano selecionado e o ano minimo (ano corrente, 2026),
os meses anteriores ao mes corrente (mes de `fromDate`/hoje) devem aparecer
**desabilitados e nao selecionaveis** no `CustomSelect` de mes, cinza, coerente
com a trava da seta. Em anos acima do minimo, todos os 12 meses ficam livres.
Exige o `CustomSelect` suportar opcoes desabilitadas.

### F3-2. Calendario: ano cortado
O `CustomSelect` de ano ainda corta o ultimo digito ("202" em vez de "2026").
Recalibrar a largura para os 4 digitos caberem inteiros, com folga para o
chevron do select.

### F3-3. Logs: tag da chave com espaco e alinhada a esquerda
Na linha de log (`logs-timeline.tsx`), a tag da chave/"Agente Nex" esta colada
na tag de status. Precisa de: (a) espaco entre as duas; (b) **alinhamento fixo
a esquerda**: a tag da chave ocupa uma coluna de largura fixa, encostada a
esquerda, de modo que ela fique sempre na mesma posicao, sem se deslocar
conforme a largura da tag de status (que varia: "Erro" vs "Sucesso"). Uma
debaixo da outra, alinhadas.

## 4. Fora de escopo

- Logs do MCP interno (ja existem em Servidor MCP > Logs).
- Exportar CSV da aba Logs do Plugar MCP (pode entrar depois; nao pedido).
- Metricas historicas alem de 24h na Visao Geral.
- Teste E2E de escrita real (pendencia herdada, aguarda credenciais).

## 5. Criterios de aceite

- Webhooks: card com acoes em linha; criacao em modal; concluir/X dao refresh;
  edicao sem botao duplicado, termo "token", bloco de revelacao alinhado; tour
  adaptado ao modal.
- Plugar MCP: card com acoes em linha; tres abas no padrao Servidor MCP; Visao
  Geral com resumo real; aba Servidores funcional.
- Integracao agente -> MCP externo: o Agente Nex, num run, conecta nos
  servidores externos habilitados, lista e executa as tools deles (namespace
  `ext__`), com isolamento de falha; aba Logs lista as chamadas reais.
- Frente 3: meses passados desabilitados no ano minimo; ano com 4 digitos
  visiveis; tag da chave nos logs com espaco e alinhada a esquerda em coluna
  fixa.
- `tsc`/`eslint`/`jest`/`next build` verdes; sem travessao; migration aplicada.
- Teste end-to-end: subir o agente e exercer um MCP externo real (regra de raiz
  do CLAUDE.md, teste contra dado real para tudo que entrega tool/log).

## 6. Historico de revisao

Esta spec captura os requisitos passados pelo usuario por audio e prints. Sofreu
**uma revisao real**, motivada por investigacao de codigo durante a fase de
planejamento:

- **Achado:** o `run-agent.ts` so abre sessao com o MCP interno
  (`createMcpSession`); nenhum codigo le os registros `ExternalMcpServer` nem
  conecta o agente a MCPs externos. A funcionalidade central do Plugar MCP nunca
  foi construida. Logo, "logs das chamadas a MCP externo" nao tinha fonte.
- **Efeito na spec:** P5 deixou de ser "aba de logs" e passou a ser a
  **integracao agente -> MCP externo** completa (secao 3, P5); o log virou P6,
  com fonte real. Confirmado com o usuario, que pediu a construcao completa.
- **Frente 3:** feedback adicional do usuario (calendario e tag dos logs) entrou
  como secao 2.6.

As reviews adversariais formais acontecem sobre o **plano**, nao sobre esta
spec: ver `docs/superpowers/reviews/2026-05-21-r8-plan-review-{1,2}.md`.
