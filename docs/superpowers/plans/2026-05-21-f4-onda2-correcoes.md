# F4 Onda 2 — Correções (UI rework + conceito Plugar MCPs) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar este plano
> task-a-task **na sessão principal, inline, Opus 4.7, sem subagentes** (CLAUDE.md §6[8]).
> UI exige `ui-ux-pro-max`. Steps usam checkbox (`- [ ]`).

**Goal:** Corrigir integralmente a entrega da F4 Onda 2 reprovada pelo usuário — refazer toda a UI do
painel "Servidor MCP", corrigir o conceito errado de "Plugar MCPs", refazer a documentação no padrão
visual do NFE Nexus, e consertar o falso "MCP inacessível".

**Architecture:** O painel `Integrações → Servidor MCP` tem 4 abas (Visão Geral / Chaves / Logs /
Documentação), hoje 4 rotas separadas com `<Tabs>` duplicado. A correção introduz uma sub-nav
compartilhada (`ServidorMcpNav`) com aba ativa derivada de `usePathname()`. Cada componente de
conteúdo é reescrito seguindo o padrão canônico da plataforma (`webhooks-content.tsx` /
`api-keys-content.tsx`): `space-y-6 max-w-3xl`, cards `rounded-xl border bg-card p-5`, títulos
`text-sm font-semibold`, texto auxiliar `text-xs text-muted-foreground`, escala tipográfica
`12/14/16/20`, acento violeta, ícones Lucide, forms inline colapsáveis. "Plugar MCPs" passa a ser
um **registro de servidores MCP externos** que o Agente Nex consome (model `ExternalMcpServer` +
Server Actions CRUD + UI), removendo a tela errada que expunha o nosso endpoint + token + n8n.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Tailwind v4, base-ui, Prisma v7,
lucide-react, sonner. Sem dependências novas.

**Fora de escopo (decisão consciente):** o teste E2E de escrita real contra
`grupojht.teste.tauga.online` (Task 16) fica **gated** — o usuário não tem as credenciais agora;
a task documenta o estado pendente sem bloquear o resto. O *runtime* de consumo dos MCPs externos
pelo loop do Agente Nex é F5 — esta correção entrega o **registro** (model + CRUD + UI) com o
conceito correto, não a execução.

---

## File Structure

**Criar:**
- `src/components/integracoes/servidor-mcp/servidor-mcp-nav.tsx` — sub-nav compartilhada (client, `usePathname`).
- `src/lib/actions/external-mcp-servers.ts` — Server Actions CRUD de MCPs externos.
- `src/lib/actions/external-mcp-servers-types.ts` — tipos compartilhados.
- `prisma/migrations/<timestamp>_external_mcp_servers/migration.sql` — gerada pelo Prisma.

**Modificar:**
- `prisma/schema.prisma` — model `ExternalMcpServer`.
- `src/app/(protected)/integracoes/servidor-mcp/page.tsx` + `chaves/page.tsx` + `logs/page.tsx` + `docs/page.tsx` — trocar `<Tabs>` por `<ServidorMcpNav>`.
- `src/components/integracoes/servidor-mcp/visao-geral.tsx` — reescrever.
- `src/components/integracoes/servidor-mcp/chaves-lista.tsx` — reescrever form de criação.
- `src/components/integracoes/servidor-mcp/logs-timeline.tsx` — reescrever apresentação.
- `src/components/integracoes/servidor-mcp/docs-layout.tsx` + `docs-catalog.tsx` + `docs-renderer.tsx` — reescrever no padrão NFE.
- `src/components/agent/plugar-mcps-content.tsx` — reescrever (conceito correto).
- `src/app/(protected)/agente/plugar-mcps/page.tsx` — buscar MCPs externos e passar ao componente.
- `STATUS.md` + `docs/HANDOFF-2026-05-21-f4-onda2-correcoes.md` — registrar conclusão.

---

## Design Contract (vale para todas as tasks de UI)

Referência canônica: `src/components/integracoes/webhooks-content.tsx` e `api-keys-content.tsx`.
Toda task de UI **deve** respeitar:

- **Container:** `space-y-6 max-w-3xl` (conteúdo de painel) — docs usa largura maior (ver Task 11).
- **Cards/blocos:** `rounded-xl border border-border bg-card p-5` (ou `bg-muted/30` para sub-blocos).
- **Tipografia:** título de seção `text-sm font-semibold`; corpo `text-sm`; auxiliar `text-xs text-muted-foreground`; metadados `text-[11px]`. **Proibido** `text-lg`/`text-xl`/`text-2xl` dentro do conteúdo (o `text-xl` é exclusivo do `PageHeader`). KPIs numéricos: no máximo `text-base font-semibold`.
- **Espaçamento:** rítmo 4/8px (`gap-2`, `gap-3`, `space-y-3`, `space-y-6`).
- **Ícones:** Lucide, `h-4 w-4` (padrão) ou `h-3.5 w-3.5` (inline em botão/badge). Acento violeta (`text-violet-500`, `bg-violet-500/10`).
- **Forms:** inline colapsável (padrão webhooks), nunca modal denso com scroll. Diálogo só para confirmação destrutiva.
- **Estados:** `loading` com `Loader2 animate-spin`; vazio com mensagem + ação; erro via `toast.error`.
- **A11y:** `aria-label` em botão icon-only; alvo de toque ≥ 36px de altura (`h-9`); foco visível.

