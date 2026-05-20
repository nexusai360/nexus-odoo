# F5 — Mapeamento técnico para rework da UI do Agente de IA

> Pesquisa read-only. Compara o "Agente Nex" do **nexus-insights** (referência) com a
> UI da F5 do **nexus-odoo** (alvo do rework). Objetivo: portar a estrutura do Nex e
> reaproveitar o design system, eliminando a divergência criada na F5.

Caminhos absolutos:
- nexus-insights: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`
- nexus-odoo: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo`

Abaixo, `I/` = raiz do nexus-insights, `O/` = raiz do nexus-odoo.

---

## RESUMO EXECUTIVO (ler primeiro)

1. **Componente de Select a usar:** nexus-insights tem DOIS selects ricos que o nexus-odoo
   **não tem**: `CustomSelect` (`I/src/components/ui/custom-select.tsx`) e `SearchableSelect`
   (`I/src/components/ui/searchable-select.tsx`). Ambos rodam sobre o `Popover` da base-ui
   (portalizado no `<body>`, sem bug de overflow). O nexus-odoo só tem o `Select` cru da
   base-ui (`O/src/components/ui/select.tsx`) — funcional, porém sem busca, sem cards de
   opção com descrição/notes, sem `endAdornment` (badge de tier). **Recomendação:** portar
   `custom-select.tsx` e `searchable-select.tsx` para `O/src/components/ui/`. O `Popover`
   já existe no odoo (`O/src/components/ui/popover.tsx`), então é só copiar os dois arquivos.
   `CustomSelect` para selects simples com descrição (provedor, credencial); `SearchableSelect`
   para o select de modelo (busca + `TierBadge` no `endAdornment` + modo "digitar manualmente").

2. **Sidebar suporta grupo expansível?** nexus-insights: **SIM** — `I/src/components/layout/sidebar.tsx`
   tem `renderItem` recursivo, estado `openGroups`, chevron rotativo, sub-itens indentados
   com borda-esquerda e dot violet no item ativo. nexus-odoo: **NÃO** — `O/src/components/layout/sidebar.tsx`
   `renderItem` é flat, sem children, sem chevron; o tipo `NavItem` em `O/src/lib/constants/nav.ts`
   já declara `children?: NavItem[]` e o `filterNav` já trata children recursivamente, **mas o
   sidebar nunca os renderiza**. O "Agente" hoje é um item único `{ label: "Agente", href: "/agente" }`.
   Para o rework é preciso **portar o `renderItem` recursivo + `openGroups`** do insights.

3. **Onde está cada peça da UI da F5 do nexus-odoo:**
   - Bubble flutuante: `O/src/components/agent/agent-bubble.tsx`
   - Painel de chat: `O/src/components/agent/chat-panel.tsx` (modo bubble E embedded)
   - Página dedicada do agente: `O/src/app/(protected)/agente/page.tsx` + `client.tsx` (lista + chat 2 colunas)
   - Configuração (tudo numa página): `O/src/app/(protected)/agente/configuracao/page.tsx`
   - Playground (página dedicada): `O/src/app/(protected)/agente/playground/page.tsx` + `O/src/components/agent/playground-content.tsx`
   - Consumo: `O/src/app/(protected)/agente/consumo/page.tsx` + `O/src/components/agent/consumo/*`
   - Integrações: `O/src/app/(protected)/integracoes/**` + `O/src/components/integracoes/*`

---

# PARTE A — nexus-insights (a referência a portar)

## A1. Sidebar / nav group expansível

**Arquivos:**
- Sidebar: `I/src/components/layout/sidebar.tsx`
- Definição de nav: `I/src/lib/constants/nav.ts`
- Utilitários de path ativo: `I/src/lib/utils/sidebar-active-path.ts` (funções `collectLeafHrefs`,
  `isGroupActive`, `isLeafActive`)

**Como o "Agente Nex" vira grupo expansível** — `I/src/lib/constants/nav.ts:104-116`:

```ts
{
  label: "Agente Nex",
  href: "/agente-nex",
  icon: Sparkles,
  superAdminOnly: true,
  section: "admin",
  children: [
    { label: "Configuração",  href: "/agente-nex/configuracao", icon: SlidersHorizontal, superAdminOnly: true },
    { label: "Chaves de API", href: "/agente-nex/chaves",       icon: KeyRound,          superAdminOnly: true },
    { label: "Prompt",        href: "/agente-nex/prompt",       icon: BookOpen,          superAdminOnly: true },
    { label: "Consumo",       href: "/agente-nex/consumo",      icon: TrendingUp,        superAdminOnly: true },
  ],
}
```

