# F5 , Integração WhatsApp ↔ Agente Nex via n8n/Webhook , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir conversa com o Agente Nex pelo WhatsApp (mesma inteligência do chat in-app) via n8n, com validação em camadas antes da IA, resposta rica por webhook, acesso por canal/nível, webhook por evento e monitoramento separando Bubble vs WhatsApp.

**Architecture:** Fluxo assíncrono de 2 webhooks. O inbound (`/api/integrations/whatsapp/inbound`) valida HMAC, resolve o usuário pelo número (com/sem nono dígito), aplica as barreiras L1 (número) e L2 (canal/nível) e enfileira o job na fila `agent`. O worker adquire lock por usuário, abre/reusa a sessão de 24h, roda a barreira L3 (acesso ao módulo, via `respondPermissionDenied` antes do LLM), executa `runAgent` (Judge roda normalmente), persiste com idempotência de saída e emite o evento `agent.reply` (envelope assinado) nos webhooks outbound habilitados. As barreiras devolvem mensagem padrão no webhook (`kind:"blocked"`) sem gastar crédito de IA. Schema (Onda 0): enum `WebhookEvent` + `events` em `WhatsappWebhook`; enum `ChannelAccessLevel` + `bubbleAccessLevel`/`whatsappAccessLevel` em `AgentSettings`. Banco Postgres é COMPARTILHADO entre worktrees, logo a migration da Onda 0 segue o protocolo de schema (avisar, `agente schema-changed`, mergear cedo, coordenar com `feat/nex-reconstrucao`).

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma v7 (`@prisma/adapter-pg`), BullMQ + IORedis, Zod, base-ui + Tailwind v4, Jest. Componentes de UI exclusivamente inline na sessão principal com a skill `ui-ux-pro-max` (Ondas C e E).

**Spec fonte:** `docs/superpowers/specs/2026-06-17-f5-whatsapp-nex-webhook-design.md` (SPEC v4).

---

## Convenções deste plano

- **Comando de teste por unidade:** `npx jest <caminho-do-teste> --runInBand` (rodado da raiz da worktree). Para o conjunto: `npx jest`.
- **tsc:** `npx tsc --noEmit`. **eslint:** `npx eslint <arquivos>`.
- **Mensagens de commit:** prefixos `feat`/`fix`/`test`/`chore`, sem travessão (`—`); usar vírgula/parênteses/dois-pontos. Co-author conforme regra do projeto é responsabilidade do executor.
- **Prisma client gerado:** `src/generated/prisma/client`. Após editar `prisma/schema.prisma`, rodar `npx prisma generate` antes do `tsc`.
- **Catálogo de mensagens padrão (helper único):** será criado em `src/lib/whatsapp/blocked-messages.ts` na Onda A (task A5.1) e reusado por inbound (L1/L2) e worker (L3). Texto provisório pt-br; revisão final do texto vai para o runbook (Onda F, pendência §17.4).

---

## Onda 0 , Schema (PRIMEIRA, banco compartilhado)

> **PROTOCOLO DE SCHEMA (banco compartilhado, OBRIGATÓRIO).** Antes de rodar a migration, avisar o usuário em uma frase ("esta migration muda o schema do DB compartilhado; outras worktrees, ex. `feat/nex-reconstrucao`, precisarão rebase + `npx prisma generate`; segue?"). Depois de `npx prisma migrate dev` com sucesso, rodar `agente schema-changed` na worktree e sugerir abrir PR e mergear cedo para minimizar divergência. Coordenar com `feat/nex-reconstrucao`.

### Task 0.1: Enum `WebhookEvent` + campo `events` em `WhatsappWebhook`

**Files:**
- Modify: `prisma/schema.prisma` (adicionar enum após `WhatsappResponseMode`/`WebhookDirection`, ~linha 114; adicionar campo `events` em `WhatsappWebhook`, ~linha 3133 entre `methods` e `secret`)

- [ ] **Step 1: Adicionar o enum `WebhookEvent`**

No `prisma/schema.prisma`, logo após o enum `WebhookDirection` (~linha 116-119), adicionar:

```prisma
/// Eventos emissíveis em webhooks de saída (F5). Serializa para "agent.reply".
enum WebhookEvent {
  agent_reply
}
```

- [ ] **Step 2: Adicionar o campo `events` no model `WhatsappWebhook`**

No model `WhatsappWebhook` (linha ~3122-3141), após `methods String[] @default([])` (~linha 3133), adicionar:

```prisma
  /// Eventos que este webhook de saída emite (F5). Vazio = nenhum.
  events    WebhookEvent[]   @default([])
```

- [ ] **Step 3: Verificar que o schema é válido**

Run: `npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): enum WebhookEvent e campo events em WhatsappWebhook (F5 Onda 0)"
```

### Task 0.2: Enum `ChannelAccessLevel` + campos de nível em `AgentSettings`

**Files:**
- Modify: `prisma/schema.prisma` (adicionar enum após `WebhookEvent`; adicionar `bubbleAccessLevel`/`whatsappAccessLevel` em `AgentSettings`, junto de `bubbleEnabled`/`whatsappEnabled` ~linhas 2798-2801)

- [ ] **Step 1: Adicionar o enum `ChannelAccessLevel`**

No `prisma/schema.prisma`, após o enum `WebhookEvent`, adicionar (a ordem dos níveis segue a hierarquia de `PLATFORM_ROLE_HIERARCHY`, com `off` representando "Desativado"):

```prisma
/// Nível mínimo de acesso de um canal do Agente Nex (F5). "off" = desativado;
/// os demais são roles de PlatformRole. Herança: role >= nível escolhido acessa.
enum ChannelAccessLevel {
  off
  viewer
  manager
  admin
  super_admin
}
```

- [ ] **Step 2: Adicionar os dois campos em `AgentSettings`**

No model `AgentSettings`, logo após `whatsappEnabled` (~linha 2801), adicionar (os booleans antigos PERMANECEM por enquanto; serão removidos na task 0.4 após o backfill):

```prisma
  /// F5: nível mínimo de acesso da bubble in-app. Default viewer = todos (preserva bubbleEnabled=true).
  bubbleAccessLevel   ChannelAccessLevel @default(viewer) @map("bubble_access_level")
  /// F5: nível mínimo de acesso do canal WhatsApp. Default viewer = todos (preserva whatsappEnabled=true).
  whatsappAccessLevel ChannelAccessLevel @default(viewer) @map("whatsapp_access_level")
```

- [ ] **Step 3: Verificar schema**

Run: `npx prisma validate`
Expected: "valid"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): enum ChannelAccessLevel e campos de nivel por canal em AgentSettings (F5 Onda 0)"
```

### Task 0.3: Gerar migration + backfill (events e níveis)

**Files:**
- Create: `prisma/migrations/<timestamp>_f5_whatsapp_webhook_events_e_channel_levels/migration.sql` (gerada pelo Prisma; editar para acrescentar o backfill)

- [ ] **Step 1: Avisar o usuário (protocolo de schema) e gerar a migration**

Avisar em uma frase. Depois:

Run: `npx prisma migrate dev --name f5_whatsapp_webhook_events_e_channel_levels --create-only`
Expected: cria o diretório de migration sem aplicar ainda (`--create-only` para podermos editar o SQL antes de aplicar).

- [ ] **Step 2: Acrescentar o backfill ao final do `migration.sql`**

Editar o `migration.sql` gerado e ACRESCENTAR ao final (o cast Postgres do array de enum é obrigatório):

```sql
-- Backfill (F5): outbound existentes passam a emitir agent.reply.
UPDATE "whatsapp_webhooks"
  SET "events" = ARRAY['agent_reply']::"WebhookEvent"[]
  WHERE "direction" = 'outbound';

-- Backfill (F5): preserva o comportamento atual de disponibilidade.
-- bubble/whatsapp habilitado (true) => viewer (todos veem); desabilitado => off.
UPDATE "AgentSettings"
  SET "bubble_access_level"   = CASE WHEN "bubble_enabled"   THEN 'viewer'::"ChannelAccessLevel" ELSE 'off'::"ChannelAccessLevel" END,
      "whatsapp_access_level" = CASE WHEN "whatsapp_enabled" THEN 'viewer'::"ChannelAccessLevel" ELSE 'off'::"ChannelAccessLevel" END;
```

Nota: os nomes de coluna/tabela no SQL devem casar com os `@map`/`@@map` reais. `whatsapp_webhooks` (mapeado), `AgentSettings` (sem `@@map`, então o nome é o do model). Conferir no `migration.sql` recém-gerado.

- [ ] **Step 3: Aplicar a migration**

Run: `npx prisma migrate dev`
Expected: "Your database is now in sync with your schema" (aplica a migration pendente + roda o backfill).

- [ ] **Step 4: Regenerar o client e validar tsc**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: client gerado; tsc sem erros novos relacionados a `WebhookEvent`/`ChannelAccessLevel`.

- [ ] **Step 5: Sinalizar mudança de schema às outras worktrees**

Run: `agente schema-changed`
Expected: registra `.agente/schema-changed.json` (visível em `agente status` nas outras worktrees).

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations src/generated/prisma
git commit -m "feat(schema): migration F5 com backfill de events e niveis de canal (Onda 0)"
```

### Task 0.4 (VERIFICAÇÃO da Onda 0): tsc + sanidade do backfill contra o dado real

**Files:** nenhuma (verificação).

- [ ] **Step 1: tsc + eslint do schema/migration**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 2: Conferir o backfill no banco real**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT direction, events FROM whatsapp_webhooks;
SELECT bubble_enabled, bubble_access_level, whatsapp_enabled, whatsapp_access_level FROM "AgentSettings";
SQL
```
Expected: todo webhook `outbound` tem `events = {agent_reply}`; `bubble_access_level`/`whatsapp_access_level` refletem os booleans (true→viewer, false→off).

- [ ] **Step 3: Commit (se houver ajuste no SQL)**

```bash
git commit --allow-empty -m "chore: verificacao Onda 0 (backfill conferido no banco real)"
```

> NOTA: os booleans `bubbleEnabled`/`whatsappEnabled` continuam no schema durante as Ondas A-D para não quebrar o código existente. Eles são REMOVIDOS na Onda C (task C.6), quando a UI e as leituras já usam os campos de nível.

---

## Onda A , Entrada + identidade + áudio + concorrência + barreiras inbound

> A1-A5 são paralelizáveis entre si (arquivos distintos), com a ressalva de que A5 depende do catálogo de mensagens (A5.1) e toca `route.ts` (mesmo arquivo de A2). Executar A2 antes de A5 para evitar conflito no `route.ts`.

### Task A1.1: Resolver usuário por variantes do número (com/sem nono dígito)

**Files:**
- Modify: `src/lib/whatsapp/resolve.ts:75` (trocar `findUnique` por `findFirst` com `phoneVariants`)
- Test: `src/lib/whatsapp/resolve.test.ts` (já existe; acrescentar casos)

- [ ] **Step 1: Escrever o teste que falha**

Em `src/lib/whatsapp/resolve.test.ts`, adicionar um `describe` que cobre: número cadastrado COM o 9 (`+5534998765432`) sendo resolvido quando chega SEM o 9 (`5534988765432` da Meta), e vice-versa. Mockar `prisma.userWhatsappNumber.findFirst` para retornar o usuário quando `where.phoneE164.in` contém a variante cadastrada.

```ts
import { resolveWhatsappUser } from "./resolve";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { userWhatsappNumber: { findFirst: jest.fn() } },
}));