Ao final de cada task de UI, rodar a checklist "Visual Quality / Interaction / Light-Dark" da skill `ui-ux-pro-max`.

---

## Task 1: Sub-nav compartilhada `ServidorMcpNav`

**Files:**
- Create: `src/components/integracoes/servidor-mcp/servidor-mcp-nav.tsx`

Problema: hoje cada uma das 4 rotas tem seu próprio `<Tabs>` com a lista duplicada; o usuário "não
sabe em qual aba está". Solução: um componente único, aba ativa derivada de `usePathname()`.

- [ ] **Step 1: Criar o componente**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Visão Geral", href: "/integracoes/servidor-mcp" },
  { label: "Chaves de Acesso", href: "/integracoes/servidor-mcp/chaves" },
  { label: "Logs", href: "/integracoes/servidor-mcp/logs" },
  { label: "Documentação", href: "/integracoes/servidor-mcp/docs" },
] as const;

/**
 * Sub-navegação do painel Servidor MCP. Aba ativa derivada do pathname —
 * fonte única, sem `<Tabs>` duplicado por rota.
 */
export function ServidorMcpNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções do Servidor MCP"
      className="mt-6 inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/integracoes/servidor-mcp"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/components/integracoes/servidor-mcp/servidor-mcp-nav.tsx
git commit -m "feat(f4-onda2-fix): sub-nav compartilhada do painel Servidor MCP"
```

---

## Task 2: Aplicar `ServidorMcpNav` nas 4 rotas

**Files:**
- Modify: `src/app/(protected)/integracoes/servidor-mcp/page.tsx`
- Modify: `src/app/(protected)/integracoes/servidor-mcp/chaves/page.tsx`
- Modify: `src/app/(protected)/integracoes/servidor-mcp/logs/page.tsx`
- Modify: `src/app/(protected)/integracoes/servidor-mcp/docs/page.tsx`

- [ ] **Step 1:** Em cada uma das 4 páginas, remover os imports `Tabs, TabsList, TabsTrigger, TabsContent` e `Link` (quando só servia às abas), remover o bloco `<Tabs>...</Tabs>` inteiro, e substituir por:

```tsx
import { ServidorMcpNav } from "@/components/integracoes/servidor-mcp/servidor-mcp-nav";
// ...
<ServidorMcpNav />
<div className="mt-6">
  {/* conteúdo da aba: <McpVisaoGeral .../>, <ChavesLista .../>, <LogsTimeline .../>, <McpDocsLayout .../> */}
</div>
```

Manter `PageShell`, `Breadcrumb`, `PageHeader` e os fetches server-side intactos. O `PageHeader`
de todas as 4 rotas mantém `title="Servidor MCP"` e o mesmo `subtitle`; só o `icon` varia.

- [ ] **Step 2: Verificar build e tipos**

Run: `npx tsc --noEmit && npx next build 2>&1 | tail -5`
Expected: build OK, sem erro.

- [ ] **Step 3: Verificação visual**

Run: `npm run dev` e abrir as 4 rotas. Confirmar: aba ativa destacada (fundo claro + sombra),
inativas em `muted-foreground`, navegação funciona, sem erro de console.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/integracoes/servidor-mcp"
git commit -m "feat(f4-onda2-fix): rotas do painel usam sub-nav compartilhada, fim do Tabs duplicado"
```

---

## Task 3: Reescrever `visao-geral.tsx`

**Files:**
- Modify (reescrever): `src/components/integracoes/servidor-mcp/visao-geral.tsx`

Problema (usuário): "não entendi nada o que tem aquela tela de visão geral", "top 5 métricas"
confuso, fontes fora do padrão. A tela atual empilha 2 `Card`s com `CardHeader/CardTitle`
`text-base`, KPIs `text-lg`, badges informativos densos e "Top 5 tools".

Decisão de design: a Visão Geral responde **três perguntas** em linguagem clara, nesta ordem:
1. *O servidor está no ar?* — bloco de status (saudável/degradado/indisponível) + URL pública copiável.
2. *Está sendo usado?* — 3 números das últimas 24h: chamadas, taxa de erro, latência típica (p50). Sem p99, sem badges de transport/protocolo (vão para a Documentação).
3. *O que mais é chamado?* — lista enxuta das tools mais usadas (renomear "Top 5 tools" → "Tools mais usadas"), só se houver dados; senão, estado vazio explicativo.