O tipo `NavItem` (`nav.ts:26-45`) tem `children?: NavItem[]`, `section?: NavSection`,
`superAdminOnly`, `visibleTo`, `featureFlag`, `key` (relatório no catálogo).

**Renderização do grupo** — `I/src/components/layout/sidebar.tsx`:
- Estado `openGroups: Record<string, boolean>` (`sidebar.tsx:63-65`), inicializado abrindo
  o grupo cujo prefixo bate com o `pathname`.
- `renderItem(item, depth)` recursivo (`sidebar.tsx:101-189`):
  - **Item com children** (`hasChildren`): renderiza um `<button>` (não Link) que chama
    `toggleGroup(item.href)`. Mostra `item.icon`, `item.label`, e um `<ChevronDown>` que
    recebe `rotate-180` quando aberto (`sidebar.tsx:128-133`). Os children entram dentro de
    um `<AnimatePresence>` + `motion.div` com animação de `height: 0 → auto` (`sidebar.tsx:135-150`).
    Container dos filhos: `mt-1 ml-3 pl-3 border-l border-border/40 space-y-1` (indentação
    com borda esquerda — `sidebar.tsx:145`).
  - **Sub-item** (`depth > 0`, `isSubmenu`): renderiza um `<Link>`; quando ativo mostra um
    **dot violet** `block h-1 w-1 rounded-full bg-violet-500` antes do ícone (`sidebar.tsx:172-177`).
    Ícone do sub-item é menor (`h-[16px]` vs `h-[18px]` do grupo).
- Estado ativo do grupo via `isGroupActive(item.href, pathname)`; do leaf via
  `isLeafActive(...)` (`sidebar.tsx:92-95`).
- Headers de seção (`SECTION_LABELS` — "Relatórios" / "Administração") renderizados quando
  `item.section` muda (`sidebar.tsx:216-238`).

**Cores do estado ativo:** `bg-violet-500/10 text-violet-600 dark:text-violet-300` para
grupo/leaf raiz; `bg-violet-500/5` para sub-item ativo.

## A2. As 4 sub-páginas do Agente Nex

Todas em `I/src/app/(protected)/agente-nex/`. Gate em cada page: `getCurrentUser()` →
`if (user.platformRole !== "super_admin") redirect("/dashboard")`. Layout
`agente-nex/layout.tsx` é pass-through (`<>{children}</>`). `agente-nex/page.tsx` redireciona
para `/agente-nex/configuracao`.

Todas usam o mesmo esqueleto: `<PageShell variant="narrow|wide">` + `<PageHeader icon title subtitle [actions]>`
+ `Card` (`I/src/components/ui/card.tsx`, classe padrão `rounded-2xl border border-border bg-muted/30 p-2`).

| Sub-página | Rota / arquivo | Componente principal | Estrutura |
|---|---|---|---|
| **Configuração** | `agente-nex/configuracao/page.tsx` | `LlmConfigForm` (`I/src/components/agente-nex/llm-config-form.tsx`) | 1 Card. Toggle "Agente Nex ativo" (linha com dot + Switch) + seção "Conexão LLM" (grid 2col: Provedor `CustomSelect` + Modelo `SearchableSelect`; depois Chave `CustomSelect`; banner de status; botões "Testar conexão" / "Salvar"). |
| **Chaves de API** | `agente-nex/chaves/page.tsx` | `LlmCredentialsManager` (`I/src/components/settings/llm-credentials-manager.tsx`) | CRUD de credenciais por provedor. |
| **Prompt** | `agente-nex/prompt/page.tsx` | `PromptPreviewCard`, `PromptConfigForm`, `ResourcesToggles`, `KbSection` | 4 Cards empilhados: preview do prompt → "Comportamento" → "Recursos" → "Base de conhecimento". Header tem `actions={<PlaygroundLauncher .../>}`. |
| **Consumo** | `agente-nex/consumo/page.tsx` | `ConsumoContent` (`I/src/components/llm/consumo-content.tsx`) | `PageShell variant="wide"`. Tokens/custo/estatísticas por período. |

