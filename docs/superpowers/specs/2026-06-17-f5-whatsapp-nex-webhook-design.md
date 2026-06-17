# F5 , Integração WhatsApp ↔ Agente Nex via n8n/Webhook (SPEC v4)

> **Status:** SPEC v4. Incorpora os esclarecimentos do usuário (2026-06-17, tarde)
> sobre áudio, avaliação, validação em camadas e acesso por canal/nível, e o
> mapeamento do código real. Próximo passo após aprovação: PLAN (`CLAUDE.md §6`).
> **Branch:** `feat/router-ativacao-r2`.
> **Mudou v3 → v4 (correções de entendimento):**
> - **Áudio:** dois caminhos COEXISTEM , via n8n vem transcrito (texto + flag);
>   via Meta direto vem o arquivo e a plataforma transcreve (código atual). Nada
>   é removido; o microfone da bubble não se toca.
> - **Avaliação:** o Judge automático **roda para WhatsApp também** (já roda hoje
>   para todos os canais , `run-agent.ts:1422`). O que não existe é o **voto do
>   usuário** pelo WhatsApp. Gate de "pular avaliação" da v3 **revertido**.
> - **Origem** volta a separar Bubble vs WhatsApp (na tabela de avaliações **e**
>   nas sessões), já que WhatsApp tem avaliação.
> - **Validação em camadas antes da IA** (número → canal/nível → assunto), cada
>   bloqueio devolvendo **mensagem padrão** no webhook, sem gastar crédito de IA.
> - **Acesso por canal/nível:** trocar os toggles bubble/WhatsApp por um
>   **segmented control** (Desativado + níveis de perfil, com herança).

---

## 1. Objetivo

Conversa com o Agente Nex pelo **WhatsApp**, mesma inteligência do chat in-app,
via **n8n**, refletida no monitoramento e governada pelo RBAC. Reusa a infra
madura (inbound, HMAC, fila, sessão 24h, router, RBAC de catálogo, recusa por
permissão, Judge). Não é a F5 inteira.

Fluxo (**assíncrono, 2 webhooks**):

```
Usuário(WhatsApp) → Meta → n8n (extrai campos, transcreve áudio, assina HMAC)
  → [ENTRADA] POST /inbound (HMAC)
       → L1 número existe? (com/sem nono dígito)
       → L2 canal WhatsApp habilitado p/ o nível do usuário?
       (bloqueio em L1/L2 ⇒ dispara webhook de saída com MENSAGEM PADRÃO, sem fila/IA)
       → fila `agent`
  → worker: lock por usuário → sessão (24h)
       → L3 acesso ao assunto/módulo? (router + RBAC; recusa sem LLM se negado)
       → runAgent (MCP F4) → Judge (avaliação automática) roda normalmente
       → persiste + idempotência de saída + payload rico
       → emite `agent.reply` nos webhooks outbound habilitados (HMAC)
  → n8n (receptor) deduplica por deliveryId → entrega ao usuário
```

## 2. Decisões travadas

1. Resposta **assíncrona, 2 webhooks**.
2. **Camada de eventos no webhook** implementada agora (campo + UI + emissor).
   Evento real: `agent.reply`.
3. **Áudio , dois caminhos coexistem:** (a) via **n8n**: vem `type:"audio"` +
   `text` (transcrito) , a plataforma **não baixa/transcreve**, só marca como
   áudio; (b) via **Meta direto** (sem n8n): vem o `audioMediaId` e a plataforma
   **baixa e transcreve** (fluxo atual em `processor.ts:108-140`, **preservado**);
   (c) **microfone da bubble** (in-app) já funciona , **intocado**.
4. **Avaliação automática (Judge) roda para WhatsApp** (igual aos outros canais ,
   `run-agent.ts:1422`, sem filtro). **Não** existe voto do usuário pelo WhatsApp
   (sem UI de feedback). **Nada a mudar** no disparo do Judge.