- [ ] **Step 1:** Reescrever o componente. **Mudança de assinatura:** a nova tela não usa
`versionInfo` (transport/protocolo/versão/commit saem da Visão Geral) — remover `versionInfo` da
`Props`, mantendo só `mcpPublicUrl`, `healthStatus`, `metrics`. **Atualizar também a chamada
`<McpVisaoGeral .../>` em `page.tsx`** removendo a prop `versionInfo` (e o helper `getMcpVersion`
fica sem uso → removê-lo de `page.tsx` para não gerar warning de lint). Estrutura:
  - Wrapper `div.space-y-6.max-w-3xl`.
  - **Bloco status:** `rounded-xl border bg-card p-5`. Linha com ícone de estado (`h-9 w-9` rounded-lg colorido), título `text-sm font-semibold` ("Servidor no ar" / "Servidor degradado" / "Servidor indisponível"), frase `text-xs text-muted-foreground` explicando. Abaixo, label `text-xs font-medium text-muted-foreground` "Endpoint público" + `code` + botão copiar (padrão de `api-keys-content` banner).
  - **Bloco uso 24h:** `rounded-xl border bg-card p-5`. Título `text-sm font-semibold` "Uso nas últimas 24 horas". Grid `grid-cols-3 gap-3` com 3 itens: cada um `rounded-lg border bg-muted/30 px-3 py-2.5`, label `text-[11px] text-muted-foreground`, valor `text-base font-semibold font-mono` (tabular). Itens: "Chamadas", "Taxa de erro" (âmbar se >10%), "Latência típica" (p50, sufixo "ms"). Se `metrics` for `null` ou `totalCalls === 0`, mostrar só uma linha `text-sm text-muted-foreground` "Nenhuma chamada registrada nas últimas 24 horas."
  - **Bloco tools mais usadas:** só renderizar se `metrics?.topTools.length`. Título `text-sm font-semibold` "Tools mais usadas". Lista `space-y-1.5`, cada linha `rounded-lg border bg-muted/30 px-3 py-2` com `code text-xs` (nome) à esquerda e contagem `text-xs text-muted-foreground` à direita; badge de erro só se `errors>0`.
  - Remover os `InfoBadge` de Transport/Protocolo/Versão/Commit desta tela.

- [ ] **Step 2:** `npx tsc --noEmit` → sem erro.
- [ ] **Step 3:** `npm run dev`, abrir `/integracoes/servidor-mcp` → conferir tipografia uniforme (nada maior que `text-base` no conteúdo), 3 blocos claros, sem jargão.
- [ ] **Step 4: Commit**

```bash
git add src/components/integracoes/servidor-mcp/visao-geral.tsx
git commit -m "feat(f4-onda2-fix): reescreve Visão Geral do MCP — 3 blocos claros, tipografia padrão"
```

---

## Task 4: Reescrever o form de criação em `chaves-lista.tsx`

**Files:**
- Modify (reescrever): `src/components/integracoes/servidor-mcp/chaves-lista.tsx`

Problema (usuário + screenshot): o modal "Nova chave de acesso MCP" está cortado, campos largos
demais, a matriz de capabilities (crm/vendas/estoque… × Leitura/Create/Update/Delete/Transition)
extrapola a largura, scroll desconfortável — "horrível, uma desgraça".

Decisão de design: trocar o **modal** por um **form inline colapsável** (padrão webhooks/api-keys),
dentro do fluxo da página, com largura `max-w-3xl` (sem scroll horizontal). A matriz de
capabilities vira uma grade legível por módulo.

- [ ] **Step 1:** Ler a estrutura atual (`chaves-lista.tsx`, 36 KB) e os tipos
(`src/lib/actions/mcp-api-keys-types.ts`) para conhecer `McpCapabilities`, `McpModule`,
`SENSITIVE_ACTIONS` e a assinatura de `createMcpApiKey`. **Não** alterar as Server Actions —
só a UI.

- [ ] **Step 2:** Reescrever a lista mantendo: banner de token revelado (idêntico ao de
`api-keys-content.tsx` — `border-amber-500/40 bg-amber-500/5`, copiar/ocultar/fechar), cabeçalho
com contagem + botão "Nova chave", e as linhas de chave (`ChavesRow`) no padrão `ApiKeyRow`
(ícone `Key`, label `text-sm font-semibold`, `••••last4`, badges de capability, datas `text-[11px]`,
ação revogar destrutiva).