**No nexus-odoo essas 4 telas estão fundidas numa só** (`agente/configuracao/page.tsx`
junta Chaves + Modelo + Identidade + Comportamento + Recursos + KB em 6 `<section>` numa
página). O Consumo e o Playground têm página própria. O rework pode optar por manter
o grupo expansível com sub-rotas (paridade Nex) ou manter a página única — decisão de design.

## A3. Componente de Select/Dropdown rico — `SearchableSelect` e `CustomSelect`

### `CustomSelect` — `I/src/components/ui/custom-select.tsx`
Select simples sobre `Popover` (base-ui). Opção com `label` + `description` opcional + `icon`.
API:
```ts
interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];          // { value, label, description?, icon? }
  placeholder?: string;
  className?: string;
  triggerClassName?: string;        // ex.: "min-h-[44px]"
  icon?: React.ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
}
```
Trigger: `flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2`.
Dropdown: lista de `<button role="option">` com label/description em cards de `px-4 py-2.5`,
`Check` violet no selecionado. `min-w-[280px]`. Usado para Provedor e Chave de API no
`llm-config-form.tsx` do insights.

### `SearchableSelect` — `I/src/components/ui/searchable-select.tsx`
Select com **busca** + `endAdornment` (badge à direita). API:
```ts
interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  notes?: string;                   // exibido em texto pequeno abaixo do label
  endAdornment?: ReactNode;         // ex.: <TierBadge tier={...} />
}
interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
  customMode?: SearchableSelectCustomMode;   // modo "digitar manualmente"
}
interface SearchableSelectCustomMode {       // quando value === sentinel,
  sentinel: string;                          // o trigger vira <input> editável
  customValue: string;
  onCustomChange: (next: string) => void;
  placeholder?: string;
  inputAriaLabel?: string;
}
```
Filtra por `label`/`value`/`notes`. Campo de busca no topo do popup (`Input` + ícone `Search`).
`customMode` é o que permite "Outro (digitar manualmente)" sem trocar de componente.
**Este é o componente certo para o select de Modelo** (catálogo + tier badge + custom).

> Ambos importam `Popover/PopoverContent/PopoverTrigger` de `@/components/ui/popover` —
> esse arquivo **já existe** em `O/src/components/ui/popover.tsx`, então portar os dois
> selects é só copiar os arquivos. `SearchableSelect` também importa `Input` (`O/src/components/ui/input.tsx` existe).

## A4. Bubble do agente — `I/src/components/nex/nex-bubble.tsx`

- FAB `fixed right-6 bottom-6 z-50` (mobile `right-4 bottom-5`).
- Botão `h-14 w-14` (56px), `rounded-full`, `bg-gradient-to-br from-violet-600 to-violet-500`,
  glow externo pulsante (`motion.span` com loop 2.8s, respeita `useReducedMotion`),
  ícone `Sparkles`, dot verde "online" no canto inferior direito.
- Estado: `open` local. **Quando o painel abre, o bubble NÃO some** — ele continua
  renderizado; o painel (`NexChatPanel`) é renderizado por cima via `AnimatePresence`.
  No desktop o painel fica `sm:bottom-24` (acima do bubble), então convivem.
- **Painel** — `I/src/components/nex/nex-chat-panel.tsx`:
  - Desktop: `sm:right-6 sm:bottom-24 sm:h-[70vh] sm:max-h-[640px] sm:w-[420px] sm:rounded-2xl sm:border`.
  - Mobile: full-screen (`inset-0 rounded-none`).
  - Abertura: `motion.div` com `scale + slide` a partir de `transformOrigin: "bottom right"`.
    Saída ~70% da duração da entrada.
  - Header: avatar gradient + "Agente Nex" + "Online · ...", botão `MoreVertical` (menu
    "Limpar histórico") e `X` (fechar). ESC fecha.
  - Body: `WelcomeBlock` (ícone + saudação + 3 sugestões clicáveis) quando vazio; senão
    lista de `NexMessage` + `SuggestionsBar`.
  - Input bar (v0.15.4 "layout estável"): container externo `flex items-end gap-2` →
    botão **Mic** redondo (só em idle, quando `audioInputEnabled`) + inner area
    (`rounded-xl border border-input`, alterna `textarea` ↔ `AudioRecorder mode="embedded"`)
    + botão **Send** violet retangular fixo. O Mic some durante gravação; o Send muda de
    comportamento (idle envia texto, recording chama `recorder.sendNow()`).