5. **Origem distinta** (Bubble vs WhatsApp) na **tabela de avaliações** e nas
   **sessões** , agora faz sentido, pois WhatsApp gera avaliação.
6. **Validação em camadas antes da IA** (§5), cada bloqueio ⇒ **mensagem padrão**
   no webhook de saída, **sem acionar a IA**.
7. **Acesso por canal/nível** via segmented control (§6), com herança de nível.
8. **Sessão WhatsApp = janela de 24h**; sem encerramento manual.
9. **Heartbeat suprimido no WhatsApp** (só a resposta final / mensagens padrão).
10. **Monitoramento incluído** nesta entrega (aba "Bubble" → "Chat"); conflitos
    com `feat/nex-reconstrucao` resolvidos no merge (commits atômicos por arquivo).

## 3. Contrato , Webhook de ENTRADA (n8n → plataforma)

Calibrado pelo payload real da Meta (`body.entry[0].changes[0].value`):

| Campo | Origem (Meta) | Obrig. | Uso |
|---|---|---|---|
| `from` | `messages[0].from` (= `contacts[0].wa_id`) | sim | chave → usuário |
| `text` | `messages[0].text.body` **ou a transcrição do áudio** | sim | conteúdo |
| `type` | `messages[0].type` | sim | `text`/`audio` (nome mantido) |
| `messageId` | `messages[0].id` (`wamid...`) | sim | idempotência + correlação |
| `timestamp` | `messages[0].timestamp` (segundos) | sim | ordenação |
| `contactName` | `contacts[0].profile.name` | opcional | exibição no monitoramento |
| `phoneNumberId` | `metadata.phone_number_id` | opcional | rotear a resposta pelo nº certo |

Regras:
- `type` mantido (não renomear). `image` permanece no enum, rejeitado com
  mensagem amigável neste fluxo.
- **Áudio via n8n:** `type:"audio"` + `text` ⇒ o worker **usa o `text` direto**,
  passa `isAudio:true` ao `runAgent` (`run-agent.ts:209`; grava `Message.kind=
  "audio"`), e **pula** download/transcrição. **Áudio via Meta direto:** vem
  `audioMediaId` sem `text` ⇒ mantém o caminho atual (`downloadMedia` +
  `transcribeAudio`). O worker decide pelo que veio (`text` presente vs
  `audioMediaId`). **Nenhum dos dois caminhos é removido.**
- Validação cruzada: para `type ∈ {text,audio}` no fluxo n8n, `text` não-vazio;
  vazio ⇒ mensagem padrão (não `throw`).
- `timestamp`: a Meta manda segundos; normalização para ms é **no n8n** (sem
  mudança no Zod).
- Headers: `X-Signature` (HMAC-SHA256 de `${timestamp}.${body}`), `X-Timestamp`.
  A assinatura da Meta (`x-hub-signature-256`) é validada **no n8n**.

## 4. Resolução do usuário pelo número , nono dígito

A Meta manda sem o nono dígito (`553491908624`). **Regra (confirmada pelo
usuário):** ao receber, buscar o número **nas duas formas (com e sem o 9)**,
independentemente de como veio. No Brasil não existe o mesmo DDD+número como dois
usuários distintos (um com 9, outro sem), então **qualquer match é o usuário**.
- `resolve.ts:75`: trocar `findUnique({phoneE164})` por
  `findFirst({ where: { phoneE164: { in: phoneVariants(e164) } } })`
  (`phoneVariants` de `countries.ts:180`, mesma equivalência do cadastro).
- Sem match em nenhuma forma ⇒ status `unknown` ⇒ §5 L1 (mensagem padrão).

## 5. Validação em camadas ANTES da IA (sem gastar crédito)

Toda barreira que falha devolve uma **mensagem padrão** (código + texto) pelo
webhook de saída (§7, `ok:false` + `reason`), **sem acionar a IA**. O n8n trata
essas mensagens e responde ao usuário como quiser. (Há uma 1ª triagem no n8n; a
plataforma é a 2ª linha , RBAC estrutural da F4.)