- [ ] **Step 3:** Substituir o modal por form inline `rounded-xl border bg-card p-5 space-y-4`,
exibido ao clicar "Nova chave". Campos, na ordem:
  - **Rótulo** (`Input`, required) + helper `text-xs`.
  - **Descrição** (`Input` ou `textarea` curto, opcional).
  - **Tenant ID** (`Input`, opcional) + helper.
  - **Rate limit** (`Input type="number"`, default 60) + helper "chamadas por minuto".
  - **Capabilities** — grade por módulo: para cada `McpModule`, uma linha `flex items-center` com
    o nome do módulo (`text-sm font-mono`, largura fixa `w-28`) e à direita um grupo de toggles
    compactos (`Switch` ou checkbox `h-4 w-4`) para `read` + cada ação de escrita. Ações sensíveis
    (`SENSITIVE_ACTIONS`) marcadas com `text-amber-600` e um ícone `AlertTriangle h-3 w-3`.
    O grupo inteiro rola só verticalmente; cada linha cabe em `max-w-3xl` sem corte. Acima da
    grade, helper `text-xs` "Marque os módulos e ações que esta chave pode executar."
  - **Expiração** (`Input type="date"`, opcional).
  - Botões "Criar chave" (`disabled` sem rótulo) + "Cancelar".
  - O state monta o objeto `McpCapabilities` (`{ version: 1, read: string[], write: Record<...> }`)
    e chama `createMcpApiKey`.

- [ ] **Step 4:** `npx tsc --noEmit` → sem erro.
- [ ] **Step 5:** `npm run dev` → criar uma chave de teste: form abre inline, todos os módulos
visíveis sem scroll horizontal, token revelado uma vez, chave aparece na lista. Revogar a chave de teste.
- [ ] **Step 6: Commit**

```bash
git add src/components/integracoes/servidor-mcp/chaves-lista.tsx
git commit -m "feat(f4-onda2-fix): form de criação de chave MCP inline, matriz de capabilities legível"
```

---

## Task 5: Reescrever `logs-timeline.tsx`

**Files:**
- Modify (reescrever): `src/components/integracoes/servidor-mcp/logs-timeline.tsx`

Problema (usuário + screenshot): "não dá pra entender porra nenhuma"; ao clicar abre um modal
quase vazio (`Payload/Params {}`); fora do padrão de fonte.

Decisão de design: manter a tabela de logs (válida no escopo), porém legível, e trocar o **modal**
por um **painel de detalhe expansível inline** (linha que abre abaixo de si). Manter a barra de
busca/filtros/CSV existente.

- [ ] **Step 1:** Ler a estrutura atual (`logs-timeline.tsx`, 24 KB) — tipos das linhas de audit,
ações de query/filtro/export e paginação. **Não** alterar `queryAuditLogs` nem o endpoint de export.

- [ ] **Step 2:** Reescrever a apresentação:
  - Barra de filtros: manter, ajustar para `text-sm`, alturas `h-9`, espaçamento `gap-2`.
  - Contagem total `text-xs text-muted-foreground`.
  - Tabela: cabeçalho `text-[11px] uppercase tracking-wide text-muted-foreground`; células `text-sm`;
    timestamp `text-xs` em uma só linha (`Intl.DateTimeFormat pt-BR`, formato `dd/MM HH:mm:ss`);
    nome da tool em `code text-xs`; status como badge (`success` esmeralda, `error`/`denied`
    vermelho); duração `text-xs font-mono`; capability `text-xs`.
  - Linha clicável: ao clicar, **expande inline** uma região `bg-muted/30 rounded-lg p-4` abaixo da
    linha (não modal) com: status, duração, timestamp, requestId, idempotencyKey, e o payload/params
    e o resultado em `<pre className="text-xs font-mono overflow-x-auto">`. Quando o payload é `{}`,
    mostrar texto `text-xs text-muted-foreground` "Sem parâmetros." em vez de `{}` cru.
  - Estado vazio: mensagem `text-sm text-muted-foreground` + sugestão.

- [ ] **Step 3:** `npx tsc --noEmit` → sem erro.
- [ ] **Step 4:** `npm run dev`, abrir `/integracoes/servidor-mcp/logs` → tabela legível, expandir
uma linha mostra detalhe inline claro, sem modal, tipografia uniforme.
- [ ] **Step 5: Commit**

```bash
git add src/components/integracoes/servidor-mcp/logs-timeline.tsx
git commit -m "feat(f4-onda2-fix): logs MCP legíveis, detalhe inline expansível no lugar do modal"
```

---

## Task 6: Corrigir o falso "MCP inacessível" (health check)

**Files:**
- Modify: `src/app/(protected)/integracoes/servidor-mcp/page.tsx`
- (investigar) `src/app/(protected)/api/mcp/health/route.ts` ou equivalente

Problema (usuário): a tela reporta "MCP inacessível" mesmo com tudo configurado. Causa provável:
`page.tsx` faz `pingMcp(process.env.MCP_URL)` apontando para um **container `mcp` separado** que
não roda em dev/local; mas o endpoint real de escrita da Onda 2 é **in-app**, `/api/mcp` (e o
health é `GET /api/mcp/health`, Bloco I).

- [ ] **Step 1:** Confirmar o caminho do endpoint de health in-app:
  `grep -rl "mcp.*health" src/app/(protected)/api src/app/api 2>/dev/null` e ler o route handler.
