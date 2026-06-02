# Nex Bubble: persistência de sessão, menu e sugestões por domínio , Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (execução inline, conforme CLAUDE.md §6 do projeto). UI exclusivamente na sessão principal + ui-ux-pro-max obrigatório. Steps usam checkbox (`- [ ]`).

**Goal:** Tornar a conversa da bubble do Agente Nex persistente entre fechar/F5/logout, consolidar o menu de 3 pontinhos (Baixar conversa + Limpar sessão) e curar as sugestões iniciais pelos domínios permitidos do RBAC v2.

**Architecture:** Soft-archive via campo `Conversation.endedAt`; o layout server resolve a conversa ativa e injeta no FAB; sugestões derivadas da fonte única `TOOL_TO_QUESTION` + novo mapa `TOOL_DOMAIN`, filtradas por `allowedDomains`.

**Tech Stack:** Next.js 16 (App Router, server components/actions), Prisma v7, TypeScript, Jest, React, Tailwind, lucide-react, framer-motion.

**Spec:** `docs/superpowers/specs/2026-06-02-nex-bubble-sessao-menu-sugestoes-design.md`

**Ordem das ondas:** A (schema+backend) → B (sugestões) → C (UI). A e B independentes entre si; C depende de A.

---

## File Structure

- `prisma/schema.prisma` , modelo `Conversation`: + `endedAt` e índice.
- `prisma/migrations/<ts>_conversation_ended_at/migration.sql` , migration.
- `src/lib/actions/active-conversation.ts` (novo) , `getActiveConversationId`, `archiveActiveConversation`.
- `src/lib/actions/__tests__/active-conversation.test.ts` (novo).
- `src/lib/actions/conversation-messages.ts` , filtro `endedAt: null`.
- `src/lib/agent/conversation.ts` , whatsapp `findFirst` + `endedAt: null`.
- `src/app/api/agent/stream/route.ts` , guard 403 conversa arquivada.
- `src/lib/agent/personalized-suggestions/templates.ts` , + `TOOL_DOMAIN`.
- `src/lib/agent/personalized-suggestions/pick.ts` , filtro por domínio.
- `src/lib/agent/welcome-suggestions.ts` , `pickWelcomeByDomains`.
- `src/lib/agent/welcome-suggestions.test.ts` (novo).
- `src/app/(protected)/layout.tsx` , integra domínios + initialConversationId.
- `src/components/agent/agent-bubble.tsx` , prop `initialConversationId`.
- `src/components/agent/chat-panel.tsx` , menu consolidado + handler.

---

## Onda A , Schema + persistência (backend)

### Task A1: Campo `endedAt` em Conversation + migration

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Conversation`, índice)
- Create: `prisma/migrations/<timestamp>_conversation_ended_at/migration.sql`

- [ ] **Step 1: Adicionar campo e índice ao schema**

No modelo `Conversation`, após `updatedAt`, adicionar:

```prisma
  /// Quando a conversa foi encerrada/arquivada pelo usuario ("Limpar sessao").
  /// null = ativa. Arquivadas nao reabrem, mas permanecem para auditoria/export.
  endedAt   DateTime?  @map("ended_at")
```

Trocar o índice existente `@@index([userId, updatedAt])` por:

```prisma
  @@index([userId, updatedAt])
  @@index([userId, channel, endedAt, updatedAt])
```

- [ ] **Step 2: Gerar a migration**

Run: `npx prisma migrate dev --name conversation_ended_at --create-only`
Expected: cria pasta de migration com `ALTER TABLE "conversations" ADD COLUMN "ended_at" TIMESTAMP(3)` e o CREATE INDEX.

- [ ] **Step 3: Aplicar a migration**

Run: `npx prisma migrate dev`
Expected: "Database schema is up to date" / migration aplicada sem erro.

- [ ] **Step 4: Regenerar client + avisar schema**

Run: `npx prisma generate && agente schema-changed`
Expected: client gerado; aviso registrado para outras worktrees.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): Conversation.endedAt para arquivar sessao da bubble"
```

### Task A2: Server actions `active-conversation`

**Files:**
- Create: `src/lib/actions/active-conversation.ts`
- Test: `src/lib/actions/__tests__/active-conversation.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Espelhar o padrão de `src/lib/actions/__tests__/domain-access.test.ts` (mock de `@/lib/auth` e `@/lib/prisma`). Casos:

```typescript
// getActiveConversationId
// - sem usuario -> { ok: false }
// - usuario sem conversa ativa -> { ok: true, conversationId: null }
// - usuario com conversa in_app ativa -> { ok: true, conversationId: <id> }
// - ignora conversas com endedAt != null e de outros canais (assert no where)
// archiveActiveConversation
// - sem usuario -> { ok: false }
// - conversa de outro usuario -> { ok: false, error }
// - conversa ja arquivada -> { ok: true } sem chamar update
// - conversa ativa -> chama update com endedAt e retorna { ok: true }
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/actions/__tests__/active-conversation.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar as actions**

