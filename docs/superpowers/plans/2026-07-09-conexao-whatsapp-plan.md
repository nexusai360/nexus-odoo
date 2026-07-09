# PLAN v3 , Conexão com WhatsApp

> Executa a SPEC v3 (`docs/superpowers/specs/2026-07-09-conexao-whatsapp-spec.md`).
> Uma task = uma unidade verificável. TDD onde há lógica. UI inline, com
> `ui-ux-pro-max`, nunca delegada.
>
> **v2** aplicou a review #1: rota legada vira 410 dentro da Onda A (senão o `tsc`
> quebra no meio); cobertura migra antes; `criarConexao` grava `responseMode`;
> `connectionName` viaja pela fila; `model` é `string | null`; `listWebhooks` não muda.
>
> **v3** aplica a review #2, que furou as correções da v1. Achados que mudam o plano:
> - **A edição nunca gravava `responseMode`.** O `Matrix Group` (única conexão de
>   produção) ficaria preso em `direct` para sempre, e o destino seria ignorado em
>   silêncio: exatamente o bug A13 que a spec nasceu para matar. → **TG.7b**.
> - **`listConnections` nascia órfã.** A tela continuaria mostrando dois cards para
>   a mesma conexão. → **TG.9**.
> - **`podeUsarDirect` era cego para `NULL`.** Como o backfill deixa `response_mode`
>   nulo (e nulo = `direct` no modo efetivo), a regra liberaria uma segunda conexão
>   em `direct`. → **TB.3** conta pelo **modo efetivo**.
> - Faltava a **infra obrigatória** (rebuild do worker, protocolo de schema), sem a
>   qual os E2E rodam contra container velho e dão falso verde. → **Onda I**.

## Convenções

- Cada onda fecha com `tsc` + `jest` verdes e **um commit atômico**.
- Teste que prova bug nasce **vermelho**; só depois vem a correção.
- Ações novas seguem o padrão do módulo: **gate super_admin + `logAudit` +
  `revalidatePath("/integracoes/webhooks")`**.

## Onda 0 , Rede de segurança

**T0.1 , Suíte nova contra o caminho por slug** (pré-requisito de tudo).
- Hoje toda a cobertura de `handleWhatsappInbound` (L1, L2, teto, enfileiramento,
  replay) vive em `src/app/api/integrations/whatsapp/inbound/route.test.ts`, que
  exercita a **rota legada**. Ela vai virar 410 (T A.7) e levar a cobertura junto.
- Criar `src/lib/whatsapp/slug-inbound.test.ts`, **portando** esses casos para o
  caminho `/api/webhooks/<slug>`. Molde: o próprio `route.test.ts`. Mocka
  `prisma.whatsappWebhook.findFirst` + `decrypt`, além do que a legada já mocka.
- **O porte não é 1:1:** a legada devolve `503` quando não há inbound habilitado;
  o caminho por slug devolve `404` (`slug-inbound.ts`). O caso muda de contrato e
  precisa ser reescrito, não copiado, para a cobertura não sumir no ar.
- Verificação: a suíte nova passa **antes** de qualquer mudança de código.

**T0.1b , Reescrever `route.test.ts` para o contrato de 410, já aqui.**
- Se ficasse em TA.7, os testes da rota legada continuariam asserindo disparo de
  webhook (`route.test.ts` "loadOutboundTargets filtra por events") enquanto TA.3
  já teria feito `loadOutboundTargets(undefined)` retornar `[]`. A suíte ficaria
  **vermelha no meio da Onda A**, e a entrega pela rota legada morreria em silêncio.
- A cobertura de comportamento já vive em T0.1; aqui a rota legada passa a ser
  testada só pelo 410.

**T0.2 , Teste que prova o vazamento (deve FALHAR).**
- `src/lib/whatsapp/isolamento.test.ts`.
- Duas conexões (A e B), cada uma com outbound próprio.
- Caso 1: mensagem para A → `emitAgentReply` recebe **um** target (o de A).
- Caso 2: `user_not_found` na conexão A (`fireBlocked`) → **um** target (o de A).
- **Atenção (review):** o mock de `prisma.whatsappWebhook.findMany` **precisa
  honrar `where.connectionId`**. Se devolver `[A,B]` fixo, o teste continuaria
  vermelho depois da correção e o resultado seria inútil.