- [ ] **Step 2:** Alterar `pingMcp` em `page.tsx` para usar a URL in-app
  (`/api/mcp/health`). Montar a URL absoluta a partir dos headers da request:
  `const h = await headers();` (em Next 16 `headers()` é assíncrono) → `const host = h.get("host")`,
  `const proto = h.get("x-forwarded-proto") ?? "http"`. URL = `${proto}://${host}/api/mcp/health`.
  O objetivo: em dev, com o `app` rodando, o health **deve** retornar `healthy`. (`getMcpVersion`
  já terá sido removido na Task 3.)
- [ ] **Step 3:** `npm run dev`, abrir `/integracoes/servidor-mcp` → status "Servidor no ar".
- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/integracoes/servidor-mcp/page.tsx"
git commit -m "fix(f4-onda2-fix): health check aponta para /api/mcp/health in-app, fim do falso inacessível"
```

---

## Task 7: Model `ExternalMcpServer` no schema Prisma

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_external_mcp_servers/migration.sql` (via Prisma)

Suporta o conceito correto de "Plugar MCPs": registro de servidores MCP **externos** que o Agente
Nex pode consumir.

- [ ] **Step 1:** Adicionar ao `schema.prisma`, após `model AppSetting`:

```prisma
/// Servidor MCP externo registrado para o Agente Nex consumir (cliente de MCPs de terceiros).
model ExternalMcpServer {
  id          String   @id @default(uuid())
  name        String   // rótulo amigável, ex.: "Slack", "GitHub"
  description String?  // o que este MCP agrega ao agente
  transport   String   @default("http") // "http" (Streamable HTTP) | "sse"
  url         String   // endpoint do MCP externo
  authHeader  String?  // nome do header de auth, ex.: "Authorization"
  authToken   String?  // token/secret — armazenado cifrado (AES-256), ver Step 3
  enabled     Boolean  @default(true)
  lastStatus  String   @default("unknown") // "ok" | "error" | "unknown"
  lastCheckAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([enabled])
}
```

- [ ] **Step 2:** Gerar a migration:

Run: `npx prisma migrate dev --name external_mcp_servers`
Expected: migration criada e aplicada no DB local; `prisma generate` roda.

- [ ] **Step 3:** Confirmar o util de criptografia **reversível** (o `authToken` precisa ser
decifrado para ser enviado ao MCP externo — portanto cifra AES-256, não hash). `grep -rnE
"encrypt|decrypt|createCipheriv" src/lib`. Se já existir um par `encrypt/decrypt`, usar.
**Se não existir** (o `src/lib/crypto.ts` conhecido só tem `sha256hex`, que é hash): criar
`src/lib/secret-box.ts` com `encryptSecret(plain: string): string` e `decryptSecret(enc: string):
string` usando `crypto.createCipheriv("aes-256-gcm", key, iv)` — a chave vem de
`process.env.ENCRYPTION_KEY` (32 bytes; conferir se já está no `.env.example`, senão adicionar).
Formato persistido: `iv:authTag:ciphertext` em base64. Este helper é pré-requisito da Task 8.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(f4-onda2-fix): model ExternalMcpServer — registro de MCPs externos do Agente Nex"
```

---

## Task 8: Server Actions CRUD de MCPs externos

**Files:**
- Create: `src/lib/actions/external-mcp-servers-types.ts`
- Create: `src/lib/actions/external-mcp-servers.ts`

- [ ] **Step 1:** Criar `external-mcp-servers-types.ts`:

```ts
export interface ExternalMcpServerListItem {
  id: string;
  name: string;
  description: string | null;
  transport: string;
  url: string;
  hasAuth: boolean;        // true se authToken configurado — token nunca sai do servidor
  authHeader: string | null;
  enabled: boolean;
  lastStatus: "ok" | "error" | "unknown";
  lastCheckAt: Date | null;
  createdAt: Date;
}

export type DataResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

- [ ] **Step 2:** Criar `external-mcp-servers.ts` com `"use server"`, gate `requireSuperAdmin`,
validação Zod, `revalidatePath("/agente/plugar-mcps")`, `logAudit`, e o `authToken` cifrado via o
util AES-256 do projeto. Funções:
  - `listExternalMcpServers(): Promise<DataResult<ExternalMcpServerListItem[]>>` — mapeia `hasAuth = !!authToken`, nunca devolve o token.
  - `createExternalMcpServer(input: { name; description?; transport; url; authHeader?; authToken? }): Promise<DataResult<ExternalMcpServerListItem>>` — Zod: `name` 1–100, `url` `.url()`, `transport` enum `["http","sse"]`.
  - `updateExternalMcpServer(id, input): Promise<DataResult<ExternalMcpServerListItem>>` — `authToken` ausente = mantém; string vazia = limpa.
  - `toggleExternalMcpServer(id, enabled): Promise<DataResult<ExternalMcpServerListItem>>`.
  - `deleteExternalMcpServer(id): Promise<DataResult<{ id: string }>>`.
  - `testExternalMcpServer(id): Promise<DataResult<{ status: "ok" | "error"; message: string }>>` — faz um GET/handshake no `url` com timeout 5s, decifra o token p/ o header, grava `lastStatus`/`lastCheckAt`.

  Seguir o padrão de `src/lib/actions/mcp-api-keys.ts` (estrutura `DataResult`, `requireSuperAdmin`,
  schemas Zod no topo).