- **Botão de áudio/mic:** `AudioRecorder` (`I/src/components/nex/audio-recorder.tsx`) com
  `mode="embedded"` controlado por `ref`; `AudioPlayer` (`audio-player.tsx`) para reproduzir.
  Áudios persistem em IndexedDB (`I/src/lib/nex/audio-storage.ts`).

## A5. Playground — `Sheet` lateral

No nexus-insights o Playground é um **`Sheet` lateral** (`side=right`, `width={480}`), não
página. Arquivos:
- `I/src/components/agente-nex/playground-sheet.tsx` — o Sheet.
- `I/src/components/agente-nex/playground-launcher.tsx` — botão "Abrir playground" (violet,
  `Sparkles`) que controla `open` e renderiza o `PlaygroundSheet`. Fica no `actions` do
  `PageHeader` da página Prompt.
- Usa `Sheet/SheetBody/SheetHeader` de `I/src/components/ui/sheet.tsx`.
- Header do Sheet: provider · modelo + botões "Limpar histórico" / "Ver prompt usado"
  (este abre um `Dialog` `z-[70]` sobre o Sheet). Histórico efêmero FIFO de 20 msgs,
  sem localStorage. Mesma input bar da bubble (Mic + inner area + Send).

> **Divergência:** o nexus-odoo decidiu (SPEC §8.3) o Playground como **página dedicada**
> (`agente/playground`). O componente `PlaygroundContent` é o port do `playground-sheet`
> adaptado para full-page e com persistência em Postgres. Se o rework quiser paridade
> total com o Nex, considerar voltar para Sheet — mas isso conflita com a SPEC F5; provável
> manter página e só alinhar visual.

## A6. Outros componentes compartilhados relevantes (insights)

- **Card** — `I/src/components/ui/card.tsx`. `Card / CardHeader / CardTitle / CardContent`.
- **Dialog** — `I/src/components/ui/dialog.tsx`. Aceita `overlayClassName`, `z-[70]` etc.
- **Sheet** — `I/src/components/ui/sheet.tsx` (`Sheet/SheetHeader/SheetBody/SheetFooter`, prop `width`).
- **Switch** — `I/src/components/ui/switch.tsx` (`checked`, `onCheckedChange`, `id`, `disabled`).
- **ScrollArea** — `I/src/components/ui/scroll-area.tsx`.
- **Badge** — `I/src/components/ui/badge.tsx`; **`badge-select.tsx`** (select estilo badge).
- **TierBadge** — `I/src/components/llm/tier-badge.tsx`. `<TierBadge tier="low|medium|high|premium" />`
  → renderiza `$`/`$$`/`$$$`/`$$$$` com cor por tier + tooltip. É o `endAdornment` no select de modelo.
- **Collapsible** — `I/src/components/ui/collapsible.tsx` + `collapsible-section.tsx`.
- **PageShell** — `I/src/components/layout/page-shell.tsx` (`variant="narrow|wide"`).
- **PageHeader** — `I/src/components/page-header.tsx` (`icon`, `title`, `subtitle`, `actions`).

---

# PARTE B — nexus-odoo (o alvo)

## B7. Design system existente — `O/src/components/ui/`

Componentes presentes:
`alert-dialog.tsx`, `badge-select.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`,
`dialog.tsx`, `input.tsx`, `label.tsx`, `password-input.tsx`, `popover.tsx`, `select.tsx`,
`separator.tsx`, `skeleton.tsx`, `sonner.tsx`, `switch.tsx`, `table.tsx`, `tabs.tsx`,
`textarea.tsx`, `tooltip.tsx`.

**Existe um Select/Dropdown decente? Parcialmente.** Só há o `Select` cru da base-ui
(`O/src/components/ui/select.tsx`) — `Select / SelectTrigger / SelectValue / SelectContent /
SelectItem / SelectGroup / SelectLabel / SelectSeparator`. API base-ui: `<Select items value
onValueChange>` + `<SelectTrigger size="sm|default">` + `<SelectContent>` + `<SelectItem value>`.
Funciona, é portalizado e estilizado, mas:
- **não tem busca** (nada de filtrar opções);
- **não tem cards de opção** com `description`/`notes` ricos;
- **não tem `endAdornment`** (badge de tier ao lado da opção);
- **não tem modo "digitar manualmente"** inline.

