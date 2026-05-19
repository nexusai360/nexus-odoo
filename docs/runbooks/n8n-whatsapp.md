# Runbook — Configuração do n8n para WhatsApp

> **Audiência:** administrador que irá conectar o n8n ao endpoint receptor da plataforma.
> **Última atualização:** 2026-05-19

---

## 1. Visão geral do fluxo

```
WhatsApp (Meta)
    │ mensagem
    ▼
n8n (webhook receptor Meta)
    │ transforma + assina HMAC
    ▼
POST /api/integrations/whatsapp/inbound
    │ valida + enfileira job
    ▼
Worker BullMQ (fila `agent`)
    │ roda o agente, obtém resposta
    ▼
[modo direct]  → Graph API (Meta) → WhatsApp
[modo n8n_webhook] → POST no outboundUrl → n8n → WhatsApp
```

---

## 2. Pré-requisitos

- n8n rodando e acessível pela instância da plataforma.
- Número de WhatsApp Business configurado no Meta (WABA).
- Credenciais Meta registradas na plataforma (Integrações → Canais → WhatsApp).
- URL pública da plataforma (`NEXT_PUBLIC_APP_URL`).

---

## 3. Endpoint receptor (n8n → plataforma)

### 3.1 URL de destino

```
POST https://<domínio-da-plataforma>/api/integrations/whatsapp/inbound
```

### 3.2 Headers obrigatórios

| Header | Valor |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Signature` | HMAC-SHA256 hex do corpo cru (ver §3.3) |
| `X-Timestamp` | Epoch ms atual (ex.: `1716109200000`) |

### 3.3 Cálculo do HMAC

A assinatura é calculada sobre a mensagem `${timestamp}.${bodyRaw}`:

```javascript
// Exemplo em JavaScript (n8n Code node)
const crypto = require('crypto');
const secret = $env.WHATSAPP_INBOUND_SECRET;  // variável de ambiente no n8n
const timestamp = String(Date.now());
const body = JSON.stringify($json);  // corpo que será enviado
const message = `${timestamp}.${body}`;
const signature = crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');

return [{
  json: $json,
  headers: {
    'X-Signature': signature,
    'X-Timestamp': timestamp,
  }
}];
```

O `WHATSAPP_INBOUND_SECRET` é o valor do campo **secret** do webhook inbound, configurado em
Integrações → Canais → WhatsApp → Webhooks (seção "Inbound").

### 3.4 Corpo JSON (payload de entrada)

```json
{
  "messageId": "wamid.HBgNNTUxMTk5...",
  "from": "+5511999999999",
  "timestamp": 1716109200000,
  "type": "text",
  "text": "Qual o estoque de bicicletas?"
}
```

Para mensagens de **áudio**:

```json
{
  "messageId": "wamid.HBgN...",
  "from": "+5511999999999",
  "timestamp": 1716109200000,
  "type": "audio",
  "audioMediaId": "1234567890123456"
}
```

Tipos de mensagem não suportados (imagem, documento, localização, etc.) devem ser
filtrados no n8n **antes** de enviar ao endpoint. O endpoint rejeitará com `400`.

### 3.5 Respostas esperadas

| Status | Significado |
|--------|-------------|
| `202` | Job enfileirado com sucesso |
| `200` `{noOp:true}` | Mensagem já processada (reentrega do n8n) |
| `200` `{rejected:true}` | Número desconhecido, inativo ou teto diário atingido |
| `400` | Payload inválido ou JSON malformado |
| `401` | Assinatura HMAC inválida |

---

## 4. Workflow n8n de recepção

Estrutura sugerida para o workflow de entrada:

```
[Webhook Meta] → [Extrair mensagem] → [Filtrar tipo suportado] → [Montar payload] → [Calcular HMAC] → [HTTP Request → /inbound]
```

### Nó "Filtrar tipo suportado"

```javascript
// n8n IF node
// Condição: type === 'text' || type === 'audio'
const type = $json.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type;
return ['text', 'audio'].includes(type);
```

### Nó "Montar payload"

```javascript
const msg = $json.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
const type = msg.type;

const payload = {
  messageId: msg.id,
  from: msg.from,
  timestamp: parseInt(msg.timestamp) * 1000,  // Meta envia em segundos, plataforma espera ms
  type,
};

if (type === 'text') payload.text = msg.text.body;
if (type === 'audio') payload.audioMediaId = msg.audio.id;

return [{ json: payload }];
```

---

## 5. Modo de resposta: `n8n_webhook` (saída da plataforma → n8n)

Quando o canal está em modo `n8n_webhook`, a plataforma faz um `POST` de volta ao n8n
com a resposta do agente.

### 5.1 Endpoint de saída (configurar na plataforma)

Em Integrações → Canais → WhatsApp → Webhooks (seção "Outbound"):
- **URL:** URL do webhook do n8n que irá receber a resposta.
- **Secret:** segredo para verificar a assinatura da plataforma.

### 5.2 Payload enviado pela plataforma → n8n

```json
{
  "to": "+5511999999999",
  "message": "Há 42 bicicletas em estoque.",
  "messageId": "wamid.HBgN...",
  "timestamp": "1716109200000"
}
```

Headers enviados:

| Header | Valor |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Signature` | HMAC-SHA256 do corpo (usando o outbound secret) |
| `X-Timestamp` | Epoch ms |

### 5.3 Verificar a assinatura no n8n

```javascript
// n8n Code node — verificação da assinatura de saída
const crypto = require('crypto');
const secret = $env.WHATSAPP_OUTBOUND_SECRET;
const signature = $headers['x-signature'];
const timestamp = $headers['x-timestamp'];
const body = $input.raw;  // corpo cru
const expected = crypto.createHmac('sha256', secret)
  .update(`${timestamp}.${body}`, 'utf8')
  .digest('hex');

if (signature !== expected) {
  throw new Error('Assinatura inválida — descartando mensagem');
}

return [{ json: JSON.parse(body) }];
```

### 5.4 Workflow de saída (n8n → WhatsApp)

Após verificar a assinatura, enviar via Graph API:

```
[Webhook n8n] → [Verificar HMAC] → [HTTP Request → Graph API /messages]
```

---

## 6. Janela de 24h da Meta

A Graph API permite envio de mensagens livres apenas dentro de 24h após a última
mensagem do usuário. Fora desse período, é necessário usar um **template** aprovado.

O agente responde sempre dentro da janela de 24h (o job é processado imediatamente).
Se o processamento atrasar mais de 24h por algum motivo, a resposta poderá falhar —
recomenda-se monitorar a fila BullMQ.

---

## 7. Variáveis de ambiente recomendadas no n8n

| Variável | Descrição |
|----------|-----------|
| `WHATSAPP_INBOUND_SECRET` | Secret HMAC para assinar requests ao endpoint `/inbound` |
| `WHATSAPP_OUTBOUND_SECRET` | Secret HMAC para verificar respostas da plataforma |
| `NEXUS_INBOUND_URL` | URL do endpoint receptor da plataforma |

---

## 8. Teste rápido do endpoint

Use o script `scripts/verify-f5-onda4.ts` para testar o endpoint localmente:

```bash
npx tsx --env-file=.env.local scripts/verify-f5-onda4.ts
```

O script testa 3 cenários:
1. Mensagem válida de usuário cadastrado → deve retornar 202.
2. Número desconhecido → deve retornar 200 com `{rejected:true}`.
3. Reenvio do mesmo `messageId` → deve retornar 200 com `{noOp:true}`.