- **L1 , Número existe (no inbound).** `resolveWhatsappUser` (§4). `unknown` ⇒
  `reason:"user_not_found"`; `inactive` ⇒ `reason:"user_inactive"`. Não enfileira.
- **L2 , Canal + nível (no inbound).** O WhatsApp está habilitado para o **nível**
  do usuário? (§6). Se canal `OFF` ⇒ `reason:"channel_disabled"` ("Agente Nex
  desativado para o WhatsApp"). Se o role do usuário < nível mínimo do canal ⇒
  `reason:"role_not_allowed"`. Não enfileira, não aciona IA. **Hoje
  `whatsappEnabled` é cosmético** (não bloqueia) , esta camada o torna efetivo.
- **L3 , Acesso ao assunto/módulo (no worker, dentro do runAgent).** **Já existe:**
  `respondPermissionDenied` (`permission-denial.ts:89-141`), disparado em
  `run-agent.ts:702-724` **antes do LLM** (custo zero), quando o domínio detectado
  pelo router não intersecta os domínios do usuário (`UserDomainAccess`). Reuso.
  Ajustes: garantir que a resposta volte no webhook (`reason:"permission_denied"`)
  e **enriquecer o template** com o **módulo desejado** e os **módulos permitidos**
  do usuário (o usuário quer esses dados para tratar no n8n).

Catálogo de **mensagens padrão** (um helper único, pt-br, versionado): textos
fixos por `reason` , o n8n pode usar o `reason` (código) e/ou o `text`.

## 6. Acesso por canal e por nível (segmented control)

**Hoje:** `AgentSettings.bubbleEnabled` e `whatsappEnabled` são dois booleans
(`schema.prisma:2798,2801`); a UI usa dois `Switch` (`agent-availability-card.tsx`).
A bubble aparece se `canUseAgent && bubbleEnabled` (`layout.tsx:94`); o WhatsApp
não checa nada (cosmético).

**Novo (decisão do usuário):** cada canal tem um **nível mínimo de acesso** com
herança, num **segmented control** (`SegmentedControl<T>` genérico , o
`FeatureCheckpoint` não serve, é rígido):
- Opções por canal: **Desativado** + os níveis de perfil **derivados do enum
  `PlatformRole`** (`super_admin/admin/manager/viewer`) e da hierarquia
  (`roles.ts:11-16`). Sem "Playground" (não se aplica). Os níveis vêm da fonte
  única de roles, então acompanham mudanças no enum (não hardcode na UI).
- **Herança:** o nível escolhido é o **mínimo**; quem tem role **≥** o escolhido
  acessa. `viewer` ⇒ todos; `manager` ⇒ manager+admin+super_admin; `admin` ⇒
  admin+super_admin; `super_admin` ⇒ só super_admin; `Desativado` ⇒ ninguém.
- **Schema:** substituir os dois booleans por dois campos de nível , novo enum
  `ChannelAccessLevel { off, viewer, manager, admin, super_admin }` (ou
  `PlatformRole?` + flag `off`). Campos `bubbleAccessLevel` e `whatsappAccessLevel`
  em `AgentSettings`. Migration (banco compartilhado , Onda 0). Default que
  **preserva o comportamento atual** (bubble/WhatsApp habilitados ⇒ `viewer`,
  i.e. todos; desabilitados ⇒ `off`).
- **Bubble some** quando in-app `off` **ou** role do usuário < nível: ajustar
  `layout.tsx:94` (`bubbleVisible`) , combinar com `canUseAgent` (que já checa
  domínios). Nenhuma mudança em `agent-bubble.tsx`.
- **WhatsApp** passa a respeitar o nível em L2 (inbound) , liga o gate hoje
  inexistente.
- UI: trocar os 2 `Switch` por 2 `SegmentedControl` em `agent-availability-card.tsx`;
  atualizar `updateAgentAvailability` (`agent-config.ts:534`), o DTO
  (`agent-config-types.ts`), `getPublicAgentFlags`/`getAgentSettings`, e a seção
  "Disponibilidade" da página (`configuracao/page.tsx`). `ui-ux-pro-max` no visual.
- **Nota:** os níveis são um **enum fixo de 4** (não tabela dinâmica). O seletor
  os deriva da lista de roles; criar um novo nível continua sendo mudança de enum
  (schema), mas a UI não precisa de edição manual (lê da fonte única).

## 7. Contrato , Webhook de SAÍDA (plataforma → n8n), evento `agent.reply`

**Breaking change** (o payload atual é `{to,message,messageId,timestamp}`,
`processor.ts:285-290`). Envelope assinado por HMAC (timestamp atual no disparo).
Cobre resposta normal **e** as mensagens padrão das barreiras (§5):

```jsonc
{
  "event": "agent.reply",
  "deliveryId": "<uuid por disparo, dedupe no n8n>",
  "kind": "final",                       // "final" | "blocked"
  "data": {
    "inboundMessageId": "wamid...",
    "to": "553491908624",
    "phoneNumberId": "593237780533272",
    "sessionId": "<conversationId | null se barrado antes da sessão>",
    "assistantMessageId": "<Message | null>",
    "ok": true,                           // false nas barreiras §5 e em falha técnica
    "reason": null,                       // user_not_found | user_inactive | channel_disabled | role_not_allowed | permission_denied | technical_error
    "reply": "<texto da resposta OU a mensagem padrão da barreira>",
    "suggestions": ["...", "..."],         // [] quando ok:false
    "tools": ["faturamento_periodo"],      // [] quando ok:false
    "reasoningMs": 4200,                   // 0 quando ok:false
    "usage": { "tokensInput":0, "tokensOutput":0, "costUsd":0 }, // zerado nas barreiras
    "messageType": "text",
    "deniedModule": "financeiro",          // só em permission_denied
    "allowedModules": ["estoque","fiscal"] // só em permission_denied
  },
  "timestamp": 1718630000000
}
```

Plumbing (Onda B):
- Estender `RunAgentResult` (dois ramos): `toolsCalled: string[]`
  (`allTurnToolNames`, `run-agent.ts:756`) e `reasoningMs` (somar `durationMs`
  por iteração `:951`, em memória no turno , `LlmUsage` é por conversa, não
  serve). Ramo `ok:false`: `toolsCalled:[]`, `reasoningMs:0`.
- `assistantMessageId` (Message) ≠ `inboundMessageId` (Meta).
- `phoneNumberId` percorre `inboundSchema` (§3) → `AgentJobData`
  (`processor.ts:38-57`) → envelope.
- Sem `suggestionsCount` (usa `suggestions.length`).
- **Bug `url`/`targetUrl`:** `route.ts:215` lê `outboundWebhook.url`; R6
  introduziu `targetUrl` (`schema.prisma:3131`) , o outbound pode estar **quebrado
  hoje**. Corrigir para `targetUrl ?? url`.
- **Fail-closed:** sem secret de saída válido, **não disparar** (hoje assina com
  `""` e envia , `processor.ts:292`).
- As barreiras §5 que ocorrem **no inbound** (L1/L2) disparam o webhook de saída
  **direto do inbound** (sem enfileirar), com `kind:"blocked"` + `reason`. A
  barreira **L3** (no worker) usa o retorno de `respondPermissionDenied`.

## 8. Concorrência , lock por usuário

Causa raiz: `getOrCreateWhatsappConversation` (`conversation.ts:92-113`) faz
`findFirst`+`create` sem atomicidade ⇒ 2 mensagens paralelas do mesmo número
criam 2 conversas e podem sobrescrever `reasoningHistory`.
- Reusar o padrão cluster-safe `set(key,val,"PX",ttl,"NX")` já existente
  (`worker/index.ts:220`). Chave `agent:lock:wa:{userId}`. Envolve get-or-create +
  runAgent + persistência. TTL ≥ timeout do turno (ex.: 120s).
- Não adquiriu ⇒ erro controlado ⇒ BullMQ re-tenta com backoff (espera a anterior).
- **Ordem best-effort**; **consistência garantida** (uma conversa/usuário, sem
  sobrescrita). FIFO estrito exigiria BullMQ Pro (fora de escopo).

## 9. Geração vs entrega , idempotência de saída

`processAgentJob` é linear. Sequência:
1. Topo do processor: se `whatsapp:replied:{messageId}` (Redis) existe ⇒ recupera
   o payload salvo e vai direto ao POST (pula `runAgent`).
2. Senão: lock → sessão → (L3) → `runAgent` (Judge roda) → persiste Message →
   grava `whatsapp:replied:{messageId}` com o payload serializado → dispara saída.
3. Falha de POST ⇒ retry só **reentrega** o payload salvo (não re-roda o agente).

## 10. Origem (Bubble vs WhatsApp) , na avaliação e nas sessões

Como o Judge roda para WhatsApp, há avaliações de WhatsApp. Separar:
- `channelToOrigem`/`ORIGEM_LABELS` (`rodada-labels.ts:45-66`): novas origens
  `agente-nex-bubble` (in_app) e `agente-nex-whatsapp`, labels "Agente Nex ·
  Bubble" / "Agente Nex · WhatsApp". Atualizar `getDistinctRodadas`
  (`queries.ts`, hoje soma `in_app`+`whatsapp` em `agenteNexCount`) e os testes
  (`rodada-labels.test.ts`). **Não** afeta a numeração de rodadas (decisão #11):
  origens virtuais entram por fora da sequência RX.
- Consumidores de `channelToOrigem`/`ORIGEM_LABELS` a tocar:
  `evaluations-table.tsx:320`, filtros de origem do monitoramento, router-filters.
- **Consumo (relatório do agente):** continua **sem** segmentar por canal (o
  usuário confirmou que lá não precisa detalhar Bubble vs WhatsApp).

## 11. Sessão WhatsApp + status no monitoramento

- Reusa `getOrCreateWhatsappConversation` (janela 24h). Encerramento **lazy**.
- Helper único de status por canal (substitui o `isActive` inline em
  `monitoramento-bubble.ts:208` e aplica em `listBubbleCollaborators:67`):
  in_app ⇒ "ativa" = `endedAt IS NULL`; whatsapp ⇒ `endedAt IS NULL AND
  updatedAt >= now()-24h`.

## 12. Webhook por evento (implementar agora)

- Schema: `enum WebhookEvent { agent_reply }` + `events WebhookEvent[]`
  (`@default([])`) em `WhatsappWebhook`. Serializa para `"agent.reply"`.
- **Backfill (cast Postgres):** `UPDATE whatsapp_webhooks SET events =
  ARRAY['agent_reply']::"WebhookEvent"[] WHERE direction='outbound';`
- Default na criação: outbound novo nasce com `['agent_reply']`.
- UI: seletor de eventos (checkbox) no `webhook-wizard.tsx` (passo 2) e
  `webhook-edit-dialog.tsx`, só para saída.
- Emissor: dispara para todos os outbound habilitados com `agent_reply`
  (substitui o `findFirst`, `route.ts:199`).
- Protocolo de schema (banco compartilhado): avisar, `agente schema-changed`,
  mergear cedo, coordenar com `feat/nex-reconstrucao`.

## 13. Monitoramento (aba Chat)

- Label "Bubble" → "Chat" (`monitoramento-nav.tsx`; textos da page). Rota mantida.
- Ampliar as ~9 ocorrências de `channel:"in_app"` em `monitoramento-bubble.ts`
  para `channel:{ in:["in_app","whatsapp"] }` (enumerar no plano).
- Marcador de canal por sessão (Bubble/WhatsApp) em `bubble-monitor-row.tsx`.
  Marcador de áudio já existe (`Message.kind="audio"` + `isAudio`, #125) , reusar.
- Status "ativa" pelo helper §11. Avaliação de WhatsApp aparece (Judge roda).
- Conflito com `feat/nex-reconstrucao` (`monitoramento-content.tsx`,
  `kpis-block.tsx`, `bubble-monitor*.tsx`, `monitoramento-nav.tsx`): onda por
  último, commits atômicos por arquivo, merge resolvido por mim.

## 14. Segurança + runbook do n8n

- HMAC pronto. Runbook: assinar com timestamp atual a cada (re)envio; os 2
  webhooks (entrada + receptor); validar a HMAC do `agent.reply` no n8n e
  deduplicar por `deliveryId`; mapear os campos do payload da Meta (§3); como
  tratar cada `reason` das barreiras (§5/§7); aviso de que o contrato de saída
  mudou (breaking, §7).
- `WhatsappChannel` (singleton `id:"global"`) é o caminho vivo; `WhatsappInstance`
  (R6) dorme , unificar fica fora de escopo (dívida documentada).

## 15. Sub-fases (ondas) e dependências

- **Onda 0 , Schema:** migration `WebhookEvent`/`events` (§12) + `ChannelAccessLevel`
  e `bubble/whatsappAccessLevel` (§6) + backfill/defaults. PRIMEIRA (banco
  compartilhado).
- **Onda A , Entrada + identidade + áudio + concorrência + barreiras inbound:**
  - A1 resolução por variantes (`resolve.ts`).
  - A2 contrato de entrada (`inbound-payload.ts`, `route.ts`, `AgentJobData`:
    `phoneNumberId`/`contactName`).
  - A3 áudio dois caminhos (`processor.ts`: usa `text` se veio; senão transcreve).
  - A4 lock por usuário (`processor.ts`).
  - A5 barreiras L1/L2 no inbound + catálogo de mensagens padrão + disparo de
    saída `kind:"blocked"`.
- **Onda B , Resposta rica + entrega idempotente + L3:** `RunAgentResult`
  estendido, envelope §7, idempotência §9, `url`→`targetUrl`, fail-closed,
  enriquecer `respondPermissionDenied` (módulo desejado/permitidos) e levá-lo ao
  webhook.
- **Onda C , Acesso por canal/nível (config):** segmented control §6 (UI +
  schema usado da Onda 0 + gates: bubble visibility no layout, WhatsApp em L2).
- **Onda D , Webhook por evento (UI + emissor):** §12.
- **Onda E , Monitoramento (aba Chat + origem):** §10, §11, §13. `ui-ux-pro-max`.
- **Onda F , Runbook n8n + verificação e2e final.**

Dependências: 0 → C,D; A → B; A1-A5 paralelizáveis; E por último (conflito).

## 16. Verificação (regra de raiz)

`tsc`+`eslint`+`jest` por unidade **e** e2e contra dado real: inbound assinado
com número **sem o 9** cadastrado **com** o 9 (A1); `type:"audio"`+`text` (A3) e
um áudio via mídia (caminho Meta, não regrediu); duas mensagens seguidas do mesmo
usuário (lock, A4); barreiras L1/L2/L3 retornando mensagem padrão **sem** custo
de IA; **Judge gerando avaliação para a conversa WhatsApp** (confirma §4);
webhook de saída com envelope rico + idempotência (retry não duplica nem re-roda);
seletor de canal/nível bloqueando bubble e WhatsApp conforme o role.

## 17. Pendências menores

1. Confirmar no E2E se o outbound usa `url` ou `targetUrl` hoje (corrigir).
2. Granularidade da contagem por canal no monitoramento de colaboradores.
3. Fuso do teto diário (`route.ts:170` , meia-noite do servidor; conferir BR).
4. Texto exato das mensagens padrão (§5) , revisar com o usuário no runbook.