```typescript
"use server";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getActiveConversationId(): Promise<
  { ok: true; conversationId: string | null } | { ok: false }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const conv = await prisma.conversation.findFirst({
    where: { userId: user.id, channel: "in_app", endedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return { ok: true, conversationId: conv?.id ?? null };
}

export async function archiveActiveConversation(
  conversationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado" };
  if (!conversationId || typeof conversationId !== "string") {
    return { ok: false, error: "conversationId obrigatório" };
  }
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, endedAt: true },
  });
  if (!conv) return { ok: false, error: "Conversa não encontrada" };
  if (conv.userId !== user.id) return { ok: false, error: "Acesso negado" };
  if (conv.endedAt !== null) return { ok: true };
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { endedAt: new Date() },
  });
  return { ok: true };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/actions/__tests__/active-conversation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/active-conversation.ts src/lib/actions/__tests__/active-conversation.test.ts
git commit -m "feat(agent): actions getActiveConversationId + archiveActiveConversation"
```

### Task A3: Guards de `endedAt` (stream, getConversationMessages, whatsapp)

**Files:**
- Modify: `src/app/api/agent/stream/route.ts` (após validação de ownership do conversationId)
- Modify: `src/lib/actions/conversation-messages.ts:43-52` (where do findMany)
- Modify: `src/lib/agent/conversation.ts:92-111` (findFirst do whatsapp)

- [ ] **Step 1: `getConversationMessages` ignora arquivada**

No `findMany` de `conversation-messages.ts`, trocar `where: { conversationId }` por:

```typescript
    where: { conversationId, conversation: { endedAt: null } },
```

- [ ] **Step 2: WhatsApp não reaproveita arquivada**

No `findFirst` de reuso de janela em `conversation.ts`, adicionar `endedAt: null` ao `where` (junto de `userId`, `channel: "whatsapp"`, `updatedAt: { gte: cutoff }`).

- [ ] **Step 3: Stream bloqueia conversa arquivada**

Na rota de stream, depois de validar ownership do `conversationId` recebido (quando existe), carregar `endedAt` e recusar:

```typescript
  if (conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { endedAt: true },
    });
    if (conv?.endedAt) {
      return new Response(
        JSON.stringify({ error: "Conversa encerrada. Inicie uma nova." }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
  }
```

(Ajustar nomes às variáveis já existentes na rota; reusar a query de ownership se ela já carrega a conversa, adicionando `endedAt` ao select.)

- [ ] **Step 4: Verificar tipos e lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/agent/stream/route.ts src/lib/actions/conversation-messages.ts src/lib/agent/conversation.ts`
Expected: zero erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agent/stream/route.ts src/lib/actions/conversation-messages.ts src/lib/agent/conversation.ts
git commit -m "feat(agent): conversa arquivada nao reabre (stream 403 + getMessages + whatsapp)"
```

---

## Onda B , Sugestões por domínio

### Task B1: Mapa `TOOL_DOMAIN`

**Files:**
- Modify: `src/lib/agent/personalized-suggestions/templates.ts`
- Test: `src/lib/agent/personalized-suggestions/templates.test.ts` (criar se não existir; senão adicionar caso)

- [ ] **Step 1: Teste de integridade do mapa**

```typescript
import { TOOL_TO_QUESTION, TOOL_DOMAIN } from "./templates";

test("toda tool com pergunta tem dominio mapeado", () => {
  for (const toolId of Object.keys(TOOL_TO_QUESTION)) {
    expect(TOOL_DOMAIN[toolId]).toBeDefined();
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/personalized-suggestions/templates.test.ts`
Expected: FAIL (`TOOL_DOMAIN` não existe).

- [ ] **Step 3: Adicionar `TOOL_DOMAIN`**

Após `TOOL_TO_QUESTION`, importando `ReportDomain` de `@/generated/prisma/client`:

```typescript
import type { ReportDomain } from "@/generated/prisma/client";

export const TOOL_DOMAIN: Readonly<Record<string, ReportDomain>> = {
  estoque_saldo_produto: "estoque",
  estoque_top_movimentados: "estoque",
  estoque_entradas_saidas: "estoque",
  estoque_produtos_parados: "estoque",
  estoque_concentracao: "estoque",
  estoque_valor_armazem: "estoque",
  financeiro_saldo_contas: "financeiro",
  financeiro_caixa_periodo: "financeiro",
  financeiro_fluxo_caixa: "financeiro",
  financeiro_contas_a_receber: "financeiro",
  financeiro_contas_a_pagar: "financeiro",
  financeiro_titulos_vencidos: "financeiro",
  fiscal_faturamento_periodo: "fiscal",
  fiscal_faturamento_por_cliente: "fiscal",
  fiscal_notas_emitidas: "fiscal",
  fiscal_notas_recebidas: "fiscal",
  fiscal_impostos_periodo: "fiscal",
  fiscal_produtos_faturados: "fiscal",
  comercial_pedidos_por_etapa: "comercial",
  comercial_pedidos_atrasados: "comercial",
  comercial_pedidos_periodo: "comercial",
  comercial_parcelas_a_vencer: "comercial",
  comercial_pedidos_por_vendedor: "comercial",
  cadastro_buscar_parceiro: "cadastros",
  cadastro_parceiros_por_uf: "cadastros",
  cadastro_contar_parceiros: "cadastros",
  contabil_plano_de_contas: "contabil",
  contabil_estrutura_conta: "contabil",
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/personalized-suggestions/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/personalized-suggestions/templates.ts src/lib/agent/personalized-suggestions/templates.test.ts
git commit -m "feat(agent): mapa TOOL_DOMAIN para curar sugestoes por dominio"
```

### Task B2: `pickWelcomeByDomains`

**Files:**
- Modify: `src/lib/agent/welcome-suggestions.ts`
- Test: `src/lib/agent/welcome-suggestions.test.ts` (novo)

- [ ] **Step 1: Escrever testes falhando**

```typescript
import { pickWelcomeByDomains } from "./welcome-suggestions";

test("um dominio retorna so perguntas dele, capado", () => {
  const r = pickWelcomeByDomains(["estoque"], "viewer", 3);
  expect(r).toHaveLength(3);
  expect(r.every((q) => q.toLowerCase().includes("estoque") || q.toLowerCase().includes("produto") || q.toLowerCase().includes("itens"))).toBe(true);
});

test("so crm (sem tools) cai no fallback por role", () => {
  const r = pickWelcomeByDomains(["crm"], "viewer", 3);
  expect(r.length).toBeGreaterThan(0); // veio do pickWelcomeByRole/WELCOME_SUGGESTIONS
});

test("dominios vazios cai no fallback por role", () => {
  const r = pickWelcomeByDomains([], "manager", 3);
  expect(r.length).toBeGreaterThan(0);
});

test("todos dominios (super_admin) inclui faturamento", () => {
  const all = ["cadastros","comercial","contabil","crm","estoque","financeiro","fiscal"] as const;
  const r = pickWelcomeByDomains([...all], "super_admin", 5);
  expect(r.some((q) => q.includes("faturamos"))).toBe(true);
});

test("intercala multiplos dominios sem duplicar", () => {
  const r = pickWelcomeByDomains(["estoque","fiscal"], "manager", 4);
  expect(new Set(r).size).toBe(r.length);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/agent/welcome-suggestions.test.ts`
Expected: FAIL (`pickWelcomeByDomains` não existe).

- [ ] **Step 3: Implementar**

Importar a fonte e o mapa no topo:

```typescript
import { TOOL_TO_QUESTION, TOOL_DOMAIN } from "./personalized-suggestions/templates";
import type { ReportDomain } from "@/generated/prisma/client";
```

Adicionar ordem de prioridade e a função:

```typescript
/** Prioridade de negocio para intercalar dominios no welcome. */
const DOMAIN_PRIORITY: ReportDomain[] = [
  "fiscal", "financeiro", "comercial", "estoque", "cadastros", "contabil", "crm",
];

/** Perguntas de um dominio, derivadas da fonte unica TOOL_TO_QUESTION. */
function questionsForDomain(domain: ReportDomain): string[] {
  return Object.entries(TOOL_TO_QUESTION)
    .filter(([toolId]) => TOOL_DOMAIN[toolId] === domain)
    .map(([, q]) => q);
}

/**
 * Sugestoes iniciais curadas pelos dominios permitidos do usuario. Intercala
 * (round-robin) entre os dominios na ordem de prioridade de negocio, dedup, e
 * cai no fallback por role quando nao ha pergunta elegivel (ex.: so crm).
 */
export function pickWelcomeByDomains(
  allowedDomains: ReportDomain[],
  role: PlatformRole | string | null | undefined,
  max: number,
): readonly string[] {
  const cap = Math.min(Math.max(1, max || 3), 5);
  const ordered = DOMAIN_PRIORITY.filter((d) => allowedDomains.includes(d));
  const buckets = ordered.map((d) => questionsForDomain(d)).filter((b) => b.length > 0);
  if (buckets.length === 0) return pickWelcomeByRole(role).slice(0, cap);

  const out: string[] = [];
  const seen = new Set<string>();
  let idx = 0;
  while (out.length < cap && buckets.some((b) => b.length > 0)) {
    const b = buckets[idx % buckets.length];
    const q = b.shift();
    if (q && !seen.has(q)) {
      seen.add(q);
      out.push(q);
    }
    idx++;
  }
  return out.length > 0 ? out : pickWelcomeByRole(role).slice(0, cap);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/welcome-suggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/welcome-suggestions.ts src/lib/agent/welcome-suggestions.test.ts
git commit -m "feat(agent): pickWelcomeByDomains , sugestoes por dominio permitido"
```

