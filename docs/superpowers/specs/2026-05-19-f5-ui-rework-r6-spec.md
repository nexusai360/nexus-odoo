# F5 — Rework de UI rodada 6 — SPEC

> **Versão:** v3 (2026-05-19) — pós review #1 e review #2. Log de reviews
> no §8. Ciclo SPEC v1 → review #1 → v2 → review #2 → v3 (CLAUDE.md §6).
> **Origem:** 6ª rodada de feedback do usuário sobre a UI da F5, somada aos
> itens das rodadas anteriores ainda não entregues.
> **Escopo:** somente UI/UX e ajustes de backend necessários para suportá-la.
> O backend funcional da F5 (agente, MCP, webhook) está pronto.

---

## 1. Contexto e objetivo

A F5 entregou o backend do Agente Nex (WhatsApp + chat in-app). A UI foi
reprovada em rodadas sucessivas. Esta rodada consolida **todo** o feedback
pendente: telas do Agente Nex (Prompt, Recursos, KB, Consumo, Playground,
Bubble) e o menu **Integrações** inteiro (Canais/WhatsApp, Webhooks, MCP, API).

**Princípios inegociáveis** (CLAUDE.md, HANDOFF §0–1):
- `ui-ux-pro-max` aplicado de fato em cada componente.
- Reusar o design system (`src/components/ui/*`). Zero `<select>` nativo.
  Zero componente divergente para o mesmo fim.
- Clonar visualmente o `nexus-insights` onde houver tela equivalente.
- "Agente Nex" em toda menção ao agente.
- Testar de verdade contra serviços no ar antes de declarar pronto.

**Fora de escopo:** novas capacidades de backend do agente; F6.

---

## 2. Decisões de design transversais

Aplicam-se a todas as telas tocadas.

### 2.1 Feedback de clicável (plataforma inteira)
Todo elemento clicável da plataforma nexus-odoo — botão, ícone-botão, linha
de lista clicável, card navegável, aba, item de menu — deve ter:
- `cursor-pointer` (mãozinha) no hover.
- **Tooltip** descrevendo a ação, exibido ao passar o mouse.

Implementação: um componente `Tooltip` único do design system (base-ui),
reusado em todo lugar. Onde já há `title=""`, migrar para o `Tooltip` visual
para consistência. Ícones-botão sem rótulo textual **exigem** tooltip
(acessibilidade — `aria-label` + tooltip).

**Escopo desta rodada:** cobre integralmente as telas tocadas (Agente Nex +
Integrações) e os componentes compartilhados de navegação/ação (`Button`,
sidebar, abas, cards). A varredura exaustiva de toda a plataforma fica como
item de RADAR de acompanhamento, como em §2.2.

### 2.2 Responsividade e adaptação ao tamanho de tela
A plataforma deve ser utilizável e bem proporcionada em **mobile, tablet,
desktop e telas grandes (TV/monitores 4K)**. Regras:
- Breakpoints sistemáticos do Tailwind (`sm` 640, `md` 768, `lg` 1024,
  `xl` 1280, `2xl` 1536).
- **Largura máxima de conteúdo por tipo de tela** — cada seção define o seu
  `max-w`, para não esticar conteúdo de leitura/formulário numa TV:
  - Telas de formulário/configuração (Configuração, Prompt, Recursos, WhatsApp
    wizard, etc.): `max-w-5xl` centralizado.
  - Telas densas de dado (Relatórios, Consumo, tabelas): `max-w-screen-2xl`,
    aproveitando a largura para colunas.
  - Chat (Bubble, Playground): largura de leitura confortável da mensagem
    (`max-w-3xl` para o fluxo de mensagens), painel lateral fixo.
- Sem scroll horizontal em mobile; tabelas largas → `overflow-x-auto`.
- Esta rodada **audita e corrige** as telas tocadas; um item de RADAR
  (`docs/RADAR.md`) registra a auditoria responsiva completa da plataforma
  como trabalho de acompanhamento.

