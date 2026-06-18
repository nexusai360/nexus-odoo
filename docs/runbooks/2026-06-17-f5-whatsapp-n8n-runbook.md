# Runbook , Integração WhatsApp ↔ Agente Nex via n8n (F5)

> Como ligar o WhatsApp ao Agente Nex usando o n8n como ponte. Fluxo
> assíncrono de 2 webhooks: o n8n recebe da Meta, chama a plataforma (ENTRADA);
> a plataforma processa e dispara o resultado de volta para um receptor do n8n
> (SAÍDA, evento `agent.reply`). Leitura obrigatória antes de configurar o n8n
> em produção.

## 1. Topologia , os 2 webhooks

```
Usuário(WhatsApp) → Meta → n8n (extrai campos, transcreve áudio, assina HMAC)
   → [ENTRADA]  POST  https://<plataforma>/api/integrations/whatsapp/inbound
        (a plataforma valida HMAC, resolve usuário, aplica barreiras, enfileira)
   → worker processa (lock por usuário, sessão 24h, RBAC, runAgent, Judge)
   → [SAÍDA]   POST  <URL do receptor n8n>   (envelope `agent.reply`, HMAC)
   → n8n (receptor) deduplica por deliveryId → entrega ao usuário no WhatsApp
```

- **ENTRADA:** webhook de ENTRADA da plataforma (cadastrado em Integrações →
  Webhooks, direção "Receber eventos", caminho `whatsapp/inbound`). O n8n é o
  cliente que chama esse endpoint.
- **SAÍDA:** webhook de SAÍDA da plataforma (direção "Enviar eventos"), com a
  URL do nó Webhook do n8n que vai receber a resposta. Marque o evento
  **`agent.reply`** (default já vem marcado). Sem o evento marcado, o webhook
  não recebe nada.

## 2. Assinatura HMAC (nas duas pontas)

A plataforma usa HMAC-SHA256 sobre `${timestamp}.${body}`:

- **ENTRADA (n8n → plataforma):** a cada (re)envio, o n8n monta:
  - `X-Timestamp`: timestamp ATUAL em ms (gerar na hora do envio, não reaproveitar).
  - `X-Signature`: `HMAC_SHA256(secret, "${X-Timestamp}.${corpoJSON}")`, em hex.
  - `secret`: o token revelado uma única vez ao criar o webhook de ENTRADA.
  - A assinatura própria da Meta (`x-hub-signature-256`) é validada **no n8n**,
    não na plataforma. A plataforma só confia na HMAC do n8n.
- **SAÍDA (plataforma → n8n):** a plataforma assina o envelope com o secret do
  webhook de SAÍDA e o timestamp do disparo. **Valide essa HMAC no n8n** antes
  de confiar no payload (mesmo esquema `${timestamp}.${body}`).

> Reenvio: como o timestamp entra na assinatura, todo reenvio precisa de
> `X-Timestamp` novo e `X-Signature` recalculado. Não reusar headers antigos.

## 3. Mapeamento do payload da Meta para o contrato de ENTRADA

O n8n extrai de `body.entry[0].changes[0].value` e envia à plataforma:

| Campo enviado | Origem na Meta | Obrig. | Observação |
|---|---|---|---|
| `from` | `messages[0].from` (= `contacts[0].wa_id`) | sim | número do usuário |
| `text` | `messages[0].text.body` **ou a transcrição do áudio** | sim* | conteúdo |
| `type` | `messages[0].type` | sim | `text` ou `audio` |
| `messageId` | `messages[0].id` (`wamid...`) | sim | idempotência/correlação |
| `timestamp` | `messages[0].timestamp` (segundos) | sim | normalizar para **ms** no n8n |
| `contactName` | `contacts[0].profile.name` | não | exibição no monitoramento |
| `phoneNumberId` | `metadata.phone_number_id` | não | roteia a resposta pelo nº certo |

- **Áudio (caminho n8n):** o n8n transcreve o áudio e envia `type:"audio"` +
  `text` com a transcrição. A plataforma usa o `text` direto, marca a mensagem
  como áudio e **não** baixa nem transcreve. Isso **independe** do checkpoint de
  áudio da plataforma (o gate de áudio só vale para o caminho Meta direto, sem n8n).
- `timestamp`: a Meta manda em **segundos**; o n8n multiplica por 1000 (ms)
  antes de enviar.
- `image` e demais tipos não suportados são recusados com mensagem amigável
  (ver §5, `technical_error` por ora).
- Número sem o nono dígito: a plataforma resolve o usuário buscando com e sem o
  9, então o n8n pode mandar o `from` como veio da Meta.

## 4. Envelope de SAÍDA , evento `agent.reply` (BREAKING CHANGE)

> **Atenção:** o contrato de saída MUDOU. Antes era
> `{ to, message, messageId, timestamp }`. Agora é o envelope abaixo. Quem já
> consumia o formato antigo precisa atualizar o nó do n8n.