**Faltam `custom-select.tsx` e `searchable-select.tsx`** — os dois selects ricos do insights.
O `Popover` necessário **já existe** (`O/src/components/ui/popover.tsx`). Recomendação do
rework: portar esses dois arquivos + `tier-badge.tsx` (hoje a F5 usa um `<span>` com cor
inline em vez de um TierBadge — ver B10).

APIs dos demais (resumo): `Button` (`variant`, `size`), `Card/CardContent` (+ `CardHeader/CardTitle`),
`Dialog` (`overlayClassName`, `className`), `Switch` (`checked`/`onCheckedChange`), `Badge`
(`variant`), `Input`, `Textarea`, `Label`, `Tabs`, `Tooltip`, `AlertDialog`. **Não há `Sheet`
nem `ScrollArea` nem `Collapsible`** no odoo — se o rework precisar deles, terão de ser portados.

## B8. Sidebar do nexus-odoo

- Sidebar: `O/src/components/layout/sidebar.tsx`
- Nav: `O/src/lib/constants/nav.ts`
- Roles: `O/src/lib/constants/roles.ts`

**`NAV_ITEMS`** (`nav.ts:21-46`) — itens flat, sem `children`:
```
Dashboard (/dashboard)         — todos
Agente    (/agente, Bot)       — todos          ← item ÚNICO, sem submenu
Relatórios(/relatorios)        — todos
Usuários  (/usuarios)          — section admin, visibleTo super_admin/admin
Integrações(/integracoes)      — section admin, visibleTo super_admin
Configuração(/configuracao)    — section admin, visibleTo super_admin
```

**O tipo `NavItem` JÁ declara `children?: NavItem[]`** (`nav.ts:13`) e `filterNav`
(`nav.ts:48-65`) **já trata children recursivamente** (inclusive esconde o pai se todos
os filhos foram filtrados). **Mas o `Sidebar` não renderiza children:** `renderItem`
(`sidebar.tsx:66-92`) sempre devolve um `<Link>` flat — não há `openGroups`, não há
`ChevronDown`, não há recursão, não há `AnimatePresence` para os filhos. Importa apenas
`isLeafActive` (não importa `isGroupActive` nem `collectLeafHrefs` para grupos).

**Conclusão B8:** para transformar "Agente" num grupo expansível (Conversas, Configuração,
Playground, Consumo) é preciso **portar o `renderItem` recursivo + estado `openGroups` +
chevron + sub-item com dot** de `I/src/components/layout/sidebar.tsx`, e dar `children`
ao item Agente em `nav.ts`. A camada de dados (`NavItem.children`, `filterNav`) já está pronta.

**RBAC por item:** via `superAdminOnly` e `visibleTo: PlatformRole[]` em cada `NavItem`,
aplicado por `filterNav(NAV_ITEMS, user)` (`sidebar.tsx:64`). Roles em
`O/src/lib/constants/roles.ts`: `super_admin | admin | manager | viewer`.

## B9. Onde a UI da F5 está hoje

### `O/src/components/agent/**`
| Arquivo | Função |
|---|---|
| `agent-bubble.tsx` | FAB flutuante (port do `nex-bubble`). Renderiza `ChatPanel`. |
| `chat-panel.tsx` | Painel de chat. Modo bubble (floating) E `embedded` (full-page). Consome SSE `/api/agent/stream`. |
| `agent-message.tsx` | Balão de mensagem (user/assistant/loading/tool), streaming cursor. |
| `audio-player.tsx` | Player de áudio. |
| `audio-recorder.tsx` | Gravador (mode embedded), controlado por ref. |
| `conversation-list.tsx` | Lista lateral de conversas (`w-72`), CTA "Nova conversa". |
| `credentials-section.tsx` | CRUD de credenciais LLM. Usa `Select` base-ui. |
| `identity-base-editor.tsx` | Editor da identidade base do agente. |
| `kb-section.tsx`, `kb-upload-dialog.tsx`, `kb-url-form.tsx` | Base de conhecimento (RAG). |
| `llm-config-form.tsx` | Lista/cria/ativa configs de LLM. Usa `Select` base-ui. |
| `prompt-config-form.tsx` | Personalidade, tom, guardrails. |
| `resources-toggles.tsx` | Toggles de recursos (áudio, KB, sugestões). |
| `suggestions-bar.tsx` | Barra de sugestões clicáveis. |
| `playground-content.tsx` | Playground como página completa. Mesma input bar do chat. |
| `consumo/consumo-content.tsx` | Dashboard de consumo (KPIs, charts, tabela). |
| `consumo/kpi-row.tsx`, `usage-charts.tsx`, `usage-detail.tsx`, `usage-table.tsx`, `usage-table-filters.tsx` | Peças do consumo. |