### 2.3 Botão de ação primário das Integrações
Todas as integrações têm uma ação primária ("Novo webhook", "Nova API key",
"Adicionar instância"). Hoje o botão é tímido (outline, solto no topo).
Padrão novo: **botão primário roxo** (`variant="default"`), posicionado no
cabeçalho da seção, alinhado à direita do título, com ícone `+`.

### 2.4 Segredos exibidos uma única vez (secret/API key/token)
Quando a plataforma gera um segredo que só é exibido uma vez (secret de
webhook, API key, etc.), ele deve aparecer **dentro do fluxo de criação** —
no passo/modal de criação, como etapa final ("Copie o segredo agora") — e
não como uma tarja solta no topo da tela depois. Componente reutilizável:
`SecretRevealStep` (campo monospace + copiar + ocultar + confirmação de que
foi copiado, que fecha o fluxo).

### 2.5 Tag de direção / estado
Onde hoje há um ícone de check ambíguo (webhook "entrada"), usar uma **tag**
textual com cor semântica: `Badge` do design system — "Entrada" (azul/violeta)
/ "Saída" (âmbar). Reusada em webhooks e onde aplicável.

### 2.6 Sequenciamento — fundação antes da paralelização
Componentes compartilhados novos/alterados — `Tooltip`, `ExpandableTextarea`,
`SecretRevealStep`, o wizard de webhook compartilhado, o ajuste do `Button` —
e as **migrations de schema** são uma **fase de fundação** executada
**antes** dos blocos de feature. Só depois os blocos de feature (telas do
Agente Nex e cada integração) rodam **em paralelo** (subagentes Opus 4.7),
pois passam a depender de componentes estáveis e não conflitam entre si.

---

## 3. Telas do Agente Nex

### 3.1 Tela Prompt — modal de tela cheia
Os campos longos de texto da tela Prompt (Identidade base, Comportamento, e
qualquer textarea de prompt) recebem um **botão sutil de expandir** no canto
do próprio campo (ícone `Maximize2`, discreto). Ao clicar:
- Abre um **modal** que desfoca o fundo (scrim + blur).
- O modal é **largo** (`max-w-5xl`/`max-w-6xl`) e alto (ocupa quase toda a
  altura útil), com o textarea preenchendo o espaço.
- Edição no modal reflete no campo da tela ao fechar (mesmo estado).
- Botão de fechar claro; `Escape` fecha; salvar continua sendo a ação da tela.

Componente: `ExpandableTextarea` — encapsula textarea + botão expandir +
modal. Reusado em Identidade base, Comportamento e no Prompt da sessão do
Playground (§3.6 / G10).

### 3.2 Tela Prompt — respiro vertical
Aumentar (de forma sutil) o espaçamento vertical:
- Acima dos títulos de seção ("Identidade básica", "Comportamento").
- Abaixo das seções, antes dos botões "Salvar prompt" / "Salvar
  comportamento" — hoje colados ao fim do componente.
- Os botões de salvar ganham respiro do contorno do card que os envolve.
Escala de espaçamento do `ui-ux-pro-max` (4/8px); seções com `space-y`
maior e `pt`/`pb` nos cards.

### 3.3 Recursos — rótulos de provedor/modelo
Na seção Recursos, os seletores de áudio e de imagem hoje rotulam "Provedor
de áudio", "Modelo de áudio", "Provedor de imagem", "Modelo de imagem".
Trocar para apenas **"Provedor"** e **"Modelo"** (o contexto — dentro do
bloco "Entrada de áudio" / "Entrada de imagem" — já deixa claro).
O placeholder de busca "Buscar modelo de áudio…" vira **"Buscar modelo…"**.

### 3.4 Recursos — filtro de modelos por capacidade
- Seletor de **modelo de imagem**: lista **apenas** modelos com capacidade de
  visão (entendem imagem).
- Seletor de **modelo de áudio**: lista **apenas** modelos de áudio
  (transcrição/STT).