- [ ] **Step 3:** `npx tsc --noEmit` → sem erro.
- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/external-mcp-servers.ts src/lib/actions/external-mcp-servers-types.ts
git commit -m "feat(f4-onda2-fix): Server Actions CRUD de MCPs externos do Agente Nex"
```

---

## Task 9: Reescrever `plugar-mcps-content.tsx` (conceito correto)

**Files:**
- Modify (reescrever do zero): `src/components/agent/plugar-mcps-content.tsx`

Problema (usuário): a tela atual mostra **o nosso** endpoint MCP + `MCP_SERVICE_TOKEN` + instruções
de n8n — conceito invertido. O correto (brainstorm 2026-05-20): "Plugar MCPs" é onde o usuário
**registra MCPs externos** (Slack, GitHub, etc.) para **agregar capacidades ao Agente Nex**. O Nex
como *cliente* de MCPs de terceiros. Nada de n8n, nada do nosso endpoint, nada de `MCP_SERVICE_TOKEN`.

- [ ] **Step 1:** Nova `Props`: `{ initial: ExternalMcpServerListItem[] }`. Remover `mcpUrl`,
`maskedToken`, `healthStatus` e tudo de n8n/token de serviço.

- [ ] **Step 2:** Implementar no padrão `webhooks-content.tsx`:
  - Wrapper `space-y-6 max-w-3xl`.
  - Texto introdutório curto `text-sm text-muted-foreground`: explica que aqui se conectam
    servidores MCP externos para o Agente Nex usar como ferramentas. Uma linha `text-xs`
    apontando que, para expor **o nosso** MCP a terceiros, o caminho é
    `Integrações → Servidor MCP → Chaves de Acesso` (resolve a confusão do usuário sobre "onde crio o token").
  - Cabeçalho: contagem (`N servidores conectados` / `Nenhum servidor conectado`) + botão "Conectar MCP".
  - Form inline colapsável `rounded-xl border bg-card p-5`: campos **Nome**, **Descrição** (opcional),
    **Transporte** (`CustomSelect`: Streamable HTTP / SSE), **URL**, **Header de auth** (opcional,
    placeholder `Authorization`), **Token** (opcional, `type="password"` com toggle). Botões Criar/Cancelar.
  - Lista: cada servidor em card padrão `ApiKeyRow`/`WebhookRow` — ícone `Plug`/`Boxes` violeta,
    nome `text-sm font-semibold`, badge de status (`ok` esmeralda / `error` vermelho / `unknown`
    cinza), URL `text-xs font-mono truncate`, descrição `text-xs text-muted-foreground`, data
    `text-[11px]`. Ações: `Switch` enabled, botão "Testar conexão" (chama `testExternalMcpServer`,
    toast com resultado), botão "Remover" destrutivo.
  - Estado vazio: card `border-dashed` com ícone, frase "Nenhum servidor MCP conectado" e dica.

- [ ] **Step 3:** `npx tsc --noEmit` → sem erro.
- [ ] **Step 4: Commit**

```bash
git add src/components/agent/plugar-mcps-content.tsx
git commit -m "feat(f4-onda2-fix): Plugar MCPs com conceito correto — registro de MCPs externos do Nex"
```

---

## Task 10: Atualizar a rota `plugar-mcps/page.tsx`

**Files:**
- Modify: `src/app/(protected)/agente/plugar-mcps/page.tsx`

- [ ] **Step 1:** Trocar o cálculo de `mcpUrl`/`maskedToken`/`healthStatus` por
`const result = await listExternalMcpServers();` e passar `initial={result.success ? result.data : []}`
ao `<PlugarMcpsContent>`. Manter `PageShell`, `PageHeader` (ícone, título "Plugar MCPs", subtítulo
reescrito: "Conecte servidores MCP externos para ampliar as capacidades do Agente Nex"), gate
super_admin.
- [ ] **Step 2:** `npx tsc --noEmit && npx next build 2>&1 | tail -5` → OK.
- [ ] **Step 3:** `npm run dev`, abrir `/agente/plugar-mcps` → conectar um MCP de teste, testar
conexão, remover. Sem menção a n8n nem a `MCP_SERVICE_TOKEN`.
- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/agente/plugar-mcps/page.tsx"
git commit -m "feat(f4-onda2-fix): rota Plugar MCPs serve registro de MCPs externos"
```

---

## Task 11: Reescrever a documentação no padrão NFE Nexus

**Files:**
- Modify (reescrever): `src/components/integracoes/servidor-mcp/docs-layout.tsx`
- Modify (reescrever): `src/components/integracoes/servidor-mcp/docs-renderer.tsx`
- Modify (reescrever): `src/components/integracoes/servidor-mcp/docs-catalog.tsx`