describe("resolveWhatsappUser , variantes do nono dígito", () => {
  const findFirst = prisma.userWhatsappNumber.findFirst as jest.Mock;
  beforeEach(() => findFirst.mockReset());

  it("resolve número que chega SEM o 9 quando o cadastro tem COM o 9", async () => {
    findFirst.mockResolvedValue({ user: { id: "u1", name: "Ana", isActive: true } });
    const r = await resolveWhatsappUser("553498765432"); // sem o 9, vindo da Meta
    expect(r).toEqual({ status: "ok", user: { id: "u1", name: "Ana", isActive: true } });
    // confere que a query usou IN com as duas formas
    const arg = findFirst.mock.calls[0][0];
    expect(arg.where.phoneE164.in.length).toBeGreaterThanOrEqual(2);
    expect(arg.where.phoneE164.in).toContain("+5534998765432");
  });

  it("usuário inativo retorna inactive", async () => {
    findFirst.mockResolvedValue({ user: { id: "u2", name: "Bia", isActive: false } });
    const r = await resolveWhatsappUser("+5511988887777");
    expect(r).toEqual({ status: "inactive" });
  });

  it("sem match retorna unknown", async () => {
    findFirst.mockResolvedValue(null);
    const r = await resolveWhatsappUser("+5511988887777");
    expect(r).toEqual({ status: "unknown" });
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx jest src/lib/whatsapp/resolve.test.ts --runInBand`
Expected: FALHA , os novos casos quebram porque o código ainda usa `findUnique({ where: { phoneE164 } })` (o mock só tem `findFirst`).

- [ ] **Step 3: Implementação mínima**

Em `src/lib/whatsapp/resolve.ts`: importar `phoneVariants` de `./countries` no topo; trocar o bloco da linha 75:

```ts
import { phoneVariants } from "./countries";
// ...
  const row = await prisma.userWhatsappNumber.findFirst({
    where: { phoneE164: { in: phoneVariants(phoneE164) } },
    select: {
      user: { select: { id: true, name: true, isActive: true } },
    },
  });
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx jest src/lib/whatsapp/resolve.test.ts --runInBand`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/resolve.ts src/lib/whatsapp/resolve.test.ts
git commit -m "feat(whatsapp): resolver usuario por variantes do nono digito (F5 A1)"
```

### Task A2.1: Estender o contrato Zod do inbound (`contactName`, `phoneNumberId`)

**Files:**
- Modify: `src/lib/whatsapp/inbound-payload.ts:14-35`
- Test: `src/lib/whatsapp/inbound-payload.test.ts` (criar se não existir)

- [ ] **Step 1: Escrever o teste que falha**

Criar/editar `src/lib/whatsapp/inbound-payload.test.ts`:

```ts
import { inboundSchema } from "./inbound-payload";

describe("inboundSchema , campos novos", () => {
  const base = { messageId: "wamid.1", from: "5534999999999", timestamp: 1718630000000, type: "text", text: "oi" };

  it("aceita contactName e phoneNumberId opcionais", () => {
    const r = inboundSchema.safeParse({ ...base, contactName: "Ana", phoneNumberId: "593237780533272" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contactName).toBe("Ana");
      expect(r.data.phoneNumberId).toBe("593237780533272");
    }
  });

  it("aceita payload sem os opcionais", () => {
    expect(inboundSchema.safeParse(base).success).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/whatsapp/inbound-payload.test.ts --runInBand`
Expected: FALHA (campos `contactName`/`phoneNumberId` não existem; o parse os ignora, então `r.data.contactName` é `undefined` e o assert quebra).

- [ ] **Step 3: Implementação mínima**

Em `src/lib/whatsapp/inbound-payload.ts`, dentro do `z.object`, após `imageMediaId` (linha ~34), adicionar:

```ts
  /** Nome de exibição do contato (contacts[0].profile.name), opcional. */
  contactName: z.string().optional(),

  /** ID do número de telefone da conta Meta (metadata.phone_number_id), opcional. */
  phoneNumberId: z.string().optional(),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/whatsapp/inbound-payload.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/inbound-payload.ts src/lib/whatsapp/inbound-payload.test.ts
git commit -m "feat(whatsapp): contactName e phoneNumberId no contrato inbound (F5 A2)"
```

### Task A2.2: Propagar `phoneNumberId`/`contactName` para `AgentJobData`

**Files:**
- Modify: `src/worker/agent/processor.ts:38-57` (interface `AgentJobData`)
- Modify: `src/app/api/integrations/whatsapp/inbound/route.ts:223-233` (montagem do `jobData`)
- Test: `src/worker/agent/processor.test.ts` (criar/editar; testa tipagem via uso)

- [ ] **Step 1: Adicionar os campos em `AgentJobData`**

Em `src/worker/agent/processor.ts`, na interface `AgentJobData` (após `replyTo`, ~linha 54), adicionar:

```ts
  /** ID do número Meta para rotear a resposta (opcional). */
  phoneNumberId?: string;
  /** Nome de exibição do contato, para monitoramento (opcional). */
  contactName?: string;
```

- [ ] **Step 2: Preencher na montagem do job**

Em `route.ts`, no objeto `jobData` (~linha 223-233), após `replyTo: payload.from,` adicionar:

```ts
    phoneNumberId: payload.phoneNumberId,
    contactName: payload.contactName,
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros (os campos opcionais fluem do payload ao job).

- [ ] **Step 4: Commit**

```bash
git add src/worker/agent/processor.ts src/app/api/integrations/whatsapp/inbound/route.ts
git commit -m "feat(whatsapp): propagar phoneNumberId e contactName ao AgentJobData (F5 A2)"
```

### Task A3.1: Áudio , dois caminhos coexistem (n8n transcrito vs Meta mídia)

**Files:**
- Modify: `src/worker/agent/processor.ts:92-146` (decisão do tipo audio) e `:180-187` (passar `isAudio` ao `runAgent`)
- Test: `src/worker/agent/processor.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `src/worker/agent/processor.test.ts`, testar a regra: para `type:"audio"` COM `text` presente (caminho n8n), o processor NÃO chama `downloadMedia`/`transcribeAudio` e usa `data.text` direto; para `type:"audio"` SEM `text` mas com `audioMediaId` (caminho Meta), mantém download+transcrição. Mockar `runAgent`, `buildCloudClientFromDb`, `transcribeAudio`, `getOrCreateWhatsappConversation`. Asserts:
  - n8n: `transcribeAudio` não chamado; `runAgent` recebe `userMessage === data.text` e `isAudio: true`.
  - Meta: `downloadMedia` chamado; `runAgent` recebe o texto transcrito e `isAudio: true`.

(O teste precisa de `settings.audioCheckpoint === "PRODUCTION"` para não cair no early-return de áudio desabilitado: mockar `prisma.agentSettings.findFirst` retornando `{ audioCheckpoint: "PRODUCTION", imageCheckpoint: "OFF" }`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA , hoje `type:"audio"` SEMPRE entra no ramo de download (linha 108), ignorando `text`; e `runAgent` é chamado sem `isAudio`.

- [ ] **Step 3: Implementação mínima**

Em `processor.ts`, no bloco de resolução do texto (linhas 105-146), trocar a condição para considerar `data.text` no caminho de áudio:

```ts
  // 1. Resolver texto da mensagem (text, áudio transcrito via n8n, ou áudio Meta).
  let userMessage: string;
  const isAudio = data.type === "audio";

  if (isAudio && data.text && data.text.trim().length > 0) {
    // Caminho n8n: já vem transcrito. Não baixa nem transcreve.
    userMessage = data.text;
  } else if (isAudio) {
    // Caminho Meta direto: baixa o áudio e transcreve (fluxo atual preservado).
    if (!data.audioMediaId) {
      throw new Error("[agent-processor] audioMediaId ausente para tipo=audio");
    }
    // ... (mantém o bloco existente de cloudClient/downloadMedia/transcribeAudio,
    //      linhas 115-140; ao final: userMessage = transcription.text;)
  } else {
    if (!data.text) {
      throw new Error("[agent-processor] text ausente para tipo=text");
    }
    userMessage = data.text;
  }
```

E na chamada `runAgent` (linha ~180-187), acrescentar `isAudio`:

```ts
    result = await runAgent({
      conversationId: conversation.id,
      userId: data.userId,
      userMessage,
      channel: data.channel,
      isPlayground: false,
      source: "whatsapp",
      isAudio,
    });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: PASS (ambos os caminhos).

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/processor.ts src/worker/agent/processor.test.ts
git commit -m "feat(whatsapp): audio em dois caminhos (n8n transcrito vs Meta midia) com isAudio (F5 A3)"
```

### Task A4.1: Lock por usuário no worker (cluster-safe)

**Files:**
- Modify: `src/worker/agent/processor.ts:63-224` (envolver get-or-create + runAgent + persistência no lock)
- Create: `src/worker/agent/user-lock.ts` (helper de lock reusando o padrão `SET key val PX ttl NX`)
- Test: `src/worker/agent/user-lock.test.ts`

- [ ] **Step 1: Escrever o teste do helper de lock**

Criar `src/worker/agent/user-lock.test.ts`. Mockar `@/lib/redis` com `set` e `del`. Testar:
  - `acquireUserLock("u1")` retorna `true` quando `redis.set` devolve `"OK"`, e chama `set` com `["agent:lock:wa:u1", <val>, "PX", <ttl>, "NX"]`.
  - retorna `false` quando `redis.set` devolve `null`.
  - `releaseUserLock("u1")` chama `redis.del("agent:lock:wa:u1")`.

```ts
import { acquireUserLock, releaseUserLock } from "./user-lock";
import { redis } from "@/lib/redis";

jest.mock("@/lib/redis", () => ({ redis: { set: jest.fn(), del: jest.fn() } }));

describe("user-lock", () => {
  const set = redis.set as jest.Mock;
  const del = redis.del as jest.Mock;
  beforeEach(() => { set.mockReset(); del.mockReset(); });

  it("adquire o lock quando SET NX retorna OK", async () => {
    set.mockResolvedValue("OK");
    expect(await acquireUserLock("u1")).toBe(true);
    const args = set.mock.calls[0];
    expect(args[0]).toBe("agent:lock:wa:u1");
    expect(args).toContain("PX");
    expect(args).toContain("NX");
  });

  it("não adquire quando SET NX retorna null", async () => {
    set.mockResolvedValue(null);
    expect(await acquireUserLock("u1")).toBe(false);
  });

  it("libera o lock", async () => {
    await releaseUserLock("u1");
    expect(del).toHaveBeenCalledWith("agent:lock:wa:u1");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/user-lock.test.ts --runInBand`
Expected: FALHA (módulo `user-lock` não existe).

- [ ] **Step 3: Implementar o helper**

Criar `src/worker/agent/user-lock.ts`:

```ts
import { redis } from "@/lib/redis";

/** TTL do lock por usuário (>= timeout do turno do agente). */
const USER_LOCK_TTL_MS = 120_000;

function key(userId: string): string {
  return `agent:lock:wa:${userId}`;
}

/** Tenta adquirir o lock do usuário (cluster-safe via SET NX PX). */
export async function acquireUserLock(userId: string): Promise<boolean> {
  const res = await redis.set(key(userId), String(Date.now()), "PX", USER_LOCK_TTL_MS, "NX");
  return res === "OK";
}

/** Libera o lock do usuário. */
export async function releaseUserLock(userId: string): Promise<void> {
  await redis.del(key(userId));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/worker/agent/user-lock.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit do helper**

```bash
git add src/worker/agent/user-lock.ts src/worker/agent/user-lock.test.ts
git commit -m "feat(whatsapp): helper de lock por usuario cluster-safe (F5 A4)"
```

### Task A4.2: Envolver `processAgentJob` no lock por usuário

**Files:**
- Modify: `src/worker/agent/processor.ts:63-224`
- Test: `src/worker/agent/processor.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

No `processor.test.ts`, testar: quando `acquireUserLock` retorna `false`, `processAgentJob` lança erro controlado (`/lock|ocupad/i`) e NÃO chama `runAgent` (BullMQ vai retentar). Quando retorna `true`, processa normalmente e chama `releaseUserLock` no `finally`. Mockar `./user-lock`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA (sem lock hoje).

- [ ] **Step 3: Implementação mínima**

Em `processor.ts`: importar `acquireUserLock, releaseUserLock` de `./user-lock`. Logo no topo de `processAgentJob`, após a leitura de `settings` e o tratamento de `image`/`audio desabilitado` (mas ANTES de `getOrCreateWhatsappConversation`, linha ~148), envolver o restante:

```ts
  const gotLock = await acquireUserLock(data.userId);
  if (!gotLock) {
    // Outra mensagem do mesmo usuário está em processamento. Lança para o
    // BullMQ retentar com backoff (espera a anterior liberar). Consistência
    // garantida: uma conversa por usuário, sem sobrescrita de reasoningHistory.
    throw new Error(`[agent-processor] lock ocupado para userId=${data.userId}, retry`);
  }
  try {
    // ... (todo o corpo a partir de getOrCreateWhatsappConversation até o dispatch)
  } finally {
    await releaseUserLock(data.userId);
  }
```

Nota: o `clearTimeout(heartbeatTimer)` existente deve continuar no seu próprio `finally` aninhado (não conflita).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/processor.ts src/worker/agent/processor.test.ts
git commit -m "feat(whatsapp): lock por usuario envolvendo get-or-create + runAgent + persistencia (F5 A4)"
```

### Task A5.1: Catálogo de mensagens padrão das barreiras

**Files:**
- Create: `src/lib/whatsapp/blocked-messages.ts`
- Test: `src/lib/whatsapp/blocked-messages.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/whatsapp/blocked-messages.test.ts`:

```ts
import { blockedMessageFor, type BlockReason } from "./blocked-messages";

describe("blockedMessageFor", () => {
  const reasons: BlockReason[] = [
    "user_not_found", "user_inactive", "channel_disabled",
    "role_not_allowed", "permission_denied", "technical_error",
  ];

  it("retorna texto não-vazio e sem travessão para cada reason", () => {
    for (const r of reasons) {
      const text = blockedMessageFor(r);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain("—");
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/whatsapp/blocked-messages.test.ts --runInBand`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/blocked-messages.ts` (textos provisórios pt-br, sem travessão; revisão final no runbook, §17.4):

```ts
/** Códigos de bloqueio das barreiras de validação (L1/L2/L3 + falha técnica). */
export type BlockReason =
  | "user_not_found"
  | "user_inactive"
  | "channel_disabled"
  | "role_not_allowed"
  | "permission_denied"
  | "technical_error";

/** Catálogo versionado de mensagens padrão por código de bloqueio (pt-br). */
const MESSAGES: Record<BlockReason, string> = {
  user_not_found:
    "Não encontrei seu número na plataforma. Peça ao administrador para cadastrar o seu WhatsApp.",
  user_inactive:
    "Sua conta está desativada no momento. Fale com o administrador para reativar o acesso.",
  channel_disabled:
    "O Agente Nex está desativado para o WhatsApp neste momento.",
  role_not_allowed:
    "Seu perfil ainda não tem acesso ao Agente Nex pelo WhatsApp. Fale com o administrador.",
  permission_denied:
    "Sua pergunta toca em um módulo que o seu acesso na plataforma não cobre hoje.",
  technical_error:
    "Não consegui processar sua mensagem agora. Tente novamente em instantes.",
};

/** Texto fixo da mensagem padrão para um código de bloqueio. */
export function blockedMessageFor(reason: BlockReason): string {
  return MESSAGES[reason];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/whatsapp/blocked-messages.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/blocked-messages.ts src/lib/whatsapp/blocked-messages.test.ts
git commit -m "feat(whatsapp): catalogo de mensagens padrao das barreiras (F5 A5)"
```

### Task A5.2: Helper de nível de acesso por canal (lógica de herança)

**Files:**
- Create: `src/lib/agent/channel-access.ts`
- Test: `src/lib/agent/channel-access.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/agent/channel-access.test.ts`. Usar `PLATFORM_ROLE_HIERARCHY` (`viewer=1..super_admin=4`). Regra: `roleMeetsChannelLevel(role, level)` é `true` se `level !== "off"` e hierarquia(role) >= hierarquia(level); `off` => sempre `false`.

```ts
import { roleMeetsChannelLevel } from "./channel-access";

describe("roleMeetsChannelLevel", () => {
  it("off bloqueia todos", () => {
    expect(roleMeetsChannelLevel("super_admin", "off")).toBe(false);
    expect(roleMeetsChannelLevel("viewer", "off")).toBe(false);
  });
  it("viewer (nível) libera todos os roles", () => {
    expect(roleMeetsChannelLevel("viewer", "viewer")).toBe(true);
    expect(roleMeetsChannelLevel("manager", "viewer")).toBe(true);
    expect(roleMeetsChannelLevel("super_admin", "viewer")).toBe(true);
  });
  it("manager (nível) exige role >= manager", () => {
    expect(roleMeetsChannelLevel("viewer", "manager")).toBe(false);
    expect(roleMeetsChannelLevel("manager", "manager")).toBe(true);
    expect(roleMeetsChannelLevel("admin", "manager")).toBe(true);
  });
  it("super_admin (nível) só libera super_admin", () => {
    expect(roleMeetsChannelLevel("admin", "super_admin")).toBe(false);
    expect(roleMeetsChannelLevel("super_admin", "super_admin")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/channel-access.test.ts --runInBand`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/agent/channel-access.ts`:

```ts
import type { PlatformRole, ChannelAccessLevel } from "@/generated/prisma/client";
import { PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";

/**
 * True quando o role do usuário satisfaz o nível mínimo do canal (com herança):
 * quem tem role >= o nível escolhido acessa. "off" bloqueia todos.
 */
export function roleMeetsChannelLevel(
  role: PlatformRole,
  level: ChannelAccessLevel,
): boolean {
  if (level === "off") return false;
  return PLATFORM_ROLE_HIERARCHY[role] >= PLATFORM_ROLE_HIERARCHY[level];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/channel-access.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/channel-access.ts src/lib/agent/channel-access.test.ts
git commit -m "feat(agente): helper de nivel de acesso por canal com heranca (F5 A5)"
```

### Task A5.3: Disparo de webhook de saída direto do inbound (`kind:"blocked"`)

> Esta task cria o emissor mínimo de saída usado pelas barreiras do inbound. O envelope COMPLETO `agent.reply` é definido na Onda B (task B.3); aqui usamos uma função de emissão que a Onda B vai estender. Para não criar dívida, já criamos o módulo de emissão (`src/lib/whatsapp/emit-reply.ts`) com a forma do envelope e o suporte a `kind:"blocked"`.

**Files:**
- Create: `src/lib/whatsapp/emit-reply.ts` (emissor + tipo do envelope; reusado pela Onda B)
- Test: `src/lib/whatsapp/emit-reply.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/whatsapp/emit-reply.test.ts`. Mockar `global.fetch` e `signPayload` (`@/lib/whatsapp/hmac`). Testar `emitAgentReply(targets, envelopeInput)`:
  - para cada target habilitado, faz `fetch(target.url, { method:"POST", headers contendo X-Signature/X-Timestamp })`;
  - o body inclui `event:"agent.reply"`, `deliveryId` (string não-vazia), `kind`, `data.ok`, `data.reason`, `data.reply`, `timestamp` (number);
  - quando `target.secret` é vazio/undefined, NÃO faz fetch para esse target (fail-closed) e não lança.

```ts
import { emitAgentReply } from "./emit-reply";

jest.mock("@/lib/whatsapp/hmac", () => ({ signPayload: jest.fn(() => "sig") }));

describe("emitAgentReply", () => {
  beforeEach(() => { (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: true, status: 200 }); });

  it("dispara envelope blocked com reason ao target com secret", async () => {
    await emitAgentReply(
      [{ url: "https://n8n/x", secret: "s1" }],
      { kind: "blocked", data: { ok: false, reason: "channel_disabled", reply: "msg", to: "5534999", phoneNumberId: null, inboundMessageId: "wamid.1", sessionId: null, assistantMessageId: null, suggestions: [], tools: [], reasoningMs: 0, usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 }, messageType: "text" } },
    );
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe("agent.reply");
    expect(body.kind).toBe("blocked");
    expect(body.data.reason).toBe("channel_disabled");
    expect(typeof body.deliveryId).toBe("string");
    expect(body.deliveryId.length).toBeGreaterThan(0);
  });

  it("fail-closed: target sem secret não dispara", async () => {
    await emitAgentReply([{ url: "https://n8n/x", secret: "" }], { kind: "blocked", data: { ok: false, reason: "user_not_found", reply: "m", to: "x", phoneNumberId: null, inboundMessageId: "i", sessionId: null, assistantMessageId: null, suggestions: [], tools: [], reasoningMs: 0, usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 }, messageType: "text" } });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/whatsapp/emit-reply.test.ts --runInBand`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/emit-reply.ts`:

```ts
import { randomUUID } from "node:crypto";
import { signPayload } from "@/lib/whatsapp/hmac";

export interface AgentReplyData {
  inboundMessageId: string;
  to: string;
  phoneNumberId: string | null;
  sessionId: string | null;
  assistantMessageId: string | null;
  ok: boolean;
  reason: string | null;
  reply: string;
  suggestions: string[];
  tools: string[];
  reasoningMs: number;
  usage: { tokensInput: number; tokensOutput: number; costUsd: number };
  messageType: "text" | "audio" | "image";
  deniedModule?: string;
  allowedModules?: string[];
}

export interface AgentReplyEnvelopeInput {
  kind: "final" | "blocked";
  data: AgentReplyData;
}

export interface OutboundTarget {
  url: string;
  secret: string;
}

/** Emite o evento agent.reply (envelope assinado HMAC) para cada target com
 *  secret válido. Fail-closed: target sem secret é pulado (não dispara). */
export async function emitAgentReply(
  targets: OutboundTarget[],
  input: AgentReplyEnvelopeInput,
): Promise<void> {
  const timestamp = Date.now();
  const envelope = {
    event: "agent.reply" as const,
    deliveryId: randomUUID(),
    kind: input.kind,
    data: input.data,
    timestamp,
  };
  const body = JSON.stringify(envelope);
  const tsStr = String(timestamp);

  for (const t of targets) {
    if (!t.url || !t.secret) continue; // fail-closed
    const signature = signPayload(body, t.secret, tsStr);
    await fetch(t.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
        "X-Timestamp": tsStr,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/whatsapp/emit-reply.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/emit-reply.ts src/lib/whatsapp/emit-reply.test.ts
git commit -m "feat(whatsapp): emissor agent.reply com envelope assinado e fail-closed (F5 A5/B)"
```

### Task A5.4: Barreiras L1/L2 no inbound (não enfileira; dispara `kind:"blocked"`)

**Files:**
- Modify: `src/app/api/integrations/whatsapp/inbound/route.ts:140-251`
- Test: `src/app/api/integrations/whatsapp/inbound/route.test.ts` (criar/editar)

- [ ] **Step 1: Escrever o teste que falha**

Em `route.test.ts`, testar (mockando `resolveWhatsappUser`, `prisma`, `emitAgentReply`, a fila `getAgentQueue`):
  - L1 número `unknown`: NÃO enfileira; chama `emitAgentReply` com `kind:"blocked"` + `reason:"user_not_found"`; resposta 200 `{ rejected:true }`.
  - L1 `inactive`: idem com `reason:"user_inactive"`.
  - L2 canal `off` (whatsappAccessLevel="off"): NÃO enfileira; `emitAgentReply` `reason:"channel_disabled"`.
  - L2 role abaixo do nível (whatsappAccessLevel="admin", user role="viewer"): NÃO enfileira; `reason:"role_not_allowed"`.
  - caso OK (role satisfaz nível): enfileira normalmente.

(Mockar `prisma.agentSettings.findFirst` retornando `{ whatsappAccessLevel }` e o `user.platformRole` na resolução , a resolução hoje retorna só `{id,name,isActive}`, então acrescentar `platformRole` ao `select` da resolução , ver Step 3.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/app/api/integrations/whatsapp/inbound/route.test.ts --runInBand`
Expected: FALHA (barreira L2 não existe; resolução não traz role).

- [ ] **Step 3: Implementação mínima**

(3a) Em `src/lib/whatsapp/resolve.ts`: acrescentar `platformRole` ao `select.user` e ao tipo `ResolvedWhatsappUser` (`user: { id; name; isActive; platformRole }`). Ajustar o `resolve.test.ts` da task A1.1 se necessário (o mock já retorna o objeto user, basta incluir `platformRole`).

(3b) Em `route.ts`, após `const { user } = resolved;` (linha ~158), ANTES do teto diário, inserir:
  - L1 já está coberta pelo `if (resolved.status !== "ok")` existente (linhas 143-156): trocar a resposta para também disparar o webhook de saída. Reescrever esse bloco para mapear `unknown→user_not_found`, `inactive→user_inactive`, chamar um helper local `emitBlocked(reason, to, phoneNumberId)` que carrega os outbound targets habilitados (com `events` contendo `agent_reply`) e chama `emitAgentReply` com `kind:"blocked"`.
  - L2: ler `agentSettings.whatsappAccessLevel`; se `!roleMeetsChannelLevel(user.platformRole, level)`, disparar `channel_disabled` (quando `level === "off"`) ou `role_not_allowed` (quando role insuficiente), retornar 200 `{ rejected:true, reason }` SEM enfileirar.

Helper `emitBlocked` no `route.ts` (carrega targets uma vez):

```ts
async function loadOutboundTargets() {
  const rows = await prisma.whatsappWebhook.findMany({
    where: { direction: "outbound", enabled: true, events: { has: "agent_reply" } },
  }).catch(() => []);
  return rows.flatMap((w) => {
    const url = w.targetUrl ?? w.url; // bug url/targetUrl: prioriza targetUrl
    if (!url) return [];
    try { return [{ url, secret: decrypt(w.secret) }]; } catch { return []; }
  });
}
```

E o disparo da barreira:

```ts
import { emitAgentReply } from "@/lib/whatsapp/emit-reply";
import { blockedMessageFor, type BlockReason } from "@/lib/whatsapp/blocked-messages";
import { roleMeetsChannelLevel } from "@/lib/agent/channel-access";
// ...
async function fireBlocked(reason: BlockReason, to: string, phoneNumberId: string | undefined, inboundMessageId: string) {
  const targets = await loadOutboundTargets();
  await emitAgentReply(targets, {
    kind: "blocked",
    data: {
      inboundMessageId, to, phoneNumberId: phoneNumberId ?? null,
      sessionId: null, assistantMessageId: null, ok: false, reason,
      reply: blockedMessageFor(reason), suggestions: [], tools: [],
      reasoningMs: 0, usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 },
      messageType: "text",
    },
  }).catch((e) => console.warn("[inbound] emitBlocked falhou:", e));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/app/api/integrations/whatsapp/inbound/route.test.ts src/lib/whatsapp/resolve.test.ts --runInBand`
Expected: PASS (todas as barreiras + resolução com role).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/integrations/whatsapp/inbound/route.ts src/lib/whatsapp/resolve.ts src/app/api/integrations/whatsapp/inbound/route.test.ts
git commit -m "feat(whatsapp): barreiras L1/L2 no inbound com mensagem padrao via webhook blocked (F5 A5)"
```

### Task A.VERIF (VERIFICAÇÃO da Onda A): tsc + eslint + jest + e2e

**Files:** nenhuma (verificação).

- [ ] **Step 1: tsc + eslint + jest das unidades da Onda A**

Run: `npx tsc --noEmit && npx eslint src/lib/whatsapp src/worker/agent src/lib/agent/channel-access.ts src/app/api/integrations/whatsapp/inbound/route.ts && npx jest src/lib/whatsapp src/worker/agent/user-lock.test.ts src/worker/agent/processor.test.ts src/lib/agent/channel-access.test.ts --runInBand`
Expected: tsc sem erros; eslint limpo; todos os testes PASS.

- [ ] **Step 2: e2e contra dado real (rebuild de containers obrigatório)**

Rebuildar app+worker (worker não tem build próprio , usa imagem do `app`):
```bash
docker compose build app && docker compose up -d --force-recreate worker
docker image inspect nexus-odoo:local --format '{{.Created}}'   # deve ser agora
```
Exercer: assinar um inbound com número SEM o 9, com um usuário cadastrado COM o 9 (confirma A1); enviar `type:"audio"`+`text` (A3 n8n) e um áudio só com `audioMediaId` (A3 Meta, não regrediu); duas mensagens seguidas do mesmo usuário (A4 lock , conferir que só uma conversa é criada). Barreiras L1/L2 retornando o webhook `kind:"blocked"` sem custo de IA (conferir que `runAgent` não roda , ausência de `LlmUsage` novo para a barreira).

- [ ] **Step 3: Commit (registro de verificação)**

```bash
git commit --allow-empty -m "chore: verificacao Onda A (e2e inbound, audio dois caminhos, lock, barreiras)"
```

---

## Onda B , Resposta rica + entrega idempotente + L3 (depende de A)

### Task B.1: Estender `RunAgentResult` com `toolsCalled` e `reasoningMs`

**Files:**
- Modify: `src/lib/agent/run-agent.ts:250-259` (tipo `RunAgentResult`) e `:756`/`:951` (coleta) e o `return` final do ramo `ok:true`
- Modify: `src/lib/agent/permission-denial.ts:133-141` (ramo `ok:true` da recusa: `toolsCalled:[]`, `reasoningMs:0`)
- Test: `src/lib/agent/run-agent.test.ts` (editar mock/asserts) e `src/lib/agent/permission-denial.test.ts`

- [ ] **Step 1: Escrever/ajustar o teste que falha**

Em `permission-denial.test.ts`, assertar que o retorno de `respondPermissionDenied` inclui `toolsCalled: []` e `reasoningMs: 0` (além de `deniedModule`/`allowedModules` , ver B.5). Em `run-agent.test.ts`, assertar que o retorno `ok:true` final inclui `toolsCalled` (array) e `reasoningMs` (number).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/permission-denial.test.ts src/lib/agent/run-agent.test.ts --runInBand`
Expected: FALHA (campos inexistentes no tipo/retorno).

- [ ] **Step 3: Implementação mínima**

(3a) Em `run-agent.ts`, no tipo `RunAgentResult` ramo `ok:true` (linhas 250-258), adicionar:

```ts
      toolsCalled: string[];
      reasoningMs: number;
```

(3b) Acumular `reasoningMs`: declarar `let turnReasoningMs = 0;` junto de `allTurnToolNames` (linha ~756). Dentro do loop de iterações, somar a duração por iteração reusando o `Date.now() - iterStart` (a mesma base usada no `logUsage` da linha 951): após o cálculo da duração da iteração, `turnReasoningMs += Date.now() - iterStart;`. (Confirmar que `iterStart` existe no escopo da iteração; se for redefinido por iteração, somar dentro do loop.)

(3c) Popular `allTurnToolNames` quando houver tool calls: no ponto onde as toolCalls da iteração são conhecidas (`result.toolCalls`), fazer `allTurnToolNames.push(...result.toolCalls.map((t) => t.name));`. (Verificar se já existe um push equivalente; se sim, reusar.)

(3d) No `return` final do ramo de sucesso, adicionar `toolsCalled: allTurnToolNames, reasoningMs: turnReasoningMs`.

(3e) Em `permission-denial.ts`, no `return` (linhas 133-141), adicionar `toolsCalled: [], reasoningMs: 0`.

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/lib/agent/permission-denial.test.ts src/lib/agent/run-agent.test.ts --runInBand`
Expected: tsc sem erros (todos os call-sites de `RunAgentResult ok:true` agora exigem os campos; o único produtor além do run-agent é `permission-denial.ts`, já ajustado); testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/run-agent.ts src/lib/agent/permission-denial.ts src/lib/agent/run-agent.test.ts src/lib/agent/permission-denial.test.ts
git commit -m "feat(agente): RunAgentResult com toolsCalled e reasoningMs (F5 B)"
```

### Task B.2: Enriquecer `respondPermissionDenied` com módulo desejado/permitidos

**Files:**
- Modify: `src/lib/agent/permission-denial.ts:133-141` (retorno) e a interface `RunAgentResult` na nota: os campos `deniedModule`/`allowedModules` NÃO entram no `RunAgentResult` (que é genérico); são passados via canal de saída. O ramo `ok:true` da recusa retorna os campos extras que o processor levará ao envelope.
- Test: `src/lib/agent/permission-denial.test.ts`

> Decisão do plano (ambiguidade da spec): `RunAgentResult` é compartilhado por todos os canais (in-app inclusive). Adicionar `deniedModule`/`allowedModules` nele poluiria o tipo. Decisão: estender o ramo `ok:true` com dois campos OPCIONAIS `deniedModule?: string` e `allowedModules?: string[]`, preenchidos só por `respondPermissionDenied`. O processor lê esses opcionais ao montar o envelope (B.4). Em-app os ignora.

- [ ] **Step 1: Escrever o teste que falha**

Em `permission-denial.test.ts`, assertar: o retorno inclui `deniedModule` (o primeiro domínio negado) e `allowedModules` (array dos disponíveis). Ex.: `deniedDomains:["financeiro"]`, `availableDomains:["estoque","fiscal"]` => `deniedModule:"financeiro"`, `allowedModules:["estoque","fiscal"]`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/permission-denial.test.ts --runInBand`
Expected: FALHA.

- [ ] **Step 3: Implementação mínima**

(3a) Em `run-agent.ts`, no ramo `ok:true` de `RunAgentResult`, adicionar:

```ts
      /** Só em recusa por permissão (L3): módulo desejado e permitidos. */
      deniedModule?: string;
      allowedModules?: string[];
```

(3b) Em `permission-denial.ts`, no `return`, adicionar:

```ts
    deniedModule: args.deniedDomains[0],
    allowedModules: args.availableDomains,
```

(O texto da recusa em si já é enriquecido pelo `buildTemplate`; aqui adicionamos os campos estruturados para o n8n.)

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/lib/agent/permission-denial.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/run-agent.ts src/lib/agent/permission-denial.ts src/lib/agent/permission-denial.test.ts
git commit -m "feat(agente): recusa por permissao expoe deniedModule e allowedModules (F5 B/L3)"
```

### Task B.3: Mapear o resultado do agente para o envelope `agent.reply` (data de `kind:"final"`)

**Files:**
- Create: `src/worker/agent/build-reply-data.ts` (puro: `RunAgentResult` + contexto → `AgentReplyData`)
- Test: `src/worker/agent/build-reply-data.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `build-reply-data.test.ts`. Testar `buildReplyData(ctx, result)`:
  - `result.ok=true` sem recusa: `ok:true`, `reason:null`, `reply` = texto formatado, `tools` = `result.toolsCalled`, `reasoningMs` = `result.reasoningMs`, `usage` mapeado de `result.usage`, `suggestions` = `result.suggestions`, `assistantMessageId` = `result.messageId`, `sessionId` = `ctx.conversationId`, `messageType` = `ctx.messageType`. Sem `deniedModule`/`allowedModules`.
  - `result.ok=true` com `deniedModule` (recusa L3): `reason:"permission_denied"`, `ok:false` no envelope? Decisão do plano: a spec diz `ok:false` para `permission_denied`. Como mapear: quando `result.deniedModule` está presente => `ok:false`, `reason:"permission_denied"`, `tools:[]`, `reasoningMs:0`, `suggestions:[]`, `deniedModule`/`allowedModules` preenchidos, `reply` = o template (que vem em `result.message`). 
  - `result.ok=false` (falha técnica): `ok:false`, `reason:"technical_error"`, `reply` = `AGENT_ERROR_MSG`, `tools:[]`, `reasoningMs:0`, `usage` zerado.

```ts
import { buildReplyData } from "./build-reply-data";

const ctx = { inboundMessageId: "wamid.1", to: "5534999", phoneNumberId: "5932", conversationId: "c1", messageType: "text" as const };

it("ok final mapeia tools/reasoning/usage", () => {
  const d = buildReplyData(ctx, { ok: true, message: "resp", suggestions: ["a"], usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0.01 } as any, messageId: "m1", toolsCalled: ["faturamento_periodo"], reasoningMs: 4200 });
  expect(d.ok).toBe(true);
  expect(d.reason).toBeNull();
  expect(d.tools).toEqual(["faturamento_periodo"]);
  expect(d.reasoningMs).toBe(4200);
  expect(d.assistantMessageId).toBe("m1");
});

it("recusa de permissao vira ok:false/permission_denied", () => {
  const d = buildReplyData(ctx, { ok: true, message: "recusa", suggestions: [], usage: { tokensInput: 0, tokensOutput: 0, costUsd: 0 } as any, messageId: "m2", toolsCalled: [], reasoningMs: 0, deniedModule: "financeiro", allowedModules: ["estoque"] });
  expect(d.ok).toBe(false);
  expect(d.reason).toBe("permission_denied");
  expect(d.deniedModule).toBe("financeiro");
  expect(d.allowedModules).toEqual(["estoque"]);
});

it("falha técnica vira ok:false/technical_error", () => {
  const d = buildReplyData(ctx, { ok: false, error: "boom" });
  expect(d.ok).toBe(false);
  expect(d.reason).toBe("technical_error");
  expect(d.reasoningMs).toBe(0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/build-reply-data.test.ts --runInBand`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementação mínima**

Criar `src/worker/agent/build-reply-data.ts`. Importar `AgentReplyData` de `@/lib/whatsapp/emit-reply`, `formatForChannel` de `@/lib/agent/format/by-channel`, `RunAgentResult` de `@/lib/agent/run-agent`. Implementar:

```ts
export interface ReplyContext {
  inboundMessageId: string;
  to: string;
  phoneNumberId: string | null;
  conversationId: string | null;
  messageType: "text" | "audio" | "image";
}

const AGENT_ERROR_MSG =
  "Desculpe, não consegui processar sua mensagem agora. Tente novamente em instantes.";

export function buildReplyData(ctx: ReplyContext, result: RunAgentResult): AgentReplyData {
  const baseUsage = { tokensInput: 0, tokensOutput: 0, costUsd: 0 };
  if (!result.ok) {
    return {
      inboundMessageId: ctx.inboundMessageId, to: ctx.to, phoneNumberId: ctx.phoneNumberId,
      sessionId: ctx.conversationId, assistantMessageId: null,
      ok: false, reason: "technical_error", reply: AGENT_ERROR_MSG,
      suggestions: [], tools: [], reasoningMs: 0, usage: baseUsage, messageType: ctx.messageType,
    };
  }
  const isDenied = typeof result.deniedModule === "string";
  return {
    inboundMessageId: ctx.inboundMessageId, to: ctx.to, phoneNumberId: ctx.phoneNumberId,
    sessionId: ctx.conversationId, assistantMessageId: result.messageId,
    ok: !isDenied,
    reason: isDenied ? "permission_denied" : null,
    reply: formatForChannel(result.message, "whatsapp"),
    suggestions: isDenied ? [] : result.suggestions,
    tools: isDenied ? [] : result.toolsCalled,
    reasoningMs: isDenied ? 0 : result.reasoningMs,
    usage: isDenied
      ? baseUsage
      : { tokensInput: result.usage.tokensInput, tokensOutput: result.usage.tokensOutput, costUsd: result.usage.costUsd },
    messageType: ctx.messageType,
    ...(isDenied ? { deniedModule: result.deniedModule, allowedModules: result.allowedModules ?? [] } : {}),
  };
}
```

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/worker/agent/build-reply-data.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/build-reply-data.ts src/worker/agent/build-reply-data.test.ts
git commit -m "feat(whatsapp): mapeia resultado do agente para o envelope agent.reply (F5 B)"
```

### Task B.4: Idempotência de saída no processor (§9) + emissão do `agent.reply`

**Files:**
- Modify: `src/worker/agent/processor.ts:63-224` (topo: short-circuit por `whatsapp:replied:{messageId}`; fim: gravar payload + emitir via `emitAgentReply`)
- Modify: `src/worker/agent/processor.ts:276-311` (substituir `sendViaWebhook` legado pelo novo envelope quando `responseMode==="n8n_webhook"`; o modo `direct` envia só `data.reply` via cloud-client)
- Modify: `src/app/api/integrations/whatsapp/inbound/route.ts:205-220` (carregar TODOS os outbound targets habilitados com `agent_reply` no `channelConfig`, não um só; corrigir `url`→`targetUrl ?? url`)
- Test: `src/worker/agent/processor.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

No `processor.test.ts`, testar:
  - Idempotência: quando `redis.get("whatsapp:replied:wamid.1")` retorna um payload serializado, `processAgentJob` NÃO chama `runAgent` e re-emite o payload salvo (chama `emitAgentReply` com aquele envelope). 
  - Caminho normal: após `runAgent` ok, grava `redis.set("whatsapp:replied:wamid.1", <payload>, ...)` e chama `emitAgentReply` com `kind:"final"`, `data.tools` = toolsCalled, etc.
  - Falha de POST não re-roda o agente no retry (coberta pela idempotência: no retry o `redis.get` acha o payload).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA (sem idempotência/emissão nova).

- [ ] **Step 3: Implementação mínima**

(3a) Em `route.ts` (~205-220): substituir o carregamento de UM outbound por TODOS os targets habilitados com `events has agent_reply`, reusando o helper `loadOutboundTargets` (criado em A5.4). Mudar `channelConfig` para carregar `outboundTargets: { url, secret }[]` (corrigindo `url`→`targetUrl ?? url`). Atualizar a interface `AgentJobChannelConfig` em `processor.ts` para `outboundTargets?: { url: string; secret: string }[]` (manter `outboundUrl`/`outboundSecret` legados só se algum teste/modo direct ainda usar; senão remover).

(3b) Em `processor.ts`, no topo de `processAgentJob` (após adquirir o lock, antes do get-or-create), inserir o short-circuit de idempotência:

```ts
import { emitAgentReply, type AgentReplyData } from "@/lib/whatsapp/emit-reply";
import { buildReplyData } from "./build-reply-data";
// ...
  const replayKey = `whatsapp:replied:${data.messageId}`;
  const cached = await redis.get(replayKey).catch(() => null);
  if (cached) {
    try {
      const replyData = JSON.parse(cached) as AgentReplyData;
      await dispatchReply(data, replyData, replyData.ok ? "final" : "blocked");
    } catch (e) { console.warn("[processor] replay falhou:", e); }
    return;
  }
```

(3c) Após `runAgent` + persistência, montar o `AgentReplyData` via `buildReplyData`, gravar em Redis (`redis.set(replayKey, JSON.stringify(replyData), "EX", 24*60*60)`) e despachar:

```ts
  const replyData = buildReplyData(
    { inboundMessageId: data.messageId, to: data.replyTo, phoneNumberId: data.phoneNumberId ?? null, conversationId: conversation.id, messageType: data.type },
    result,
  );
  await redis.set(replayKey, JSON.stringify(replyData), "EX", 24 * 60 * 60).catch(() => {});
  await dispatchReply(data, replyData, "final");
```

(3d) Criar a função `dispatchReply(data, replyData, kind)` no processor: em `n8n_webhook`, chama `emitAgentReply(data.channelConfig.outboundTargets ?? [], { kind, data: replyData })`; em `direct`, chama `cloudClient.sendText(data.replyTo, replyData.reply)`.

(3e) Remover/aposentar `sendViaWebhook` legado (substituído por `emitAgentReply`+`dispatchReply`). O heartbeat (`scheduleWhatsappHeartbeat`) que usava `sendViaWebhook`: a spec decisão #9 diz heartbeat suprimido no WhatsApp , na task B.6 removemos o heartbeat; aqui, se ainda presente, ajustar para usar `dispatchReply` com um envelope `final` mínimo OU deixar a remoção para B.6 (preferir B.6).

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/processor.ts src/app/api/integrations/whatsapp/inbound/route.ts
git commit -m "feat(whatsapp): idempotencia de saida e emissao do envelope agent.reply (F5 B)"
```

### Task B.5: Levar a recusa L3 ao webhook (a recusa já roda via `respondPermissionDenied`)

**Files:**
- Modify: `src/worker/agent/processor.ts` (o caminho de recusa já volta em `result.ok=true` com `deniedModule`; garantir que `buildReplyData` emita `kind:"blocked"` quando `isDenied`)
- Test: `src/worker/agent/processor.test.ts`

> Nota: `respondPermissionDenied` é chamado DENTRO de `runAgent` (run-agent.ts:715), portanto o processor recebe o resultado já como `ok:true` + `deniedModule`. A única mudança aqui é garantir que o `kind` do envelope seja `"blocked"` quando `replyData.ok === false`.

- [ ] **Step 1: Escrever o teste que falha**

No `processor.test.ts`, mockar `runAgent` retornando `{ ok:true, message:"recusa", suggestions:[], usage:{...0}, messageId:"m", toolsCalled:[], reasoningMs:0, deniedModule:"financeiro", allowedModules:["estoque"] }`. Assertar que `emitAgentReply` é chamado com `kind:"blocked"`, `data.reason:"permission_denied"`, `data.deniedModule:"financeiro"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA se `dispatchReply` for chamado com `kind:"final"` fixo.

- [ ] **Step 3: Implementação mínima**

No ponto onde se chama `dispatchReply(data, replyData, "final")` (B.4 Step 3c), trocar o `kind` fixo por derivado: `const kind = replyData.ok ? "final" : "blocked";` e usar `kind`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/processor.ts src/worker/agent/processor.test.ts
git commit -m "feat(whatsapp): recusa L3 sai como kind:blocked/permission_denied no webhook (F5 B)"
```

### Task B.6: Suprimir heartbeat no WhatsApp (decisão #9)

**Files:**
- Modify: `src/worker/agent/processor.ts:171-190,251-270` (remover `scheduleWhatsappHeartbeat` e seu uso)
- Test: `src/worker/agent/processor.test.ts`

- [ ] **Step 1: Ajustar o teste**

No `processor.test.ts`, assertar que nenhuma mensagem intermediária ("Buscando...", etc.) é emitida durante o processamento (i.e., `emitAgentReply`/`cloudClient.sendText` só é chamado UMA vez, com a resposta final).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA se o teste detectar emissão intermediária (na prática, com fake timers o heartbeat de 3s pode não disparar; o objetivo é remover o código mesmo).

- [ ] **Step 3: Implementação mínima**

Remover a função `scheduleWhatsappHeartbeat` (linhas ~251-270), a chamada `const heartbeatTimer = scheduleWhatsappHeartbeat(data);` (linha ~174) e o `finally { if (heartbeatTimer) clearTimeout(heartbeatTimer); }` em volta do `runAgent` (substituir por `await runAgent(...)` direto, mantendo o `try/finally` do lock externo).

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/processor.ts src/worker/agent/processor.test.ts
git commit -m "feat(whatsapp): suprime heartbeat no WhatsApp (so resposta final/barreira) (F5 B)"
```

### Task B.VERIF (VERIFICAÇÃO da Onda B): tsc + eslint + jest + e2e

**Files:** nenhuma (verificação).

- [ ] **Step 1: tsc + eslint + jest**

Run: `npx tsc --noEmit && npx eslint src/lib/agent/run-agent.ts src/lib/agent/permission-denial.ts src/worker/agent && npx jest src/lib/agent/run-agent.test.ts src/lib/agent/permission-denial.test.ts src/worker/agent --runInBand`
Expected: tudo verde.

- [ ] **Step 2: e2e contra dado real (rebuild app+worker)**

```bash
docker compose build app && docker compose up -d --force-recreate worker
```
Exercer: pergunta normal por WhatsApp (modo n8n_webhook) e conferir o envelope rico no receptor (campos `tools`, `reasoningMs`, `usage`, `assistantMessageId`, `suggestions`); confirmar que o Judge gerou avaliação para a conversa WhatsApp (`SELECT status, channel ... JOIN conversations WHERE channel='whatsapp'`); barreira L3 (usuário sem o domínio da pergunta) sai como `kind:"blocked"`/`permission_denied` com `deniedModule`/`allowedModules`; retry de POST falho NÃO re-roda o agente nem duplica (conferir que `whatsapp:replied:{messageId}` é reusado).

- [ ] **Step 3: Commit (registro)**

```bash
git commit --allow-empty -m "chore: verificacao Onda B (envelope rico, idempotencia, L3, Judge no WhatsApp)"
```

---

## Onda C , Acesso por canal/nível (config) (depende de Onda 0)

> UI: tasks C.4 e C.5 são frontend , construir INLINE com a skill `ui-ux-pro-max`. NÃO escrever o visual aqui; o plano descreve componente, comportamento, estados e critério visual.

### Task C.1: Estender o DTO de AgentSettings com os níveis de canal

**Files:**
- Modify: `src/lib/actions/agent-config-types.ts` (adicionar `bubbleAccessLevel`/`whatsappAccessLevel` ao `AgentSettingsData` e `PublicAgentFlags`)
- Modify: `src/lib/actions/agent-config.ts:130-157` (tipo `AgentSettingsRow`), `:168-189` (`mapSettings`), `:275-310` (`getPublicAgentFlags`)
- Test: `src/lib/actions/agent-config.test.ts` (se existir; senão criar mínimo)

- [ ] **Step 1: Escrever o teste que falha**

Testar que `getPublicAgentFlags` retorna `bubbleAccessLevel` e `whatsappAccessLevel` lidos do settings (mock do `prisma.agentSettings.findFirst`). Se não houver suíte, criar `src/lib/actions/agent-config.test.ts` com o caso mínimo (mockando prisma).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/actions/agent-config.test.ts --runInBand`
Expected: FALHA (campos ausentes).

- [ ] **Step 3: Implementação mínima**

(3a) Em `agent-config-types.ts`: adicionar `bubbleAccessLevel: ChannelAccessLevel;` e `whatsappAccessLevel: ChannelAccessLevel;` em `AgentSettingsData` e em `PublicAgentFlags` (importar o tipo de `@/generated/prisma/client`).

(3b) Em `agent-config.ts`: incluir os dois campos em `AgentSettingsRow` (linha ~130), no `mapSettings` (linha ~182, ler `row.bubbleAccessLevel`/`row.whatsappAccessLevel`), e no `getPublicAgentFlags` (linha ~305) incluir `bubbleAccessLevel`/`whatsappAccessLevel` no retorno e no default (linhas ~269-270, ~288-289) com `viewer` (preserva comportamento).

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/lib/actions/agent-config.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/agent-config-types.ts src/lib/actions/agent-config.ts src/lib/actions/agent-config.test.ts
git commit -m "feat(agente): DTO de settings expoe niveis de acesso por canal (F5 C)"
```

### Task C.2: `updateAgentAvailability` aceita níveis (não booleans)

**Files:**
- Modify: `src/lib/actions/agent-config.ts:534-581`
- Test: `src/lib/actions/agent-config.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Testar que `updateAgentAvailability({ bubbleAccessLevel:"manager", whatsappAccessLevel:"off" })` chama `prisma.agentSettings.upsert` gravando os dois níveis (mockar `requireAdminOrAbove` ok + `prisma`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/actions/agent-config.test.ts --runInBand`
Expected: FALHA (assinatura aceita booleans).

- [ ] **Step 3: Implementação mínima**

Em `agent-config.ts`, trocar a assinatura de `updateAgentAvailability` para `{ bubbleAccessLevel: ChannelAccessLevel; whatsappAccessLevel: ChannelAccessLevel }`; no `upsert` (create+update) gravar `bubbleAccessLevel`/`whatsappAccessLevel` (remover `bubbleEnabled`/`whatsappEnabled` do payload). Ajustar o `logAudit.details`.

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/lib/actions/agent-config.test.ts --runInBand`
Expected: PASS (tsc vai apontar a UI em C.4 que ainda passa booleans , será corrigida lá; se tsc quebrar agora pela UI, seguir para C.4 antes de fechar este tsc , ordenar C.4 logo após).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/agent-config.ts src/lib/actions/agent-config.test.ts
git commit -m "feat(agente): updateAgentAvailability grava niveis por canal (F5 C)"
```

### Task C.3: Helper de opções do segmented control (derivado dos roles)

**Files:**
- Create: `src/lib/agent/channel-level-options.ts`
- Test: `src/lib/agent/channel-level-options.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Testar `channelLevelOptions()` retorna 5 opções: `{ value:"off", label:"Desativado" }` seguido dos roles em ordem de hierarquia CRESCENTE de exigência (viewer→super_admin) com labels de `PLATFORM_ROLE_LABELS`. Critério: a primeira opção é "Desativado"; as demais derivam de `PLATFORM_ROLE_LABELS`/`PLATFORM_ROLE_HIERARCHY` (sem hardcode de label).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/channel-level-options.test.ts --runInBand`
Expected: FALHA.

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/agent/channel-level-options.ts`:

```ts
import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { PLATFORM_ROLE_LABELS, PLATFORM_ROLE_HIERARCHY } from "@/lib/constants/roles";

export interface ChannelLevelOption { value: ChannelAccessLevel; label: string; }

/** Opções do seletor de nível por canal: "Desativado" + roles por hierarquia
 *  crescente (viewer..super_admin). Derivado da fonte única de roles. */
export function channelLevelOptions(): ChannelLevelOption[] {
  const roles = (Object.keys(PLATFORM_ROLE_HIERARCHY) as Array<keyof typeof PLATFORM_ROLE_HIERARCHY>)
    .sort((a, b) => PLATFORM_ROLE_HIERARCHY[a] - PLATFORM_ROLE_HIERARCHY[b]);
  return [
    { value: "off", label: "Desativado" },
    ...roles.map((r) => ({ value: r, label: PLATFORM_ROLE_LABELS[r] })),
  ];
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/channel-level-options.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/channel-level-options.ts src/lib/agent/channel-level-options.test.ts
git commit -m "feat(agente): opcoes do seletor de nivel por canal derivadas dos roles (F5 C)"
```

### Task C.4 (UI, ui-ux-pro-max): trocar os 2 Switch por 2 SegmentedControl no AgentAvailabilityCard

**Files:**
- Modify: `src/components/agent/agent-availability-card.tsx` (substituir os dois `Switch`/`Row` por dois `SegmentedControl<ChannelAccessLevel>`)
- Modify: `src/components/agent/agent-availability-summary.ts` (atualizar `summarizeAvailability` para receber níveis em vez de booleans)
- Modify: `src/app/(protected)/agente/configuracao/page.tsx:92-93,174-177` (passar `bubbleAccessLevel`/`whatsappAccessLevel` em vez dos booleans)

> NÃO escrever o código visual aqui. Construir INLINE com `ui-ux-pro-max`.
>
> **Componente:** dois grupos rotulados ("Bubble no app" e "WhatsApp"), cada um com um `SegmentedControl` (componente genérico de `src/components/ui/segmented-control.tsx`) cujas opções vêm de `channelLevelOptions()` (5 segmentos: Desativado, Visualizador, Gerente, Admin, Super Admin). Reaproveita a faixa de sumário do topo (bolinha de status + título + helper).
>
> **Comportamento:** ao trocar o nível de um canal, chama `updateAgentAvailability({ bubbleAccessLevel, whatsappAccessLevel })` (server action de C.2) via `useTransition`; em erro, `toast.error` + `router.refresh()`. Mantém o gate `isConfigured` (sem provedor LLM => segmented desabilitado, exceto manter "Desativado").
>
> **Estados:** pendente (segmento em transição com leve opacidade/spinner inline), desabilitado (`isConfigured=false`), ativo por canal. O sumário do topo deve refletir os 4+ estados: ambos ativos, só um ativo, ambos off, mais o nível mínimo escolhido (ex.: "Bubble: a partir de Gerente").
>
> **Critério visual (ui-ux-pro-max):** estado ativo por fundo + peso (não só cor), foco visível, contraste AA, alinhamento com o grupo "Máximo por resposta" da mesma tela, sem travessão nos textos, linguagem natural pt-br. Responsivo (empilha em telas estreitas).

- [ ] **Step 1: Atualizar `summarizeAvailability`**

Em `agent-availability-summary.ts`, mudar a assinatura para `(bubbleLevel: ChannelAccessLevel, whatsappLevel: ChannelAccessLevel)` e derivar `tone`/`title`/`helper` dos níveis (`off` em ambos => tone "off"; ambos !=off => "active"; um só => "partial"; helper menciona o nível mínimo). Ajustar/criar o teste `agent-availability-summary.test.ts` correspondente (TDD: escrever os casos primeiro, ver falhar, implementar).

- [ ] **Step 2: Construir a UI com ui-ux-pro-max e ligar a page**

Editar `agent-availability-card.tsx` (props `initial: { bubbleAccessLevel; whatsappAccessLevel }`) e `page.tsx` (passar os níveis lidos de `settings`).

- [ ] **Step 3: Verificar (tsc + eslint + render manual)**

Run: `npx tsc --noEmit && npx eslint src/components/agent/agent-availability-card.tsx src/components/agent/agent-availability-summary.ts src/app/(protected)/agente/configuracao/page.tsx && npx jest src/components/agent/agent-availability-summary.test.ts --runInBand`
Expected: verde. Render manual: rebuild `app` e abrir `/agente/configuracao`, conferir os dois segmented controls e a persistência.

- [ ] **Step 4: Commit**

```bash
git add src/components/agent/agent-availability-card.tsx src/components/agent/agent-availability-summary.ts src/components/agent/agent-availability-summary.test.ts src/app/(protected)/agente/configuracao/page.tsx
git commit -m "feat(agente): segmented control de nivel por canal na Disponibilidade (F5 C, ui-ux-pro-max)"
```

### Task C.5: Gate da bubble por nível no layout (`bubbleVisible`)

**Files:**
- Modify: `src/app/(protected)/layout.tsx:94` (`bubbleVisible`)
- Test: nenhum unitário direto (server component); verificação manual + tsc.

- [ ] **Step 1: Implementar o gate por nível**

Em `layout.tsx`, trocar `const bubbleVisible = canUseAgent && flags.bubbleEnabled;` por:

```ts
import { roleMeetsChannelLevel } from "@/lib/agent/channel-access";
// ...
  const bubbleVisible =
    canUseAgent && roleMeetsChannelLevel(user.platformRole, flags.bubbleAccessLevel);
```

(`canUseAgent` continua cobrindo domínios; o nível cobre o canal. `off` => `roleMeetsChannelLevel` retorna false => bubble some.)

- [ ] **Step 2: Verificar tsc + eslint**

Run: `npx tsc --noEmit && npx eslint "src/app/(protected)/layout.tsx"`
Expected: verde.

- [ ] **Step 3: Verificação manual (rebuild app)**

`docker compose build app && docker compose up -d --force-recreate app`. Logar como viewer com `bubbleAccessLevel="admin"` => bubble some; com `bubbleAccessLevel="viewer"` => bubble aparece.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/layout.tsx"
git commit -m "feat(agente): bubble respeita nivel minimo do canal in-app (F5 C)"
```

### Task C.6: Remover os booleans legados `bubbleEnabled`/`whatsappEnabled`

**Files:**
- Modify: `prisma/schema.prisma:2798-2801` (remover os dois booleans)
- Modify: `src/lib/actions/agent-config.ts` (remover `updateBubbleEnabled` se ficou órfão; remover refs aos booleans no Row/map/flags)
- Create: `prisma/migrations/<timestamp>_f5_drop_legacy_channel_booleans/migration.sql`
- Grep guard: `grep -rn "bubbleEnabled\|whatsappEnabled" src/` deve não retornar usos vivos antes de migrar.

> Esta task fecha a migração de dados. Só executar após C.1-C.5 (todas as leituras já usam os níveis). Segue protocolo de schema (segunda migration; avisar + `agente schema-changed`).

- [ ] **Step 1: Garantir que não há mais uso dos booleans**

Run: `grep -rn "bubbleEnabled\|whatsappEnabled" src/ | grep -v "AccessLevel"`
Expected: vazio (ou só comentários). Se houver código vivo, corrigir antes de remover do schema.

- [ ] **Step 2: Remover do schema + gerar migration**

Remover `bubbleEnabled`/`whatsappEnabled` do model `AgentSettings`. Avisar o usuário (protocolo). Run: `npx prisma migrate dev --name f5_drop_legacy_channel_booleans` e `agente schema-changed`.

- [ ] **Step 3: Regenerar + verificar**

Run: `npx prisma generate && npx tsc --noEmit && npx jest src/lib/actions/agent-config.test.ts --runInBand`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/generated/prisma src/lib/actions/agent-config.ts
git commit -m "chore(schema): remove booleans legados bubbleEnabled/whatsappEnabled (F5 C)"
```

### Task C.VERIF (VERIFICAÇÃO da Onda C): tsc + eslint + jest + e2e

- [ ] **Step 1:** Run: `npx tsc --noEmit && npx eslint src/components/agent src/lib/agent/channel-access.ts src/lib/agent/channel-level-options.ts "src/app/(protected)/layout.tsx" "src/app/(protected)/agente/configuracao/page.tsx" && npx jest src/lib/agent/channel-access.test.ts src/lib/agent/channel-level-options.test.ts src/lib/actions/agent-config.test.ts src/components/agent/agent-availability-summary.test.ts --runInBand`
Expected: tudo verde.

- [ ] **Step 2: e2e (rebuild app):** segmented control bloqueando bubble e WhatsApp conforme o role: definir `whatsappAccessLevel="manager"`, enviar inbound de um usuário `viewer` => barreira L2 `role_not_allowed`; definir `bubbleAccessLevel="off"` => bubble some para todos; `viewer` => aparece para todos.

- [ ] **Step 3: Commit:** `git commit --allow-empty -m "chore: verificacao Onda C (segmented control, gates bubble/whatsapp por nivel)"`

---

## Onda D , Webhook por evento (UI + emissor) (depende de Onda 0)

> UI: task D.2 é frontend , INLINE com `ui-ux-pro-max`.

### Task D.1: Validação de `events` na criação/edição de webhook (server)

**Files:**
- Modify: `src/lib/actions/webhooks.ts:140-185` (createWebhook: outbound novo nasce com `events:['agent_reply']` por default; aceitar `events` no input) e a action de update correspondente
- Modify: `src/lib/actions/webhooks.ts` (schema Zod `createSchema`/update: campo `events: z.array(z.enum(["agent_reply"])).optional()`)
- Test: `src/lib/actions/webhooks.test.ts` (criar/editar)

- [ ] **Step 1: Escrever o teste que falha**

Testar: `createWebhook` outbound sem `events` => grava `events:["agent_reply"]` (default); com `events:[]` => grava vazio; inbound => `events` ignorado (vazio). Mockar `getCurrentUser` super_admin + `prisma.whatsappWebhook.create`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/actions/webhooks.test.ts --runInBand`
Expected: FALHA (campo `events` inexistente).

- [ ] **Step 3: Implementação mínima**

Adicionar `events` ao `createSchema` (e ao schema de update). No `create` (linha ~173-183), gravar `events: data.direction === "outbound" ? (data.events ?? ["agent_reply"]) : []`. Idem no update.

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/lib/actions/webhooks.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/webhooks.ts src/lib/actions/webhooks.test.ts
git commit -m "feat(webhooks): campo events com default agent_reply em outbound (F5 D)"
```

### Task D.2 (UI, ui-ux-pro-max): seletor de eventos no wizard e no dialog de edição

**Files:**
- Modify: `src/components/integrations/webhook-wizard.tsx` (passo 2, só quando direction=outbound)
- Modify: `src/components/integracoes/webhook-edit-dialog.tsx` (só para outbound)

> NÃO escrever o código visual aqui. Construir INLINE com `ui-ux-pro-max`.
>
> **Componente:** lista de checkboxes de eventos disponíveis (hoje só `agent.reply`), visível APENAS quando o webhook é de saída (`direction === "outbound"`). Label do evento amigável ("Resposta do agente (agent.reply)").
>
> **Comportamento:** o estado dos eventos selecionados entra no payload de `createWebhook`/update (`events: ["agent_reply"]`). Default marcado para outbound novo. Inbound não mostra a seção.
>
> **Estados:** marcado/desmarcado; desabilitado quando há só um evento e ele é obrigatório (decisão do plano: permitir desmarcar => webhook não recebe nada, válido). Sem seleção => aviso suave "este webhook não receberá eventos".
>
> **Critério visual (ui-ux-pro-max):** checkbox acessível (label clicável, foco visível), agrupamento claro com título "Eventos", consistente com o restante do wizard, pt-br, sem travessão.

- [ ] **Step 1: Construir a UI com ui-ux-pro-max e ligar ao payload**

- [ ] **Step 2: Verificar tsc + eslint + render manual (rebuild app)**

Run: `npx tsc --noEmit && npx eslint src/components/integrations/webhook-wizard.tsx src/components/integracoes/webhook-edit-dialog.tsx`
Expected: verde. Render: criar um outbound pelo wizard, conferir o evento marcado e persistido.

- [ ] **Step 3: Commit**

```bash
git add src/components/integrations/webhook-wizard.tsx src/components/integracoes/webhook-edit-dialog.tsx
git commit -m "feat(webhooks): seletor de eventos no wizard e edicao de outbound (F5 D, ui-ux-pro-max)"
```

### Task D.3: Emissor por evento (carregar todos os outbound com `agent_reply`)

**Files:**
- Modify: `src/app/api/integrations/whatsapp/inbound/route.ts` (o `loadOutboundTargets` da Onda A já filtra `events has agent_reply`; garantir que substitui o `findFirst` único, linha ~199)
- Test: `src/app/api/integrations/whatsapp/inbound/route.test.ts`

> A Onda A (A5.4) já introduziu `loadOutboundTargets` com `where: { ..., events: { has: "agent_reply" } }`. Esta task confirma e testa que o emissor dispara para TODOS os outbound habilitados com o evento (não só o primeiro).

- [ ] **Step 1: Escrever o teste que falha**

Testar: com 2 webhooks outbound habilitados com `events:["agent_reply"]` e 1 sem o evento, o `loadOutboundTargets` (ou o caminho do inbound) retorna 2 targets; o sem o evento é excluído. Mockar `prisma.whatsappWebhook.findMany`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/app/api/integrations/whatsapp/inbound/route.test.ts --runInBand`
Expected: FALHA se ainda houver `findFirst` único em algum caminho.

- [ ] **Step 3: Implementação mínima**

Garantir que TODO carregamento de outbound (barreiras e channelConfig) usa `loadOutboundTargets` (findMany com `events has agent_reply`). Remover qualquer `findFirst({ direction:"outbound" })` remanescente.

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/app/api/integrations/whatsapp/inbound/route.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/integrations/whatsapp/inbound/route.ts src/app/api/integrations/whatsapp/inbound/route.test.ts
git commit -m "feat(webhooks): emissor dispara para todos os outbound com agent_reply (F5 D)"
```

### Task D.VERIF (VERIFICAÇÃO da Onda D): tsc + eslint + jest + e2e

- [ ] **Step 1:** Run: `npx tsc --noEmit && npx eslint src/lib/actions/webhooks.ts src/components/integrations/webhook-wizard.tsx src/components/integracoes/webhook-edit-dialog.tsx src/app/api/integrations/whatsapp/inbound/route.ts && npx jest src/lib/actions/webhooks.test.ts src/app/api/integrations/whatsapp/inbound/route.test.ts --runInBand`
Expected: verde.

- [ ] **Step 2: e2e (rebuild app):** criar 2 outbound, um com `agent.reply` e um sem; enviar inbound; confirmar que só o com o evento recebe o `agent.reply`. Desmarcar o evento de um webhook pela UI e confirmar que ele para de receber.

- [ ] **Step 3: Commit:** `git commit --allow-empty -m "chore: verificacao Onda D (webhook por evento)"`

---

## Onda E , Monitoramento (aba Chat + origem) (POR ÚLTIMO, conflito com feat/nex-reconstrucao)

> Conflito previsto com `feat/nex-reconstrucao` em `monitoramento-content.tsx`, `kpis-block.tsx`, `bubble-monitor*.tsx`, `monitoramento-nav.tsx`. Commits ATÔMICOS por arquivo; merge resolvido manualmente. UI: tasks E.4/E.5 INLINE com `ui-ux-pro-max`.

### Task E.1: Origens distintas Bubble vs WhatsApp em rodada-labels

**Files:**
- Modify: `src/lib/agent/quality/rodada-labels.ts:35-66` (novas origens + labels + `channelToOrigem`)
- Test: `src/lib/agent/quality/rodada-labels.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `rodada-labels.test.ts`, assertar: `channelToOrigem("in_app") === ORIGEM_AGENTE_NEX_BUBBLE`; `channelToOrigem("whatsapp") === ORIGEM_AGENTE_NEX_WHATSAPP`; `ORIGEM_LABELS[ORIGEM_AGENTE_NEX_BUBBLE] === "Agente Nex · Bubble"`; `ORIGEM_LABELS[ORIGEM_AGENTE_NEX_WHATSAPP] === "Agente Nex · WhatsApp"`. Manter `playground`/`backtest` inalterados.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/quality/rodada-labels.test.ts --runInBand`
Expected: FALHA (hoje ambos os canais coalescem em `ORIGEM_AGENTE_NEX`).

- [ ] **Step 3: Implementação mínima**

Em `rodada-labels.ts`: adicionar `export const ORIGEM_AGENTE_NEX_BUBBLE = "__origem:agente-nex-bubble";` e `export const ORIGEM_AGENTE_NEX_WHATSAPP = "__origem:agente-nex-whatsapp";`. Em `ORIGEM_LABELS`, adicionar as duas chaves com labels "Agente Nex · Bubble" e "Agente Nex · WhatsApp". Em `channelToOrigem`, trocar a checagem única por: `in_app → ORIGEM_AGENTE_NEX_BUBBLE`, `whatsapp → ORIGEM_AGENTE_NEX_WHATSAPP`. Manter `ORIGEM_AGENTE_NEX` exportado (compat) mas não mais retornado por `channelToOrigem`. Origens virtuais entram por fora da sequência RX (decisão #11 , `buildRodadaNamesFromMarkers` já trata `marker in ORIGEM_LABELS`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/quality/rodada-labels.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/quality/rodada-labels.ts src/lib/agent/quality/rodada-labels.test.ts
git commit -m "feat(monitoramento): origens distintas Bubble vs WhatsApp (F5 E)"
```

### Task E.2: `getDistinctRodadas` separa in_app e whatsapp

**Files:**
- Modify: `src/lib/agent/quality/queries.ts:235-258`
- Test: `src/lib/agent/quality/queries.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Em `queries.test.ts`, mockar `prisma.$queryRaw` para `virtualRows` retornar `[{channel:"in_app",count:3},{channel:"whatsapp",count:2}]` e assertar que `getDistinctRodadas` produz DUAS entradas: `__origem:agente-nex-bubble` (count 3) e `__origem:agente-nex-whatsapp` (count 2), em vez de uma única `__origem:agente-nex` somando 5.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/quality/queries.test.ts --runInBand`
Expected: FALHA (hoje soma em `agenteNexCount`).

- [ ] **Step 3: Implementação mínima**

Em `queries.ts` (linhas 235-257): trocar `agenteNexCount` único por `bubbleCount`/`whatsappCount`; no loop, `in_app → bubbleCount`, `whatsapp → whatsappCount`; emitir `__origem:agente-nex-bubble` e `__origem:agente-nex-whatsapp` (importando as consts de `rodada-labels.ts`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/quality/queries.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/quality/queries.ts src/lib/agent/quality/queries.test.ts
git commit -m "feat(monitoramento): getDistinctRodadas separa origens Bubble e WhatsApp (F5 E)"
```

### Task E.3: Helper único de status por canal (in_app vs whatsapp)

**Files:**
- Create: `src/lib/agent/session-status.ts`
- Test: `src/lib/agent/session-status.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Testar `isSessionActive({ channel, endedAt, updatedAt })`:
  - in_app: ativa sse `endedAt === null` (independente de updatedAt).
  - whatsapp: ativa sse `endedAt === null` E `updatedAt >= now()-24h`.

```ts
import { isSessionActive } from "./session-status";

const now = Date.now();
it("in_app: ativa se endedAt null", () => {
  expect(isSessionActive({ channel: "in_app", endedAt: null, updatedAt: new Date(now - 100 * 3600e3) })).toBe(true);
});
it("whatsapp: ativa só dentro de 24h", () => {
  expect(isSessionActive({ channel: "whatsapp", endedAt: null, updatedAt: new Date(now - 1 * 3600e3) })).toBe(true);
  expect(isSessionActive({ channel: "whatsapp", endedAt: null, updatedAt: new Date(now - 25 * 3600e3) })).toBe(false);
});
it("encerrada nunca é ativa", () => {
  expect(isSessionActive({ channel: "whatsapp", endedAt: new Date(), updatedAt: new Date() })).toBe(false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/session-status.test.ts --runInBand`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/agent/session-status.ts`:

```ts
const WHATSAPP_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isSessionActive(s: {
  channel: string;
  endedAt: Date | null;
  updatedAt: Date;
}): boolean {
  if (s.endedAt !== null) return false;
  if (s.channel === "whatsapp") {
    return +s.updatedAt >= Date.now() - WHATSAPP_ACTIVE_WINDOW_MS;
  }
  return true; // in_app e demais: ativa enquanto não encerrada
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/session-status.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/session-status.ts src/lib/agent/session-status.test.ts
git commit -m "feat(monitoramento): helper unico de status de sessao por canal (F5 E)"
```

### Task E.4: Ampliar `monitoramento-bubble.ts` para in_app + whatsapp

**Files:**
- Modify: `src/lib/actions/monitoramento-bubble.ts` (todas as ~9 ocorrências de `channel: "in_app"` para `channel: { in: ["in_app", "whatsapp"] }`; `isActive` via helper §11; expor `channel` por sessão; usar `updatedAt` no select)
- Test: `src/lib/actions/monitoramento-bubble.test.ts` (criar/editar)

- [ ] **Step 1: Escrever o teste que falha**

Testar (mock prisma + `requireMinRole`): `listBubbleSessions` inclui sessões whatsapp; cada `SessionRow` ganha `channel: "in_app" | "whatsapp"`; `isActive` de uma whatsapp com `updatedAt` há 25h é `false`; `listBubbleCollaborators` conta in_app+whatsapp.

Ocorrências de `channel: "in_app"` a trocar (enumeradas): linha 61 (`groupBy`), 67 (`findMany active`), 83 (`messageFeedback`), 96 (`conversationQualityEvaluation`), 146 (`findMany sessions`), 160 (`message`), 177 (`messageFeedback`), 189 (`evaluation`). Total: 8 ocorrências de `channel: "in_app"` + a lógica de `isActive` inline (linha 208) e `hasActiveSession` (linha 39/120).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/actions/monitoramento-bubble.test.ts --runInBand`
Expected: FALHA.

- [ ] **Step 3: Implementação mínima**

Trocar cada `channel: "in_app"` por `channel: { in: ["in_app", "whatsapp"] }` (as 8 ocorrências acima). Em `listBubbleSessions`: acrescentar `channel: true` e `updatedAt: true` ao `select` (linha ~148), expor `channel` no `SessionRow` (tipo, linha ~42-49) e calcular `isActive` via `isSessionActive({ channel: c.channel, endedAt: c.endedAt, updatedAt: c.updatedAt })` (substitui o `pos === 0 && endedAt === null` da linha 208). Em `listBubbleCollaborators`: `hasActiveSession` usando o helper sobre as sessões do usuário (ou manter a heurística por canal). Decisão do plano: a derivação de `endedAt` por sessão posterior (linhas 212-218) permanece só para in_app; para whatsapp, `endedAt` real ou null.

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/lib/actions/monitoramento-bubble.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/monitoramento-bubble.ts src/lib/actions/monitoramento-bubble.test.ts
git commit -m "feat(monitoramento): sessoes e colaboradores incluem WhatsApp + status por canal (F5 E)"
```

### Task E.5 (UI, ui-ux-pro-max): aba "Chat" + marcador de canal por sessão

**Files:**
- Modify: `src/components/agent/monitoramento-nav.tsx:10` (label "Bubble" → "Chat"; rota `/agente/monitoramento/bubble` mantida)
- Modify: `src/components/agent/monitoramento/bubble-monitor-row.tsx` (já tem marcador de áudio; sem mudança de canal aqui , o canal por sessão vai na lista de sessões, não na linha de mensagem)
- Modify: o componente de lista de sessões (consumidor de `SessionRow`, provavelmente `src/components/agent/monitoramento/*` , localizar inline) para exibir um marcador Bubble/WhatsApp por sessão
- Modify: textos da página que dizem "Bubble" para "Chat" (localizar inline)
- Modify: `src/components/agent/monitoramento/evaluations-table.tsx:320` (consumidor de `channelToOrigem`/`ORIGEM_LABELS`: passa a exibir as duas origens distintas , verificar que o filtro de origem lista as duas novas e renderiza o label correto)

> NÃO escrever o código visual aqui. Construir INLINE com `ui-ux-pro-max`.
>
> **Componente/comportamento:** (1) renomear a aba de navegação "Bubble" para "Chat" (rota inalterada). (2) Em cada linha de sessão da lista, um marcador discreto de canal (ícone + label "Bubble" ou "WhatsApp") derivado de `SessionRow.channel`. (3) No filtro de origem do monitoramento (evaluations-table e filtros), as duas novas origens (`Agente Nex · Bubble`, `Agente Nex · WhatsApp`) aparecem como opções distintas, com os labels de `ORIGEM_LABELS`. (4) O status "ativa" da sessão usa o helper de E.3 (whatsapp respeita a janela de 24h). (5) Avaliação do Judge para WhatsApp aparece igual à de in_app (já flui).
>
> **Estados:** sessão ativa vs encerrada (badge); canal Bubble vs WhatsApp (marcador); áudio (marcador existente, reusar `Message.kind="audio"`).
>
> **Critério visual (ui-ux-pro-max):** marcador de canal discreto e consistente com os demais selos da linha, ícone com significado (ex.: bolha vs WhatsApp), contraste AA, pt-br, sem travessão. Aba "Chat" mantém o padrão visual do `MonitoramentoNav`.

- [ ] **Step 1: Renomear a aba e textos (commit atômico por arquivo)**

Em `monitoramento-nav.tsx`, trocar `{ label: "Bubble", href: "/agente/monitoramento/bubble" }` por `{ label: "Chat", href: "/agente/monitoramento/bubble" }`. Localizar e ajustar os textos "Bubble" nos cabeçalhos da página da rota `/agente/monitoramento/bubble`.

- [ ] **Step 2: Marcador de canal por sessão + filtro de origem (ui-ux-pro-max)**

Construir o marcador na lista de sessões e garantir que o filtro de origem lista as duas origens novas.

- [ ] **Step 3: Verificar tsc + eslint + render manual (rebuild app)**

Run: `npx tsc --noEmit && npx eslint src/components/agent/monitoramento-nav.tsx src/components/agent/monitoramento/evaluations-table.tsx src/components/agent/monitoramento/bubble-monitor-row.tsx`
Expected: verde. Render: abrir a aba "Chat", ver sessões in_app e whatsapp com marcador de canal, status correto, e o filtro de origem com as duas entradas.

- [ ] **Step 4: Commit (atômicos por arquivo, por causa do conflito com feat/nex-reconstrucao)**

```bash
git add src/components/agent/monitoramento-nav.tsx
git commit -m "feat(monitoramento): aba Bubble vira Chat (F5 E)"
git add src/components/agent/monitoramento/evaluations-table.tsx
git commit -m "feat(monitoramento): filtro de origem lista Bubble e WhatsApp (F5 E)"
git add src/components/agent/monitoramento/bubble-monitor-row.tsx
git commit -m "feat(monitoramento): marcador de canal por sessao (F5 E, ui-ux-pro-max)"
```

### Task E.VERIF (VERIFICAÇÃO da Onda E): tsc + eslint + jest + e2e

- [ ] **Step 1:** Run: `npx tsc --noEmit && npx eslint src/lib/agent/quality src/lib/agent/session-status.ts src/lib/actions/monitoramento-bubble.ts src/components/agent/monitoramento src/components/agent/monitoramento-nav.tsx && npx jest src/lib/agent/quality/rodada-labels.test.ts src/lib/agent/quality/queries.test.ts src/lib/agent/session-status.test.ts src/lib/actions/monitoramento-bubble.test.ts --runInBand`
Expected: verde.

- [ ] **Step 2: e2e (rebuild app):** gerar uma conversa WhatsApp real (via Onda A/B), confirmar que ela aparece na aba "Chat" com marcador "WhatsApp", status "ativa" dentro de 24h, avaliação do Judge presente; o filtro de origem mostra "Agente Nex · Bubble" e "Agente Nex · WhatsApp" separados, com contagens corretas.

- [ ] **Step 3: Commit:** `git commit --allow-empty -m "chore: verificacao Onda E (aba Chat, origem, status por canal, sessoes WhatsApp)"`

---

## Onda F , Runbook n8n + verificação e2e final

### Task F.1: Runbook do n8n

**Files:**
- Create: `docs/runbooks/2026-06-17-f5-whatsapp-n8n-runbook.md`

- [ ] **Step 1: Escrever o runbook**

Cobrir, em pt-br sem travessão: (1) os 2 webhooks (entrada `/api/integrations/whatsapp/inbound` e o receptor do `agent.reply`); (2) assinar a HMAC com timestamp ATUAL a cada (re)envio (`X-Signature` = HMAC-SHA256 de `${timestamp}.${body}`, `X-Timestamp`); validar a HMAC do `agent.reply` no n8n e deduplicar por `deliveryId`; (3) mapeamento dos campos do payload da Meta (§3): `from`, `text` (texto OU transcrição do áudio), `type` (`text`/`audio`), `messageId`, `timestamp` (normalizar segundos→ms no n8n), `contactName`, `phoneNumberId`; (4) como tratar cada `reason` das barreiras (`user_not_found`, `user_inactive`, `channel_disabled`, `role_not_allowed`, `permission_denied`, `technical_error`) usando `reason` e/ou `reply`; (5) AVISO de breaking change do contrato de saída (envelope `agent.reply` substitui `{to,message,messageId,timestamp}`); (6) nota da dívida `WhatsappChannel` (singleton vivo) vs `WhatsappInstance` (dorme , unificação fora de escopo); (7) os textos finais das mensagens padrão (revisar §17.4 com o usuário e fixar aqui).

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/2026-06-17-f5-whatsapp-n8n-runbook.md
git commit -m "docs(runbook): integracao WhatsApp via n8n (F5 F)"
```

### Task F.2 (VERIFICAÇÃO FINAL e2e , §16 da spec): bateria completa contra dado real

**Files:** nenhuma (verificação). Rebuild app+mcp+worker antes (schema mudou na Onda 0):
```bash
docker compose build app && docker compose up -d --force-recreate worker app
docker compose up -d --build mcp
docker image inspect nexus-odoo:local --format '{{.Created}}'   # deve ser agora
```

- [ ] **Step 1: Suíte completa + lint + tsc**

Run: `npx tsc --noEmit && npx eslint . && npx jest`
Expected: tudo verde.

- [ ] **Step 2: Cenários e2e da §16 (todos)**

- [ ] inbound assinado com número SEM o 9 cadastrado COM o 9 (A1) resolve o usuário.
- [ ] `type:"audio"`+`text` (A3 n8n) usa o texto direto; áudio via mídia (A3 Meta) não regrediu (transcreve).
- [ ] duas mensagens seguidas do mesmo usuário (A4 lock) não criam duas conversas nem sobrescrevem `reasoningHistory`.
- [ ] barreiras L1/L2/L3 retornando mensagem padrão SEM custo de IA (sem `LlmUsage` novo nas barreiras).
- [ ] Judge gerando avaliação para a conversa WhatsApp (confirma §4): `SELECT e.status FROM conversation_quality_evaluations e JOIN conversations c ON c.id=e.conversation_id WHERE c.channel='whatsapp'` retorna linhas.
- [ ] webhook de saída com envelope rico (`tools`, `reasoningMs`, `usage`, `suggestions`, `deniedModule`/`allowedModules` na recusa) + idempotência (retry de POST falho NÃO duplica nem re-roda; `whatsapp:replied:{messageId}` reusado).
- [ ] seletor de canal/nível bloqueando bubble e WhatsApp conforme o role (viewer vs nível manager/admin/off).

- [ ] **Step 3: Commit (registro final)**

```bash
git commit --allow-empty -m "chore: verificacao e2e final F5 (todos os cenarios da spec §16)"
```

---

## Self-Review (checklist do autor do plano)

**1. Spec coverage:** §3 (A2.1/A2.2), §4 (A1.1), §5 L1/L2 (A5.4)/L3 (B.2/B.5), §6 (Onda 0.2/C.*), §7 envelope/url-targetUrl/fail-closed (A5.3/B.1/B.3/B.4), §8 lock (A4.*), §9 idempotência (B.4), §10 origens (E.1/E.2), §11 status (E.3/E.4), §12 webhook por evento (0.1/D.*), §13 aba Chat (E.5), §14 runbook (F.1), §15 ondas/dependências (estrutura), §16 verificação (tasks *.VERIF + F.2), §17 pendências (1 url/targetUrl resolvido em A5.4/B.4; 2 granularidade em E.4; 3 fuso do teto diário , NÃO tocado nesta entrega, documentar no runbook; 4 textos das mensagens , A5.1 provisório + F.1 final). Cobertos.

**2. Placeholder scan:** sem "TODO/TBD"; cada step de código mostra o código; tasks de UI descrevem componente/comportamento/estados/critério (intencional, construção inline com ui-ux-pro-max).

**3. Type consistency:** `AgentReplyData` (emit-reply.ts) é o tipo único do envelope, consumido por build-reply-data e processor. `RunAgentResult.ok:true` ganha `toolsCalled`/`reasoningMs` (obrigatórios) + `deniedModule`/`allowedModules` (opcionais); `permission-denial.ts` é o único outro produtor, ajustado. `ChannelAccessLevel` (enum Prisma) usado em roles/channel-access/channel-level-options/DTO/UI. `roleMeetsChannelLevel` consistente em L2 (A5.4) e bubble (C.5).