A capacidade vem do catálogo de modelos (`model-catalog` / `catalog.ts`) —
exige um campo/flag de capacidade por modelo (`modalities`/`capabilities`).
Se o catálogo ainda não marca isso, esta SPEC inclui adicionar o metadado.
O seletor de **provedor** lista apenas provedores **com chave de API
cadastrada**; vazio por padrão; sem chave → atalho "Nova chave" (como na
tela Configuração, §H2 da rodada 5). Adicionar seletor de **chave de API**
(provedor + modelo + chave), coerente com a tela Configuração — isso exige
campos `audioCredentialId` e `imageCredentialId` em `AgentSettings`
(migration aditiva — incluído no §5).

### 3.5 Recursos — Sugestões clicáveis como checkpoint de 3 estados
"Sugestões clicáveis" hoje usa um `Switch` simples. Trocar pelo **mesmo
controle de 3 estados** (Desativado / Playground / Produção) usado em Entrada
de áudio, Entrada de imagem e Base de conhecimento. Backend: `AgentSettings`
ganha `suggestionsCheckpoint` (`FeatureCheckpoint`, migration aditiva),
substituindo `suggestionsEnabled` (ou derivando: PRODUCTION/PLAYGROUND = on).
`run-agent` passa a respeitar o checkpoint (sugestões no playground e/ou
produção conforme o estado).

### 3.6 Recursos — respiro do bloco "Sugestões clicáveis"
O contorno do bloco "Sugestões clicáveis" está colado à borda inferior do
card geral "Recursos". Dar respiro: padding inferior do card e
espaçamento entre o último bloco e a borda. Mesma escala dos demais blocos.

### 3.7 Base de conhecimento — lixeira no lugar do X + alinhamento
> Substitui o G8 da rodada 4 (marcado "feito" no HANDOFF mas o "X" continua
> na tela — feedback do usuário).
- Remover o ícone "X" (circle-x) de cada documento da KB — ele é redundante
  com a lixeira.
- Manter **um único** controle de excluir: o ícone de **lixeira**.
- **Alinhar à direita** o cluster de controles de cada linha da KB
  (checkpoint de 3 estados + lixeira) à mesma margem direita dos controles
  da seção Recursos — as duas seções ficam visualmente alinhadas.

### 3.8 Tela Consumo — clone fiel do nexus-insights
A tela `/agente/consumo` é refeita como **cópia visual fiel** de
`nexus-insights/src/components/llm/consumo-content.tsx` e dos componentes
`.../llm/*`, `.../charts/*`, `.../reports/kpi-card`, `.../reports/period-pills`:
- Mesmos KPIs (cards), gráficos (área de custo, donut por provider, barras
  por modelo), cores (`CHART_COLORS`), tipografia, tags/pílulas, tabela de
  histórico com linha de total, paginação de 3 zonas, drill-down sheet.
- Seletor de período com "Personalizado".
- Adaptar **apenas os dados** à realidade do nexus-odoo (schema `LlmUsage`,
  `requestKind`, BRL/USD, providers cadastrados).
- Manter a coluna "Tipo" (texto/imagem/áudio/arquivo — G11, já existe) e
  permitir filtrar por tipo.
- Corrigir bugs de dados e qualquer dropdown que vaze o componente.
- **Inventário de dependências (pré-passo do plano):** a `consumo-content`
  do nexus-insights importa componentes compartilhados (`KpiCard`,
  `PeriodPills`, `charts/*`, `PeriodNavigator`, `UsageDetailSheet`,
  `UsageTableFilters`). O plano inventaria quais já existem no nexus-odoo
  (há `kpi-row`, `usage-charts`, `usage-table` próprios) e decide, por
  componente, entre **portar o do nexus-insights** (preferido, para
  fidelidade visual) ou adaptar o existente. O alvo é a paridade visual.

### 3.9 Playground — redesenho completo
Conforme o plano v3 Bloco D (D1–D9) e G10:
- D1: margem/padding/borda padrão das demais telas.
- D2: painel de sessão com **Provedor + Modelo + Chave de API**; nova sessão
  não pré-seleciona modelo; botão "Salvar" ao mudar; atualiza o card de
  histórico.