```jsonc
{
  "event": "agent.reply",
  "deliveryId": "<uuid por disparo, usar para deduplicar>",
  "kind": "final",                 // "final" (resposta) | "blocked" (barreira)
  "data": {
    "inboundMessageId": "wamid...",
    "to": "553491908624",
    "phoneNumberId": "593237780533272",
    "sessionId": "<conversationId | null se barrado antes da sessão>",
    "assistantMessageId": "<id da Message | null>",
    "ok": true,                    // false nas barreiras e em falha técnica
    "reason": null,                // ver §5 quando ok:false
    "reply": "<texto da resposta OU a mensagem padrão da barreira>",
    "suggestions": ["...", "..."], // [] quando ok:false
    "tools": ["faturamento_periodo"], // [] quando ok:false
    "reasoningMs": 4200,           // 0 quando ok:false
    "usage": { "tokensInput": 0, "tokensOutput": 0, "costUsd": 0 },
    "messageType": "text",
    "deniedModule": "financeiro",      // só em permission_denied
    "allowedModules": ["estoque","fiscal"] // só em permission_denied
  },
  "timestamp": 1718630000000
}
```

## 5. Barreiras de validação , como tratar cada `reason`

Quando `data.ok === false`, `data.reason` traz o código e `data.reply` o texto
padrão pronto para enviar ao usuário. Use o `reason` para lógica/roteamento e o
`reply` para a mensagem. Textos atuais (versionados em
`src/lib/whatsapp/blocked-messages.ts`):

| `reason` | Camada | Texto padrão (`reply`) |
|---|---|---|
| `user_not_found` | L1 (inbound) | Não encontrei seu número na plataforma. Peça ao administrador para cadastrar o seu WhatsApp. |
| `user_inactive` | L1 (inbound) | Sua conta está desativada no momento. Fale com o administrador para reativar o acesso. |
| `channel_disabled` | L2 (inbound) | O Agente Nex está desativado para o WhatsApp neste momento. |
| `role_not_allowed` | L2 (inbound) | Seu perfil ainda não tem acesso ao Agente Nex pelo WhatsApp. Fale com o administrador. |
| `permission_denied` | L3 (worker) | Sua pergunta toca em um módulo que o seu acesso na plataforma não cobre hoje. |
| `technical_error` | técnica | Não consegui processar sua mensagem agora. Tente novamente em instantes. |

- **L1/L2** acontecem no inbound, **sem custo de IA** (não enfileiram, não
  chamam o LLM). Vêm com `kind:"blocked"`.
- **L3 (`permission_denied`)** acontece no worker, **antes do LLM principal**
  (sem custo do modelo principal), mas **cria sessão/Message e pode acionar o
  Judge** (há custo de IA do Judge, não do LLM principal). Traz `deniedModule`
  (módulo desejado) e `allowedModules` (os que o usuário acessa), úteis para o
  n8n montar uma resposta mais rica se quiser.
- **`technical_error`** cobre, por ora, também as recusas de mídia (imagem
  provisória, áudio desabilitado sem texto, fallback de áudio). Ver §8.

## 6. Idempotência e deduplicação (defesa de ponta no n8n)

- A plataforma é idempotente na saída: se a mesma `messageId` (inbound) for
  reprocessada, ela **reentrega o payload salvo** sem re-rodar o agente
  (`whatsapp:replied:{messageId}` no Redis).
- **No n8n, deduplique por `deliveryId`** (uuid por disparo) para não entregar
  a mesma resposta duas vezes em caso de retry de POST.
- **Janela estreita conhecida:** se o worker morrer entre persistir a Message e
  gravar a chave de idempotência, um retry pode re-rodar o turno e emitir um 2º
  `agent.reply` com **outro `deliveryId`** mas o **mesmo `inboundMessageId`**.
  Para idempotência de PONTA, o n8n deve deduplicar **também por
  `inboundMessageId`** quando precisar garantia forte (não só por `deliveryId`).

## 7. Sessão e concorrência

- A sessão WhatsApp é a janela de 24h (igual à da Meta), encerrada de forma
  lazy. Não há encerramento manual.
- Mensagens paralelas do mesmo número são serializadas por um lock por usuário
  (Redis). Se duas chegarem juntas, a segunda espera (retry com backoff) , isso
  é normal e garante uma conversa por usuário sem sobrescrita.

## 8. Pendências e dívidas conhecidas

- **Mídia não suportada vs falha técnica:** hoje ambas saem como
  `technical_error`. Se a operação quiser distinguir "mídia não suportada" de
  "falha técnica" de fato, criar uma `BlockReason` nova numa onda futura (fora
  de escopo desta entrega).
- **Fuso do teto diário:** a contagem do teto diário usa a meia-noite do
  servidor (`route.ts`). Conferir se bate com o fuso BR esperado antes de
  confiar no corte por dia.
- **`WhatsappChannel` vs `WhatsappInstance`:** o singleton `WhatsappChannel`
  (`id:"global"`) é o caminho vivo; `WhatsappInstance` (R6) dorme. A unificação
  fica fora de escopo (dívida documentada).
- **Drop das colunas legadas `bubbleEnabled`/`whatsappEnabled`:** deferido para
  depois do merge desta frente (banco compartilhado). Ver `docs/RADAR.md`
  (`R-f5-drop-booleans-legados`).
