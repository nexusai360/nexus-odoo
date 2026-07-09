# SPEC v3 , Conexão com WhatsApp

> Transforma o tipo de webhook "Receber mensagens do WhatsApp" numa **Conexão com
> WhatsApp**: um objeto de configuração que cuida das duas pontas (recebimento e
> envio), com assistente guiado. Requisitos do usuário em 2026-07-09.
> Nenhuma menção a n8n em texto de produto.
>
> **v3** aplica as duas reviews adversariais. Mudanças materiais desde a v2:
> envelope de saída definido de verdade (era fantasia); regras de formatação
> refeitas (a v2 se contradizia com o próprio exemplo); contrato dos tokens
> fechado; rota legada vira `410` em vez de sumir; entrega de bloqueio no modo
> `direct`; propagação de `model` cobrindo todos os ramos.

## 1. Por que

O usuário precisa criar **dois** webhooks e entender sozinho que formam um par.
A plataforma não sabe que são um par, e por isso entrega a resposta de um cliente
no destino de outro (§2, A1/A1b).

## 2. Achados da perícia (medidos no código e no banco, não supostos)

| # | Achado | Evidência |
|---|---|---|
| A1 | A resposta vai para **todos** os webhooks de saída habilitados com `agent_reply` | `loadOutboundTargets()` (`inbound-handler.ts:54`) sem `where` de conexão |
| A1b | O vazamento **também ocorre no bloqueio**, antes de existir sessão | `fireBlocked()` (`inbound-handler.ts:78`) |
| A2 | Tabela markdown **já** vira lista no WhatsApp | `formatForChannel` (`build-reply-data.ts:62`), executado |
| A3 | O payload já leva `reply`, `suggestions`, `tools`, `reasoningMs`, `usage` | `AgentReplyData` (`emit-reply.ts:5`) |
| A4 | A lista sai verbosa: `- Cliente: X \| Valor: Y \| Notas: Z` | `convertTablesToList` (`by-channel.ts`) |
| A5 | `technical_error` cobre falha técnica **e** mídia não suportada | `processor.ts:294` |
| A6 | `model` **não existe** em `RunAgentResult` nem em `AgentReplyData` | `run-agent.ts:252-268` |
| A7 | O nome da conexão não trafega até o payload | `AgentJobData`, `AgentReplyData` |
| A8 | `responseMode` é **global** (singleton), mas a conexão é por número | `schema.prisma`, `inbound-handler.ts:211` |
| A9 | `businessId` é `@@unique` na tabela inteira | `schema.prisma` |
| A10 | A rota fixa `/api/integrations/whatsapp/inbound` pega o **primeiro** inbound | `route.ts:16` |
| A11 | Prod tem **uma** linha (inbound `Matrix Group`), nenhuma de saída | consulta ao banco de prod |
| A12 | `WhatsappInstance` existe no schema, sem uso vivo | `schema.prisma` |
| **A13** | **Prod não tem linha em `whatsapp_channel`** → `responseMode` cai no default `direct` | consulta ao banco: `count = 0`; `inbound-handler.ts:214` (`?? "direct"`) |
| A14 | `daily_limit_exceeded` **não emite nada**: o usuário no teto recebe silêncio | `inbound-handler.ts:206` |
| A15 | O envelope real é `{event, deliveryId, kind, data, timestamp}` com `data` **plano** | `emit-reply.ts:44` |
| A16 | `deliveryId` é `randomUUID()` por disparo; retry gera outro | `emit-reply.ts:43` |
| A17 | Credenciais Meta são **globais** (um `phoneNumberId`) | `schema.prisma`, `cloud-client.ts` |

**A1 e A1b são falha de segurança.** O "não encontrei seu número" expõe o telefone
de quem escreveu, e hoje iria para o destino de outra conexão.

**A13 é bloqueador operacional:** hoje, mesmo com o Envio configurado, o modo
global é `direct` e o webhook de saída **seria ignorado**.

## 3. Escopo

### 3.1 Nome e identidade

- Rótulo: **"Conexão com WhatsApp"**. Ícone **inalterado** (`MessageCircle`, verde).
- Descrição: *"Recebe as mensagens do WhatsApp, o Agente Nex processa e a
  plataforma devolve a resposta pronta para o seu fluxo."*