- D3: **nome** da sessão (campo `PlaygroundSession.title` já existe).
- D4: histórico de sessões navegável — clicar carrega a conversa; voltar
  para a sessão atual.
- D5: **tag `provedor · modelo`** em toda mensagem da IA; em mensagens de
  áudio/imagem, a tag do modelo que transcreveu/leu; persistida.
- D6: botão "Prompt da sessão" reposicionado e destacado.
- D7: enviar **áudio** no Playground (modelo de áudio dos Recursos).
- D8: input de mensagem de **uma linha que cresce** até um limite, depois
  rola internamente.
- D9: limpeza visual — remover separadores sem propósito.
- G10: a sub-tela "Prompt da sessão" é **visualmente idêntica** à tela
  Prompt (Identidade base, Comportamento, etc.), reusando os mesmos
  componentes, incluindo o `ExpandableTextarea` (§3.1).

### 3.10 Bubble do Agente Nex
- G4: o botão de **áudio (microfone)** vai para a **direita**, imediatamente
  antes do botão Enviar. Onde ficava o áudio (esquerda), entra um botão
  **"+"** de anexo que abre opções para anexar **imagem** e **arquivo**
  (sem vídeo).
  - Formatos de **imagem**: PNG, JPG/JPEG, WebP.
  - Formatos de **arquivo**: PDF, TXT, Markdown, CSV, XML (os mesmos aceitos
    pelo upload da KB).
- G5: investigar e tratar o erro de **permissão de microfone** — estado de
  permissão negada com mensagem clara; `getUserMedia` exige HTTPS (verificar
  implicação em produção). Vale para a bubble e o Playground.
- O input da bubble adota o mesmo input de uma linha que cresce (§D8), por
  consistência com o Playground.

### 3.11 Recursos / WhatsApp — regras de comportamento (G2)
Regra de backend já especificada na rodada 4, ainda pendente:
- Sugestões clicáveis: nunca enviadas ao WhatsApp (só in-app).
- Áudio com checkpoint que não cobre o WhatsApp + usuário envia áudio no
  WhatsApp → o agente responde que **não entende áudio**.
- Imagem idem → ignora silenciosamente.
- Na bubble in-app, os controles travados não precisam de mensagem.

---

## 4. Menu Integrações

### 4.1 Página Integrações — cards padronizados
Todos os cards (Canais, MCP, Webhooks, API, BI) com **tamanho idêntico**:
mesma altura e largura, num grid regular (`grid-cols-1 sm:grid-cols-2
lg:grid-cols-3`, `auto-rows-fr` para igualar altura). Descrições limitadas a
**2 linhas** (`line-clamp-2`), reservando a altura para 2 linhas mesmo
quando o texto tem 1. O card "BI — Em breve" mantém o tamanho e o estado
desabilitado. Ícone, título, descrição e chevron alinhados igualmente.

### 4.2 Canais — lista de canais enxuta
A tela Canais lista os canais disponíveis (hoje só WhatsApp). O item de
canal hoje é um retângulo gigante fora do padrão. **Decisão de design:**
redesenhar como **card compacto quase quadrado**, num grid (`grid-cols-2
md:grid-cols-3 lg:grid-cols-4`), ícone grande no topo, nome do canal e um
mini-indicador de quantas instâncias ativas. Fica visualmente distinto dos
cards retangulares da página Integrações (que têm ícone à esquerda + texto)
— evita a navegação monótona "retângulo dentro de retângulo". O card
WhatsApp é só um **atalho**: clicar leva à tela de instâncias (§4.3). Sem o
badge "Não configurado" (o estado é por instância, não por canal).

### 4.3 WhatsApp — gestão de instâncias
A tela do canal WhatsApp **não** mostra mais o formulário "Configure
credenciais". Mostra a **lista de instâncias** do WhatsApp:
- Cada instância é um **card quadrado** com nome, número, estado e uma
  **chavinha (Switch)** para habilitar/desabilitar rapidamente.