### Task B3: Filtro das personalizadas por domínio

**Files:**
- Modify: `src/lib/agent/personalized-suggestions/pick.ts`
- Test: `src/lib/agent/personalized-suggestions/pick.test.ts` (adicionar caso)

- [ ] **Step 1: Ler `pick.ts` e a assinatura de `pickPersonalizedQuestions`**

Run: `sed -n '1,80p' src/lib/agent/personalized-suggestions/pick.ts`
Expected: entender como tool ids viram perguntas (onde aplicar o filtro por `TOOL_DOMAIN`).

- [ ] **Step 2: Teste falhando**

Adicionar caso: dado uso que inclui tool `fiscal_faturamento_periodo`, com `allowedDomains` sem `fiscal`, a pergunta correspondente não aparece no resultado.

- [ ] **Step 3: Implementar filtro opcional**

Estender `pickPersonalizedQuestions` (ou um wrapper) para aceitar `allowedDomains?: ReportDomain[]` e descartar tool ids cujo `TOOL_DOMAIN[toolId]` não esteja na lista (quando a lista é fornecida). Propagar o parâmetro a partir de `getPersonalizedWelcomeSuggestions` (`index.ts`), que recebe `allowedDomains` do layout.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/agent/personalized-suggestions`
Expected: PASS (todos, incluindo `pick.test.ts` existente).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/personalized-suggestions
git commit -m "feat(agent): filtra sugestoes personalizadas por dominio da tool"
```

### Task B4: Integração no layout

**Files:**
- Modify: `src/app/(protected)/layout.tsx:28-97`

- [ ] **Step 1: Ler o bloco atual (28-97)**

Run: `sed -n '24,100p' src/app/(protected)/layout.tsx`
Expected: ver como `canUseAgent`, `welcomeSet` (âncora + personalizadas) e props são montados.

- [ ] **Step 2: Resolver allowedDomains uma vez e reusar**

Computar `allowedDomains: ReportDomain[]` (super_admin/admin = todos via `REPORT_DOMAINS`/`getMyDomains`, senão `getUserDomains(user.id)`), reaproveitando o que já é feito para `canUseAgent` (evitar query duplicada).

- [ ] **Step 3: Trocar âncora e propagar filtro**

- Âncora: `pickWelcomeByDomains(allowedDomains, user.platformRole, max)` no lugar de `pickWelcomeByRole(...)`.
- Personalizadas: passar `allowedDomains` para `getPersonalizedWelcomeSuggestions`.
- Manter a lógica de merge/dedup existente intacta.

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: zero erros.

- [ ] **Step 5: Commit**

```bash
git add src/app/(protected)/layout.tsx
git commit -m "feat(agent): layout cura sugestoes da bubble por dominios permitidos"
```

---

## Onda C , UI da bubble (depende da Onda A)

> ui-ux-pro-max obrigatório antes de tocar o menu/FAB. Mudanças visuais mínimas e coerentes com o design system atual (lucide-react, tokens de cor existentes).

### Task C1: Persistência , `initialConversationId` no FAB + layout

**Files:**
- Modify: `src/components/agent/agent-bubble.tsx:28-69`
- Modify: `src/app/(protected)/layout.tsx` (montagem do `<AgentBubble>`)

- [ ] **Step 1: Prop no FAB**

Em `AgentBubbleProps`, adicionar `initialConversationId?: string | null;`. No componente, inicializar o estado com ela:

```typescript
const [conversationId, setConversationId] = React.useState<string | null>(
  initialConversationId ?? null,
);
```

(Adicionar `initialConversationId = null` na desestruturação de props.)

- [ ] **Step 2: Layout resolve e passa**

