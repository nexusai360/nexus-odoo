# Review adversarial — F5 ondas 4 e 6 (WhatsApp + menu Integrações)

**Data:** 2026-05-19
**Revisor:** Opus 4.7 (review adversarial, não-carimbo)
**Branch:** `feat/integracao-whatsapp`
**Escopo:** webhook receptor de WhatsApp, fila BullMQ `agent`, cliente Graph API,
credenciais Meta, 2 modos de resposta; menu Integrações superadmin.
**Contratos:** SPEC v3 §6/§7 · PLANO v3 ondas 4 e 6.

## Resultado da verificação executada

- Testes unitários: `hmac`, `cloud-client`, `worker/agent`, `whatsapp-channel`,
  `api-keys`, `webhooks` → **60/60 passando**.
- Script e2e `scripts/verify-f5-onda4.ts` → **8/8 passando** — porém rodou com
  **HMAC_SECRET não configurado** ("endpoint aceita sem validação"), ou seja,
  validou o caminho fail-open, não o caminho assinado.
- `curl` contra `/api/integrations/whatsapp/inbound` sem nenhuma assinatura,
  com banco sem `whatsapp_webhooks` inbound → endpoint **aceita e processa**
  (status 200, rejeição só por número desconhecido — a porta de autenticação
  estava aberta).

## Resumo de achados

| Severidade | Qtd |
|---|---|
| CRÍTICO | 2 |
| ALTO | 3 |
| MÉDIO | 4 |
| BAIXO | 3 |

---

## CRÍTICO

### C1 — Bug: modo `n8n_webhook` exige credenciais Meta indevidamente
**Arquivo:** `src/worker/agent/processor.ts:62-67`

No processor, mensagens de **áudio** chamam `buildCloudClientFromDb()`
*incondicionalmente* — antes de saber o modo de resposta. `buildCloudClientFromDb`
lança erro se `WhatsappChannel` não estiver habilitado ou se `encryptedApiToken`/
`phoneNumberId` faltarem (`cloud-client.ts:122-127`).

Consequência: no modo `n8n_webhook`, um áudio de WhatsApp **derruba o job** se as
credenciais Meta não estiverem preenchidas — embora a SPEC §6.2 desenhe o modo 2
justamente para *não* depender da Graph API da plataforma. O plano (Task 4.3) diz
"`n8n_webhook` → POST assinado no `outboundUrl`", sem menção a credenciais Meta.

Nuance: o download de mídia (§6.1.1) realmente precisa do token Meta para baixar
o binário do áudio — então áudio *sempre* exige token, independente do modo. Mas
isso não é o que a SPEC §6.1.1 diz: ela prevê "se as credenciais não estiverem
configuradas, áudio de WhatsApp responde com pedido de texto". O processor não
implementa esse fallback — ele simplesmente lança e o job falha (3 tentativas,
depois morto, **usuário nunca recebe resposta**).

Para `type=text` no modo `n8n_webhook` o fluxo está correto (não toca o cloud
client). O bug afeta: (a) áudio em qualquer modo sem credenciais → job morto sem
resposta; (b) divergência da SPEC §6.1.1 que pede fallback gracioso.

