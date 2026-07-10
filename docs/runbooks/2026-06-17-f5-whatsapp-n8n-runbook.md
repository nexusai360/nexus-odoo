# Runbook , Integração WhatsApp ↔ Agente Nex via n8n (F5)

> Como ligar o WhatsApp ao Agente Nex usando o n8n como ponte, através de uma
> **Conexão com WhatsApp** (Integrações → Webhooks → Novo → Conexão com
> WhatsApp). Fluxo assíncrono com as duas pontas da conexão: o n8n recebe da
> Meta e chama a plataforma (RECEBIMENTO); a plataforma processa e dispara o
> resultado para o destino da conexão (ENVIO, evento `agent.reply`).
> Leitura obrigatória antes de configurar o n8n em produção.
>
> **Atualizado em 2026-07-09 (feature Conexão com WhatsApp):** rota fixa legada
> agora responde **410 Gone**; envelope de saída passou a ser ANINHADO; dedup é
> por `message.inboundMessageId`; o modo de resposta é POR CONEXÃO; e o disparo
> de saída é isolado por conexão (fail-closed).

## 1. Topologia , uma Conexão, duas pontas

```
Usuário(WhatsApp) → Meta → n8n (extrai campos, transcreve áudio)
   → [RECEBIMENTO] POST https://<plataforma>/api/webhooks/<slug>   ← canônica
        Authorization: Bearer <token de recebimento da conexão>
        (valida token, resolve usuário, aplica barreiras, enfileira)
   → worker processa (lock por usuário, sessão 24h, RBAC, runAgent, Judge)
   → [ENVIO]  POST <URL de destino da conexão>  (envelope `agent.reply`, HMAC)
   → n8n (receptor) deduplica por message.inboundMessageId → entrega no WhatsApp
```

- A **Conexão com WhatsApp** cria as duas pontas juntas, ligadas por um
  `connection_id`. O assistente tem 4 etapas (Recebimento · Envio · Revisão ·
  Conclusão) e exibe os dois tokens nas etapas em que são usados.
- **Isolamento por conexão (segurança):** a resposta (e o aviso de bloqueio) de
  uma conexão sai **somente** para o destino DAQUELA conexão. Conexão sem
  destino não dispara para ninguém (fail-closed) , não existe fallback para
  outros webhooks.
- **Rota antiga `/api/integrations/whatsapp/inbound`: DESCONTINUADA.** Responde
  **`410 Gone`** com corpo explicativo (não 404, não redirect). Quem ainda
  aponta para lá precisa migrar para a URL da conexão
  (`https://<plataforma>/api/webhooks/<slug>`).

## 2. Autenticação (as duas pontas usam esquemas DIFERENTES)

- **RECEBIMENTO (n8n → plataforma): Bearer token.** O n8n manda o header
  `Authorization: Bearer <token de recebimento>`. A comparação é timing-safe
  (`verifyToken`). Não há assinatura, não há timestamp.
  - O token é gerado pela plataforma quando o assistente abre e **só passa a
    valer quando a conexão é criada**. Se perder, rotacione (por ponta, na tela
    de edição da conexão).
  - A assinatura própria da Meta (`x-hub-signature-256`) é validada **no n8n**,
    não na plataforma.
- **ENVIO (plataforma → n8n): HMAC-SHA256.** A plataforma assina o envelope
  (`src/lib/whatsapp/emit-reply.ts`) com o **token de assinatura** da conexão:
  - `X-Timestamp`: epoch ms do disparo.
  - `X-Signature`: `HMAC_SHA256(token_de_assinatura, "${X-Timestamp}.${corpoJSON}")`, em hex.
  - **Valide essa HMAC no n8n** antes de confiar no payload.

## 3. Mapeamento do payload da Meta para o contrato de RECEBIMENTO

> Os nomes de campo abaixo são os do schema Zod real
> (`src/lib/whatsapp/inbound-payload.ts`), em `snake_case`. O número da empresa
> não vai no corpo: ele é da conexão (resolvido pelo slug da URL).

O n8n extrai de `body.entry[0].changes[0].value` e envia à plataforma:

| Campo enviado | Origem na Meta | Obrig. | Observação |
|---|---|---|---|
| `wa_id` | `messages[0].from` (= `contacts[0].wa_id`) | sim | número do usuário |
| `user_id` | `contacts[0].wa_id` ou o id estável do contato | sim | chave estável do contato |
| `type` | `messages[0].type` | sim | `text`, `audio`, `image`, `document`, `video`, `sticker` |
| `text` | `messages[0].text.body` **ou a transcrição do áudio** | sim* | obrigatório em `text` e `audio`; legenda opcional em mídia |
| `message_id` | `messages[0].id` (`wamid...`) | sim | idempotência/dedup |
| `timestamp` | `messages[0].timestamp` (segundos) | sim | normalizar para **ms** no n8n (epoch ms, inteiro positivo) |
| `contact_name` | `contacts[0].profile.name` | não | exibição no monitoramento |
| `media` | `{ url, mime_type, filename?, id?, sha256? }` | condicional | **obrigatório** quando `type` é `image`/`document`/`video`/`sticker` |

Exemplo mínimo de corpo (mensagem de texto):

```json
{
  "wa_id": "5534991908624",
  "user_id": "5534991908624",
  "type": "text",
  "text": "qual o faturamento deste mes?",
  "message_id": "wamid.HBgNNTUzNDk5MTkwODYyNBUCABIYIDc...",
  "timestamp": 1752080000000
}
```

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

## 4. Envelope de ENVIO , evento `agent.reply` (BREAKING CHANGE 2026-07-09)

> **Atenção:** o contrato de saída MUDOU DE NOVO. O formato plano
> (`{event, deliveryId, kind, data: {...}, timestamp}`) foi substituído pelo
> envelope ANINHADO abaixo (SPEC §3.10). Não havia consumidor em produção
> quando a troca foi feita.

```jsonc
{
  "event": "agent.reply",
  "deliveryId": "<uuid NOVO a cada tentativa , NÃO use para deduplicar>",
  "kind": "final",                 // "final" (resposta) | "blocked" (barreira)
  "timestamp": 1752090000000,
  "connection": {
    "name": "<nome da conexão>",
    "businessId": "5561995630029"
  },
  "message": {
    "inboundMessageId": "wamid...",  // ← use ESTE campo para deduplicar
    "to": "5534991908624",
    "type": "text"
  },
  "session": {
    "conversationId": "<id | null se barrado antes da sessão>",
    "assistantMessageId": "<id da Message | null>"
  },
  "result": {
    "ok": true,                    // false nas barreiras e em falha técnica
    "reason": null,                // ver §5 quando ok:false
    "reply": "<texto da resposta OU a mensagem padrão da barreira>",
    "suggestions": ["...", "..."], // [] quando ok:false
    "deniedModule": null,          // só em permission_denied
    "allowedModules": []           // só em permission_denied
  },
  "diagnostics": {
    "tools": ["faturamento_periodo"], // [] quando ok:false
    "reasoningMs": 4200,              // 0 quando ok:false
    "model": "<modelo efetivo da resposta final | null em blocked/erro>",
    "usage": { "tokensInput": 1200, "tokensOutput": 340, "costUsd": 0.0021 }
  }
}
```

- `connection.name`/`connection.businessId` identificam a conexão que recebeu a
  mensagem (útil quando um mesmo fluxo atende mais de um número).
- `diagnostics.model` é o modelo que produziu o texto final (pós retry/tier);
  `null` em `kind:"blocked"` e em erro.
- Jobs enfileirados antes do deploy desta versão podem sair sem
  `connection.name`/`diagnostics.model` (campos nulos).

## 5. Barreiras de validação , como tratar cada `reason`

Quando `result.ok === false`, `result.reason` traz o código e `result.reply` o
texto padrão pronto para enviar ao usuário. Textos versionados em
`src/lib/whatsapp/blocked-messages.ts`:

| `reason` | Camada | Texto padrão (`reply`) |
|---|---|---|
| `user_not_found` | L1 (inbound) | Não encontrei seu número na plataforma. Peça ao administrador para cadastrar o seu WhatsApp. |
| `user_inactive` | L1 (inbound) | Sua conta está desativada no momento. Fale com o administrador para reativar o acesso. |
| `channel_disabled` | L2 (inbound) | O Agente Nex está desativado para o WhatsApp neste momento. |
| `role_not_allowed` | L2 (inbound) | Seu perfil ainda não tem acesso ao Agente Nex pelo WhatsApp. Fale com o administrador. |
| `daily_limit_exceeded` | teto (inbound) | Você atingiu o limite diário de mensagens ao Agente Nex. Amanhã o limite renova; se precisar de mais, fale com o administrador. |
| `media_unsupported` | worker | Recebi seu arquivo, mas ainda não consigo lê-lo por aqui. Por enquanto, me envie sua pergunta por escrito que eu te ajudo. |
| `permission_denied` | L3 (worker) | Sua pergunta toca em um módulo que o seu acesso na plataforma não cobre hoje. |
| `technical_error` | técnica | Não consegui processar sua mensagem agora. Tente novamente em instantes. |

- **L1/L2/teto** acontecem no inbound, **sem custo de IA** (não enfileiram, não
  chamam o LLM). Vêm com `kind:"blocked"`, **somente para o destino da conexão**.
- **A entrega do bloqueio respeita o modo da conexão** (§7): `n8n_webhook` →
  webhook de envio; `direct` → Graph API (cloud-client); nenhum caminho → log de
  aviso no servidor (nunca silêncio).
- **L3 (`permission_denied`)** acontece no worker, **antes do LLM principal**,
  mas cria sessão/Message e pode acionar o Judge. Traz `deniedModule` e
  `allowedModules` para o n8n montar resposta mais rica se quiser.
- **`media_unsupported`** cobre imagem/documento/vídeo/sticker (a leitura de
  mídia pela IA é etapa futura) e áudio Meta cru com o canal de áudio
  desligado. `technical_error` é só falha técnica de fato.

## 6. Idempotência e deduplicação (defesa de ponta no n8n)

- A plataforma é idempotente na saída: se a mesma `message_id` (inbound) for
  reprocessada, ela **reentrega o payload salvo** sem re-rodar o agente
  (`whatsapp:replied:{messageId}` no Redis).
- **No n8n, deduplique por `message.inboundMessageId`.** O `deliveryId` é
  gerado de novo a cada tentativa de entrega (retry de POST = outro
  `deliveryId`), então ele **não serve** como chave de dedup.

## 7. Modo de resposta POR CONEXÃO e trava de número único

- O modo de resposta (`direct` × `n8n_webhook`) agora é **da conexão** (coluna
  na linha de recebimento), com fallback para o singleton global e, por fim,
  `direct`. O assistente grava `n8n_webhook` ao concluir a etapa de Envio; a
  tela de edição grava ao configurar um destino.
- **Trava de número único (decisão do usuário, SPEC §3.4.1):** um número de
  WhatsApp existe em UMA configuração, e só uma , ou no canal direto
  (credenciais Meta em Integrações → Canais) ou numa Conexão por webhook. A
  trava vale nos dois sentidos, é verificada no servidor e compara o número
  normalizado (tolerando o nono dígito). A tela de Canais passou a resolver o
  telefone real (`display_phone_number`) na Graph API ao salvar (fail-closed).

## 8. Sessão e concorrência

- A sessão WhatsApp é a janela de 24h (igual à da Meta), encerrada de forma
  lazy. Não há encerramento manual.
- Mensagens paralelas do mesmo número são serializadas por um lock por usuário
  (Redis). Se duas chegarem juntas, a segunda espera (retry com backoff) , isso
  é normal e garante uma conversa por usuário sem sobrescrita.

## 9. Pendências e dívidas conhecidas

- ~~Mídia não suportada vs falha técnica~~ → resolvido em 2026-07-10:
  `media_unsupported` existe (ver §5).
- ~~Fuso do teto diário~~ → resolvido em 2026-07-10: o corte é a meia-noite de
  **America/Sao_Paulo** (`inicioDoDiaEmSaoPaulo`), não a do servidor (UTC).
- ~~`WhatsappInstance`~~ → removido em 2026-07-10 (modelo, tabela e telas; a
  tabela tinha 0 linhas em dev e em produção).
- ~~Drop das colunas legadas `bubbleEnabled`/`whatsappEnabled`~~ → dropadas em
  2026-07-10 (as frentes que ainda liam as colunas foram encerradas).
- **Jobs em voo no deploy:** payloads gravados no Redis antes da versão de
  2026-07-10 não têm `connection.name` nem `diagnostics.model` (saem `null`).