### `O/src/app/(protected)/agente/**`
| Arquivo | Função |
|---|---|
| `layout.tsx` | Suprime padding do layout pai (`-mt-16 h-screen overflow-hidden`) para o chat ocupar a tela. |
| `page.tsx` | Server Component: busca conversas + flags + LLM ativo; gate `getCurrentUser`. Renderiza `AgentPageClient`. |
| `client.tsx` | `AgentPageClient`: layout 2 colunas (`ConversationList` + `ChatPanel` embedded). |
| `configuracao/page.tsx` | Página única com 6 `<section>`: Chaves, Modelo, Identidade, Comportamento, Recursos, KB. Gate super_admin/admin. |
| `playground/page.tsx` | Playground (gate super_admin/admin). Renderiza `PlaygroundContent`. |
| `consumo/page.tsx` | Consumo (gate super_admin/admin). Renderiza `ConsumoContent`. |

> Não existe `agente/layout.tsx` com gate de role — o gate é por página. Não há submenu;
> a navegação entre Configuração/Playground/Consumo **não tem entrada no sidebar** hoje
> (só `/agente` aparece). Esse é um buraco de navegação que o grupo expansível resolveria.

### `O/src/components/integracoes/**` e `O/src/app/(protected)/integracoes/**`
| Arquivo | Função |
|---|---|
| `app/.../integracoes/layout.tsx` | Gate: só super_admin. |
| `app/.../integracoes/page.tsx` | Grade de cards (`IntegracoesGrid`). |
| `app/.../integracoes/canais/page.tsx` | Lista de canais (card WhatsApp). |
| `app/.../integracoes/canais/whatsapp/page.tsx` | Form do canal WhatsApp. |
| `app/.../integracoes/mcp/page.tsx` | Painel MCP. |
| `app/.../integracoes/webhooks/page.tsx` | Webhooks. |
| `app/.../integracoes/api/page.tsx` | API keys. |
| `app/.../integracoes/bi/page.tsx` | BI (em breve). |
| `components/integracoes/integracoes-grid.tsx` | Grade de cards de integração. |
| `components/integracoes/breadcrumb.tsx` | Breadcrumb das sub-telas. |
| `components/integracoes/mcp-panel.tsx` | Conteúdo do painel MCP. |
| `components/integracoes/webhooks-content.tsx` | Conteúdo de webhooks. Usa `Select` base-ui. |
| `components/integracoes/api-keys-content.tsx` | Conteúdo de API keys. |
| `components/integracoes/whatsapp-channel-form.tsx` | Form do canal WhatsApp. Usa `Select` base-ui. |

## B10. Onde a F5 divergiu do design system

### a) `<select>` HTML nativo (não usa NENHUM componente de Select)
Estes arquivos da F5 renderizam `<select>`/`<option>` cru, estilizado à mão com Tailwind —
divergência clara do design system:
- `O/src/components/agent/consumo/usage-table-filters.tsx:47` e `:65` — filtro de provider e
  de modelo, dois `<select>` nativos.
- `O/src/components/agent/consumo/usage-table.tsx:377` — `<select>` nativo (paginação/page-size).
- `O/src/components/agent/consumo/consumo-content.tsx:218` e `:234` — filtro de provider e
  filtro de ambiente, dois `<select>` nativos.
- (Fora da F5, mas mesma dívida: `O/src/components/reports/filters-dialog.tsx:233,248`.)

**Deveriam usar `CustomSelect`** (após portá-lo) — opções simples com label, sem busca.

### b) `Select` base-ui usado, mas sem riqueza
`O/src/components/agent/llm-config-form.tsx` e `credentials-section.tsx` usam o `Select`
base-ui (`O/src/components/ui/select.tsx`). Funciona, mas:
- O select de **Modelo** (`llm-config-form.tsx:232-254`) lista modelo + tier, mas o tier é um
  `<span className={cn("text-[10px]", TIER_COLORS[m.tier])}>` inline (`llm-config-form.tsx:46-51,245-249`)
  — **reimplementa o `TierBadge`** do insights em vez de reusar o componente. E **não há busca**
  no select de modelo, ao contrário do `SearchableSelect` do Nex.