Problema (usuário): a documentação "ficou uma verdadeira merda", "sem exemplo", feia. Referência
aprovada: a página de API do NFE Nexus (`~/Developer/Claude Code/Nexus AI/Projetos Internos/
nexus-nfe/src/app/(protected)/api-docs/api-docs-content.tsx`) — sidebar de seções, header com
título + URL base, blocos de conteúdo com cards de conceito, exemplos de request/response lado a
lado, badges de método. O **conteúdo** em `src/content/mcp-docs/*.ts` já tem exemplos e está bom —
o problema é a **apresentação**.

Decomposta em 4 subtasks (decomposição máxima — CLAUDE.md §6[7]):

### Task 11a — Estudar a referência NFE + reescrever `docs-renderer.tsx`

- [ ] **Step 1:** Ler `nexus-nfe/src/app/(protected)/api-docs/api-docs-content.tsx` para extrair
os padrões: header, `SectionBlock`, blocos de código, cards de conceito, badges de método.
- [ ] **Step 2:** `grep -n react-markdown package.json` — decidir o renderer. Se `react-markdown`
existe, usar; senão **manter o parser atual do `docs-renderer.tsx`** (não regredir funcionalidade)
e só reestilizar.
- [ ] **Step 3:** Reescrever `docs-renderer.tsx` (estilo): `h1/h2/h3` escala `16/14/13` peso 600;
parágrafos/listas `text-sm`; blocos de código `rounded-lg border bg-muted/50 p-3 text-xs font-mono
overflow-x-auto` com rótulo de linguagem + botão copiar; inline code `bg-muted rounded px-1 text-xs`;
blockquote como callout `border-l-2 border-violet-500/40 bg-violet-500/5 p-3`.
- [ ] **Step 4:** `npx tsc --noEmit` → OK. Commit:
`git commit -m "feat(f4-onda2-fix): docs-renderer do MCP reestilizado no padrão NFE"`

### Task 11b — Reescrever `docs-layout.tsx`

- [ ] **Step 1:** Layout de 2 colunas — sidebar `w-52 shrink-0` (lista de seções + busca, item
ativo destacado) e área de conteúdo `max-w-2xl` para texto. Cabeçalho: título da seção
`text-base font-semibold`, descrição `text-sm text-muted-foreground`. Tipografia uniforme.
- [ ] **Step 2:** `npx tsc --noEmit && npx next build 2>&1 | tail -5` → OK. Commit:
`git commit -m "feat(f4-onda2-fix): docs-layout do MCP com sidebar e leitura confortável"`

### Task 11c — Reescrever `docs-catalog.tsx`

- [ ] **Step 1:** Catálogo de tools por módulo no padrão NFE de endpoints: cada tool é uma linha
expansível com badge de tipo (read = esmeralda / write = violeta), nome em `code`, descrição
curta; ao expandir mostra o schema de argumentos. Tipografia uniforme.
- [ ] **Step 2:** `npx tsc --noEmit` → OK. Commit:
`git commit -m "feat(f4-onda2-fix): docs-catalog do MCP com tools expansíveis estilo NFE"`

### Task 11d — Enriquecer o conteúdo das seções

- [ ] **Step 1:** Revisar `src/content/mcp-docs/*.ts`; garantir que cada seção tem ao menos um
exemplo de request **e** response (`quickstart.ts` já tem; replicar o nível em `permissoes.ts`,
`idempotencia.ts`, `rate-limits.ts`, `external-id.ts`, `autenticacao.ts`). Não criar seções novas.
- [ ] **Step 2:** `npx next build 2>&1 | tail -5` → OK. `npm run dev` → abrir
`/integracoes/servidor-mcp/docs`, navegar seções, conferir código copiável e exemplos. Commit:
`git commit -m "feat(f4-onda2-fix): exemplos de request/response nas seções de docs do MCP"`

---

## Task 12: Auditoria de consistência tipográfica do painel

**Files:**
- Review: todos os arquivos de `src/components/integracoes/servidor-mcp/` e `src/components/agent/plugar-mcps-content.tsx`.

- [ ] **Step 1:** `grep -rnE "text-(lg|xl|2xl|3xl)" src/components/integracoes/servidor-mcp src/components/agent/plugar-mcps-content.tsx` — não deve haver nenhuma ocorrência dentro de conteúdo (o `text-xl` do `PageHeader` é em `src/components/page-header.tsx`, fora deste escopo). Corrigir qualquer remanescente para a escala do Design Contract.
- [ ] **Step 2:** `grep -rn "emoji\|🚀\|⚙️\|📊" ...` — garantir zero emoji como ícone.
- [ ] **Step 3:** Aplicar a checklist "Visual Quality / Interaction / Light-Dark" da skill `ui-ux-pro-max` a cada componente reescrito.
- [ ] **Step 4: Commit** (se houver correção)

```bash
git add -A && git commit -m "fix(f4-onda2-fix): auditoria de consistência tipográfica do painel MCP"
```

