# F5 — Review adversarial #2 da SPEC v2 → achados para a v3

> Review #2 (de 2), mais profunda que a #1. Audita a SPEC v2 já corrigida.
> Critério: caçar o que sobrou — integração, conceito quebrado, exagero, lacuna
> de planejamento. Se não achar nada material, a review falhou.

## Achados materiais

**B1 — Ciclo de vida da sessão do cliente MCP (LACUNA DE INTEGRAÇÃO).**
A v2 (§4.5) diz que o cliente MCP "injeta o `userId` na sessão", mas não define
o **ciclo de vida** da sessão. O MCP da F4 é stateless e tem sessão por
`userId`. Com WhatsApp + in-app concorrentes, vários `userId` distintos chamam o
agente ao mesmo tempo. Decisão necessária na v3: **uma sessão de cliente MCP por
invocação de `runAgent`**, escopada àquele `userId`, aberta no início e
**fechada no fim** (try/finally). Sem pool global compartilhado entre usuários
(vazaria identidade). Conexão é barata (HTTP); correção > reuso.

**B2 — `runAgent` roda em dois processos — declarar explicitamente.**
In-app: `runAgent` roda **no request handler do Next** (`/api/agent/stream`),
síncrono, com `onEvent` escrevendo no SSE. WhatsApp: `runAgent` roda **no
worker** (job BullMQ), `onEvent` é no-op. A v3 deve afirmar isso em §3.2: o chat
in-app **não** passa pela fila BullMQ; só o WhatsApp passa. Caso contrário o
plano pode rotear in-app pela fila e perder o streaming.

**B3 — Agrupamento de conversa quebra para o chat in-app (CONCEITO QUEBRADO).**
§9.1 define `getOrCreateConversation(userId, channel)` "para qualquer canal" com
janela de 24h. Isso está **errado para o in-app**: a página `/agente` tem
**lista de conversas** e botão "nova conversa" (§8.1) — o usuário escolhe a
conversa explicitamente. Auto-agrupar por 24h ignoraria a UI. Correção v3:
- **WhatsApp** → `getOrCreateConversation` automático, janela 24h (não há UI
  para escolher).
- **In-app (bubble e página)** → o cliente envia um `conversationId` explícito;
  "nova conversa" cria uma `Conversation` nova; a bubble reusa a última
  conversa in-app aberta do usuário (continuidade), mas isso é escolha de UI,
  não regra de servidor.
- **Playground** → ver B4.

**B4 — Persistência do playground indefinida (INCONSISTÊNCIA).**
`AgentChannel` tem o valor `playground` (sugere conversa persistida), mas o
playground do Nex é efêmero (20 msgs, sem persistência). A v3 deve decidir:
**playground persiste** `Conversation` com `channel=playground` (permite
histórico e separação no consumo) — coerente com a decisão "plataforma é
stateful". `LlmUsage.isPlayground=true` continua marcando o custo. Fechar a
ambiguidade.

**B5 — Dimensão de embedding 1536 sem trava de modelo (FRÁGIL).**
§9/Q5 fixam `vector(1536)`. Se a credencial de embedding apontar para um modelo
com outra dimensão (ex.: `text-embedding-3-large` = 3072), o `INSERT` quebra. A
v3 deve **restringir os modelos de embedding aceitos** aos que produzem 1536
dimensões (`text-embedding-3-small`, ou `3-large` com `dimensions=1536`), e
validar isso na ingestão. Sem validação, o RAG falha em runtime.

**B6 — Referência de schema do Caminho 3c vai sofrer drift (RISCO).**
§4.5.2 cria `bi-schema-reference.ts` como constante mantida à mão. A F4 já teve
problema de drift Prisma×realidade. A v3 deve exigir um **teste jest** que
compara a referência com as tabelas `fato_*` reais (introspecção do banco ou
diff contra `prisma/schema.prisma`) — o teste falha se as fact tables mudarem e
a referência não. Trava o drift.

**B7 — Contrato do payload de entrada do webhook não está definido (LACUNA DE
PLANEJAMENTO).** §6.3 joga o formato do payload n8n→nós para o runbook. Mas o
endpoint `/inbound` precisa de um **Zod schema concreto** — isso é código que o
plano vai escrever. A v3 deve definir o **contrato do payload inbound**:
`messageId`, `from` (E.164), `timestamp`, `type` (`text`|`audio`), `text?`,
`audioMediaId?`, e o header `X-Signature` + `X-Timestamp`. Sem o contrato na
spec, o plano fica ambíguo.

**B8 — Tamanho do resultado de tool pode estourar o contexto (LACUNA).**
`bi_consulta_avancada` devolve até 1000 linhas; outras tools devolvem listas. O
orquestrador realimenta o resultado da tool no contexto do LLM. 1000 linhas
podem estourar a janela e disparar custo. A v3 deve especificar um **guard de
tamanho do resultado de tool**: truncar/resumir o payload da tool antes de
devolvê-lo ao LLM (ex.: cap de N KB, com aviso "resultado truncado — refine a
pergunta").

**B9 — Número de WhatsApp na resposta direta (CLARIFICAR, não é bug).**
A decisão #10 diz "número nunca chega ao MCP". O modo 1 (resposta direta)
precisa do número para chamar a Graph API. Está **correto** — o número fica na
camada `whatsapp`/no job; só o `userId` cruza para o MCP. A v3 deve afirmar isso
explicitamente em §6.2 para não confundir o executor: o número é retido pelo job
inbound apenas para entregar a resposta.

## Achados menores

- **B10 — Janela de 24h da Meta.** A Graph API só permite mensagem livre dentro
  de 24h da última mensagem do usuário. Como o agente sempre **responde** a uma
  mensagem recebida, está dentro da janela. A v3 registra: mensagens proativas /
  fora da janela (template messages) estão **fora do escopo da F5**.
- **B11 — Hash vs cifra.** Confirmar na v3 a regra: `ApiKey.keyHash` é **hash**
  unidirecional (key exibida 1× na criação); `LlmCredential.encryptedApiKey` e
  `WhatsappWebhook.secret` e `WhatsappChannel.encryptedApiToken` são **cifra
  reversível** (precisam do valor em claro em runtime). Coerente, só explicitar.
- **B12 — Teto de custo por usuário.** Rate limit (A8) limita frequência, não
  custo acumulado. Um teto diário de mensagens/tokens por usuário seria
  prudente. A v3 pode entregar um cap simples de mensagens/dia por usuário no
  inbound, ou registrar como item de `docs/RADAR.md` para fase futura. Decidir.
- **B13 — Corrida no `LlmConfig.isActive`.** Ativar uma config deve ser
  transacional (desativa as outras + ativa a escolhida num `$transaction`).
- **B14 — Migrations incrementais.** As ~12 tabelas do §9 não entram numa
  migration só — cada onda cria as suas. Nota para o plano.
- **B15 — Env de cifragem.** `src/lib/encryption.ts` depende de uma chave em env;
  garantir que está no `.env.example` e documentada (provável que a F1 já tenha).

## Veredito
A v2 fechou as lacunas de execução da #1, mas a #2 encontrou **um conceito
quebrado** (B3 — agrupamento de conversa não serve ao in-app), **duas
inconsistências** (B4 playground, B5 dimensão de embedding) e **lacunas de
planejamento reais** (B1 sessão MCP, B7 contrato do payload, B8 tamanho de
resultado de tool). A v3 deve resolver B1–B9 e decidir B10–B15. Após a v3, a
spec está pronta para o PLAN.