- Verificação: os dois **vermelhos** agora.

**T0.3 , Casos fixos da formatação (deve FALHAR).**
- `by-channel.test.ts`: entrada/saída exatas da SPEC §3.12, moeda negativa,
  `1.2.3` como texto, 6 colunas → 4, primeira coluna vazia, linha toda vazia.
- Verificação: vermelho.

## Onda A , Isolamento por conexão (SPEC §3.3) , SEGURANÇA

**TA.1 , Schema + migration das colunas.**
- `WhatsappWebhook`: `connectionId String? @map("connection_id") @db.Uuid`,
  `@@index([connectionId])`, `responseMode WhatsappResponseMode? @map("response_mode")`.
- Migration idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Verificação: `prisma migrate diff --from-migrations --to-schema` = "No difference".

**TA.2 , Backfill.**
- Toda linha inbound com `is_whatsapp_receiver` e `connection_id IS NULL` recebe
  `gen_random_uuid()` (disponível sem `pgcrypto`, já usado em migrations do repo).
- `response_mode` fica **`NULL`**. A v1 marcava `n8n_webhook` quando existisse
  qualquer outbound habilitado; a review mostrou que isso é enganoso: os outbound
  antigos não têm `connection_id` e, com o fail-closed de TA.3, **ficam órfãos de
  propósito**. Marcar o modo sugeriria um destino que nunca dispara.
- **Não** copiar `business_id` para a linha outbound (SPEC A9).
- Documentar no cabeçalho da migration: outbounds pré-existentes são orfanados
  intencionalmente (em produção não há nenhum, SPEC A11).
