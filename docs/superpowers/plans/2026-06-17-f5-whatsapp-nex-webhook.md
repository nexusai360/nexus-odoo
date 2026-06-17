# F5 , Integração WhatsApp ↔ Agente Nex via n8n/Webhook , Implementation Plan , PLAN v2 (achados das 2 reviews aplicados)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **PLAN v2 , o que mudou em relação ao v1 (achados das 2 reviews adversariais, confirmados contra o código):**
> - `platformRole` entra no `select.user` E no tipo `ResolvedWhatsappUser` JÁ na A1.1 (a primeira task a tocar `resolve.ts`); a L2 (A5.4) apenas consome `user.platformRole` (sem editar o select de novo).
> - `resolve.test.ts` e `route.test.ts` e `processor.test.ts` JÁ EXISTEM: as tasks MIGRAM/ESTENDEM/REESCREVEM os casos existentes (não apenas acrescentam). `findUnique`→`findFirst` em resolve; mocks de emit-reply/`findMany`/`agentSettings` em route; casos de `n8n_webhook` reescritos em processor.
> - Onda B migra TODOS os 5 call-sites de `sendViaWebhook` (84, 97, 129, 218, 261) para o novo dispatch ANTES de remover a função (senão o tsc quebra). O heartbeat (call-site 261) é SUPRIMIDO no WhatsApp (decisão #9).
> - Áudio: A3.1 evita o early-return de "áudio desabilitado" quando `data.text` está presente (caminho n8n já transcrito não depende de `audioCheckpoint`).
> - `AgentReplyData.reason` é tipado como `BlockReason | null` (catálogo único de A5.1).
> - B.1: `allTurnToolNames.push(tc.name)` JÁ EXISTE (run-agent.ts:1704); não duplicar. `reasoningMs` soma `Date.now()-iterStart` por iteração. Um único return `ok:true` (run-agent.ts:1487) + o de `permission-denial.ts`.
> - Filtro por evento (`events: { has: "agent_reply" }`) inteiro movido para a Onda D; nas Ondas A/B o emissor dispara para todo outbound habilitado (direction=outbound, enabled), sem janela de "webhooks invisíveis".
> - Idempotência ANTES do lock (reentrega não toca conversa). Janela de gravação da chave documentada. TTL do lock alinhado ao timeout do turno (120s, §8 da spec).
> - L3 (permission_denied) difere de L1/L2: cria sessão/Message e pode acionar o Judge; só L1/L2 são "sem custo de IA". O Judge segue rodando (decisão da spec).
> - Backfill lê o `CREATE TYPE` real do migration.sql e usa o nome EXATO do enum no cast.
> - `url`/`targetUrl`: `createWebhook` grava AMBOS (webhooks.ts:178-179); `targetUrl ?? url` é robustez (não conserto de algo quebrado hoje, exceto webhooks legados pré-R6).
> - `updateBubbleEnabled` (agent-config.ts:584) tem um step de guard + migração de call-sites ANTES do drop da coluna.
> - `agent-availability-summary.test.ts` reescrito (booleans → níveis). `rodada-labels.test.ts`/`queries.test.ts` migrados (origem única → 2 origens) com ordem final do filtro especificada.
> - A5.4 NÃO é paralelizável: depende de A1.1, A2.1, A2.2, A5.1, A5.2, A5.3.
> - E.5 fixa os arquivos exatos; `SegmentedControl` genérico já existe (C.4 só usa).

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

- [ ] **Step 2: LER o `CREATE TYPE` gerado e acrescentar o backfill ao final do `migration.sql`**

PRIMEIRO, abrir o `migration.sql` recém-gerado e LER o(s) `CREATE TYPE` que o Prisma emitiu, copiando o nome EXATO de cada enum (case-sensitive, normalmente `"WebhookEvent"` e `"ChannelAccessLevel"`, mas confirmar , o cast Postgres falha se o nome divergir do `CREATE TYPE`). Confirmar também os nomes de tabela/coluna contra os `@map`/`@@map` reais: `whatsapp_webhooks` (model `WhatsappWebhook` mapeado), `AgentSettings` (sem `@@map`, então o nome do relation é o do model), colunas `bubble_access_level`/`whatsapp_access_level` (mapeadas), `bubble_enabled`/`whatsapp_enabled` (confirmar o `@map` real no schema , se não houver `@map`, o nome físico é o do campo).

Então ACRESCENTAR ao final, substituindo `"WebhookEvent"`/`"ChannelAccessLevel"` pelos nomes EXATOS lidos do `CREATE TYPE`:

```sql
-- Backfill (F5): outbound existentes passam a emitir agent.reply.
UPDATE "whatsapp_webhooks"
  SET "events" = ARRAY['agent_reply']::"WebhookEvent"[]
  WHERE "direction" = 'outbound';

-- Backfill (F5): preserva o comportamento atual de disponibilidade.
-- bubble/whatsapp habilitado (true) => viewer (todos veem); desabilitado => off.
-- AgentSettings é singleton: se NÃO houver linha, este UPDATE afeta 0 linhas
-- (correto , o @default(viewer) das colunas novas preserva o comportamento
-- quando a primeira linha for criada). Não há INSERT de seed aqui.
UPDATE "AgentSettings"
  SET "bubble_access_level"   = CASE WHEN "bubble_enabled"   THEN 'viewer'::"ChannelAccessLevel" ELSE 'off'::"ChannelAccessLevel" END,
      "whatsapp_access_level" = CASE WHEN "whatsapp_enabled" THEN 'viewer'::"ChannelAccessLevel" ELSE 'off'::"ChannelAccessLevel" END;
```

Nota: o `prisma migrate dev` (Step 3) reporta o número de linhas afetadas , conferir no Step 2 da verificação (0.4) que o `AgentSettings` foi atualizado (1 linha, já que é singleton e a linha existe) e que os `outbound` ganharam o array.

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

> **Ordem e dependências (CORRIGIDO no v2):** NÃO é tudo paralelizável. As unidades base são independentes e PODEM ir em paralelo: A1.1 (resolve), A2.1+A2.2 (contrato/job), A3.1 (áudio), A4.1+A4.2 (lock), A5.1 (catálogo), A5.2 (channel-access), A5.3 (emit-reply). A **A5.4 (barreiras L1/L2 no inbound) NÃO é paralelizável**: depende de A1.1 (precisa do `platformRole` no resolve), A2.1 e A2.2 (contrato/job já estendidos e `route.ts` já montando o jobData), A5.1 (catálogo de mensagens), A5.2 (helper `roleMeetsChannelLevel`) e A5.3 (emissor `emitAgentReply`). Executar A5.4 por ÚLTIMO na onda. A5.4 toca `route.ts` (mesmo arquivo de A2.x) , garantir A2.x mergeado/aplicado antes para evitar conflito.

### Task A1.1: Resolver usuário por variantes do número (com/sem nono dígito) + `platformRole` no resolve

> **Decisão do v2 (consolida #2 e #3):** Esta task é a PRIMEIRA a tocar `resolve.ts`, então adiciona `platformRole` ao `select.user` E ao tipo `ResolvedWhatsappUser` JÁ AQUI (importando `PlatformRole` do prisma client). A barreira L2 (A5.4) só CONSOME `user.platformRole` , não edita o select de novo. Confirmado contra o código: `resolve.ts` hoje usa `findUnique({ where: { phoneE164 } })` com `select.user = { id, name, isActive }`; `phoneVariants(e164)` existe em `src/lib/whatsapp/countries.ts:180` (achado "phoneVariants não existe" é FALSO , o helper existe e o import está correto).

**Files:**
- Modify: `src/lib/whatsapp/resolve.ts` (trocar `findUnique` por `findFirst` com `phoneVariants`; acrescentar `platformRole` ao `select.user` e ao tipo `ResolvedWhatsappUser`; importar `phoneVariants` de `./countries` e `PlatformRole` de `@/generated/prisma/client`)
- Test: `src/lib/whatsapp/resolve.test.ts` (JÁ EXISTE , MIGRAR os mocks/asserts de `findUnique`→`findFirst`, incluindo `platformRole`)

- [ ] **Step 1: MIGRAR o teste existente para `findFirst` + `platformRole` (e ver falhar)**

O `resolve.test.ts` já existe e mocka `prisma.userWhatsappNumber.findUnique`. **Migrar** (não duplicar) o `jest.mock` de `findUnique` para `findFirst` e ajustar TODOS os casos existentes do `describe("resolveWhatsappUser")` (unknown/inactive/ok/normaliza/malformado) para usar `findFirst`, incluindo `platformRole` nos objetos `user` mockados e nos `expect(...).toEqual(...)`. Acrescentar o `describe` novo das variantes do nono dígito. O mock de `findFirst` retorna o usuário quando `where.phoneE164.in` contém a variante cadastrada.

```ts
import { normalizeE164, resolveWhatsappUser } from "./resolve";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { userWhatsappNumber: { findFirst: jest.fn() } },
}));

const mockPrisma = jest.mocked(prisma) as unknown as {
  userWhatsappNumber: { findFirst: jest.Mock };
};

// (manter o describe("normalizeE164", ...) existente sem mudança)

describe("resolveWhatsappUser", () => {
  const findFirst = mockPrisma.userWhatsappNumber.findFirst;
  beforeEach(() => jest.clearAllMocks());

  it("retorna unknown para número não cadastrado", async () => {
    findFirst.mockResolvedValue(null);
    expect(await resolveWhatsappUser("+5511991234567")).toEqual({ status: "unknown" });
  });

  it("retorna inactive para número de usuário inativo", async () => {
    findFirst.mockResolvedValue({ user: { id: "u1", name: "Ana", isActive: false, platformRole: "viewer" } });
    expect(await resolveWhatsappUser("+5511991234567")).toEqual({ status: "inactive" });
  });

  it("retorna ok com o usuário (incluindo platformRole) para usuário ativo", async () => {
    const user = { id: "u1", name: "Ana", isActive: true, platformRole: "manager" };
    findFirst.mockResolvedValue({ user });
    expect(await resolveWhatsappUser("+5511991234567")).toEqual({ status: "ok", user });
  });

  it("consulta com IN das variantes (com/sem o 9) , normalizado", async () => {
    findFirst.mockResolvedValue(null);
    await resolveWhatsappUser("553498765432"); // sem o 9, vindo da Meta
    const arg = findFirst.mock.calls[0][0];
    expect(arg.where.phoneE164.in.length).toBeGreaterThanOrEqual(2);
    expect(arg.where.phoneE164.in).toContain("+5534998765432");
    expect(arg.select.user.select.platformRole).toBe(true);
  });

  it("retorna unknown para número malformado (sem consultar)", async () => {
    expect(await resolveWhatsappUser("abc")).toEqual({ status: "unknown" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx jest src/lib/whatsapp/resolve.test.ts --runInBand`
Expected: FALHA , o código ainda usa `findUnique({ where: { phoneE164 } })` sem `platformRole` (o mock só tem `findFirst`).

- [ ] **Step 3: Implementação mínima (findFirst + variantes + platformRole no select e no tipo)**

Em `src/lib/whatsapp/resolve.ts`:

(3a) No topo, importar `import { phoneVariants } from "./countries";` e `import type { PlatformRole } from "@/generated/prisma/client";`.

(3b) Estender o tipo `ResolvedWhatsappUser` para incluir `platformRole`:

```ts
export type ResolvedWhatsappUser =
  | { status: "unknown" }
  | { status: "inactive" }
  | { status: "ok"; user: { id: string; name: string; isActive: boolean; platformRole: PlatformRole } };
```

(3c) Trocar o `findUnique` pelo `findFirst` com as variantes e `platformRole` no select:

```ts
  const row = await prisma.userWhatsappNumber.findFirst({
    where: { phoneE164: { in: phoneVariants(phoneE164) } },
    select: {
      user: { select: { id: true, name: true, isActive: true, platformRole: true } },
    },
  });
```

(O restante , checagem de `!row?.user`, `isActive`, retorno , permanece igual; o retorno `ok` já carrega o `platformRole` por estar no select.)

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

> **Achado do v2 (early-return de áudio desabilitado):** confirmado contra o código , há um early-return `if (data.type === "audio" && !audioInProduction) { ...responde "não entendo áudio"...; return; }` ANTES da lógica de texto (`audioInProduction = settings?.audioCheckpoint === "PRODUCTION"`). No caminho n8n o áudio JÁ chega transcrito em `data.text`, então NÃO depende do `audioCheckpoint`. A condição do early-return precisa passar a ser `data.type === "audio" && !audioInProduction && !data.text` , só barra quando NÃO há texto (caminho Meta com áudio cru e canal desligado).

**Files:**
- Modify: `src/worker/agent/processor.ts` (early-return de áudio desabilitado: acrescentar `&& !data.text` à condição; bloco de resolução do texto: considerar `data.text` no caminho de áudio; chamada `runAgent`: passar `isAudio`)
- Test: `src/worker/agent/processor.test.ts` (JÁ EXISTE , ESTENDER o `describe("processAgentJob , type=audio")`)

- [ ] **Step 1: Escrever o teste que falha**

Em `src/worker/agent/processor.test.ts`, ESTENDER o `describe("processAgentJob , type=audio")` (já existe com o caso "baixa a mídia e transcreve") com:
  - **n8n transcrito (canal de áudio OFF):** `type:"audio"` + `text:"qual o estoque?"` com `prisma.agentSettings.findFirst` mockado retornando `{ audioCheckpoint: "OFF", imageCheckpoint: "OFF" }` ⇒ NÃO cai no early-return de "não entendo áudio"; NÃO chama `transcribeAudio`/`downloadMedia`; `runAgent` recebe `userMessage === data.text` e `isAudio: true`. (Prova que o caminho n8n independe do `audioCheckpoint`.)
  - **Meta mídia (canal de áudio PRODUCTION):** `type:"audio"` SEM `text`, com `audioMediaId`, `audioCheckpoint:"PRODUCTION"` ⇒ `downloadMedia`/`transcribeAudio` chamados; `runAgent` recebe o texto transcrito e `isAudio: true`.
  - **Meta mídia com canal OFF e SEM text:** mantém o early-return atual (responde "não entendo áudio"; não chama `runAgent`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA , hoje (a) `type:"audio"` com `audioCheckpoint:"OFF"` cai no early-return de "não entendo áudio" mesmo havendo `text`; (b) `type:"audio"` SEMPRE entra no ramo de download, ignorando `text`; (c) `runAgent` é chamado sem `isAudio`.

- [ ] **Step 3: Implementação mínima**

(3a) Ajustar a condição do early-return de áudio desabilitado para NÃO disparar quando há texto (caminho n8n):

```ts
  // n8n entrega o áudio JÁ transcrito em data.text => não depende do audioCheckpoint.
  if (data.type === "audio" && !audioInProduction && !data.text) {
    // G2 , Áudio (mídia Meta) desativado e sem texto: responder explicando.
    // ... (mantém o corpo existente: mensagem "não entendo áudio" + dispatch + return)
  }
```

(3b) No bloco de resolução do texto, considerar `data.text` no caminho de áudio:

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
    // ... (mantém o bloco existente de cloudClient/downloadMedia/transcribeAudio;
    //      ao final: userMessage = transcription.text;)
  } else {
    if (!data.text) {
      throw new Error("[agent-processor] text ausente para tipo=text");
    }
    userMessage = data.text;
  }
```

E na chamada `runAgent`, acrescentar `isAudio`:

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

/**
 * TTL do lock por usuário. Decisão do v2 (alinha à spec §8 "TTL >= timeout do
 * turno, ex.: 120s"): 120_000 ms. Justificativa do número: o turno do agente é
 * limitado por `maxIterations` (run-agent.ts), não por um timeout em ms fixo;
 * 120s é o teto prático observado (a spec cita 120s) e cobre com folga um turno
 * normal. Como NÃO há renovação aqui (lock simples SET NX PX), o TTL é o teto
 * de proteção: se um turno exceder 120s (raro , só num loop de tools muito
 * longo), o lock expira e uma 2a mensagem do mesmo usuário poderia entrar. Isso
 * é aceitável (degradação graciosa, não corrupção, pois a sessão é a mesma) e
 * é o pior caso documentado. Se a operação mostrar turnos > 120s recorrentes,
 * subir o TTL ou adicionar renovação periódica do lock (watchdog) , NÃO usar
 * TTL infinito (deadlock se o worker morrer).
 */
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

Em `processor.ts`: importar `acquireUserLock, releaseUserLock` de `./user-lock`. Logo no topo de `processAgentJob`, após a leitura de `settings` e o tratamento de `image`/`audio desabilitado` (mas ANTES de `getOrCreateWhatsappConversation`), envolver o restante:

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

> **Ordem em relação à idempotência (decisão do v2, alinha à spec §9):** o short-circuit de idempotência `whatsapp:replied:{messageId}` (introduzido na B.4) fica ACIMA deste lock , uma reentrega não toca a conversa, logo NÃO precisa de lock. Estrutura final do topo de `processAgentJob` (depois de A4.2 + B.4):
>
> 1. leitura de `settings` + early-returns de `image`/`audio desligado-sem-texto`;
> 2. **short-circuit de idempotência** (B.4): se `whatsapp:replied:{messageId}` existe ⇒ reentrega e `return` (SEM lock);
> 3. `acquireUserLock` → `try { get-or-create → (L3) → runAgent → persiste → grava replied → dispatch } finally { releaseUserLock }`.
>
> Nota: o `heartbeatTimer`/`clearTimeout` é REMOVIDO na B.6 (heartbeat suprimido no WhatsApp, decisão #9), então não há `finally` aninhado de heartbeat após a Onda B. Nesta task A4.2, se o heartbeat ainda existir, mantenha o `clearTimeout(heartbeatTimer)` no seu `finally` aninhado (não conflita); a B.6 o remove.

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

> **Depende de A5.1** (importa o tipo `BlockReason` do catálogo). Executar A5.1 antes.
>
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
import type { BlockReason } from "@/lib/whatsapp/blocked-messages";

export interface AgentReplyData {
  inboundMessageId: string;
  to: string;
  phoneNumberId: string | null;
  sessionId: string | null;
  assistantMessageId: string | null;
  ok: boolean;
  reason: BlockReason | null; // catálogo único de A5.1; null quando ok:true
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
- Modify: `src/app/api/integrations/whatsapp/inbound/route.ts`
- Test: `src/app/api/integrations/whatsapp/inbound/route.test.ts` (JÁ EXISTE , ESTENDER os mocks e casos)

- [ ] **Step 1: ESTENDER o teste existente (e ver falhar)**

O `route.test.ts` já existe e cobre HMAC, validação, idempotência, resolução, teto diário e enfileiramento. Os casos existentes mudam e novos entram. **Estender** assim:

(a) **Mocks (acrescentar ao bloco de mocks no topo):**
  - novo `const mockEmitAgentReply = jest.fn();` + `jest.mock("@/lib/whatsapp/emit-reply", () => ({ emitAgentReply: mockEmitAgentReply }));`
  - no `jest.mock("@/lib/prisma", ...)`: acrescentar `whatsappWebhook.findMany: mockWebhookFindMany` (novo mock fn, usado por `loadOutboundTargets`) e `agentSettings: { findFirst: mockAgentSettingsFindFirst }` (novo mock fn, lê `whatsappAccessLevel`). Manter os mocks existentes (`processedWhatsappMessage`, `conversation.count`, `whatsappWebhook.findFirst`, `whatsappChannel`, `appSetting`).
  - default no `beforeEach`: `mockAgentSettingsFindFirst.mockResolvedValue({ whatsappAccessLevel: "viewer" })`; `mockWebhookFindMany.mockResolvedValue([{ targetUrl: "https://n8n/x", url: null, secret: "enc:s1" }])`; o `mockResolveWhatsappUser` ok agora retorna `{ status:"ok", user: { id:"user-001", name:"Ana", isActive:true, platformRole:"viewer" } }` (acrescentar `platformRole`).

(b) **Casos existentes que MUDAM** (barreiras L1/L2 agora disparam `kind:"blocked"`):
  - "número desconhecido/rejeitado" (status `unknown`): além de NÃO enfileirar e logar `whatsapp_inbound_rejected`, agora chama `mockEmitAgentReply` com `kind:"blocked"` + `data.reason:"user_not_found"`.
  - status `inactive`: idem com `reason:"user_inactive"`.
  - "retorna 202 e enfileira job para mensagem válida": continua enfileirando QUANDO `whatsappAccessLevel:"viewer"` e role satisfaz (default). Confirmar que `mockEmitAgentReply` NÃO é chamado no caminho OK.

(c) **Casos NOVOS (L2):**
  - canal `off` (`whatsappAccessLevel:"off"`): NÃO enfileira; `mockEmitAgentReply` com `reason:"channel_disabled"`; 200 `{ rejected:true, reason:"channel_disabled" }`.
  - role abaixo do nível (`whatsappAccessLevel:"admin"`, user `platformRole:"viewer"`): NÃO enfileira; `reason:"role_not_allowed"`.
  - role satisfaz (`whatsappAccessLevel:"manager"`, user `platformRole:"admin"`): enfileira normalmente; sem `emitAgentReply`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/app/api/integrations/whatsapp/inbound/route.test.ts --runInBand`
Expected: FALHA (barreira L2 não existe; resolução não traz role; mocks novos não consumidos pelo código atual).

- [ ] **Step 3: Implementação mínima**

(3a) `platformRole` no resolve JÁ FOI feito na A1.1 (select + tipo `ResolvedWhatsappUser`). Esta task apenas CONSOME `user.platformRole`. NÃO reeditar o `select` do resolve aqui.

(3b) Em `route.ts`, após `const { user } = resolved;`, ANTES do teto diário, inserir:
  - L1 já está coberta pelo `if (resolved.status !== "ok")` existente: trocar a resposta para também disparar o webhook de saída. Reescrever esse bloco para mapear `unknown→user_not_found`, `inactive→user_inactive`, chamar um helper local `emitBlocked(reason, to, phoneNumberId)` que carrega os outbound targets habilitados e chama `emitAgentReply` com `kind:"blocked"`.
  - L2: ler `agentSettings.whatsappAccessLevel`; se `!roleMeetsChannelLevel(user.platformRole, level)`, disparar `channel_disabled` (quando `level === "off"`) ou `role_not_allowed` (quando role insuficiente), retornar 200 `{ rejected:true, reason }` SEM enfileirar.

> **Decisão do v2 (achado #10 , sem janela de "webhooks invisíveis"):** nesta Onda A o `loadOutboundTargets` filtra APENAS por `direction:"outbound", enabled:true` , NÃO filtra por `events: { has: "agent_reply" }`. O filtro por evento + o default `['agent_reply']` na criação entram JUNTOS na Onda D (D.1/D.3), quando a UI de eventos já existe. Assim, entre as Ondas A/B (antes da D) todo outbound habilitado recebe o `agent.reply`, e não há um intervalo em que webhooks fiquem mudos por `events` vazio. A Onda D reaperta o `loadOutboundTargets` para incluir `events: { has: "agent_reply" }`.

> **Decisão do v2 (achado #16 , url/targetUrl):** confirmado contra o código que `createWebhook` grava AMBOS `targetUrl` E `url` (webhooks.ts:178-179) e que `listWebhooks` já retorna `targetUrl ?? url` (webhooks.ts:303). Portanto o outbound NÃO está "quebrado hoje" para webhooks criados pela UI; o `targetUrl ?? url` aqui é robustez para eventuais linhas legadas pré-R6 que tenham só uma das colunas. O comentário no helper reflete isso (sem alarmar "bug").

Helper `emitBlocked` no `route.ts` (carrega targets uma vez):

```ts
async function loadOutboundTargets() {
  // Onda A/B: todo outbound habilitado (sem filtro de evento , ver achado #10).
  // A Onda D acrescenta `events: { has: "agent_reply" }` a este where.
  const rows = await prisma.whatsappWebhook.findMany({
    where: { direction: "outbound", enabled: true },
  }).catch(() => []);
  return rows.flatMap((w) => {
    const url = w.targetUrl ?? w.url; // robustez: prioriza targetUrl, cai no url legado
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
Exercer: assinar um inbound com número SEM o 9, com um usuário cadastrado COM o 9 (confirma A1); enviar `type:"audio"`+`text` com `audioCheckpoint:"OFF"` (A3 n8n , deve processar normalmente, NÃO cair no early-return) e um áudio só com `audioMediaId` com `audioCheckpoint:"PRODUCTION"` (A3 Meta, não regrediu); duas mensagens seguidas do mesmo usuário (A4 lock , conferir que só uma conversa é criada). Barreiras L1/L2 (apenas estas , rodam no inbound antes de enfileirar) retornando o webhook `kind:"blocked"` SEM custo de IA (conferir que `runAgent` não roda , ausência de `LlmUsage` novo). Observação: L3 não é exercida aqui (a L3 vive na Onda B, dentro do `runAgent`, e pode acionar o Judge , ver B.5).

- [ ] **Step 3: Commit (registro de verificação)**

```bash
git commit --allow-empty -m "chore: verificacao Onda A (e2e inbound, audio dois caminhos, lock, barreiras)"
```

---

## Onda B , Resposta rica + entrega idempotente + L3 (depende de A)

### Task B.1: Estender `RunAgentResult` com `toolsCalled` e `reasoningMs`

> **Achados do v2 (confirmados contra run-agent.ts):** o push `allTurnToolNames.push(tc.name)` JÁ EXISTE (linha 1704) , NÃO duplicar; apenas usar `allTurnToolNames` no return. `allTurnToolNames` é declarado na linha 756. Há um ÚNICO return `ok:true` no run-agent (linha 1487, com `message`/`suggestions`/`usage`/`messageId`); o outro produtor de `RunAgentResult ok:true` é `respondPermissionDenied` (permission-denial.ts). `iterStart` é declarado POR ITERAÇÃO (linha 886) e usado em `durationMs: Date.now() - iterStart` (linha 951); somar em uma variável de turno.

**Files:**
- Modify: `src/lib/agent/run-agent.ts` (tipo `RunAgentResult` ramo `ok:true`, linhas 250-259; acumular `reasoningMs` no loop; usar `allTurnToolNames` e `reasoningMs` no ÚNICO return `ok:true`, linha 1487)
- Modify: `src/lib/agent/permission-denial.ts` (return `ok:true` da recusa: `toolsCalled:[]`, `reasoningMs:0`)
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

(3b) Acumular `reasoningMs`: declarar `let turnReasoningMs = 0;` junto de `allTurnToolNames` (linha ~756). `iterStart` é declarado por iteração (linha 886). Dentro do loop, ao final de cada iteração (perto da linha 951, onde já existe `durationMs: Date.now() - iterStart`), somar: `turnReasoningMs += Date.now() - iterStart;`. Como `iterStart` é por-iteração, a soma acumula a duração de cada iteração do turno.

(3c) NÃO criar push novo de tool names: o `allTurnToolNames.push(tc.name)` JÁ EXISTE na linha 1704 (dentro do laço que processa os tool results). Apenas reusar `allTurnToolNames` no return.

(3d) No ÚNICO `return { ok: true, ... }` (linha 1487), adicionar `toolsCalled: allTurnToolNames, reasoningMs: turnReasoningMs` ao objeto retornado.

(3e) Em `permission-denial.ts`, no `return { ok: true, ... }` de `respondPermissionDenied`, adicionar `toolsCalled: [], reasoningMs: 0`.

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

Criar `src/worker/agent/build-reply-data.ts`. Importar `AgentReplyData` de `@/lib/whatsapp/emit-reply`, `blockedMessageFor` (catálogo único de A5.1) de `@/lib/whatsapp/blocked-messages`, `formatForChannel` de `@/lib/agent/format/by-channel`, `RunAgentResult` de `@/lib/agent/run-agent`. Implementar:

> **Decisão do v2 (achado #8 , reusar o catálogo):** o `reply` de `technical_error` e de `permission_denied` reusa o catálogo único de A5.1 (`blockedMessageFor("technical_error")` / `blockedMessageFor("permission_denied")`) em vez de uma string literal local. Exceção documentada: no caminho `permission_denied`, o `reply` final é o TEMPLATE enriquecido que `respondPermissionDenied` já montou (`result.message`, com módulos desejado/permitidos), pois é mais informativo que a frase genérica do catálogo; o `reason` é `"permission_denied"`. O catálogo serve de fallback de texto e mantém o tipo `BlockReason` consistente. Não há mais string de erro literal solta no arquivo.

```ts
export interface ReplyContext {
  inboundMessageId: string;
  to: string;
  phoneNumberId: string | null;
  conversationId: string | null;
  messageType: "text" | "audio" | "image";
}

export function buildReplyData(ctx: ReplyContext, result: RunAgentResult): AgentReplyData {
  const baseUsage = { tokensInput: 0, tokensOutput: 0, costUsd: 0 };
  if (!result.ok) {
    return {
      inboundMessageId: ctx.inboundMessageId, to: ctx.to, phoneNumberId: ctx.phoneNumberId,
      sessionId: ctx.conversationId, assistantMessageId: null,
      ok: false, reason: "technical_error", reply: blockedMessageFor("technical_error"),
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

### Task B.4: Idempotência de saída no processor (§9) + emissão do `agent.reply` + migração dos 5 call-sites de `sendViaWebhook`

> **Achado central do v2 (#6 , confirmado contra o código):** `sendViaWebhook` tem **5 call-sites** no `processor.ts`: linha 84 (imagem provisória), 97 (áudio desabilitado), 129 (fallback de áudio sem cloud client), 218 (resposta final), 261 (heartbeat). Esta task MIGRA TODOS os 5 para o novo dispatch (`emitAgentReply` com envelope) ANTES de remover `sendViaWebhook` , senão o `tsc` quebra (a função deixaria de existir mas ainda seria chamada). As barreiras de mídia (84, 97, 129) viram envelopes `kind:"blocked"` (canal indisponível para aquela mídia) ou `kind:"notice"` (aviso sem ser bloqueio , decisão abaixo). O heartbeat (261) é SUPRIMIDO no WhatsApp (decisão #9), removido na B.6; nesta task ele já passa a NÃO usar `sendViaWebhook` (vira no-op preparando a remoção da B.6).
>
> **Decisão do v2 sobre o `kind` das barreiras de mídia:** o envelope só tem `kind:"final" | "blocked"` (spec §7). Imagem provisória / áudio desabilitado / fallback de áudio são respostas "não consigo essa mídia agora" , semanticamente um bloqueio brando. Para não inventar um terceiro `kind`, eles saem como `kind:"blocked"` com `reason:"technical_error"` (mídia não suportada no momento) e o `reply` = a frase provisória atual. (Se a operação preferir distinguir "mídia não suportada" de "falha técnica", criar uma `BlockReason` nova em A5.1 numa onda futura; fora do escopo aqui , registrado como pendência no runbook F.1.)

**Files:**
- Modify: `src/worker/agent/processor.ts` (topo: short-circuit por `whatsapp:replied:{messageId}` ACIMA do lock; interface `AgentJobChannelConfig`: trocar `outboundUrl`/`outboundSecret` por `outboundTargets?: { url:string; secret:string }[]`; migrar os 5 call-sites de `sendViaWebhook`; gravar payload + emitir via `emitAgentReply`; remover `sendViaWebhook`)
- Modify: `src/app/api/integrations/whatsapp/inbound/route.ts` (montar `channelConfig.outboundTargets` via `loadOutboundTargets` em vez de UM webhook; `targetUrl ?? url` , ver A5.4)
- Test: `src/worker/agent/processor.test.ts` (JÁ EXISTE , REESCREVER os describes de `n8n_webhook` e estender os de mídia/erro)

- [ ] **Step 1: REESCREVER/ESTENDER o teste existente (e ver falhar)**

O `processor.test.ts` já existe com estes describes/casos (confirmado):
  - `describe("processAgentJob , type=text, modo direct")` , casos "chama runAgent" (89-103) e "modo direct: chama cloud-client.sendText" (104-114): MANTER (modo direct não muda; segue via `cloudClient.sendText`).
  - `describe("processAgentJob , type=text, modo n8n_webhook")` (119-155), casos "faz POST no outboundUrl com a resposta assinada" (129) e "inclui cabeçalhos de assinatura HMAC" (141): **REESCREVER**. O `webhookJob.channelConfig` deixa de ter `outboundUrl`/`outboundSecret` e passa a ter `outboundTargets: [{ url:"https://n8n/x", secret:"s1" }]`. Os asserts deixam de inspecionar `global.fetch` diretamente do processor e passam a verificar `mockEmitAgentReply` chamado com `(outboundTargets, { kind:"final", data })` onde `data.reply` é o texto e `data.tools`/`data.reasoningMs`/`data.usage` vêm do `runAgent`. (O fetch/HMAC agora é responsabilidade testada de `emit-reply.test.ts`, não do processor , `emitAgentReply` é mockado aqui.)
  - `describe("processAgentJob , type=audio")` (157-194): ESTENDER conforme A3.1 já pediu (n8n transcrito vs Meta). Aqui acrescentar: no modo `n8n_webhook`, a resposta final do áudio sai por `emitAgentReply` (não `fetch`).
  - `describe("processAgentJob , erro do runAgent")` (196+): manter o caso direct; acrescentar o caso `n8n_webhook` ⇒ `emitAgentReply` com `kind:"blocked"`, `data.reason:"technical_error"`.

Acrescentar mocks no topo: `const mockEmitAgentReply = jest.fn();` + `jest.mock("@/lib/whatsapp/emit-reply", () => ({ emitAgentReply: mockEmitAgentReply, ...jest.requireActual? }))` (mockar só `emitAgentReply`; o tipo `AgentReplyData` pode vir do actual). Mockar `@/lib/redis` com `get`/`set` (`mockRedisGet`/`mockRedisSet`) , `get` default `null` (sem replay). Mockar `buildReplyData`? NÃO , usar o real (é função pura) para que `data` reflita o `runAgent`.

Casos NOVOS:
  - **Idempotência (replay):** `mockRedisGet` retorna um `JSON.stringify(replyData)` para `whatsapp:replied:wamid.123` ⇒ `processAgentJob` NÃO chama `runAgent` nem `acquireUserLock`; chama `emitAgentReply` com o envelope do payload salvo (`kind` derivado de `replyData.ok`).
  - **Caminho normal grava replied:** após `runAgent` ok, `mockRedisSet` é chamado com `("whatsapp:replied:wamid.123", <json>, "EX", 86400)` e `emitAgentReply` com `kind:"final"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA (sem idempotência; `sendViaWebhook`/`outboundUrl` ainda no lugar; `emitAgentReply` não chamado).

- [ ] **Step 3: Implementação mínima**

(3a) Em `route.ts`: montar `channelConfig.outboundTargets` chamando `loadOutboundTargets()` (helper de A5.4) em vez de carregar UM webhook via `findFirst`. Remover o `findFirst({ direction:"outbound" })` de saída remanescente (se houver). Atualizar a interface `AgentJobChannelConfig` em `processor.ts`: remover `outboundUrl?`/`outboundSecret?` e adicionar `outboundTargets?: { url: string; secret: string }[]`. (O modo `direct` não usa `outboundTargets`; continua via cloud client.)

(3b) No topo de `processAgentJob`, ACIMA do `acquireUserLock` (ver A4.2), inserir o short-circuit de idempotência (reentrega não precisa de lock):

```ts
import { emitAgentReply, type AgentReplyData } from "@/lib/whatsapp/emit-reply";
import { buildReplyData } from "./build-reply-data";
import { redis } from "@/lib/redis";
// ...
  const replayKey = `whatsapp:replied:${data.messageId}`;
  const cached = await redis.get(replayKey).catch(() => null);
  if (cached) {
    try {
      const replyData = JSON.parse(cached) as AgentReplyData;
      await dispatchReply(data, replyData);
    } catch (e) { console.warn("[processor] replay falhou:", e); }
    return; // reentrega: não adquire lock, não roda agente
  }
```

(3c) Migrar os 5 call-sites de `sendViaWebhook` para `dispatchReply` (ou `emitAgentReply` direto via um helper `dispatchNotice`):
  - **84 (imagem provisória)** e **97 (áudio desabilitado)** e **129 (fallback de áudio)**: trocar `await sendViaWebhook(data, <frase>)` por um envelope `kind:"blocked"`, `reason:"technical_error"`, `reply:<frase>` quando `n8n_webhook`; quando `direct`, manter `cloudClient.sendText(data.replyTo, <frase>)`. Encapsular num helper `dispatchNotice(data, text)` que monta um `AgentReplyData` mínimo (`ok:false`, `reason:"technical_error"`, `reply:text`, demais zerados) e chama `dispatchReply`.
  - **218 (resposta final):** substituir por: montar `replyData` via `buildReplyData(ctx, result)`, gravar `redis.set(replayKey, JSON.stringify(replyData), "EX", 24*60*60)`, e `dispatchReply(data, replyData)`.
  - **261 (heartbeat):** dentro de `scheduleWhatsappHeartbeat`, REMOVER a chamada a `sendViaWebhook` (vira no-op no WhatsApp); a função inteira é removida na B.6.

```ts
  // resposta final (substitui o call-site 218)
  const replyData = buildReplyData(
    { inboundMessageId: data.messageId, to: data.replyTo, phoneNumberId: data.phoneNumberId ?? null, conversationId: conversation.id, messageType: data.type },
    result,
  );
  await redis.set(replayKey, JSON.stringify(replyData), "EX", 24 * 60 * 60).catch(() => {});
  await dispatchReply(data, replyData);
```

> **Janela de idempotência (achado #12, decisão explícita):** a chave `whatsapp:replied` é gravada APÓS `runAgent` + persistência da Message e ANTES do `dispatchReply` (POST). Existe uma janela ESTREITA: se o worker morrer entre `runAgent`/persist e o `redis.set`, o retry do BullMQ re-roda o agente (sem a chave). Mitigação aceita e documentada: (a) a janela é de milissegundos; (b) o reprocessamento é detectável , a Message do assistant já foi persistida na conversa, então o reprocesso gera uma 2a Message; o consumidor (n8n) deduplica por `deliveryId`/`inboundMessageId`. Decisão do v2: NÃO mover o `redis.set` para dentro da transação de persistência nesta onda (Redis e Postgres são stores distintos, não há transação atômica trivial); aceitar a janela e documentá-la no runbook (F.1) + dedup no n8n. Se a operação observar duplicatas reais, evoluir para gravar a chave dentro do mesmo `prisma.$transaction` da Message via outbox, fora do escopo.

(3d) Criar `dispatchReply(data, replyData)` no processor (o `kind` é DERIVADO de `replyData.ok`, ver B.5): em `n8n_webhook`, `emitAgentReply(data.channelConfig.outboundTargets ?? [], { kind: replyData.ok ? "final" : "blocked", data: replyData })`; em `direct`, `cloudClient.sendText(data.replyTo, replyData.reply)`.

(3e) REMOVER a função `sendViaWebhook` (todos os 5 call-sites já migrados nesta task). Verificar com `grep -n 'sendViaWebhook' src/worker/agent/processor.ts` ⇒ vazio. (O `scheduleWhatsappHeartbeat` ainda existe após esta task, mas sem chamar `sendViaWebhook`; é removido na B.6.)

- [ ] **Step 4: Rodar e ver passar + tsc**

Run: `npx tsc --noEmit && npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: PASS; tsc sem erros (nenhum call-site órfão de `sendViaWebhook`).

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/processor.ts src/app/api/integrations/whatsapp/inbound/route.ts
git commit -m "feat(whatsapp): idempotencia de saida e emissao do envelope agent.reply (F5 B)"
```

### Task B.5: Levar a recusa L3 ao webhook (a recusa já roda via `respondPermissionDenied`)

**Files:**
- Modify: `src/worker/agent/processor.ts` (o caminho de recusa já volta em `result.ok=true` com `deniedModule`; garantir que `dispatchReply` emita `kind:"blocked"` quando `!replyData.ok`)
- Test: `src/worker/agent/processor.test.ts`

> Nota: `respondPermissionDenied` é chamado DENTRO de `runAgent` (run-agent.ts:715), portanto o processor recebe o resultado já como `ok:true` + `deniedModule`. A única mudança aqui é garantir que o `kind` do envelope seja `"blocked"` quando `replyData.ok === false` (já coberto pelo `dispatchReply` de B.4 3d, que deriva o `kind` de `replyData.ok`).
>
> **L3 difere de L1/L2 (achado #14 , documentar):** as barreiras L1 (número desconhecido/inativo) e L2 (canal/nível) rodam NO INBOUND, antes de enfileirar, e NÃO tocam banco nem IA , para elas vale 100% a frase "sem custo de IA". A L3 (permission_denied) é diferente: roda DENTRO de `runAgent` via `respondPermissionDenied`, que CRIA a sessão/Message (par user/assistant) e marca a `AgentRouterDecision`; como há conversa persistida, o **Judge (avaliação automática) PODE ser acionado** para essa conversa, exatamente como nos demais canais (decisão da spec: o Judge segue rodando). Ou seja, L3 evita o LLM PRINCIPAL (não gera resposta via modelo), mas NÃO é "zero IA" como L1/L2 , o Judge é um custo de IA possível. Manter o Judge rodando (não suprimir). Esta distinção deve constar no runbook (F.1) e na verificação (a §16 separa "L1/L2/L3 sem custo do LLM principal" de "Judge roda para WhatsApp").

- [ ] **Step 1: Escrever o teste que falha**

No `processor.test.ts`, mockar `runAgent` retornando `{ ok:true, message:"recusa", suggestions:[], usage:{...0}, messageId:"m", toolsCalled:[], reasoningMs:0, deniedModule:"financeiro", allowedModules:["estoque"] }`. Assertar que `emitAgentReply` é chamado com `kind:"blocked"`, `data.reason:"permission_denied"`, `data.deniedModule:"financeiro"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: FALHA se o envelope da recusa sair como `kind:"final"` (em vez de `"blocked"`).

- [ ] **Step 3: Implementação mínima**

O `dispatchReply(data, replyData)` definido em B.4 (3d) já DERIVA o `kind` de `replyData.ok` (`replyData.ok ? "final" : "blocked"`). Como o `buildReplyData` (B.3) já mapeia a recusa L3 para `ok:false`/`reason:"permission_denied"` (via `result.deniedModule`), a recusa sai automaticamente como `kind:"blocked"`. Logo, NÃO há código novo a escrever aqui se B.3 + B.4 (3d) já estão corretos. Esta task é a GARANTIA por teste: se o teste do Step 1 passar sem mudança de código, confirmar que B.4 (3d) realmente deriva o `kind` (não usa `"final"` fixo). Caso B.4 tenha ficado com `kind` fixo por engano, corrigir para o derivado aqui.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/worker/agent/processor.test.ts --runInBand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/worker/agent/processor.ts src/worker/agent/processor.test.ts
git commit -m "feat(whatsapp): recusa L3 sai como kind:blocked/permission_denied no webhook (F5 B)"
```

### Task B.6: Suprimir heartbeat no WhatsApp (decisão #9)

> Em B.4 o call-site 261 (heartbeat) já deixou de chamar `sendViaWebhook` (que foi removido). Aqui removemos a função `scheduleWhatsappHeartbeat` inteira e seu uso (o timer e o `finally` de `clearTimeout`).

**Files:**
- Modify: `src/worker/agent/processor.ts` (remover `scheduleWhatsappHeartbeat`, a chamada `const heartbeatTimer = scheduleWhatsappHeartbeat(data);` e o `finally { clearTimeout(heartbeatTimer) }` aninhado)
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
> **Componente:** dois grupos rotulados ("Bubble no app" e "WhatsApp"), cada um com um `SegmentedControl` cujas opções vêm de `channelLevelOptions()` (5 segmentos: Desativado, Visualizador, Gerente, Admin, Super Admin). Reaproveita a faixa de sumário do topo (bolinha de status + título + helper).
>
> **NOTA (achado #21):** o `SegmentedControl` genérico JÁ EXISTE em `src/components/ui/segmented-control.tsx` (confirmado). Esta task só o USA (parametrizado com `ChannelAccessLevel`), NÃO cria componente novo de segmented.
>
> **Comportamento:** ao trocar o nível de um canal, chama `updateAgentAvailability({ bubbleAccessLevel, whatsappAccessLevel })` (server action de C.2) via `useTransition`; em erro, `toast.error` + `router.refresh()`. Mantém o gate `isConfigured` (sem provedor LLM => segmented desabilitado, exceto manter "Desativado").
>
> **Estados:** pendente (segmento em transição com leve opacidade/spinner inline), desabilitado (`isConfigured=false`), ativo por canal. O sumário do topo deve refletir os 4+ estados: ambos ativos, só um ativo, ambos off, mais o nível mínimo escolhido (ex.: "Bubble: a partir de Gerente").
>
> **Critério visual (ui-ux-pro-max):** estado ativo por fundo + peso (não só cor), foco visível, contraste AA, alinhamento com o grupo "Máximo por resposta" da mesma tela, sem travessão nos textos, linguagem natural pt-br. Responsivo (empilha em telas estreitas).

- [ ] **Step 1: REESCREVER `agent-availability-summary.test.ts` e `summarizeAvailability` (TDD)**

> O `agent-availability-summary.test.ts` JÁ EXISTE com 4 casos por BOOLEAN (`summarizeAvailability(true,true)` ⇒ active; `(true,false)`/`(false,true)` ⇒ partial; `(false,false)` ⇒ off). **REESCREVER** esses 4 casos para a nova assinatura por NÍVEIS , a chamada passa a ser `summarizeAvailability(bubbleLevel, whatsappLevel)` com valores `ChannelAccessLevel`. Mapeamento direto dos casos antigos: `(true,true)`→`("viewer","viewer")` ⇒ active; `(true,false)`→`("viewer","off")` ⇒ partial ("apenas no chat"); `(false,true)`→`("off","viewer")` ⇒ partial ("apenas no whatsapp"); `(false,false)`→`("off","off")` ⇒ off. Acrescentar 1 caso de nível restrito: `("manager","off")` ⇒ partial, com `helper` mencionando o nível mínimo ("a partir de Gerente"). TDD: reescrever os casos, ver falhar, implementar.

Em `agent-availability-summary.ts`, mudar a assinatura de `(bubble: boolean, whatsapp: boolean)` para `(bubbleLevel: ChannelAccessLevel, whatsappLevel: ChannelAccessLevel)` (importar `ChannelAccessLevel` de `@/generated/prisma/client`) e derivar `tone`/`title`/`helper` dos níveis: `off` em ambos ⇒ tone "off"; ambos `!= off` ⇒ "active"; um só `!= off` ⇒ "partial". O `helper` menciona o nível mínimo quando o nível não é `viewer` (ex.: "Bubble: a partir de Gerente"), reusando `PLATFORM_ROLE_LABELS`.

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

> **Achado do v2 (#17 , `updateBubbleEnabled` órfã):** confirmado que `updateBubbleEnabled(enabled: boolean)` existe em `src/lib/actions/agent-config.ts:584` e grava `bubbleEnabled`. Ela fica ÓRFÃ/quebrada após o drop da coluna (e logicamente já é substituída por `updateAgentAvailability` com níveis, C.2). Antes de dropar a coluna, esta task tem um step de guard que localiza e migra/remove TODOS os call-sites de `updateBubbleEnabled`.

**Files:**
- Modify: `prisma/schema.prisma` (remover os dois booleans `bubbleEnabled`/`whatsappEnabled` do model `AgentSettings`)
- Modify: `src/lib/actions/agent-config.ts` (remover `updateBubbleEnabled` e o seu comentário de doc no topo; remover refs aos booleans no Row/map/flags)
- Modify: eventuais call-sites de `updateBubbleEnabled` (UI/components) localizados no Step 1
- Create: `prisma/migrations/<timestamp>_f5_drop_legacy_channel_booleans/migration.sql`

> Esta task fecha a migração de dados. Só executar após C.1-C.5 (todas as leituras já usam os níveis). Segue protocolo de schema (segunda migration; avisar + `agente schema-changed`).

- [ ] **Step 1: Guard , localizar e remover/migrar call-sites de `updateBubbleEnabled` e dos booleans**

(1a) `grep -rn "updateBubbleEnabled" src/`
Expected: hoje só a definição e o comentário de doc em `agent-config.ts` (linhas 9 e 584) , confirmado na auditoria. Se houver QUALQUER outro call-site (UI, action, teste), migrá-lo para `updateAgentAvailability` (níveis) ANTES de prosseguir. Não deixar import/uso pendente.

(1b) `grep -rn "bubbleEnabled\|whatsappEnabled" src/ | grep -v "AccessLevel"`
Expected: vazio (ou só comentários). Se houver código vivo lendo/escrevendo os booleans, corrigir antes de remover do schema.

(1c) Remover a função `updateBubbleEnabled` de `agent-config.ts` (e a linha 9 do comentário de doc que a cita).

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

### Task D.3: Acrescentar o filtro por evento ao emissor (`events has agent_reply`)

**Files:**
- Modify: `src/app/api/integrations/whatsapp/inbound/route.ts` (no `loadOutboundTargets`, ACRESCENTAR `events: { has: "agent_reply" }` ao `where`)
- Test: `src/app/api/integrations/whatsapp/inbound/route.test.ts`

> **Decisão do v2 (achado #10):** nas Ondas A/B o `loadOutboundTargets` carrega TODO outbound habilitado (sem filtro de evento) , para não haver janela de "webhooks invisíveis" antes da UI de eventos existir. ESTA task (Onda D), JUNTO com a UI (D.2) e o default na criação (D.1), aperta o `where` para incluir `events: { has: "agent_reply" }`. A partir daqui o emissor dispara só para os outbound habilitados QUE TÊM o evento.

- [ ] **Step 1: Escrever o teste que falha**

Testar: com 2 webhooks outbound habilitados com `events:["agent_reply"]` e 1 habilitado SEM o evento, o caminho do inbound (`loadOutboundTargets`) retorna 2 targets (o sem o evento é excluído). Mockar `prisma.whatsappWebhook.findMany` , assertar que o `where` passado inclui `events: { has: "agent_reply" }`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/app/api/integrations/whatsapp/inbound/route.test.ts --runInBand`
Expected: FALHA (o `where` da Onda A não filtra por evento; o webhook sem o evento ainda viria).

- [ ] **Step 3: Implementação mínima**

No `loadOutboundTargets` (route.ts), acrescentar `events: { has: "agent_reply" }` ao `where: { direction:"outbound", enabled:true }` (passa a `where: { direction:"outbound", enabled:true, events: { has: "agent_reply" } }`). Atualizar o comentário do helper (que na Onda A dizia "sem filtro de evento , a Onda D acrescenta"). Confirmar que não há `findFirst({ direction:"outbound" })` remanescente.

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
- Modify: `src/lib/agent/quality/rodada-labels.ts` (novas consts de origem + labels em `ORIGEM_LABELS`; `channelToOrigem` passa a distinguir in_app/whatsapp)
- Test: `src/lib/agent/quality/rodada-labels.test.ts` (JÁ EXISTE , MIGRAR os asserts legados)

- [ ] **Step 1: MIGRAR os asserts legados (e escrever os novos que falham)**

> O `rodada-labels.test.ts` JÁ EXISTE e tem asserts que esperam o resultado legado de `channelToOrigem` (hoje `in_app`/`whatsapp` coalescem em `ORIGEM_AGENTE_NEX = "__origem:agente-nex"`, label "Agente Nex"). **MIGRAR** todo assert que espera `channelToOrigem("in_app") === ORIGEM_AGENTE_NEX` ou `channelToOrigem("whatsapp") === ORIGEM_AGENTE_NEX` para as duas origens novas.

Em `rodada-labels.test.ts`, assertar: `channelToOrigem("in_app") === ORIGEM_AGENTE_NEX_BUBBLE`; `channelToOrigem("whatsapp") === ORIGEM_AGENTE_NEX_WHATSAPP`; `ORIGEM_LABELS[ORIGEM_AGENTE_NEX_BUBBLE] === "Agente Nex · Bubble"`; `ORIGEM_LABELS[ORIGEM_AGENTE_NEX_WHATSAPP] === "Agente Nex · WhatsApp"`. Manter `playground`/`backtest` inalterados. (A const `ORIGEM_AGENTE_NEX` continua exportada por compat , `labelFor`/`buildRodadaNamesFromMarkers` ainda a reconhecem , mas `channelToOrigem` não a retorna mais.)

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
- Modify: `src/lib/agent/quality/queries.ts` (`getDistinctRodadas`: separar in_app/whatsapp)
- Test: `src/lib/agent/quality/queries.test.ts` (JÁ EXISTE , MIGRAR os asserts da origem única)

- [ ] **Step 1: MIGRAR os asserts legados (e escrever os novos que falham)**

> O `queries.test.ts` JÁ EXISTE e (onde cobre `getDistinctRodadas`) espera UMA entrada `__origem:agente-nex` somando in_app+whatsapp. **MIGRAR** esses asserts para DUAS entradas separadas.

Em `queries.test.ts`, mockar a fonte de `virtualRows` para retornar `[{channel:"in_app",count:3},{channel:"whatsapp",count:2}]` e assertar que `getDistinctRodadas` produz `__origem:agente-nex-bubble` (count 3) e `__origem:agente-nex-whatsapp` (count 2), em vez de uma única `__origem:agente-nex` somando 5.

> **Ordem final do filtro (achado #19 , `unshift`):** `getDistinctRodadas` monta o array com `unshift` (cada `unshift` insere no INÍCIO, então a ORDEM de chamada é invertida no resultado). A ordem atual de unshift é: agente-nex → playground → backtest, produzindo `[backtest, playground, agente-nex, ...RX]`. Ao trocar a entrada única `agente-nex` por DUAS, manter a posição relativa: substituir o `unshift({agente-nex})` por dois `unshift` na ordem `whatsapp` depois `bubble` (assim no resultado final fica `bubble` ANTES de `whatsapp`, ambos no lugar onde estava o `agente-nex`). Ordem final esperada no array: `[backtest, playground, agente-nex-bubble, agente-nex-whatsapp, ...RX]`. **Assertar essa ordem exata no teste** (ex.: `expect(out.map(o=>o.marker)).toEqual(["__origem:backtest","__origem:playground","__origem:agente-nex-bubble","__origem:agente-nex-whatsapp", ...])` , ajustando ao que o mock alimentar para backtest/playground).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/quality/queries.test.ts --runInBand`
Expected: FALHA (hoje soma em `agenteNexCount` e emite um marker só).

- [ ] **Step 3: Implementação mínima**

Em `queries.ts` (`getDistinctRodadas`): trocar `agenteNexCount` único por `bubbleCount`/`whatsappCount`; no loop que classifica `virtualRows`, `in_app → bubbleCount`, `whatsapp → whatsappCount`. Substituir o `out.unshift({ marker: "__origem:agente-nex", count: agenteNexCount })` por dois unshift NA ORDEM `whatsapp` e depois `bubble` (para o resultado final ter bubble antes de whatsapp , ver Step 1):

```ts
if (whatsappCount > 0) out.unshift({ marker: ORIGEM_AGENTE_NEX_WHATSAPP, count: whatsappCount });
if (bubbleCount > 0)   out.unshift({ marker: ORIGEM_AGENTE_NEX_BUBBLE,   count: bubbleCount });
```

Importar `ORIGEM_AGENTE_NEX_BUBBLE`/`ORIGEM_AGENTE_NEX_WHATSAPP` de `rodada-labels.ts` (criadas em E.1). Os `unshift` de `playground`/`backtest` permanecem após estes (mantendo a ordem final do Step 1).

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

> **Arquivos exatos (achado #21 , confirmados):**

**Files:**
- Modify: `src/components/agent/monitoramento-nav.tsx:10` (label "Bubble" → "Chat"; rota `/agente/monitoramento/bubble` mantida , confirmado: linha 10 tem `{ label: "Bubble", href: "/agente/monitoramento/bubble" }`)
- Modify: `src/components/agent/monitoramento/bubble-monitor.tsx` (componente da lista de sessões, consumidor de `SessionRow`; renderiza o marcador de canal Bubble/WhatsApp por sessão usando `SessionRow.channel` de E.4; e os textos "Bubble" nos cabeçalhos viram "Chat")
- Modify: `src/components/agent/monitoramento/bubble-monitor-row.tsx` (já tem marcador de áudio; o marcador de CANAL vai na lista de sessões em `bubble-monitor.tsx`, não na linha de mensagem , esta linha só muda se algum texto "Bubble" estiver aqui)
- Modify: `src/components/agent/monitoramento/evaluations-table.tsx` (consumidor de `channelToOrigem`/`ORIGEM_LABELS`: o filtro de origem passa a listar as duas origens novas com os labels corretos; verificar o ponto que monta as opções de origem)

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

Run: `npx tsc --noEmit && npx eslint src/components/agent/monitoramento-nav.tsx src/components/agent/monitoramento/evaluations-table.tsx src/components/agent/monitoramento/bubble-monitor.tsx src/components/agent/monitoramento/bubble-monitor-row.tsx`
Expected: verde. Render: abrir a aba "Chat", ver sessões in_app e whatsapp com marcador de canal, status correto, e o filtro de origem com as duas entradas.

- [ ] **Step 4: Commit (atômicos por arquivo, por causa do conflito com feat/nex-reconstrucao)**

```bash
git add src/components/agent/monitoramento-nav.tsx
git commit -m "feat(monitoramento): aba Bubble vira Chat (F5 E)"
git add src/components/agent/monitoramento/evaluations-table.tsx
git commit -m "feat(monitoramento): filtro de origem lista Bubble e WhatsApp (F5 E)"
git add src/components/agent/monitoramento/bubble-monitor.tsx
git commit -m "feat(monitoramento): marcador de canal por sessao na lista (F5 E, ui-ux-pro-max)"
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

Cobrir, em pt-br sem travessão: (1) os 2 webhooks (entrada `/api/integrations/whatsapp/inbound` e o receptor do `agent.reply`); (2) assinar a HMAC com timestamp ATUAL a cada (re)envio (`X-Signature` = HMAC-SHA256 de `${timestamp}.${body}`, `X-Timestamp`); validar a HMAC do `agent.reply` no n8n e **deduplicar por `deliveryId`** , reforçar que essa dedup é a defesa contra a janela estreita de idempotência (achado #12: se o worker morrer entre a persistência da Message e a gravação de `whatsapp:replied`, um retry pode re-rodar o turno e emitir um 2o `agent.reply` com OUTRO `deliveryId` mas o mesmo `inboundMessageId`; o n8n deve, portanto, deduplicar também por `inboundMessageId` quando precisar idempotência de PONTA, não só por `deliveryId`); (3) mapeamento dos campos do payload da Meta (§3): `from`, `text` (texto OU transcrição do áudio , no caminho n8n o áudio JÁ chega transcrito em `text` e independe do `audioCheckpoint`), `type` (`text`/`audio`), `messageId`, `timestamp` (normalizar segundos→ms no n8n), `contactName`, `phoneNumberId`; (4) como tratar cada `reason` das barreiras (`user_not_found`, `user_inactive`, `channel_disabled`, `role_not_allowed`, `permission_denied`, `technical_error`) usando `reason` e/ou `reply`; nota: `permission_denied` (L3) traz `deniedModule`/`allowedModules` e, diferente de L1/L2, foi avaliada pelo Judge (há custo de IA do Judge, não do LLM principal , achado #14); (5) AVISO de breaking change do contrato de saída (envelope `agent.reply` substitui `{to,message,messageId,timestamp}`); (6) nota da dívida `WhatsappChannel` (singleton vivo) vs `WhatsappInstance` (dorme , unificação fora de escopo); (7) os textos finais das mensagens padrão (revisar §17.4 com o usuário e fixar aqui); (8) pendência registrada: as barreiras de mídia (imagem provisória, áudio desabilitado, fallback de áudio) saem como `reason:"technical_error"` por ora , se a operação quiser distinguir "mídia não suportada" de "falha técnica", criar uma `BlockReason` nova numa onda futura (fora de escopo desta entrega).

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
- [ ] barreiras L1/L2 (no inbound) retornando mensagem padrão SEM custo de IA (sem `LlmUsage` novo). L3 (permission_denied, na Onda B) NÃO chama o LLM principal mas CRIA sessão/Message e PODE acionar o Judge (achado #14) , conferir que não há `LlmUsage` do modelo principal para a recusa, mas que a avaliação do Judge da conversa existe.
- [ ] Judge gerando avaliação para a conversa WhatsApp (confirma §4): `SELECT e.status FROM conversation_quality_evaluations e JOIN conversations c ON c.id=e.conversation_id WHERE c.channel='whatsapp'` retorna linhas.
- [ ] webhook de saída com envelope rico (`tools`, `reasoningMs`, `usage`, `suggestions`, `deniedModule`/`allowedModules` na recusa) + idempotência (retry de POST falho NÃO duplica nem re-roda; `whatsapp:replied:{messageId}` reusado).
- [ ] seletor de canal/nível bloqueando bubble e WhatsApp conforme o role (viewer vs nível manager/admin/off).

- [ ] **Step 3: Commit (registro final)**

```bash
git commit --allow-empty -m "chore: verificacao e2e final F5 (todos os cenarios da spec §16)"
```

---

## Self-Review (checklist do autor do plano , atualizado no PLAN v2)

**1. Spec coverage:** §3 (A2.1/A2.2), §4 (A1.1, com `platformRole` consolidado), §5 L1/L2 (A5.4)/L3 (B.2/B.5, com a distinção de custo de IA do achado #14), §6 (Onda 0.2/C.*), §7 envelope/url-targetUrl/fail-closed (A5.3/B.1/B.3/B.4), §8 lock + TTL documentado (A4.*), §9 idempotência ANTES do lock + janela documentada (A4.2/B.4), §10 origens (E.1/E.2, ordem do filtro especificada), §11 status (E.3/E.4), §12 webhook por evento , filtro inteiro na Onda D (D.1/D.2/D.3), §13 aba Chat (E.5, arquivos exatos), §14 runbook (F.1), §15 ondas/dependências (A5.4 não-paralelizável; A5.3 depende de A5.1), §16 verificação (tasks *.VERIF + F.2), §17 pendências (1 url/targetUrl: robustez, não bug , A5.4/B.4; 2 granularidade em E.4; 3 fuso do teto diário NÃO tocado, documentar no runbook; 4 textos das mensagens , A5.1 provisório + F.1 final; 5 NOVA: distinguir "mídia não suportada" de "technical_error" , fora de escopo, registrada em B.4/F.1). Cobertos.

**2. Placeholder scan:** sem "TODO/TBD"; cada step de código mostra o código; tasks de UI descrevem componente/comportamento/estados/critério (intencional, construção inline com ui-ux-pro-max). Tasks que tocam testes/arquivos existentes dizem MIGRAR/ESTENDER/REESCREVER (não "criar/adicionar") com os casos enumerados.

**3. Type consistency:** `AgentReplyData` (emit-reply.ts) é o tipo único do envelope, consumido por build-reply-data e processor; `reason: BlockReason | null` (catálogo único de A5.1; emit-reply importa o tipo de blocked-messages , logo A5.3 depende de A5.1). `RunAgentResult.ok:true` ganha `toolsCalled`/`reasoningMs` (obrigatórios) + `deniedModule`/`allowedModules` (opcionais); os DOIS únicos produtores (run-agent.ts return único linha 1487 + permission-denial.ts) ajustados. `ChannelAccessLevel` (enum Prisma) usado em roles/channel-access/channel-level-options/DTO/UI/summary. `roleMeetsChannelLevel` consistente em L2 (A5.4) e bubble (C.5). `ResolvedWhatsappUser.user` ganha `platformRole: PlatformRole` na A1.1 e é consumido em A5.4 (sem reedição do select). `AgentJobChannelConfig` troca `outboundUrl`/`outboundSecret` por `outboundTargets: { url; secret }[]` na B.4 (route.ts monta via `loadOutboundTargets`).

**4. Fatos confirmados contra o código (v2):** `phoneVariants` existe em `countries.ts:180` (achado #1 , import correto, descartado). `allTurnToolNames.push(tc.name)` existe em run-agent.ts:1704 (não duplicar). `iterStart` por iteração (886), `durationMs: Date.now()-iterStart` (951). Return `ok:true` único (1487). `respondPermissionDenied` retorna `ok:true` sem os campos novos (ajustar). `createWebhook` grava `url` E `targetUrl` (178-179); `listWebhooks` retorna `targetUrl ?? url` (303). `updateBubbleEnabled` só na própria def + doc (584/9). `agent-availability-summary.test.ts`, `resolve.test.ts`, `route.test.ts`, `processor.test.ts`, `rodada-labels.test.ts`, `queries.test.ts` JÁ EXISTEM (migrar). `segmented-control.tsx` existe. `getDistinctRodadas` usa `unshift` (ordem invertida , especificada em E.2). `monitoramento-nav.tsx:10` = "Bubble"; `bubble-monitor.tsx`/`bubble-monitor-row.tsx` existem. Spec §8 TTL >= 120s; §9 idempotência no topo, antes do lock.

**5. Inconsistência remanescente conhecida:** a janela estreita de idempotência (worker morre entre persist e `redis.set`) é aceita e documentada (B.4 + F.1: dedup por `deliveryId` no n8n), não eliminada nesta entrega , trade-off explícito por não haver transação atômica Postgres↔Redis trivial.