- Botão primário **"Adicionar instância"** (padrão §2.3).
- Estado vazio: mensagem + botão "Adicionar instância".

**Modelo de dados:** nova tabela `WhatsappInstance` (migration aditiva):
`id`, `name`, `phoneNumber`, `graphApiToken` (cifrado AES-256),
`businessAccountId`, `phoneNumberId`, `responseMode` (`DIRECT` | `N8N`),
`webhookId` (FK opcional para `Webhook`), `enabled` (boolean),
`createdAt`/`updatedAt`. Substitui o singleton de credenciais WhatsApp atual
(migrar o que existir; se o atual for um `AppSetting`/singleton, criar a
tabela e migrar). Server Actions: listar, criar, atualizar, habilitar/
desabilitar, testar conexão, excluir.

### 4.4 WhatsApp — wizard de criação de instância
"Adicionar instância" abre uma **tela nova** (rota dedicada, ex.
`/integracoes/canais/whatsapp/nova`) — **não** modal nem drawer — com um
**wizard passo a passo** com indicador de progresso:

- **Passo 1 — Identificação:** nome da instância + número do WhatsApp.
- **Passo 2 — Credenciais:** Token da Graph API, Business Account ID,
  Phone Number ID.
- **Passo 3 — Modo de resposta:** escolher `Direto (Meta)` ou `Webhook
  (n8n)`. Ambos exigem um **webhook** associado. O passo mostra uma **lista
  de webhooks** existentes (puxada da integração de Webhooks) para seleção.
  - Lista vazia → mensagem + botão **"Criar webhook"**.
  - "Criar webhook" abre um **modal** com o **mesmo wizard de criação de
    webhook** da §4.5 (componente compartilhado) — sem sair da tela do
    wizard de instância. Ao salvar, o webhook recém-criado é
    automaticamente selecionado, persistido, e passa a aparecer na
    integração de Webhooks.
- **Passo 4 — Testar e habilitar:** botão "Testar conexão"; o botão
  "Salvar" fica **desabilitado até o teste passar**. Switch "Canal
  habilitado" (padrão: habilitado). Ao salvar: persiste a instância, fecha
  o wizard e volta à lista de instâncias (§4.3).

Navegação entre passos: "Voltar"/"Próximo"; estado preservado entre passos;
sair do wizard pede confirmação se houver dados não salvos.

### 4.5 Webhooks — integração e wizard de criação
A tela de Webhooks:
- Botão primário **"Novo webhook"** destacado (padrão §2.3).
- Lista de webhooks criados, cada um com **tag de direção** (§2.5 — Entrada/
  Saída), o path/URL, data, switch de habilitado, "Rotacionar secret",
  "Remover".
- Criar webhook → **wizard** (mesmo componente usado embutido no §4.4):
  - **Direção:** Entrada ou Saída, com descrições claras:
    - *Entrada* — "A plataforma recebe eventos de sistemas externos (ex.:
      mensagens do WhatsApp encaminhadas pelo n8n)."
    - *Saída* — "A plataforma envia eventos para um sistema externo (ex.:
      dispara uma chamada ao n8n)."
  - **Webhook de Entrada:** a URL base é fixa (origem da plataforma) e
    exibida como prefixo read-only; o usuário define **apenas o caminho
    (path)** — o que vem depois da barra. Validação de path (slug seguro).
  - **Método(s) HTTP:** multi-seleção — GET, POST, PUT, PATCH, DELETE.
    Aceita um ou mais.
  - **Webhook de Saída:** o usuário informa a URL de destino completa.
  - **Secret:** gerado e exibido **no último passo do wizard** (§2.4 —
    `SecretRevealStep`), nunca como tarja solta no topo depois.