- **O `NULL` custa duas compensações** (review #2), sem as quais ele vira bug:
  (a) `podeUsarDirect` tem que enxergar `NULL` como `direct` (TB.3);
  (b) a edição precisa gravar `n8n_webhook` ao adicionar destino (TG.7b).
- Verificação: aplicar em banco limpo e no dev; `Matrix Group` com
  `connection_id` preenchido e `response_mode NULL`.

**TA.3 , `loadOutboundTargets(connectionId)`.**
- Filtra por `connectionId`. Sem `connectionId` → `[]` (fail-closed).
- Verificação: T0.2 caso 1 verde.

**TA.4 , Contexto de entrada carrega a conexão.**
- `slug-inbound.ts`: `select` traz `connectionId`, `name`, `responseMode`.
- `InboundWebhookContext` ganha `connectionId`, `connectionName`, `responseMode`,
  **todos opcionais**, para a rota legada continuar compilando até TA.7.
- Verificação: `tsc`.

**TA.5 , `fireBlocked` escopado (fecha A1b).**
- Usa `loadOutboundTargets(ctx.connectionId)`.
- Verificação: T0.2 caso 2 verde. **Aqui o vazamento morre.**

**TA.6 , `channelConfig` do job escopado.**
- Comentário registrando o trade-off: targets resolvidos no enqueue congelam para
  o retry (SPEC §3.3).

**TA.7a , Rota legada → `410 Gone` + `public-paths`.**
- Handler devolve 410 com corpo explicativo; **continua** público (senão o
  middleware devolveria redirect de login em vez do 410). Ajustar
  `public-paths.test.ts`.
- Verificação: `curl` no dev → 410 (não 302, não 404).

**TA.7b , Colaterais:** `scripts/verify-f5-onda4.ts` e o comentário-cabeçalho de
`inbound-handler.ts` apontam para a rota antiga.

## Onda B , Modo de resposta por conexão (SPEC §3.4, resolve A13)

**TB.1 , `modoEfetivo(conexao, singleton)` (pura).**
- Conexão → global → `direct`. Testes nos três caminhos.

**TB.2 , `inbound-handler` usa o modo efetivo.**
- Substitui exatamente o bloco `channel?.responseMode ?? "direct"` que hoje lê o
  singleton. O `responseMode` da conexão chega pelo `InboundWebhookContext` (TA.4).

**TB.3 , `podeUsarDirect(conexoesExistentes)` (pura) , duas correções.**
- A v1 dizia "só a conexão dona da credencial global". **Irrealizável:** a
  credencial global é `WhatsappChannel.phoneNumberId` (um ID da Meta) e a conexão
  guarda `businessId` (E.164). Não há como casar (SPEC A17).
- Regra: `direct` é permitido **apenas se nenhuma outra conexão já usa `direct`**.
- **A contagem é pelo MODO EFETIVO, não pela coluna crua** (review #2). O backfill
  deixa `response_mode NULL`, e `modoEfetivo(NULL)` é `direct`. Um
  `WHERE response_mode = 'direct'` não enxergaria o `Matrix Group` e liberaria uma
  segunda conexão em `direct`, que é exatamente o footgun proibido pela SPEC §3.4.
- Testes: primeira pode; segunda não; **conexão com `NULL` conta como `direct`**.

**TB.4 , Ponto de uso de `podeUsarDirect` (o órfão da review #1).**
- As ações de criar e editar conexão recusam `direct` quando já existe outra em
  `direct` (efetivo), com mensagem explicativa. A UI mostra a razão.
- Verificação: teste da ação.

## Onda C , Entrega do bloqueio e teto diário (SPEC §3.5)

**TC.1 , `fireBlocked` respeita o modo.**
- `n8n_webhook` → webhook da conexão; `direct` → `cloud-client`; nenhum → log de
  aviso (nunca silêncio). Um teste por caminho.

**TC.2 , `daily_limit_exceeded` vira `reason` emitido (A14).**
- `blocked-messages.ts`: código + mensagem pt-br.
- `inbound-handler.ts`: o teto chama `fireBlocked`.
- Teste: quem estoura o teto recebe mensagem.

## Onda D , Contrato de saída (SPEC §3.9/§3.10)

**TD.1 , `model` em `RunAgentResult` , tipo `string | null`.**
- A v1 pedia `model: string`, impossível: `permission-denial.ts` retorna pelo
  **mesmo ramo `ok:true`** e não chama LLM.
- `run-agent.ts` preenche o **modelo efetivo da resposta final** (pós tier T3 e
  pós retry). `permission-denial.ts` → `null`.
- Verificação: `tsc` aponta os dois construtores.

**TD.2 , `connectionName` viaja pela fila (o furo B4 da review).**
- `AgentJobData` ganha `connectionName`; o enqueue em `inbound-handler.ts` passa.
- `processor.ts` monta o `ReplyContext` com ele; `build-reply-data.ts` usa.
- Sem isto, `connection.name` sai vazio no caminho de **sucesso**.

**TD.3 , `model` e `connectionName` em `AgentReplyData`.**
- `model: string | null`, `connectionName: string | null`.
- `build-reply-data.ts` mapeia (`isDenied ? null : result.model`); `fireBlocked`
  passa `null`.

**TD.4a , Envelope aninhado em `emit-reply.ts`.**
- O mapeamento plano→aninhado acontece **dentro de `emitAgentReply`**, para o
  `AgentReplyData` continuar plano (o replay o serializa no Redis).
- Estrutura da SPEC §3.10.

**TD.4b , Atualizar `emit-reply.test.ts`.**
**TD.4c , Atualizar `processor.test.ts`** (final, blocked, replay).

## Onda E , Formatação compacta (SPEC §3.12)

**TE.1 , Classificadores puros.**
- `ehMoeda`, `ehNumero`, `classificar`. Testes: `1.2.3`, `,,,`, `R$`, `-R$ 5,00`, `12%`.

**TE.2a , Título da linha.**
- Primeira coluna não vazia, sem rótulo; linha toda vazia é descartada.

**TE.2b , Render por classe.**
- Moeda sem rótulo; número `(valor RÓTULO)`; texto `(RÓTULO valor)`.

**TE.2c , Mapa de rótulos.**
- `Notas`→`NF`, `Quantidade`→`Qtd`, `Documento`→`Doc`, ...; fora do mapa,
  cabeçalho truncado em 8.

**TE.2d , Truncamento e teto.**
- Truncar só texto, 24 caracteres, `...`; teto de 4 colunas (constante nomeada).

**TE.2e , Atualizar o teste legado.**
- `by-channel.test.ts` tem hoje "tabela markdown vira lista hifenizada" esperando
  o formato verboso `- Produto: A | Saldo: 10`. Ele **vai falhar** e precisa ser
  reescrito para o formato novo. Sem esta task, a onda "quebra" a suíte.
- Verificação: T0.3 verde, incluindo o caso fixo exato.

**TE.3 , E2E contra saída real do agente** (pergunta que gera tabela, no dev).

## Onda F , Ações de Conexão (SPEC §3.6)

**TF.0 , `prepararTokensConexao`** , server action sem efeito colateral; dois
secrets aleatórios. Teste: distintos, entropia mínima.

**TF.1a , Contrato de `criarConexaoWhatsapp`** , schema Zod + gate super_admin.
**TF.1b , Gravação transacional das duas linhas.**
- Duas linhas, mesmo `connection_id`; `businessId` só na inbound; `url` **e**
  `targetUrl` na outbound (o `loadOutboundTargets` lê `targetUrl ?? url`);
  `events: ["agent_reply"]` na outbound.
- **Grava `responseMode = "n8n_webhook"` na linha inbound** , sem isso a conexão
  nasce em `direct` (SPEC A13) e o destino é ignorado. Era o bloqueador B3.
**TF.1c , Recusa de `direct`** quando já existe outra conexão em `direct` efetivo
(regra de negócio, task própria com teste , TB.3/TB.4).
**TF.1d , `logAudit` + `revalidatePath`.**

**TF.2 , Apagar conexão.**
- Transação, apaga as duas linhas; se houver `WhatsappInstance.webhookId`
  apontando, erro claro. `logAudit` + `revalidatePath`.

**TF.3 , Rotacionar por ponta.**
- `rotateWebhookSecret` ganha o alvo (`recebimento` | `assinatura`).
  `logAudit` + `revalidatePath`.

**TF.4 , `listConnections` , ação NOVA.**
- A v1 mudava `listWebhooks`, quebrando 4 consumidores
  (`webhooks/page.tsx`, `webhooks/[id]/editar/page.tsx`, `webhooks/novo/page.tsx`,
  `webhooks-content.tsx`). `listWebhooks` **fica como está**; a visão de conexões
  vem de `listConnections`, agrupando por `connection_id`.
- Teste: duas linhas viram uma conexão.

## Onda G , UI (inline, `ui-ux-pro-max`)

**TG.1 , Renomear tipo e descrição.**
- `webhook-kind.ts` (rótulo "Conexão com WhatsApp") + descrição no card do wizard.
  Ícone inalterado.

**TG.2 , Indicador de 4 etapas** (`Recebimento · Envio · Revisão · Conclusão`) e
botão "Concluir configuração e continuar" nas etapas 1 e 2.

**TG.3a , Etapa 1: campos** (nome, descrição, slug com URL final, número,
`POST` travado).
**TG.3b , Etapa 1: bloco do token de recebimento** (+ aviso "só funciona depois
que você concluir a criação").
**TG.3c , Etapa 1: aviso de payload** (SPEC §3.7), visível sem abrir nada.
**TG.3d , Etapa 1: guia colapsado.**

**TG.4 , Etapa 2 (Envio):** URL de destino, `POST` travado, token de assinatura,
guia colapsado com o payload da §3.10 e a orientação de dedup por
`inboundMessageId`.

**TG.5 , Etapas 3 (Revisão) e 4 (Conclusão).**

**TG.6 , Fio de integração** (o furo I10 da review): `WebhookCreateClient` e
`webhooks/novo/page.tsx` passam a chamar `prepararTokensConexao` (ao abrir) e
`criarConexaoWhatsapp` (no submit) quando o tipo é `whatsapp`. Os outros dois
tipos seguem usando `createWebhook`.

**TG.7a , Tela de edição , formulário** (nome e descrição, gravados nas duas
linhas; recebimento e envio editam a sua linha).

**TG.7b , Ao adicionar/editar o destino, gravar `responseMode = "n8n_webhook"`.**
- **Bloqueador achado pela review #2.** O backfill deixa `response_mode NULL`, e
  `TF.1b` só grava o modo em conexões **novas**. Sem esta task, o `Matrix Group`
  (a única conexão de produção) fica preso em `direct` para sempre: o usuário
  configuraria o Envio pela tela de edição e o webhook seria **ignorado em
  silêncio**. É o bug A13 reaparecendo no único cliente real.
- Teste da ação: conexão com `response_mode NULL` + destino novo → `n8n_webhook`.

**TG.9 , Religar a listagem a `listConnections`** (o órfão da review #2).
- `TF.4` cria a ação, mas nada a consome: `webhooks/page.tsx` chama `listWebhooks`
  e `webhooks-content.tsx` renderiza **um card por linha**, então a conexão
  apareceria como **dois cards**. O critério 6 da SPEC não passaria.
- A tela passa a mostrar uma entrada por conexão (as duas linhas agrupadas) e os
  webhooks soltos como hoje.

**TG.8 , Guias colapsados por padrão** , E2E confere `aria-expanded="false"`.

## Onda I , Infra obrigatória antes de qualquer E2E (review #2)

**TI.1 , Protocolo de schema.** A migration muda o Postgres compartilhado entre
worktrees: rodar `agente schema-changed` depois de aplicar.

**TI.2 , Rebuild dos containers.** `src/worker/agent/**` e `prisma/schema.prisma`
mudam. Por `CLAUDE.md §2.1`, o `worker` **não tem build próprio**: rodar
`docker compose build app` + `docker compose up -d --force-recreate worker`, e
`npx prisma generate`. Sem isso os E2E rodam contra imagem velha e dão **falso
verde** , é a armadilha documentada na regra.

**TI.3 , Conferir a data da imagem** (`docker image inspect nexus-odoo:local`),
não confiar no "Built".

## Onda H , Verificação final

**TH.1 , E2E do isolamento contra o dev real:** duas conexões, um servidor HTTP
local capturando os disparos; A recebe, B não. Idem no caminho de bloqueio.

**TH.2 , Teste de "nenhum n8n visível"** , inspeciona **textos de UI**, não
comentários de código (senão dá falso positivo nos cabeçalhos).

**TH.3 , `tsc`, `eslint`, `jest`, `next build`, `scripts/db-health.py`.**

**TH.4 , Runbook** (`docs/runbooks/2026-06-17-f5-whatsapp-n8n-runbook.md`):
envelope novo, `410` da rota antiga, dedup por `inboundMessageId`, modo por
conexão.

**TH.5 , `docs/RADAR.md`:** registrar as dívidas A5 (`media_unsupported`), A12
(remover `WhatsappInstance`), a **janela de jobs em voo** (jobs enfileirados antes
do deploy não têm `connectionName`; payloads no Redis não têm `model` , campos
opcionais, sem consumidor em prod) e o **título numérico** (SPEC §3.12 assume que
a primeira coluna é texto; se for um código, o título sai como número nu).

## Matriz critério (SPEC §5) → task

| # | Critério | Task |
|---|---|---|
| 1 | Isolamento na resposta | T0.2, TA.3, TA.6, TH.1 |
| 2 | Isolamento no bloqueio | T0.2, TA.5, TH.1 |
| 3 | Fail-closed sem destino | TA.3 |
| 4 | Bloqueio em `direct` pelo cloud-client | TC.1 |
| 5 | `daily_limit_exceeded` chega | TC.2 |
| 6 | Criar 2 / listar 1 / apagar 2 / FK | TF.1b, TF.2, TF.4, **TG.9** |
| 7 | Rotação independente | TF.3 |
| 8 | `direct` recusado na 2ª conexão | TB.3 (modo efetivo) + TB.4 + TF.1c |
| 9 | Guias fechados, aviso, dedup | TG.3c, TG.3d, TG.4, TG.8 |
| 10 | Nenhum "n8n" visível | TH.2 |
| 11 | Formatação exata | T0.3, TE.1, TE.2a-e |
| 12 | Payload §3.10 | TD.1, **TD.2**, TD.3, TD.4a |
| 13 | Rota legada 410 | TA.7a, TA.7b |
| 14 | Só super_admin | TF.1a, TF.2, TF.3 |
| , | Modo gravado na EDIÇÃO (A13 no cliente real) | **TG.7b** |
| 15 | tsc/eslint/jest/build + E2E | TH.1, TH.3 |

## Ordem e risco

- **Onda 0 antes de tudo:** sem a suíte nova (T0.1), a Onda A destrói a única
  cobertura viva de `handleWhatsappInbound`.
- **Onda A fecha a falha de segurança** e não é mergeada sem T0.2 verde.
- **Onda D é breaking** no envelope; seguro porque não há consumidor (SPEC A11),
  mas o runbook (TH.4) sai no mesmo PR.
- **Onda G é grande.** Se o contexto apertar, vira um segundo PR, desde que
  A–F já estejam mergeadas (o backend fica correto e sem UI nova).