- O modo "Outro (digitar manualmente)" é feito mostrando um `<Input>` separado abaixo do
  Select (`llm-config-form.tsx:256-263`), em vez do `customMode` inline do `SearchableSelect`.

### c) Configuração fundida numa página só
`agente/configuracao/page.tsx` junta 6 seções numa página. No Nex isso são telas separadas
(Configuração / Chaves / Prompt / Consumo) acessíveis pelo submenu expansível. Não é "errado",
mas é a maior divergência estrutural — e a razão pela qual não há submenu no sidebar.

### d) Componentes próprios em vez de reuso
- A F5 criou `consumo/usage-table-filters.tsx`, `consumo/kpi-row.tsx` etc. — equivalentes ao
  `I/src/components/llm/*`. Aceitável (são telas), mas os filtros internos deveriam usar
  `CustomSelect`, não `<select>`.
- A "input bar" do chat foi portada fielmente (Mic + inner area + Send) — essa parte está OK.

### e) Falta `Sheet` / `ScrollArea` / `Collapsible` / `tier-badge` no design system do odoo
Se o rework portar o Playground como Sheet ou precisar de scroll-area no preview de prompt,
esses componentes precisam ser portados de `I/src/components/ui/`.

## B11. RBAC de visibilidade de menu

- Roles: `O/src/lib/constants/roles.ts` — `super_admin (4) | admin (3) | manager (2) | viewer (1)`,
  com `PLATFORM_ROLE_LABELS`, `PLATFORM_ROLE_HIERARCHY`, `PLATFORM_ROLE_STYLES`, `PLATFORM_ROLE_ICONS`.
- Visibilidade de menu: cada `NavItem` em `O/src/lib/constants/nav.ts` tem `superAdminOnly?`
  e/ou `visibleTo?: PlatformRole[]`. `filterNav(items, user)` (`nav.ts:48-65`) percorre,
  descarta itens fora do papel, recursa em `children` e **esconde o pai se todos os filhos
  somem**. O `Sidebar` chama `filterNav(NAV_ITEMS, user)` (`sidebar.tsx:64`).
- Hoje: "Agente" e "Relatórios" e "Dashboard" são visíveis a todos; "Usuários" a
  super_admin/admin; "Integrações" e "Configuração" só super_admin.
- **Importante para o rework:** quando "Agente" virar grupo, os sub-itens podem ter
  `visibleTo` próprio (ex.: Configuração/Playground/Consumo → super_admin/admin; Conversas →
  todos), exatamente como o Nex faz com `superAdminOnly` nos filhos. O `filterNav` já suporta
  isso sem mudança — basta declarar os `children` com seus papéis.

---

# Recomendações de port (síntese acionável)

1. **Portar `O/src/components/ui/custom-select.tsx`** ← `I/src/components/ui/custom-select.tsx`
   (Popover já existe). Trocar os `<select>` nativos do consumo por `CustomSelect`.
2. **Portar `O/src/components/ui/searchable-select.tsx`** ← idem. Usar no select de Modelo
   do `llm-config-form.tsx`, com `customMode` para "digitar manualmente".
3. **Portar `O/src/components/llm/tier-badge.tsx`** (ou `components/agent/tier-badge.tsx`) ←
   `I/src/components/llm/tier-badge.tsx`. Usar como `endAdornment` no SearchableSelect.
4. **Portar o `renderItem` recursivo + `openGroups` + chevron + dot de sub-item** de
   `I/src/components/layout/sidebar.tsx` para `O/src/components/layout/sidebar.tsx`. Importar
   `isGroupActive` de `O/src/lib/utils/sidebar-active-path.ts` (verificar se a função existe;
   `isLeafActive`/`collectLeafHrefs` já são usados).
5. **Dar `children` ao item "Agente"** em `O/src/lib/constants/nav.ts` (Conversas,
   Configuração, Playground, Consumo) com `visibleTo` por sub-item. `filterNav` já suporta.
6. Avaliar portar `Sheet`/`ScrollArea`/`Collapsible` se o rework do Playground/Prompt exigir.