- Modelo de dados `Webhook` (ajustar/criar migration aditiva): `id`, `name`,
  `direction` (`INBOUND`|`OUTBOUND`), `path` (para inbound), `targetUrl`
  (para outbound), `methods` (string[] ou bitmask), `secret` (cifrado),
  `enabled`, `createdAt`. O componente de criação é **compartilhado** entre
  a tela Webhooks e o passo embutido do wizard de WhatsApp.

### 4.6 MCP — remodelar para o padrão visual
A tela MCP está fora do padrão (cores e componentes alheios à identidade).
Refazer com os componentes do design system:
- Cabeçalho padrão de Integração (ícone + título + descrição).
- Card de **status** do MCP usando os tokens semânticos (verde acessível /
  vermelho destrutivo) — investigar e exibir corretamente: o container
  `mcp` está no ar (porta 3100); o status "inacessível" precisa refletir
  uma checagem real de saúde do endpoint, e quando o container está de pé
  deve mostrar "acessível". Corrigir a checagem.
- Endpoint do MCP e Token de serviço em campos read-only com copiar/ocultar
  (componentes do design system).
- Bloco "Como rotacionar o token" e "Conectar o node Agent do n8n" como
  cards informativos no padrão (sem o visual atual desbotado).

### 4.7 API Keys — remodelar
A tela `/integracoes/api`:
- Botão primário **"Nova API key"** destacado (padrão §2.3).
- Criar key → o segredo aparece **no fluxo de criação** (§2.4 —
  `SecretRevealStep`), não como tarja solta.
- Lista de keys ativas e seção "Revogadas" (histórico) — manter o histórico,
  redesenhado no padrão, apenas informativo.
- Edição do nome da key: **opcional** — não é requisito; manter o nome
  definido na criação. (Decisão: nome editável fica fora de escopo desta
  rodada — YAGNI; o usuário sinalizou que o padrão atual serve.)
- Tag de escopo (`agent:query`) como `Badge` do design system.
- **Limpeza de banco:** zerar todas as `ApiKey` do banco (ativas e
  revogadas) e remover o webhook de teste — dados de teste do usuário.

---

## 5. Backend necessário (resumo)

Mudanças de schema (todas migrations aditivas):
- `AgentSettings.suggestionsCheckpoint` (`FeatureCheckpoint`) — §3.5.
- `AgentSettings.audioCredentialId` e `imageCredentialId` (FK opcional para
  a credencial usada nos modelos dedicados de áudio/imagem) — §3.4.
- `WhatsappInstance` — nova tabela — §4.3.
- `Webhook` — criar/ajustar para `direction`, `path`, `targetUrl`,
  `methods`, `secret`, `enabled` — §4.5. **O plano inspeciona o schema
  `Webhook` atual antes de decidir** (o modelo já existe parcialmente, pois
  a tela atual cria webhooks) — ajuste aditivo, sem quebrar o receptor de
  WhatsApp da F5.
- Catálogo de modelos: metadado de capacidade (`vision`/`audio`) — §3.4.

Limpeza de dados de teste (§4.7): zerar `ApiKey` e remover o webhook de
teste — feito por um script pontual durante a execução, autorizado pelo
usuário.

Server Actions novas/ajustadas: instâncias WhatsApp (CRUD + teste +
toggle), webhooks (CRUD + criação compartilhada), MCP health check,
API keys (criação com secret no fluxo).

Comportamento do agente (G2): `run-agent`/handler WhatsApp respeitam
checkpoints de áudio/imagem/sugestões por canal.

---

## 6. Critérios de sucesso

- Todo elemento clicável da plataforma: `cursor-pointer` + tooltip.
- Telas tocadas responsivas e bem proporcionadas em mobile/tablet/desktop/TV.
- Tela Prompt: modal de tela cheia funcionando; respiro vertical aplicado.
- Recursos: rótulos "Provedor"/"Modelo"; busca "Buscar modelo…"; modelos
  filtrados por capacidade; Sugestões clicáveis com checkpoint de 3 estados;
  respiro do último bloco.