**Recomendação:** envolver o bloco de áudio em try/catch; se `buildCloudClientFromDb`
falhar, despachar uma resposta amigável ("recebi seu áudio, mas só consigo
processar texto no momento — envie sua pergunta por escrito") pelo modo
configurado, em vez de lançar. Nunca deixar o job morrer silenciosamente.

### C2 — Fail-open de autenticação no endpoint público inbound
**Arquivo:** `src/app/api/integrations/whatsapp/inbound/route.ts:61-79`

O endpoint só valida HMAC **se** existir um `whatsappWebhook` com
`direction:"inbound", enabled:true`. Sem esse registro (estado inicial do banco,
ou webhook desabilitado/deletado por engano), o bloco `if (inboundWebhook)` é
pulado e o endpoint processa **qualquer POST não autenticado**.

Confirmado empiricamente: banco sem `whatsapp_webhooks` → `curl` sem
`X-Signature` retornou 200 e o payload entrou no fluxo de resolução.

Gravidade: **alta**. É um endpoint público (liberado no middleware). Um atacante
que descubra a URL pode, sem credencial:
- enfileirar jobs do agente para qualquer número que esteja cadastrado em
  `user_whatsapp_numbers` (DoS / consumo de tokens LLM / custo);
- enquanto o número não estiver cadastrado a resposta é "rejected", mas o
  trabalho de resolução + audit já roda — e basta o atacante adivinhar/enumerar
  um número cadastrado para acionar `runAgent` de verdade.

O fail-open é um padrão clássico de vulnerabilidade: a postura segura é
**fail-closed** — sem secret configurado, rejeitar tudo.

**Recomendação:** inverter a lógica. Se não houver webhook inbound habilitado,
retornar `503` (ou `401`) — nunca processar. O endpoint só deve aceitar tráfego
quando há um secret para verificar. Adicionalmente, considerar um secret de
bootstrap em env (`WHATSAPP_INBOUND_SECRET`) como fallback de configuração, mas
**jamais** o caminho "sem secret = aceita".

---

## ALTO

### A1 — Teto diário por usuário está quebrado (conta a métrica errada)
**Arquivo:** `route.ts:128-169` combinado com `src/lib/agent/conversation.ts:52-70`

O endpoint deriva o teto diário contando `Conversation` com
`channel:"whatsapp"` e `createdAt >= todayStart`. Mas
`getOrCreateWhatsappConversation` **reutiliza** a conversa existente por uma
janela de 24h — só cria `Conversation` nova quando não há conversa recente.

Consequências:
1. O contador não mede "mensagens hoje" — mede "conversas WhatsApp *criadas* hoje".
   Um usuário que conversa o dia todo dentro da mesma janela de 24h gera **1**
   conversa → `userDailyCount` fica em 0 ou 1 para sempre. O teto de 100 nunca
   dispara. O controle de custo da SPEC §6.1.2 (B12) **não existe na prática**.
2. Pior: a conversa só é criada **dentro do processor** (`getOrCreateWhatsappConversation`
   roda no job, não no endpoint). No momento em que o endpoint conta, a conversa
   da mensagem atual ainda nem existe. O contador sempre olha o passado já
   processado — há uma defasagem estrutural.

O próprio código admite a fragilidade nos comentários (linhas 148-151:
"Aproximação conservadora… refinar se necessário"), mas a aproximação escolhida
não é conservadora — é **permissiva**: subconta drasticamente.

**Recomendação:** adicionar `userId` (nullable) em `ProcessedWhatsappMessage` e
contar mensagens processadas hoje por `userId`. Gravar o `userId` no
`create` da idempotência (já se conhece o usuário resolvido naquele ponto,
linha 125). O `todayCount` "morto" (linha 162 `void todayCount`) some.

### A2 — Endpoint inbound não tem rate limit — divergência direta do plano
**Arquivo:** `route.ts` (ausência)

A SPEC §6.1.2 (A8) e o **PLANO Task 4.4 Step 3** mandam explicitamente:
"Rate limit via `src/lib/rate-limit.ts`". O endpoint **não chama nada de rate
limit** — nem por IP, nem por número de origem. `src/lib/rate-limit.ts` existe e
está disponível.

Sem rate limit, mesmo com o HMAC funcionando, o n8n (ou quem tiver o secret)
pode martelar o endpoint; e enquanto C2 não for corrigido, qualquer um pode.
A SPEC distingue claramente rate limit (frequência) de teto diário (volume) —
nenhum dos dois funciona hoje (ver A1).

**Recomendação:** implementar rate limit no endpoint por IP e por `payload.from`,
antes da resolução de usuário. `rate-limit.ts` hoje é específico de login
(`checkLoginRateLimit`) — provavelmente precisa de uma função genérica
`checkRateLimit(key, max, windowSec)` ou adaptação. Tratar como item de plano
não cumprido, não como melhoria opcional.

### A3 — `req.text()` sem limite de tamanho de corpo
**Arquivo:** `route.ts:53-57`

`await req.text()` lê o corpo inteiro em memória sem teto. Endpoint público +
fail-open (C2) = um atacante pode enviar um corpo de centenas de MB e pressionar
memória do processo Next. O HMAC, mesmo quando ativo, é verificado **depois** de
ler o corpo todo, então não protege contra isso.

**Recomendação:** validar `Content-Length` antes de ler, ou ler com limite (ex.:
rejeitar > 256 KB — uma mensagem de WhatsApp normalizada é pequena). Retornar
`413 Payload Too Large`.

---

## MÉDIO

### M1 — `downloadMedia` confia cegamente na URL retornada pela Graph API (SSRF latente)
**Arquivo:** `src/lib/whatsapp/cloud-client.ts:94-97`

O passo 2 faz `fetch(meta.url)` com o `Authorization` da Meta anexado. `meta.url`
vem de resposta externa parseada como `{ url: string; mime_type: string }` com
cast direto, sem validação de host. Se a resposta da Graph API for adulterada
(MITM, ou um media-id malicioso roteando para outro host), o cliente faria um
request autenticado a um host arbitrário — vazando o Bearer token da Meta.

Risco real é baixo (TLS na Graph API), mas a defesa é barata.

**Recomendação:** validar que `meta.url` é `https:` e host
`*.facebook.com`/`*.fbcdn.net` antes do segundo fetch. Anexar o `Authorization`
só se o host casar.

### M2 — `sendText` sem timeout — job pode pendurar
**Arquivo:** `cloud-client.ts:57-80`, `82-107`; `processor.ts:126`

Nenhum dos `fetch` (sendText, downloadMedia, sendViaWebhook) tem `signal`/timeout.
Se a Graph API ou o `outboundUrl` do n8n pendurarem, o job BullMQ fica preso
ocupando um dos 3 slots de concorrência. A página MCP (`mcp/page.tsx:25`) usa
`AbortSignal.timeout(3000)` — o padrão existe no projeto, só não foi aplicado aqui.

**Recomendação:** `AbortSignal.timeout(...)` em todos os fetch do cloud-client e
no `sendViaWebhook`.

### M3 — `sendViaWebhook` engole falha de entrega — usuário não recebe resposta
**Arquivo:** `processor.ts:108-141`

No modo `n8n_webhook`, se o POST de saída falhar (`!response.ok`) ou se
`outboundUrl` faltar, a função só faz `console.error` e **retorna normalmente**.
O job é marcado como sucesso. Não há retry (o retry do BullMQ depende de o job
*lançar*). A resposta do agente é descartada silenciosamente — o usuário no
WhatsApp fica sem resposta e nenhum alarme dispara.

Compare com o modo `direct`: `sendText` *lança* em falha, então o BullMQ
reprocessa. Os dois modos têm semântica de erro inconsistente.

**Recomendação:** lançar erro quando `sendViaWebhook` falhar (status não-2xx ou
`outboundUrl` ausente), para que o BullMQ reprocesse com o backoff já
configurado. Se a intenção é não reprocessar, ao menos registrar em audit/log
estruturado, não só `console.error`.

### M4 — Idempotência registra a mensagem ANTES de enfileirar — perda em caso de falha
**Arquivo:** `route.ts:172-174` vs `217`

`prisma.processedWhatsappMessage.create(...)` roda **antes** de `queue.add(...)`.
Se o `queue.add` falhar (Redis indisponível, etc.), a mensagem já está marcada
como processada. A reentrega legítima do n8n cairá no caminho `noOp` (linha
103-105) e a mensagem **nunca será processada** — usuário sem resposta, sem erro
visível.

**Recomendação:** enfileirar primeiro, gravar a idempotência depois (ou as duas
numa transação com compensação). Aceitar o risco oposto (job enfileirado 2× se o
create falhar) é melhor — a SPEC já tem dedup por `messageId` na própria fila se
necessário, e processar 2× é menos grave que perder a mensagem. No mínimo, mover
o `create` para depois do `queue.add` bem-sucedido.

---

## BAIXO

### B1 — `inboundSchema` não exige `text` quando `type=text` / `audioMediaId` quando `type=audio`
**Arquivo:** `src/lib/whatsapp/inbound-payload.ts:27-31`

`text` e `audioMediaId` são ambos `.optional()` sem refinamento condicional. Um
payload `type:"text"` sem `text` passa a validação Zod (400 não dispara) e só
falha lá no processor (`processor.ts:73` lança "text ausente"). O erro acontece
tarde, no worker, em vez de ser rejeitado no endpoint com 400 claro.

**Recomendação:** `z.discriminatedUnion("type", ...)` ou `.refine(...)` para
exigir o campo correto por tipo.

### B2 — Conexão Redis lazy do endpoint nunca é fechada
**Arquivo:** `route.ts:39-48`

`agentQueueInstance` é um singleton de módulo com `IORedis` próprio. Em ambiente
serverless / múltiplas instâncias isso é aceitável, mas vale notar que não há
`close()` — em dev com hot-reload acumula conexões. Menor; aceitável para a fase.

### B3 — `ApiKey.createdById` não é FK e não há checagem de revogação no uso
**Arquivo:** `prisma/schema.prisma:1676-1689`; `src/lib/actions/api-keys.ts`

`createdById` é `String?` solto, sem `@relation` para `User` (os outros modelos
da F5 usam FK — ex.: `Conversation.userId`). Inconsistência de modelagem.
Além disso, não há nenhum consumidor que valide `keyHash` + `revokedAt` — a SPEC
§7.4.1 diz explicitamente que API keys são "infraestrutura entregue" sem
endpoint consumidor nesta fase, então isso está **dentro do escopo**; registrado
só para o caso de a F6 esquecer de checar `revokedAt` ao consumir.

---

## Aderência ao plano — ondas 4 e 6

| Task | Status |
|---|---|
| 4.1 HMAC + payload | OK (HMAC timing-safe, anti-replay ±5min corretos; ver B1) |
| 4.2 Cliente Graph API | OK funcional; ver M1, M2 |
| 4.3 Fila BullMQ `agent` | OK; ver C1, M3 |
| 4.4 Endpoint inbound | **PARCIAL — rate limit ausente (A2), fail-open (C2)** |
| 4.5 Server Actions canal | OK — cifra, gate super_admin, audit corretos |
| 4.6 Cleanup idempotência | OK — cron 24h, retenção 7 dias |
| 4.7 Runbook n8n | OK (arquivo presente) |
| 4.8 Verificação e2e | OK mas roda só o caminho fail-open (sem HMAC) |
| 6.1 Actions API keys | OK — SHA-256 unidirecional, key exibida 1×, revogação, gate |
| 6.2 Actions webhooks | OK — secret cifrado, rotação, gate |
| 6.3 Rota + layout + gate | OK — layout redireciona não-super_admin; nav `visibleTo:["super_admin"]` |
| 6.4 Canais → WhatsApp | OK |
| 6.5 MCP | OK — token mascarado server-side, ping de saúde |
| 6.6 Webhooks | OK |
| 6.7 API | OK |
| 6.8 BI placeholder | OK |
| 6.9 Verificação e2e onda 6 | OK |

### Pontos verificados e corretos (segurança)
- **HMAC:** comparação timing-safe (`timingSafeEqual`), normalização de
  comprimento antes da comparação, anti-replay com janela ±5min, timestamp
  dentro da mensagem assinada. Implementação **correta**.
- **Idempotência:** dedup por `messageId` (PK), replay → `noOp`. Correto
  (ressalva de ordering em M4).
- **Resolução de usuário:** número desconhecido/inativo → recusa; o número
  (`payload.from`) entra no job só como `replyTo` para entrega; **o `AgentJobData`
  passado a `runAgent` não carrega o número** — só `userId`. Contrato de
  identidade da decisão #10 respeitado.
- **RBAC menu Integrações:** gate triplo confirmado — `nav.ts` (`visibleTo`),
  `layout.tsx` (redirect), e cada Server Action (`isSuperAdmin`). viewer/manager/
  admin não veem nem acessam.
- **Credenciais Meta:** cifradas com AES-256-GCM (`encrypt`), token só exposto
  mascarado (`mask`), gate `super_admin`. Correto.
- **API keys:** hash SHA-256 unidirecional (não cifra reversível), `last4`
  guardado, key em claro retornada 1× e nunca persistida. Correto.

---

## Top 3 mais graves

1. **C2 — Fail-open de autenticação** no endpoint público inbound: sem webhook
   inbound configurado, qualquer POST não assinado é processado. Postura deve ser
   fail-closed.
2. **C1 — Modo `n8n_webhook` quebra com áudio sem credenciais Meta**: o processor
   chama `buildCloudClientFromDb` incondicionalmente para áudio; sem token, o job
   morre sem resposta ao usuário, contrariando a SPEC §6.1.1.
3. **A1 — Teto diário por usuário não funciona**: conta `Conversation` criadas
   hoje, mas conversas WhatsApp são reutilizadas por 24h — o contador trava em
   0/1 e o cap de custo (SPEC §6.1.2 B12) nunca dispara.