---

## Task 13: Verificação — tsc + eslint + jest + build

- [ ] **Step 1:** `npx tsc --noEmit` → sem erro.
- [ ] **Step 2:** `npx eslint src/ 2>&1 | tail -20` → sem erro (warnings pré-existentes tolerados).
- [ ] **Step 3:** `npx jest 2>&1 | tail -20` → suíte verde (mesmo nº de testes de antes; nenhum quebrado pela mudança de UI).
- [ ] **Step 4:** `npx next build 2>&1 | tail -10` → build OK.
- [ ] **Step 5:** Se algum passo falhar, corrigir e repetir. Registrar evidência (saída dos comandos) antes de declarar pronto.

---

## Task 14: Verificação visual end-to-end no app

- [ ] **Step 1:** `docker compose up -d db redis` (se não estiverem no ar), `npm run dev`.
- [ ] **Step 2:** Logar como super_admin e percorrer: `/integracoes/servidor-mcp` (4 abas),
`/agente/plugar-mcps`. Conferir, em cada tela: aba ativa óbvia, tipografia uniforme, sem modal
denso, sem erro de console, "Servidor no ar" verde.
- [ ] **Step 3:** Coletar quaisquer erros/warnings de console (cobre os "12 issues" — o usuário não
tem a lista; capturar aqui). Corrigir os que forem de código deste rework; registrar em
`docs/RADAR.md` os pré-existentes alheios ao escopo.
- [ ] **Step 4: Commit** de eventuais correções.

---

## Task 15: `/gsd-code-review` + `/gsd-ui-review`

- [ ] **Step 1:** Rodar `/gsd-code-review` sobre os arquivos alterados na branch (bugs, segurança, qualidade).
- [ ] **Step 2:** Rodar `/gsd-ui-review` sobre o painel Servidor MCP e Plugar MCPs (6 pilares visuais).
- [ ] **Step 3:** Aplicar as correções materiais apontadas; commitar.

---

## Task 16: Teste E2E de escrita real — GATED (pendente de credenciais)

> **Bloqueado:** o usuário não tem as credenciais de `grupojht.teste.tauga.online` agora
> (decisão de 2026-05-21). Esta task **não executa** neste ciclo — fica documentada como pendência.

- [ ] **Step 1:** Quando o usuário fornecer, preencher em `.env.local`:
  `ODOO_WRITE_URL=https://grupojht.teste.tauga.online`, `ODOO_WRITE_DB`, `ODOO_WRITE_USER`,
  `ODOO_WRITE_PASSWORD`.
- [ ] **Step 2:** Rodar `discovery/check-mcp-nexus-module.py` — confirmar `mcp_nexus` livre em `ir.model.data`.
- [ ] **Step 3:** Rodar `mcp/__tests__/e2e/poc-happy-path.test.ts` contra a base de teste: criar
  partner real, conferir no Odoo + cache + audit log, desfazer com `unlink`.
- [ ] **Step 4:** Registrar evidência no STATUS.md.

**Ação neste ciclo:** garantir que `STATUS.md` e o HANDOFF de correções deixam esta pendência
explícita e que `MCP_WRITE_ENABLED=false` continua como default (kill switch).

---

## Task 17: Atualizar STATUS.md e HANDOFF; encerrar agente

**Files:**
- Modify: `STATUS.md`
- Modify: `docs/HANDOFF-2026-05-21-f4-onda2-correcoes.md`
- Modify: `docs/agents/HISTORY.md`
- Delete: `docs/agents/active/claude-f4-onda2-correcoes.md`

- [ ] **Step 1:** Em `STATUS.md`, marcar o rework de UI da F4 Onda 2 como concluído e deixar a
única pendência = Task 16 (teste E2E de escrita, aguardando credenciais).
- [ ] **Step 2:** No HANDOFF de correções, marcar §2.2/§2.3/§2.4 como resolvidos; §2.1 pendente.
- [ ] **Step 3:** Registrar os commits relevantes em `docs/agents/HISTORY.md`.
- [ ] **Step 4:** Remover `docs/agents/active/claude-f4-onda2-correcoes.md`.
- [ ] **Step 5: Commit**

```bash
git add STATUS.md docs/HANDOFF-2026-05-21-f4-onda2-correcoes.md docs/agents/HISTORY.md
git rm docs/agents/active/claude-f4-onda2-correcoes.md
git commit -m "docs(f4-onda2-fix): conclui correções de UI; teste E2E de escrita pendente de credenciais"
```

---

## Self-Review (preenchido nas revisões críticas — ver seção abaixo)

Coberta a §2 do HANDOFF de correções:
- §2.1 Teste E2E escrita → Task 16 (gated, documentado).
- §2.2 UI do painel → Tasks 1–6, 11, 12.
- §2.3 Plugar MCPs → Tasks 7–10.
- §2.4 Issues de console → Task 14.
- §2.5 CLAUDE.md/processo → já feito (commit ff46692).