- Continua **exclusiva do super_admin** (PR #160).

### 3.2 Modelo de dados

Uma Conexão = **duas linhas** em `whatsapp_webhooks` ligadas por `connection_id`:

| campo | linha inbound | linha outbound |
|---|---|---|
| `direction` | `inbound` | `outbound` |
| `isWhatsappReceiver` | `true` | `false` |
| `path` (slug) | preenchido | `null` |
| `businessId` | preenchido | **`null`** (A9: único na tabela) |
| `targetUrl` **e** `url` | `null` | ambos preenchidos (`url` é legado, `loadOutboundTargets` lê `targetUrl ?? url`) |
| `events` | `[]` | `["agent_reply"]` |
| `secret` | token de **recebimento** | token de **assinatura** |
| `responseMode` (coluna nova) | preenchido | `null` |

`WhatsappInstance` é declarado **morto** (A12): não será estendido nem alimentado.
Ainda assim o `delete` da conexão **verifica a FK** `WhatsappInstance.webhookId`
antes de apagar, porque a FK existe no banco e estouraria. Remoção do modelo:
dívida em `docs/RADAR.md`.

**Migration** (aditiva, idempotente):
1. `connection_id uuid NULL` + índice.
2. `response_mode` (enum `WhatsappResponseMode`) `NULL`.
3. **Backfill:** toda linha inbound com `is_whatsapp_receiver` e `connection_id IS NULL`
   recebe um `connection_id` novo, e `response_mode = 'n8n_webhook'`
   **se e somente se** existir uma linha outbound habilitada com `agent_reply`;
   caso contrário fica `NULL`. Em produção isso atinge só o `Matrix Group` (A11),
   que fica sem destino e, portanto, sem modo forçado.

### 3.3 Isolamento por conexão (fecha A1 e A1b)

O `connectionId` é resolvido junto com o webhook de entrada e viaja pelo caminho:

1. `slug-inbound.ts` seleciona `connectionId`, `connectionName` e `responseMode`
   (hoje só `secret` e `businessId`).
2. `InboundWebhookContext` ganha os três.
3. `fireBlocked()` usa `loadOutboundTargets(connectionId)` , **este era o furo**.
4. O `channelConfig` do job usa `loadOutboundTargets(connectionId)`.
5. `loadOutboundTargets(connectionId)` filtra por
   `{direction:"outbound", enabled:true, events:{has:"agent_reply"}, connectionId}`.

**Fail-closed, sem fallback legado.** Conexão sem destino não dispara para
ninguém (a v1 previa cair nos webhooks legados, o que reintroduzia o vazamento).
Produção não tem linha outbound (A11): não há o que preservar.

**Trade-off declarado:** o job carrega os `outboundTargets` **resolvidos no
enqueue** (`channelConfig`). Num retry, o destino usado é o do enqueue, não o
atual. É aceitável (a janela é de segundos) e fica documentado; mudar isso exigiria
resolver os targets dentro do worker.

**Rota legada** (`/api/integrations/whatsapp/inbound`, A10): **não é removida**,
passa a responder **`410 Gone`** com um corpo explicativo, e **continua pública**
(senão o middleware devolveria um redirect de login em vez do 410). Assim o
comportamento é testável e a mensagem é clara para quem tiver configurado o
endereço antigo. Colaterais a atualizar juntos: `route.test.ts` daquela rota,
`public-paths.test.ts`, `scripts/verify-f5-onda4.ts` e o comentário-cabeçalho de
`inbound-handler.ts`.

### 3.4 Modo de resposta por conexão (resolve A8 e A13)

> **DECISÃO DO USUÁRIO (2026-07-09), substitui a proposta anterior.** Em vez de
> "bloquear `direct` da segunda conexão em diante", a trava é **por NÚMERO**, e
> vale nos dois sentidos: um número já configurado não pode ser reconfigurado por
> outro caminho. Ver §3.4.1.

#### 3.4.1 Trava de número único (regra dura)

**Esclarecimento:** `phoneNumberId` é um **identificador da Meta**
(ex.: `593237780533272`), não o telefone. O telefone (`5561995630029`) é o
`businessId` da conexão. São campos diferentes, e é por isso que hoje não há como
saber qual conexão é a "dona" da credencial global (SPEC A17).

**Chave de unicidade:** o telefone da empresa, **normalizado** (só dígitos, com
DDI, tolerando a ausência do nono dígito, do mesmo jeito que `resolve.ts` já faz
ao achar o usuário). Um número existe em **uma** configuração, e só uma.

Regras, verificadas na ação (servidor), não só na tela:

1. Criar/editar uma **conexão por webhook** com um número que já está em uso pelo
   **canal direto** → recusa:
   *"Este número já está configurado no envio direto pela Meta. Remova de lá antes
   de criar a conexão, ou use outro número."*
2. Configurar o **canal direto** com um número que já pertence a uma **conexão por
   webhook** → recusa:
   *"Já existe uma conexão de WhatsApp usando este número (`<nome da conexão>`).
   Edite essa conexão ou use outro número."*
3. Duas **conexões por webhook** com o mesmo número → já barrado pelo
   `@@unique([businessId])`, mas a mensagem passa a nomear a conexão existente em
   vez de estourar erro de banco.

**Como saber o telefone do canal direto:** o `WhatsappChannel` guarda só o
`phoneNumberId`. A Graph API expõe o `display_phone_number` a partir dele
(`GET /<phoneNumberId>`). A tela de Canais passa a **resolver e gravar** esse
número (coluna nova `phone_number`), para a trava ser comparável sem chamar a
Meta a cada validação. Se a resolução falhar, o canal não é salvo (fail-closed):
sem o número, não há como garantir a trava.

**Consequência:** o "footgun" de duas conexões em `direct` deixa de existir, sem
proibir o modo direto. Quem usa `direct` num número simplesmente não consegue
criar uma conexão por webhook para o mesmo número, e vice-versa.



`responseMode` passa a ser **da conexão** (coluna nova na linha inbound), com
fallback para o singleton global quando `NULL`.

- Ao concluir a etapa de Envio, o assistente grava `responseMode = n8n_webhook`.
  Sem isso, A13 faria a conexão nascer em `direct` e **ignorar** o destino.
- **A trava é por número (§3.4.1)**, não "só a primeira conexão pode `direct`".
  Decisão do usuário: o mesmo número não pode existir em dois caminhos.

### 3.5 Entrega das mensagens de bloqueio (resolve I1 da review #2)

`fireBlocked` hoje emite **sempre** por webhook, mesmo quando o modo é `direct`.
Nesse caso não há destino e o aviso é **silenciosamente descartado**: o usuário
bloqueado nunca sabe por quê.

Passa a respeitar o modo da conexão: `n8n_webhook` → webhook de saída da conexão;
`direct` → envio pelo `cloud-client`. Se nenhum caminho estiver disponível,
registra log de aviso (não engole em silêncio).

**A14** entra junto: `daily_limit_exceeded` passa a ser um `reason` emitido, com
mensagem própria. Hoje o usuário no teto diário recebe silêncio.

### 3.6 Ações sobre a Conexão (duas linhas, uma operação)

- **Criar** (`criarConexaoWhatsapp`): transação; grava as duas linhas com o mesmo
  `connection_id`. Recebe os dois tokens já gerados (§3.8) e os cifra.
- **Editar:** nome e descrição são da conexão (gravados nas duas linhas);
  recebimento e envio editam a sua linha. Não é assistente, é a tela de edição.
- **Apagar:** transação, apaga **as duas** linhas; se houver `WhatsappInstance`
  apontando, falha com mensagem clara em vez de estourar a FK.
- **Rotacionar:** dois tokens independentes; a ação recebe qual
  (`recebimento` | `assinatura`) e devolve o novo valor uma única vez.
- **Listar:** a tela mostra **uma** conexão (agrupada por `connection_id`).
- Todas revalidam a rota de Integrações/Webhooks.

### 3.7 Assistente de 4 etapas

O tipo é escolhido antes, na tela de seleção, e vira o cabeçalho. O indicador
passa a ser `Recebimento · Envio · Revisão · Conclusão`.

| Etapa | Conteúdo | Botão |
|---|---|---|
| 1. Recebimento | nome, descrição, endereço (slug) com a URL final visível, número da empresa, `POST` travado, **token de recebimento**, guia "Como montar o payload" **fechado** | **Concluir configuração e continuar** |
| 2. Envio | URL de destino, `POST` travado, **token de assinatura**, guia "O que enviamos" **fechado** | **Concluir configuração e continuar** |
| 3. Revisão | as duas pontas lado a lado, somente leitura | Criar conexão |
| 4. Conclusão | os dois tokens, com aviso de que não aparecem de novo | Concluir |

- Guias nascem **colapsados**. Nenhum texto cita n8n.
- Aviso visível na etapa 1, sem abrir nada: *"Enquanto o payload não for montado
  no seu ambiente, nenhuma mensagem chega ao Agente Nex."*
- O guia da etapa 2 diz, com todas as letras, que a deduplicação deve usar
  **`message.inboundMessageId`**, não `deliveryId` (A16).

### 3.8 Contrato dos tokens (fecha a ambiguidade da v2)

- Os dois tokens são gerados **no servidor**, numa ação sem efeito colateral
  (`prepararTokensConexao`), quando o assistente abre.
- Eles são **exibidos nas etapas 1 e 2** (onde o usuário precisa deles) e
  **repetidos na etapa 4**. Não são "revelados uma vez na conclusão": são os
  mesmos valores do começo ao fim do assistente.
- **Só passam a valer quando a conexão é criada.** A etapa 1 avisa: *"O token só
  funciona depois que você concluir a criação da conexão."*
- **Recarregar a página gera tokens novos** e invalida os que foram copiados
  (nada foi persistido). O aviso diz isso.
- Se o `submit` falhar (slug duplicado, por exemplo), os tokens continuam os
  mesmos e valem quando a criação for concluída.
- Depois de criada, o token só reaparece por **rotação**.

### 3.9 Payload de saída , envelope NOVO (breaking, declarado)

O envelope atual é `{event, deliveryId, kind, data, timestamp}` com `data` plano
(A15). O da §3.10 é **outra estrutura**, não o atual com dois campos a mais. Como
**não há nenhum consumidor** (A11: zero linhas outbound em produção), a troca é
segura. O runbook e os testes acompanham.

Mapa do que era para o que é:

| antes (`data.*`) | agora |
|---|---|
| `inboundMessageId`, `to`, `messageType` | `message.*` |
| `businessId` | `connection.businessId` |
| , | `connection.name` (novo, A7) |
| `sessionId`, `assistantMessageId` | `session.conversationId`, `session.assistantMessageId` |
| `ok`, `reason`, `reply`, `suggestions`, `deniedModule`, `allowedModules` | `result.*` |
| `tools`, `reasoningMs`, `usage` | `diagnostics.*` |
| , | `diagnostics.model` (novo, A6) |

### 3.10 Formato do payload

```jsonc
{
  "event": "agent.reply",
  "deliveryId": "uuid por disparo (NÃO use para deduplicar)",
  "kind": "final",              // "final" | "blocked"
  "timestamp": 1752090000000,
  "connection": { "name": "Matrix Group", "businessId": "5561995630029" },
  "message": { "inboundMessageId": "wamid...", "to": "5534991908624", "type": "text" },
  "session": { "conversationId": "...", "assistantMessageId": "..." },
  "result": {
    "ok": true,
    "reason": null,
    "reply": "texto já formatado para WhatsApp",
    "suggestions": ["...", "..."],
    "deniedModule": null,
    "allowedModules": []
  },
  "diagnostics": {
    "tools": ["faturamento_periodo"],
    "reasoningMs": 4200,
    "model": "gpt-5-mini",
    "usage": { "tokensInput": 1200, "tokensOutput": 340, "costUsd": 0.0021 }
  }
}
```

**Dedup:** por `message.inboundMessageId`. `deliveryId` muda a cada retry (A16).

**`model` (resolve A6 e I2):** é o **modelo efetivo da resposta final** (se houve
retry ou troca de tier, é o que produziu o texto). Entra no ramo `ok:true` de
`RunAgentResult`, e `permission-denial.ts` (que retorna pelo mesmo ramo) também
passa a preenchê-lo. Em `kind:"blocked"` de barreira (sem sessão) e em `ok:false`,
`model` é **`null`** , e o JSON declara isso.

### 3.11 `kind` e `reason`

- `kind:"final"` , processado. `ok:true`, `reason:null`.
- `kind:"blocked"` , barrado; `reply` já traz a mensagem pronta.
  `reason` ∈ `user_not_found`, `user_inactive`, `channel_disabled`,
  `role_not_allowed`, `daily_limit_exceeded` (novo, A14), `permission_denied`
  (traz `deniedModule`/`allowedModules`), `technical_error`.

**Dívida (A5):** `technical_error` também cobre "mídia não suportada". Criar
`media_unsupported` fica fora do escopo; registrar em `docs/RADAR.md`.

### 3.12 Formatação compacta para mobile (só código, nunca prompt)

O prompt **não muda**: é único e serve a bolha. A garantia é determinística, em
`by-channel.ts`. As regras da v2 se contradiziam (classificavam `12` como número,
mas o exemplo exigia `(12 NF)`). Contrato correto, em três classes de célula:

**Classificação (nesta ordem):**
1. **Moeda:** `/^-?\s*R\$\s*\d{1,3}(\.\d{3})*(,\d{2})?$/` (aceita negativo).
2. **Número:** `/^-?\d{1,3}(\.\d{3})*(,\d+)?$/` ou `/^-?\d+(,\d+)?%$/`.
   Não casa `1.2.3`, `,,,`, `.`, `R$` sozinho.
3. **Texto:** todo o resto.

**Montagem da linha:**
1. **Título** = primeira coluna não vazia, **sem rótulo**. Se todas vazias,
   descarta a linha.
2. **Moeda** entra em seguida, **sem rótulo**.
3. **Número** entra como `(valor RÓTULO)`, ex.: `(12 NF)`.
4. **Texto** entra como `(RÓTULO valor)`, ex.: `(Filial SP)`.
5. **Rótulo** vem de um mapa explícito (`Notas`→`NF`, `Quantidade`→`Qtd`,
   `Documento`→`Doc`, `Filial`→`Filial`, ...). Fora do mapa: o cabeçalho
   truncado em 8 caracteres.
6. **Truncamento nunca incide em moeda nem em número.** Só em texto, em **24**
   caracteres, com `...`.
7. **Teto de 4 colunas** por linha (constante nomeada); as demais são descartadas.
8. Células vazias são omitidas. Uma linha da tabela vira **uma** linha da lista.

Caso fixo (é o critério de aceite, e bate com as regras):

```
| Cliente          | Valor            | Notas |
| Jht Comercial SP | R$ 50.500.000,00 | 12    |
                    ↓
- Jht Comercial SP R$ 50.500.000,00 (12 NF)
```

Negrito, itálico, tachado e links seguem convertidos como hoje.

## 4. Fora de escopo

- `media_unsupported` (A5); remoção do modelo `WhatsappInstance` (A12): dívida.
- Múltiplos destinos por conexão.
- Credenciais Meta por conexão (A17): `direct` continua global, e por isso é
  bloqueado da segunda conexão em diante (§3.4).

## 5. Critérios de aceite (todos verificáveis)

1. **Isolamento na resposta:** duas conexões com destinos distintos; mensagem para
   A dispara **só** para o destino de A.
2. **Isolamento no bloqueio:** `user_not_found` na conexão A dispara **só** para o
   destino de A (fecha A1b).
3. **Fail-closed:** conexão sem destino não dispara para ninguém.
4. **Bloqueio em `direct`** é entregue pelo `cloud-client`, não descartado (§3.5).
5. `daily_limit_exceeded` chega ao usuário (A14).
6. Criar grava duas linhas com o mesmo `connection_id`; a listagem mostra **uma**
   conexão; apagar apaga as duas; com `WhatsappInstance` apontando, falha claro.
7. Rotação: cada token independente, exibido uma única vez.
8. **Trava de número (§3.4.1), nos dois sentidos:** conexão por webhook num número
   já usado pelo canal direto é recusada com mensagem clara, e o canal direto num
   número já usado por uma conexão também. Testes automatizados dos dois casos.
9. Guias começam fechados; o aviso da etapa 1 aparece sem abrir nada; o guia da
   etapa 2 orienta dedup por `inboundMessageId`.
10. Nenhuma **string visível ao usuário** contém "n8n" (o teste inspeciona textos
    de UI, não comentários de código).
11. **Formatação:** a entrada fixa da §3.12 produz **exatamente**
    `- Jht Comercial SP R$ 50.500.000,00 (12 NF)`. Mais casos: moeda negativa não
    é truncada; `1.2.3` é texto; 6 colunas produzem 4; primeira coluna vazia usa a
    próxima; linha toda vazia é descartada.
12. Payload no formato da §3.10, com `connection.name` e `diagnostics.model`
    preenchidos em `kind:"final"`, e `model: null` em `blocked`/erro.
13. `/api/integrations/whatsapp/inbound` responde **`410`** (não 404, não redirect).
14. Só super_admin cria/edita/apaga uma Conexão (mantém PR #160).
15. `tsc`, `eslint`, `jest`, `next build` verdes; E2E contra o dev real.

## 6. Riscos

- **Migration:** backfill idempotente; **não** copiar `businessId` para a linha
  outbound (A9 quebraria a unicidade).
- **A13:** conexões existentes ficam sem `responseMode`; se um destino for
  configurado depois, a edição precisa gravar `n8n_webhook`, senão o envio é
  ignorado em silêncio.
- **Envelope novo:** sem consumidor em produção (A11); runbook e testes acompanham.
- **Truncar texto** pode esconder informação: 24 caracteres, nunca em números, com `...`.
- **Rota legada em 410:** mudança de contrato público; vai para o runbook.