No `(protected)/layout.tsx`, antes de renderizar `<AgentBubble>`, chamar `getActiveConversationId()` e passar:

```tsx
const active = await getActiveConversationId();
// ...
<AgentBubble
  /* ...props atuais... */
  initialConversationId={active.ok ? active.conversationId : null}
/>
```

- [ ] **Step 3: Verificar tipos + lint**

Run: `npx tsc --noEmit && npx eslint src/components/agent/agent-bubble.tsx "src/app/(protected)/layout.tsx"`
Expected: zero erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/agent/agent-bubble.tsx "src/app/(protected)/layout.tsx"
git commit -m "feat(agent): bubble restaura conversa ativa no boot (initialConversationId)"
```

### Task C2: Menu consolidado (remove Limpar histórico, Baixar conversa, Limpar sessão)

**Files:**
- Modify: `src/components/agent/chat-panel.tsx:634-639,727-795`

- [ ] **Step 1: Consultar ui-ux-pro-max**

Confirmar ícone (`Trash2` para Limpar sessão), ordem, estados hover/focus e acessibilidade (`role="menuitem"`), mantendo o padrão visual atual do dropdown.

- [ ] **Step 2: Importar a action**

Adicionar import: `import { archiveActiveConversation } from "@/lib/actions/active-conversation";`

- [ ] **Step 3: Handler "Limpar sessão"**

Adicionar (reusa a limpeza de `handleClear`):

```typescript
const handleClearSession = React.useCallback(async () => {
  setMenuOpen(false);
  const cid = conversationIdRef.current;
  if (cid) {
    await archiveActiveConversation(cid);
  }
  abortRef.current?.abort();
  setMessages([]);
  conversationIdRef.current = null;
  onEndSession?.();
}, [onEndSession]);
```

- [ ] **Step 4: Reescrever o dropdown (727-795)**

- Remover o `<button>` "Limpar histórico" (`Trash2` + `handleClear`).
- Manter o item super_admin de export, trocando o rótulo para `Baixar conversa (.txt)` (texto apenas; lógica e `Download` inalterados). Sem o item anterior acima, remover a borda `border-t` do primeiro item visível para não deixar borda solta.
- Trocar o item "Encerrar sessão" por "Limpar sessão": ícone `Trash2`, `onClick={handleClearSession}`, visível sempre que `onEndSession` existir.

Resultado: menu com no máximo 2 itens , `Baixar conversa (.txt)` (super_admin) e `Limpar sessão` (todos).

- [ ] **Step 5: Remover `handleClear` se ficou órfão**

Se `handleClear` não for mais referenciado em nenhum lugar após a remoção do "Limpar histórico", removê-lo. Conferir:

Run: `grep -n "handleClear" src/components/agent/chat-panel.tsx`
Expected: nenhuma referência remanescente (ou ajustar se ainda usado).

- [ ] **Step 6: Limpar imports órfãos**

Conferir se `LogOut` ainda é usado; se não, remover do import de `lucide-react`. Manter `Download` e `Trash2`.

Run: `npx tsc --noEmit && npx eslint src/components/agent/chat-panel.tsx`
Expected: zero erros (sem unused).

- [ ] **Step 7: Commit**

```bash
git add src/components/agent/chat-panel.tsx
git commit -m "feat(agent): menu da bubble , Baixar conversa + Limpar sessao (remove Limpar historico)"
```

---

## Verificação final (Onda D)

- [ ] **Suite + tipos + lint**

Run: `npx tsc --noEmit && npx eslint . && npx jest`
Expected: tudo verde.

- [ ] **Rebuild dev (schema mudou , todos os containers)**

Conforme CLAUDE.md §2.1 (armadilha do worker): `docker compose build app && docker compose up -d --force-recreate app worker && docker compose up -d --build mcp`.

- [ ] **E2E manual (regra de raiz):** 4 perfis (super_admin; viewer só estoque; viewer só financeiro/fiscal; manager):
  - sugestões coerentes com o domínio de cada um (viewer-estoque só vê perguntas de estoque; viewer-fiscal vê faturamento);
  - enviar mensagem, fechar (X) e reabrir → histórico presente;
  - logout e login → ao abrir a bubble, histórico presente;
  - "Limpar sessão" → arquiva (conferir `ended_at` no banco), zera UI, volta ao welcome; nova mensagem cria conversa nova; tentar reusar a conversa arquivada (stream) → 403;
  - "Baixar conversa (.txt)" aparece só para super_admin e baixa o arquivo.

- [ ] **Code review + UI review** (`/gsd-code-review` + `/gsd-ui-review`).

- [ ] **HISTORY:** registrar as ondas em `docs/agents/HISTORY.md`.