- KB: lixeira no lugar do X; controles alinhados à direita.
- Consumo: clone fiel do nexus-insights, sem bugs de dado/dropdown.
- Playground: D1–D9 + G10 entregues.
- Bubble: "+" de anexo à esquerda, áudio à direita.
- Integrações: cards padronizados; Canais enxuto; WhatsApp com instâncias +
  wizard; Webhooks com botão destacado, wizard, tags, secret no fluxo; MCP
  remodelado e status correto; API Keys remodelada, secret no fluxo, banco
  limpo.
- `tsc`, `eslint`, `jest`, `next build` verdes; teste real (serviços no ar)
  de cada tela tocada.

---

## 7. Riscos e questões em aberto

- **R1 — Webhook como modelo existente.** Há um modelo `Webhook` parcial
  (tela atual cria webhooks). O plano deve inspecionar o schema atual antes
  de decidir migration aditiva vs. ajuste. Não quebrar o webhook receptor
  do WhatsApp já funcional da F5.
- **R2 — Credenciais WhatsApp atuais.** Há um formulário singleton de
  credenciais. Migrar para `WhatsappInstance` sem perder o webhook
  receptor já operante.
- **R3 — Capacidade de modelos.** Se o catálogo não tiver metadado de
  visão/áudio, adicioná-lo é pré-requisito de §3.4.
- **R4 — Responsividade.** Auditoria completa é grande; esta rodada cobre
  as telas tocadas e abre item de RADAR para o resto.
- **R5 — MCP health check.** Precisa de uma rota/checagem real; hoje o
  status pode ser heurístico. Verificar como é feito hoje.

---

## 8. Log de reviews (CLAUDE.md §6 [3]–[4])

### Review #1 (v1 → v2) — auditoria adversarial
Achados materiais aplicados:
1. §3.4 exige `audioCredentialId`/`imageCredentialId` em `AgentSettings` —
   não constava no §5. **Corrigido.**
2. §2.1 (tooltip) dizia "plataforma inteira" sem limite — risco de escopo
   infinito. **Corrigido:** escopo = telas tocadas + componentes
   compartilhados; resto vira RADAR.
3. §3.8 (Consumo) não previa o inventário de dependências de componentes do
   nexus-insights. **Corrigido:** pré-passo de inventário no plano.
4. §3.10 não definia os formatos aceitos de imagem/arquivo e omitia o G5
   (microfone). **Corrigido.**
5. §3.7 (KB) tinha ambiguidade no "lixeira onde estava o X". **Corrigido:**
   um único controle de excluir (lixeira), cluster alinhado à direita.
6. §4.2 (Canais) deixava o design do card vago. **Corrigido:** decisão
   explícita — card compacto quase quadrado em grid.
7. §4.5 propunha o modelo `Webhook` sem inspecionar o schema atual.
   **Corrigido:** plano inspeciona antes; ajuste aditivo.

### Review #2 (v2 → v3) — auditoria mais profunda
Achados materiais aplicados:
1. Paralelização cega causaria conflito em arquivos compartilhados (`Button`,
   componentes novos, schema). **Corrigido:** §2.6 — fase de fundação
   (componentes + migrations) antes dos blocos paralelos.
2. §3.5 troca `suggestionsEnabled` por `suggestionsCheckpoint` — há leitores
   existentes (`run-agent`, testes). O plano deve migrar **todos** os
   leitores na mesma task; `suggestionsEnabled` é removido, não duplicado.
   Registrado aqui como diretriz ao plano.
3. WhatsApp "testar conexão" gateando "salvar" impede salvar instância sem
   credenciais Meta válidas — **confirmado como intencional** (design
   explícito do usuário); sem mudança.
4. Decomposição: o escopo é grande mas coeso (rework de UI). **Decisão:**
   um único plano, estruturado em blocos independentes, cada um executável
   por um subagente Opus 4.7 em paralelo após a fundação.

Critério de saída atingido: as duas reviews não deixam achado material em
aberto. SPEC promovida a v3 — segue para o PLAN.
