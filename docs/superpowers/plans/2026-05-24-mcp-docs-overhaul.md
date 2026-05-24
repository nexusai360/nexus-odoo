# MCP Docs Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever a doc do servidor MCP em `/integracoes/servidor-mcp/docs` para separar modo externo de interno, corrigir placeholders de exemplo (`"..."` → valores tipados), incluir o módulo `cadastros` no wizard de chaves de acesso e suportar a ação `Archive`.

**Architecture:** Mudanças concentradas em três camadas: (1) tipos e dados em `src/lib/actions/mcp-api-keys-types.ts` + `src/lib/mcp-capability-levels.ts`; (2) snapshot gerador em `scripts/gen-mcp-catalog-snapshot.ts` + consumidor em `src/lib/actions/mcp-catalog-schema.ts`; (3) UI em `src/components/integracoes/servidor-mcp/{chaves-lista,mcp-docs-content}.tsx`. Nenhuma mudança no servidor MCP em si (`mcp/`).

**Tech Stack:** TypeScript, Next.js App Router, base-ui, Tailwind v4, Zod, Jest, Prisma. Renderização do catálogo via snapshot JSON pré-gerado, não fetch live.

---

## Mapa de arquivos

**Modificar:**
- `src/lib/actions/mcp-api-keys-types.ts` — adiciona `cadastros` em `MCP_MODULES`, `Archive` em `WRITE_ACTIONS`.
- `src/lib/mcp-capability-levels.ts` — adiciona `archive: "Archive"` em `ACTION_CODE_TO_WRITE`.
- `src/lib/__tests__/mcp-capability-levels.test.ts` — testes para cadastros e archive.
- `scripts/gen-mcp-catalog-snapshot.ts` — extrai `inputSchemaFields` (nome + tipo + optional + enumValues).
- `src/lib/actions/mcp-catalog-schema.ts` — `CatalogToolItem` ganha `inputSchemaFields?`.
- `src/lib/mcp-catalog-snapshot.json` — regenerado.
- `src/components/integracoes/servidor-mcp/chaves-lista.tsx` — `WRITE_ACTION_LABELS.Archive`, `LevelSegmented.writeDisabled`, render do passo 2 não exibe microcopy quando segmento está desabilitado.
- `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx` — sidebar agrupada (3 grupos), conteúdo textual reescrito, gerador `buildExamples` consome `inputSchemaFields`, exemplo do callout de write tool sem `<SERVICE_TOKEN>` / `<USER_ID>` / `<API_KEY>`.
- `src/lib/tours/servidor-mcp-tour.ts` — selectors auditados.

**Criar:**
- `src/lib/__tests__/mcp-docs-build-examples.test.ts` — testa o gerador tipado.

---

## Task 1: Adicionar `cadastros` em `MCP_MODULES`

**Files:**
- Modify: `src/lib/actions/mcp-api-keys-types.ts:7-18`
- Test: `src/lib/__tests__/mcp-capability-levels.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Adicionar ao arquivo de teste:

```ts
import { MCP_MODULES, WRITE_ACTIONS } from "@/lib/actions/mcp-api-keys-types";

describe("MCP_MODULES", () => {
  it("inclui cadastros como módulo canônico", () => {
    expect(MCP_MODULES).toContain("cadastros");
  });

  it("preserva os módulos existentes", () => {
    for (const mod of ["crm", "vendas", "estoque", "compras", "financeiro", "fiscal", "contabil", "producao", "rh", "projeto"]) {
      expect(MCP_MODULES).toContain(mod);
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx jest src/lib/__tests__/mcp-capability-levels.test.ts -t "cadastros como módulo canônico"`
Expected: FAIL, `expected to contain "cadastros"`.

- [ ] **Step 3: Aplicar a mudança**

Em `src/lib/actions/mcp-api-keys-types.ts:7-18`, mudar:

```ts
export const MCP_MODULES = [
  "crm",
  "vendas",
  "cadastros",
  "estoque",
  "compras",
  "financeiro",
  "fiscal",
  "contabil",
  "producao",
  "rh",
  "projeto",
] as const;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx jest src/lib/__tests__/mcp-capability-levels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/mcp-api-keys-types.ts src/lib/__tests__/mcp-capability-levels.test.ts
git commit -m "feat(mcp-keys): adiciona cadastros aos módulos canônicos"
```

---

## Task 2: Adicionar `Archive` em `WRITE_ACTIONS`

**Files:**
- Modify: `src/lib/actions/mcp-api-keys-types.ts:23`
- Test: `src/lib/__tests__/mcp-capability-levels.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

```ts
describe("WRITE_ACTIONS", () => {
  it("inclui Archive como ação de escrita", () => {
    expect(WRITE_ACTIONS).toContain("Archive");
  });

  it("Archive não é considerada sensível (reversível)", () => {
    const { SENSITIVE_ACTIONS } = require("@/lib/actions/mcp-api-keys-types");
    expect(SENSITIVE_ACTIONS).not.toContain("Archive");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx jest src/lib/__tests__/mcp-capability-levels.test.ts -t "Archive"`
Expected: FAIL.

- [ ] **Step 3: Aplicar a mudança**

Em `src/lib/actions/mcp-api-keys-types.ts:23`:

```ts
export const WRITE_ACTIONS = ["Create", "Update", "Delete", "Archive", "Transition"] as const;
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx jest src/lib/__tests__/mcp-capability-levels.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 erros (se houver erros relacionados a `WriteAction`, são esperados em arquivos que fazem switch exhaustivo; tratar em tasks seguintes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/mcp-api-keys-types.ts src/lib/__tests__/mcp-capability-levels.test.ts
git commit -m "feat(mcp-keys): adiciona Archive como WriteAction reversível"
```

---

## Task 3: Mapear `archive` em `ACTION_CODE_TO_WRITE`

**Files:**
- Modify: `src/lib/mcp-capability-levels.ts:35-40`
- Test: `src/lib/__tests__/mcp-capability-levels.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

```ts
import { deriveModuleWriteActions } from "@/lib/mcp-capability-levels";
import type { CatalogByModule } from "@/lib/actions/mcp-catalog-schema";

describe("deriveModuleWriteActions", () => {
  it("mapeia capability cadastros.archive para action Archive", () => {
    const catalog: CatalogByModule[] = [
      {
        module: "cadastros",
        readTools: [],
        writeTools: [
          {
            id: "cadastros.res_partner.archive",
            operation: "write",
            module: "cadastros",
            descricao: "",
            capability: "cadastros.archive",
            sensitive: false,
            addedInVersion: null,
            inputSchemaKeys: [],
            examples: [],
          },
        ],
      },
    ];
    const map = deriveModuleWriteActions(catalog);
    expect(map.cadastros).toEqual([
      { action: "Archive", tools: ["cadastros.res_partner.archive"] },
    ]);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx jest src/lib/__tests__/mcp-capability-levels.test.ts -t "cadastros.archive"`
Expected: FAIL, `map.cadastros is undefined`.

- [ ] **Step 3: Aplicar a mudança**

Em `src/lib/mcp-capability-levels.ts:35-40`:

```ts
const ACTION_CODE_TO_WRITE: Record<string, WriteAction> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  archive: "Archive",
  transition: "Transition",
};
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx jest src/lib/__tests__/mcp-capability-levels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-capability-levels.ts src/lib/__tests__/mcp-capability-levels.test.ts
git commit -m "fix(mcp-keys): mapeia capability archive para action Archive no derive"
```

---

## Task 4: Auditar `MCP_MODULES` em outros arquivos

**Files:**
- Read (não modificar a menos que ache hard-coded length): vários

- [ ] **Step 1: Listar referências a `MCP_MODULES.length` ou índice fixo**

Run: `grep -rn "MCP_MODULES" src/ --include="*.ts" --include="*.tsx"`
Expected: lista de imports e usos.

- [ ] **Step 2: Inspecionar cada uso e validar que não pressupõe 10**

Procurar padrões como `.length === 10`, `MCP_MODULES[9]`, etc. Em cada caso problemático, ajustar para usar a constante. Se nenhum problema: prossegue.

- [ ] **Step 3: Rodar tsc + jest globais**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 4: Commit (apenas se houve mudança)**

```bash
git add -p   # selecionar mudanças
git commit -m "chore(mcp-keys): ajusta consumidores de MCP_MODULES para 11 módulos"
```

Se não houve mudança, pular esta task.

---

## Task 5: `inputSchemaFields` no snapshot generator

**Files:**
- Modify: `scripts/gen-mcp-catalog-snapshot.ts`
- Modify: `src/lib/actions/mcp-catalog-schema.ts`

- [ ] **Step 1: Ler o gerador atual**

Run: `cat scripts/gen-mcp-catalog-snapshot.ts | head -200`
Identificar a função que serializa cada tool. Provavelmente extrai `Object.keys(schema._def.shape())` para `inputSchemaKeys`.

- [ ] **Step 2: Estender o tipo `McpEndpointToolItem` em `mcp-catalog-schema.ts`**

Em `src/lib/actions/mcp-catalog-schema.ts:23-32`, adicionar campo após `inputSchemaKeys`:

```ts
interface McpEndpointToolItem {
  id: string;
  operation: "read" | "write";
  module: string;
  descricao: string;
  capability: string | null;
  sensitive: boolean;
  addedInVersion: number | null;
  inputSchemaKeys: string[];
  inputSchemaFields?: CatalogInputField[];
  examples: ReadonlyArray<{ language: string; description?: string; code: string }>;
}

export interface CatalogInputField {
  name: string;
  type:
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "date"
    | "datetime"
    | "enum"
    | "array"
    | "object"
    | "unknown";
  optional: boolean;
  enumValues?: string[];
}
```

E adicionar o mesmo campo em `CatalogToolItem`:

```ts
export interface CatalogToolItem {
  // ... campos atuais ...
  inputSchemaKeys: string[];
  inputSchemaFields?: CatalogInputField[];
  examples: ReadonlyArray<{ language: string; description?: string; code: string }>;
}
```

E em `groupCatalogTools`, copiar o novo campo:

```ts
const item: CatalogToolItem = {
  id: tool.id,
  operation: tool.operation,
  module: tool.module,
  descricao: tool.descricao,
  capability: tool.capability,
  sensitive: tool.sensitive,
  addedInVersion: tool.addedInVersion,
  inputSchemaKeys: tool.inputSchemaKeys,
  inputSchemaFields: tool.inputSchemaFields,
  examples: tool.examples,
};
```

- [ ] **Step 3: Adicionar a função `extractFields` no script**

Adicionar em `scripts/gen-mcp-catalog-snapshot.ts`, antes do uso:

```ts
import { z } from "zod";

type FieldType =
  | "string" | "number" | "integer" | "boolean"
  | "date" | "datetime" | "enum" | "array" | "object" | "unknown";

interface ExtractedField {
  name: string;
  type: FieldType;
  optional: boolean;
  enumValues?: string[];
}

function unwrap(t: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean } {
  let optional = false;
  let inner: z.ZodTypeAny = t;
  while (true) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      optional = true;
      inner = inner._def.innerType;
      continue;
    }
    if (inner instanceof z.ZodDefault) {
      optional = true;
      inner = inner._def.innerType;
      continue;
    }
    break;
  }
  return { inner, optional };
}

function detectType(t: z.ZodTypeAny): { type: FieldType; enumValues?: string[] } {
  if (t instanceof z.ZodString) {
    const checks = (t._def.checks ?? []) as Array<{ kind: string }>;
    if (checks.some((c) => c.kind === "date")) return { type: "date" };
    if (checks.some((c) => c.kind === "datetime")) return { type: "datetime" };
    return { type: "string" };
  }
  if (t instanceof z.ZodNumber) {
    const isInt = (t._def.checks ?? []).some((c: { kind: string }) => c.kind === "int");
    return { type: isInt ? "integer" : "number" };
  }
  if (t instanceof z.ZodBoolean) return { type: "boolean" };
  if (t instanceof z.ZodDate) return { type: "date" };
  if (t instanceof z.ZodEnum) {
    return { type: "enum", enumValues: t._def.values as string[] };
  }
  if (t instanceof z.ZodNativeEnum) {
    return { type: "enum", enumValues: Object.values(t._def.values).filter((v): v is string => typeof v === "string") };
  }
  if (t instanceof z.ZodArray) return { type: "array" };
  if (t instanceof z.ZodObject) return { type: "object" };
  return { type: "unknown" };
}

function extractFields(schema: z.ZodTypeAny): ExtractedField[] {
  let root: z.ZodTypeAny = schema;
  while (true) {
    if (root instanceof z.ZodOptional || root instanceof z.ZodNullable || root instanceof z.ZodDefault) {
      root = root._def.innerType;
      continue;
    }
    break;
  }
  if (!(root instanceof z.ZodObject)) return [];
  const shape = root._def.shape() as Record<string, z.ZodTypeAny>;
  return Object.entries(shape).map(([name, raw]) => {
    const { inner, optional } = unwrap(raw);
    const { type, enumValues } = detectType(inner);
    return { name, type, optional, ...(enumValues ? { enumValues } : {}) };
  });
}
```

- [ ] **Step 4: Aplicar `extractFields` na serialização de cada tool**

Localizar no script o ponto onde cada tool é convertida para o item do snapshot (provavelmente um `tools.map(tool => ({...}))`). Acrescentar:

```ts
inputSchemaFields: tool.inputSchema ? extractFields(tool.inputSchema) : [],
```

Se o campo `inputSchema` tem nome diferente no `ToolEntry` real, usar o nome correto (provavelmente `inputSchema` ou `schema`). Consultar `mcp/catalog/types.ts`.

- [ ] **Step 5: Rodar o gerador**

Run: `npm run gen:mcp-catalog`
Expected: regenera `src/lib/mcp-catalog-snapshot.json` sem erro.

- [ ] **Step 6: Verificar JSON gerado**

Run: `grep -A4 '"id": "cadastro_parceiros_por_uf"' src/lib/mcp-catalog-snapshot.json | tail -10`
Expected: aparece `"inputSchemaFields": [ { "name": "apenasClientes", "type": "boolean", "optional": true } ]` (ou similar conforme schema real).

- [ ] **Step 7: Rodar tsc + jest globais**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/gen-mcp-catalog-snapshot.ts src/lib/actions/mcp-catalog-schema.ts src/lib/mcp-catalog-snapshot.json
git commit -m "feat(mcp-catalog): adiciona inputSchemaFields (nome+tipo) ao snapshot"
```

---

## Task 6: `WRITE_ACTION_LABELS.Archive`

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/chaves-lista.tsx:101`

- [ ] **Step 1: Localizar `WRITE_ACTION_LABELS`**

Run: `grep -n "WRITE_ACTION_LABELS" src/components/integracoes/servidor-mcp/chaves-lista.tsx`
Expected: linha 101.

- [ ] **Step 2: Aplicar a mudança**

Modificar o objeto para incluir `Archive: "Arquivar"`:

```ts
const WRITE_ACTION_LABELS: Record<WriteAction, string> = {
  Create: "Criar",
  Update: "Atualizar",
  Delete: "Excluir",
  Archive: "Arquivar",
  Transition: "Transicionar",
};
```

(Manter as labels existentes; só checar se já são em PT-BR no arquivo atual antes de sobrescrever. Se forem outras, preservar e só adicionar Archive.)

- [ ] **Step 3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 erros (o `Record<WriteAction, string>` agora exige Archive).

- [ ] **Step 4: Commit**

```bash
git add src/components/integracoes/servidor-mcp/chaves-lista.tsx
git commit -m "feat(chaves-mcp): label Arquivar para action Archive"
```

---

## Task 7: `LevelSegmented.writeDisabled`

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/chaves-lista.tsx` (componente `LevelSegmented`)

- [ ] **Step 1: Localizar `LevelSegmented`**

Run: `grep -n "function LevelSegmented\|<LevelSegmented" src/components/integracoes/servidor-mcp/chaves-lista.tsx`
Identificar a assinatura atual e o ponto onde renderiza os 3 botões.

- [ ] **Step 2: Estender props do componente**

Adicionar prop opcional `writeDisabled` à interface/types:

```ts
interface LevelSegmentedProps {
  value: AccessLevel;
  onChange: (value: AccessLevel) => void;
  ariaLabel: string;
  writeDisabled?: boolean;
}
```

Dentro do componente, no botão `"write"`:

```tsx
<button
  type="button"
  aria-pressed={value === "write"}
  aria-disabled={writeDisabled ? true : undefined}
  disabled={writeDisabled}
  title={writeDisabled ? "Sem tools de escrita publicadas neste módulo ainda" : undefined}
  onClick={writeDisabled ? undefined : () => onChange("write")}
  className={cn(
    "...classes atuais do botão write...",
    writeDisabled && "opacity-50 cursor-not-allowed",
  )}
>
  Leitura e escrita
</button>
```

(Manter o restante do componente como está; só esses ajustes no botão `"write"`.)

- [ ] **Step 3: Passar a prop no caller (linha ~557)**

No render do passo 2 (`chaves-lista.tsx:557`), substituir:

```tsx
<LevelSegmented
  value={access.level}
  onChange={(v) => setLevel(mod, v)}
  ariaLabel={`Nível de acesso, ${moduleLabel(mod)}`}
  writeDisabled={(moduleWriteActions[mod] ?? []).length === 0}
/>
```

- [ ] **Step 4: Esconder a microcopy quando segmento está desabilitado**

Em `chaves-lista.tsx:564-609`, mudar a condicional `{isWrite && (...)}` para:

```tsx
{isWrite && writeActions.length > 0 && (
  <div className="border-t border-border/60 px-3.5 py-2.5">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-medium text-muted-foreground">
        Ações de escrita:
      </span>
      {writeActions.map(({ action }) => {
        // ... botão de ação existente ...
      })}
    </div>
  </div>
)}
```

A microcopy "Nenhuma ação de escrita disponível neste módulo ainda" sai. O caso `isWrite && writeActions.length === 0` agora é um estado legado (chave salva antes da mudança). Para esse caso, manter um pequeno alerta:

```tsx
{isWrite && writeActions.length === 0 && (
  <div className="border-t border-border/60 px-3.5 py-2.5">
    <p className="text-[11.5px] text-amber-600 dark:text-amber-400">
      Esta chave foi marcada com escrita em um módulo que não tem mais tools de escrita publicadas. Você pode trocar para Leitura ou esperar novas tools serem expostas.
    </p>
  </div>
)}
```

- [ ] **Step 5: Rodar tsc + jest**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/integracoes/servidor-mcp/chaves-lista.tsx
git commit -m "feat(chaves-mcp): desabilita segmento 'Leitura e escrita' quando módulo não tem write tools"
```

---

## Task 8: Regenerar snapshot após mudanças e validar wizard E2E manual

**Files:** apenas validação

- [ ] **Step 1: Regenerar snapshot**

Run: `npm run gen:mcp-catalog`
Expected: snapshot atualizado em `src/lib/mcp-catalog-snapshot.json`.

- [ ] **Step 2: Subir o dev server**

Run: `npm run dev` (em background; usar `&` ou outro terminal).

- [ ] **Step 3: Abrir browser em `/integracoes/servidor-mcp/chaves` (super_admin)**

Validar:
- "Nova chave" abre o modal.
- Passo 2 mostra Cadastros entre Vendas e Estoque.
- "Leitura e escrita" em Cadastros expõe Criar / Atualizar / Excluir / Arquivar / Transicionar.
- "Leitura e escrita" em Vendas / Compras / Financeiro / Fiscal / Contábil / Produção / RH / Projeto está desabilitado (cinza claro, cursor proibido, tooltip ao hover).
- Modal não estoura a viewport com os 11 módulos visíveis.

- [ ] **Step 4: Se algum item falhar, registrar e corrigir antes de prosseguir**

Bugs comuns:
- Cadastros aparece mas sem ações: snapshot não foi regenerado ou `extractFields` retorna vazio.
- Segmento desabilitado clica: faltou `disabled`/`onClick` no-op.
- Modal estoura: investigar `min-h-[280px]` e `sm:max-w-2xl`; aumentar para `sm:max-w-3xl` ou reduzir min-h.

- [ ] **Step 5: Sem commit (apenas validação)**

---

## Task 9: Sidebar agrupado em `mcp-docs-content.tsx`

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 1: Localizar definição de seções e sidebar**

Run: `grep -n "SECTIONS\|sidebar\|asideRef\|scrollToSection" src/components/integracoes/servidor-mcp/mcp-docs-content.tsx | head -20`
Identificar a lista de seções e como ela é renderizada no sidebar.

- [ ] **Step 2: Estender a estrutura para grupos**

Definir o tipo `Section`:

```ts
type SectionGroup = "visao-geral" | "externo" | "interno";

interface Section {
  id: string;
  label: string;
  group: SectionGroup;
}

const GROUP_LABELS: Record<SectionGroup, string> = {
  "visao-geral": "VISÃO GERAL",
  externo: "INTEGRAR DE FORA",
  interno: "OPERAR POR DENTRO",
};

const SECTIONS: Section[] = [
  { id: "inicio", label: "Início", group: "visao-geral" },
  { id: "conceitos", label: "Conceitos", group: "visao-geral" },
  { id: "codigos-de-erro", label: "Códigos de erro", group: "visao-geral" },
  { id: "rate-limits", label: "Rate limits", group: "visao-geral" },
  { id: "como-comecar", label: "Como começar", group: "externo" },
  { id: "autenticacao", label: "Autenticação", group: "externo" },
  { id: "headers", label: "Headers obrigatórios", group: "externo" },
  { id: "fluxo-de-chamada", label: "Fluxo de chamada", group: "externo" },
  { id: "tools-leitura", label: "Tools de leitura", group: "externo" },
  { id: "tools-escrita", label: "Tools de escrita", group: "externo" },
  { id: "quando-usar", label: "Quando usar", group: "interno" },
  { id: "service-token", label: "Service token e identidade", group: "interno" },
  { id: "restricao-escrita", label: "Restrição de escrita", group: "interno" },
  { id: "exemplo-agente-nex", label: "Exemplo: Agente Nex", group: "interno" },
];
```

- [ ] **Step 3: Renderizar grupos no sidebar**

Substituir a iteração `SECTIONS.map(s => ...)` por:

```tsx
{(["visao-geral", "externo", "interno"] as SectionGroup[]).map((group) => (
  <div key={group} className="space-y-1">
    <div className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
      {GROUP_LABELS[group]}
    </div>
    {SECTIONS.filter((s) => s.group === group).map((s) => (
      <a
        key={s.id}
        href={`#${s.id}`}
        onClick={(e) => { e.preventDefault(); scrollToSection(s.id); }}
        className={cn(
          "block rounded-md px-2 py-1.5 text-sm transition-colors",
          activeSection === s.id
            ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
        )}
      >
        {s.label}
      </a>
    ))}
  </div>
))}
```

(Substituir `scrollToSection` e `activeSection` pelas variáveis reais do componente; verificar nome exato.)

- [ ] **Step 4: Rodar tsc**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 5: Validar no browser**

Abrir `/integracoes/servidor-mcp/docs`. Sidebar deve mostrar 3 grupos com cabeçalhos em caixa alta, separados visualmente.

- [ ] **Step 6: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "feat(mcp-docs): sidebar agrupado em Visão Geral / Externo / Interno"
```

---

## Task 10: Conteúdo textual — Início + Conceitos

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 1: Localizar a seção "Início" no JSX**

Run: `grep -n "id=\"inicio\"\|\"inicio\"\|Início" src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 2: Reescrever conteúdo de Início**

Substituir o JSX da seção `#inicio` por:

```tsx
<section id="inicio" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Início</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    O servidor MCP é a camada semântica de leitura sobre o Odoo. Ele lê do cache Postgres interno, populado pelo worker em ciclos de 3 minutos (incremental) e 24 horas (snapshot). Nenhuma chamada toca o Odoo ao vivo em leitura. Escrita só por chaves de API com capability marcada.
  </p>
  <div className="rounded-lg border border-border bg-card px-3 py-2.5">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Endpoint</div>
    <code className="text-sm font-mono text-foreground">{mcpUrl}</code>
  </div>
</section>
```

- [ ] **Step 3: Reescrever Conceitos**

Substituir a seção `#conceitos` por:

```tsx
<section id="conceitos" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Conceitos</h2>
  <div className="grid gap-3 md:grid-cols-2">
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold mb-1">Stateless</div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Cada chamada se autentica sozinha. Não há sessão. Reenvie o header Authorization em toda requisição.
      </p>
    </div>
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold mb-1">JSON-RPC 2.0</div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Protocolo de RPC padrão. Você envia {"{jsonrpc, id, method, params}"}, recebe {"{jsonrpc, id, result | error}"}. 2.0 é a versão suportada. 1.0 não.
      </p>
    </div>
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold mb-1">Modos de autenticação</div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Dois modos, mutuamente exclusivos. <a href="#autenticacao" className="text-violet-600 dark:text-violet-400 hover:underline">Externo</a> (Bearer mcp_live_...) para integradores. <a href="#quando-usar" className="text-violet-600 dark:text-violet-400 hover:underline">Interno</a> para código nosso server-side.
      </p>
    </div>
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold mb-1">RBAC por capabilities</div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        O que sua chave vê em tools/list depende das capabilities marcadas no momento da criação. Tools fora do escopo nem aparecem.
      </p>
    </div>
  </div>
</section>
```

- [ ] **Step 4: Rodar tsc**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "feat(mcp-docs): reescreve Início e Conceitos com 4 cards"
```

---

## Task 11: Conteúdo — Como começar + Autenticação (modo externo)

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 1: Reescrever Como começar**

Substituir a seção `#como-comecar` por:

```tsx
<section id="como-comecar" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Como começar</h2>
  <ol className="space-y-2 text-sm">
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-600 dark:text-violet-400">1</span>
      <span>Em <strong>Integrações &gt; Servidor MCP &gt; Chaves de Acesso</strong>, clique em <strong>Nova chave</strong>.</span>
    </li>
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-600 dark:text-violet-400">2</span>
      <span>No passo 2 do assistente, marque os módulos e ações de escrita que essa chave precisa.</span>
    </li>
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-600 dark:text-violet-400">3</span>
      <span>No passo final, copie o token <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">mcp_live_...</code>. Ele aparece uma única vez.</span>
    </li>
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-600 dark:text-violet-400">4</span>
      <span>Use o token no header Authorization da sua primeira chamada. Veja <a href="#autenticacao" className="text-violet-600 dark:text-violet-400 hover:underline">Autenticação</a>.</span>
    </li>
  </ol>
</section>
```

- [ ] **Step 2: Reescrever Autenticação**

Substituir a seção `#autenticacao` por:

```tsx
<section id="autenticacao" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Autenticação</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    Toda requisição usa Bearer Token no header <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Authorization</code>. Não há sessão; cada chamada é autenticada de forma independente.
  </p>
  <div className="rounded-lg border border-border bg-card p-3">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
      Exemplo: primeira chamada de leitura autenticada
    </div>
    <CodeBlock code={buildExamples(mcpUrl, "cadastro_contar_parceiros", {})} />
    <p className="text-[11px] text-muted-foreground mt-2">
      A tool <code className="font-mono">cadastro_contar_parceiros</code> não exige argumentos. É um bom teste de credenciais.
    </p>
  </div>
  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
    <span>Mantenha o token em segredo. Nunca em código de cliente, repositório público ou log. Em caso de vazamento, revogue na hora e gere uma nova.</span>
  </div>
</section>
```

- [ ] **Step 3: Rodar tsc + browser visual**

Run: `npx tsc --noEmit`
Expected: 0 erros.

Validar visualmente que o exemplo agora tem o rótulo "Exemplo: primeira chamada de leitura autenticada".

- [ ] **Step 4: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "feat(mcp-docs): reescreve Como começar e Autenticação com exemplo rotulado"
```

---

## Task 12: Conteúdo — Headers obrigatórios + Fluxo de chamada

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 1: Adicionar seção Headers obrigatórios**

Inserir após `#autenticacao` e antes de `#fluxo-de-chamada`:

```tsx
<section id="headers" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Headers obrigatórios</h2>
  <div className="overflow-hidden rounded-lg border border-border">
    <table className="w-full text-sm">
      <thead className="bg-muted/40">
        <tr className="text-left">
          <th className="px-3 py-2 font-medium">Header</th>
          <th className="px-3 py-2 font-medium">Quando</th>
          <th className="px-3 py-2 font-medium">Valor</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        <tr>
          <td className="px-3 py-2 font-mono text-xs">Authorization</td>
          <td className="px-3 py-2">sempre</td>
          <td className="px-3 py-2 font-mono text-xs">Bearer mcp_live_...</td>
        </tr>
        <tr>
          <td className="px-3 py-2 font-mono text-xs">Content-Type</td>
          <td className="px-3 py-2">sempre</td>
          <td className="px-3 py-2 font-mono text-xs">application/json</td>
        </tr>
        <tr>
          <td className="px-3 py-2 font-mono text-xs">Idempotency-Key</td>
          <td className="px-3 py-2">só escrita</td>
          <td className="px-3 py-2 font-mono text-xs">UUID v4 único por operação</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div className="rounded-lg border border-border bg-card p-3 space-y-2">
    <div className="text-sm font-semibold">Como gerar o Idempotency-Key</div>
    <p className="text-xs text-muted-foreground leading-relaxed">
      Uma chave UUID v4 nova por operação de escrita. Reenviar com a mesma chave devolve o resultado original sem duplicar.
    </p>
    <CodeBlock
      code={{
        curl: `IDEM=$(uuidgen)
curl -X POST "${mcpUrl}" \\
  -H "Authorization: Bearer mcp_live_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $IDEM" \\
  -d '...'`,
        javascript: `const idem = crypto.randomUUID();
await fetch("${mcpUrl}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer mcp_live_SEU_TOKEN",
    "Content-Type": "application/json",
    "Idempotency-Key": idem,
  },
  body: JSON.stringify({ /* ... */ }),
});`,
        python: `import uuid, requests

idem = str(uuid.uuid4())
requests.post(
    "${mcpUrl}",
    headers={
        "Authorization": "Bearer mcp_live_SEU_TOKEN",
        "Content-Type": "application/json",
        "Idempotency-Key": idem,
    },
    json={ },
)`,
      }}
    />
  </div>
</section>
```

Adicionar `{ id: "headers", label: "Headers obrigatórios", group: "externo" }` em `SECTIONS` (já foi feito no Task 9 se seguiu a ordem).

- [ ] **Step 2: Reescrever Fluxo de chamada**

Substituir a seção `#fluxo-de-chamada` por:

```tsx
<section id="fluxo-de-chamada" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Fluxo de chamada</h2>
  <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-xs leading-relaxed text-muted-foreground font-mono">
{`seu sistema  ──POST /api/mcp──▶  servidor MCP  ──SELECT──▶  Postgres cache
                                       │
                                       └── auditoria ──▶  McpAuditLog`}
  </pre>
  <p className="text-sm text-muted-foreground leading-relaxed">
    O cache é atualizado pelo worker em duas frentes: incremental a cada 3 minutos e snapshot/reconcile a cada 24 horas. Cada resposta de leitura inclui o <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">lastSyncAt</code> da tabela base.
  </p>
</section>
```

- [ ] **Step 3: Rodar tsc + visual**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "feat(mcp-docs): adiciona seção Headers obrigatórios e reescreve Fluxo de chamada"
```

---

## Task 13: Conteúdo — Tools de leitura + Tools de escrita (callouts auditados)

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 1: Localizar o renderizador de Tools de escrita (callout)**

Run: `grep -n "Esta tool só pode ser invocada\|Agente Nex.*modo interno" src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`
Identificar o card de callout em `ToolCard` que aparece para write tools (linha ~544).

- [ ] **Step 2: Reescrever o callout do write tool**

Substituir o bloco `{isWrite && tool.capability && (...)}` por:

```tsx
{isWrite && tool.capability && (
  <div className="flex items-start gap-2 rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
    <Key className="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>
      Esta tool exige a capability{" "}
      <code className="rounded bg-violet-500/10 px-1 py-0.5 font-mono">
        {tool.capability}
      </code>{" "}
      marcada na chave de acesso. Ver detalhes em{" "}
      <a href="#restricao-escrita" className="underline">Restrição de escrita</a>.
    </span>
  </div>
)}
```

A frase "O Agente Nex (modo interno) não consegue chamar tools de escrita" sai daqui. Vai para a seção "Restrição de escrita".

- [ ] **Step 3: Garantir que a seção `#tools-leitura` e `#tools-escrita` filtram corretamente**

Localizar `grep -n "id=\"tools-\|tools-leitura\|tools-escrita" src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`. Já existe seção `#tools` única hoje. Dividir em duas:

```tsx
<section id="tools-leitura" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Tools de leitura</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    Consultas que não modificam dados. Não exigem Idempotency-Key.
  </p>
  {catalog.map((mod) => mod.readTools.length > 0 && (
    <div key={`read-${mod.module}`} className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{moduleLabel(mod.module)}</div>
      {mod.readTools.map((tool, idx) => (
        <ToolCard key={tool.id} tool={tool} base={mcpUrl} isFirst={idx === 0 && mod.module === catalog[0].module} />
      ))}
    </div>
  ))}
</section>

<section id="tools-escrita" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Tools de escrita</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    Mutações no Odoo. Exigem header Idempotency-Key. Só executáveis por chaves de API com capability adequada.
  </p>
  {catalog.map((mod) => mod.writeTools.length > 0 && (
    <div key={`write-${mod.module}`} className="space-y-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{moduleLabel(mod.module)}</div>
      {mod.writeTools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} base={mcpUrl} />
      ))}
    </div>
  ))}
</section>
```

(Importar `moduleLabel` se ainda não importado.)

- [ ] **Step 4: Atualizar `SECTIONS` com `tools-leitura` e `tools-escrita`**

Já está no Task 9. Confirmar que a seção monolítica `tools` antiga foi removida.

- [ ] **Step 5: Rodar tsc**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "feat(mcp-docs): separa Tools de leitura e escrita, reescreve callout do write"
```

---

## Task 14: Conteúdo — Códigos de erro + Rate limits

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 1: Reescrever Códigos de erro**

Localizar `grep -n "codigos-de-erro\|Códigos de erro" src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`. Substituir por:

```tsx
<section id="codigos-de-erro" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Códigos de erro</h2>
  <div className="overflow-hidden rounded-lg border border-border">
    <table className="w-full text-sm">
      <thead className="bg-muted/40">
        <tr className="text-left">
          <th className="px-3 py-2 font-medium">HTTP</th>
          <th className="px-3 py-2 font-medium">Código</th>
          <th className="px-3 py-2 font-medium">Quando</th>
          <th className="px-3 py-2 font-medium">Como resolver</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border text-xs">
        <tr><td className="px-3 py-2 font-mono">401</td><td className="px-3 py-2 font-mono">unauthorized</td><td className="px-3 py-2">Header Authorization ausente, token inválido ou chave revogada.</td><td className="px-3 py-2">Reenvie o header com um token válido.</td></tr>
        <tr><td className="px-3 py-2 font-mono">403</td><td className="px-3 py-2 font-mono">capability_missing</td><td className="px-3 py-2">A chave existe, mas não tem permissão para a tool.</td><td className="px-3 py-2">Edite a chave em Chaves de Acesso e marque a capability necessária.</td></tr>
        <tr><td className="px-3 py-2 font-mono">400</td><td className="px-3 py-2 font-mono">idempotency_key_required</td><td className="px-3 py-2">Operação de escrita sem o header Idempotency-Key.</td><td className="px-3 py-2">Envie um UUID v4 no header e refaça.</td></tr>
        <tr><td className="px-3 py-2 font-mono">409</td><td className="px-3 py-2 font-mono">idempotency_conflict</td><td className="px-3 py-2">Mesma Idempotency-Key reusada com payload diferente.</td><td className="px-3 py-2">Gere uma nova chave UUID v4 ou repita o payload original.</td></tr>
        <tr><td className="px-3 py-2 font-mono">422</td><td className="px-3 py-2 font-mono">idempotency_in_progress</td><td className="px-3 py-2">A mesma chave já está em execução em outra requisição.</td><td className="px-3 py-2">Aguarde alguns segundos e tente de novo.</td></tr>
        <tr><td className="px-3 py-2 font-mono">429</td><td className="px-3 py-2 font-mono">rate_limit_exceeded</td><td className="px-3 py-2">Mais chamadas por minuto que o limite da chave.</td><td className="px-3 py-2">Espere o Retry-After indicado no header da resposta.</td></tr>
        <tr><td className="px-3 py-2 font-mono">503</td><td className="px-3 py-2 font-mono">idempotency_lock_unavailable</td><td className="px-3 py-2">Lock distribuído (Redis) indisponível.</td><td className="px-3 py-2">Tente novamente em alguns segundos.</td></tr>
      </tbody>
    </table>
  </div>
</section>
```

- [ ] **Step 2: Reescrever Rate limits**

```tsx
<section id="rate-limits" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Rate limits</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    Cada chave tem um limite por minuto, configurável no passo 3 do assistente (1 a 600, padrão 60). A janela é de 60 segundos deslizantes, contagem por chave. Ao exceder, a resposta vem com HTTP 429 e o header <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Retry-After</code> em segundos.
  </p>
</section>
```

- [ ] **Step 3: Rodar tsc**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "feat(mcp-docs): reescreve Códigos de erro e Rate limits com dados reais"
```

---

## Task 15: Conteúdo — Modo interno (4 sub-seções)

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

- [ ] **Step 1: Adicionar bloco "Operar por dentro" no JSX**

Logo após `#tools-escrita`, antes de fechar o body principal, inserir:

```tsx
<section id="quando-usar" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Quando usar o modo interno</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    Modo interno é só para código nosso, server-side (worker, Agente Nex, scripts internos). Cliente nunca recebe MCP_SERVICE_TOKEN. Se você está integrando de fora, use o modo externo (Bearer mcp_live_).
  </p>
</section>

<section id="service-token" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Service token e identidade</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    Modo interno usa dois headers obrigatórios em cada requisição. Não há sessão.
  </p>
  <div className="overflow-hidden rounded-lg border border-border">
    <table className="w-full text-sm">
      <thead className="bg-muted/40">
        <tr className="text-left">
          <th className="px-3 py-2 font-medium">Header</th>
          <th className="px-3 py-2 font-medium">Valor</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border text-xs">
        <tr><td className="px-3 py-2 font-mono">Authorization</td><td className="px-3 py-2 font-mono">Bearer ${"${MCP_SERVICE_TOKEN}"}</td></tr>
        <tr><td className="px-3 py-2 font-mono">X-Mcp-User-Id</td><td className="px-3 py-2">ID do usuário da plataforma cuja identidade efetua a chamada</td></tr>
      </tbody>
    </table>
  </div>
  <p className="text-xs text-muted-foreground leading-relaxed">
    A comparação do service token é constant-time (<code className="font-mono">timingSafeEqual</code>) contra a env var <code className="font-mono">MCP_SERVICE_TOKEN</code>. Sem X-Mcp-User-Id ou com user inexistente, 401.
  </p>
</section>

<section id="restricao-escrita" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Restrição de escrita</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    O dispatcher do modo interno bloqueia qualquer tool com operation="write", retornando 403 <code className="font-mono">forbidden_via_internal_auth</code> antes de chegar no Odoo. É defesa por rota de auth, não por prompt: o Agente Nex pode listar tools de escrita no <code className="font-mono">tools/list</code> do usuário, mas não consegue executá-las nesse modo.
  </p>
  <p className="text-xs text-muted-foreground leading-relaxed">
    Implementado em <code className="font-mono">mcp/dispatcher/check-mode.ts</code>.
  </p>
</section>

<section id="exemplo-agente-nex" className="scroll-mt-24 space-y-3">
  <h2 className="text-xl font-semibold">Exemplo: Agente Nex</h2>
  <p className="text-sm text-muted-foreground leading-relaxed">
    Snippet TypeScript de chamada server-side, lendo o token do env e resolvendo o usuário da sessão in-app.
  </p>
  <CodeBlock
    code={{
      javascript: `// Server-side, dentro do app Next.js
const userId = await resolveUserIdFromSession();
const res = await fetch(process.env.MCP_INTERNAL_URL!, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.MCP_SERVICE_TOKEN}\`,
    "X-Mcp-User-Id": userId,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "cadastro_contar_parceiros", arguments: {} },
  }),
});
const data = await res.json();`,
    }}
  />
</section>
```

- [ ] **Step 2: Rodar tsc**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Validar visualmente**

Sidebar de "Operar por dentro" deve mostrar 4 itens; cada seção scrolla via hash.

- [ ] **Step 4: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "feat(mcp-docs): adiciona seção Operar por dentro com 4 sub-seções"
```

---

## Task 16: Gerador de exemplos tipado em `buildExamples`/`ToolCard`

**Files:**
- Modify: `src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`
- Create: `src/lib/__tests__/mcp-docs-build-examples.test.ts`

- [ ] **Step 1: Escrever o teste falhando**

Criar `src/lib/__tests__/mcp-docs-build-examples.test.ts`:

```ts
import { typedPlaceholder } from "@/components/integracoes/servidor-mcp/mcp-docs-content";
// se a função não for exportada, criar wrapper de teste no próprio arquivo

describe("typedPlaceholder", () => {
  it("retorna true para boolean", () => {
    expect(typedPlaceholder({ name: "x", type: "boolean", optional: false })).toBe(true);
  });
  it("retorna 1 para integer/number", () => {
    expect(typedPlaceholder({ name: "x", type: "integer", optional: false })).toBe(1);
    expect(typedPlaceholder({ name: "x", type: "number", optional: false })).toBe(1);
  });
  it("retorna YYYY-MM-DD para date", () => {
    expect(typedPlaceholder({ name: "x", type: "date", optional: false })).toBe("2026-05-24");
  });
  it("retorna primeiro valor do enum", () => {
    expect(typedPlaceholder({ name: "x", type: "enum", optional: false, enumValues: ["a", "b"] })).toBe("a");
  });
  it("retorna placeholder semântico para string", () => {
    expect(typedPlaceholder({ name: "nomeCliente", type: "string", optional: false })).toBe("<nomeCliente>");
  });
  it("retorna [] para array", () => {
    expect(typedPlaceholder({ name: "x", type: "array", optional: false })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx jest src/lib/__tests__/mcp-docs-build-examples.test.ts`
Expected: FAIL, `typedPlaceholder is not a function`.

- [ ] **Step 3: Implementar `typedPlaceholder`**

Adicionar em `mcp-docs-content.tsx`, antes de `buildExamples`:

```ts
import type { CatalogInputField } from "@/lib/actions/mcp-catalog-schema";

export function typedPlaceholder(field: CatalogInputField): unknown {
  switch (field.type) {
    case "boolean": return true;
    case "integer":
    case "number": return 1;
    case "date": return "2026-05-24";
    case "datetime": return "2026-05-24T00:00:00Z";
    case "enum": return field.enumValues?.[0] ?? "<valor>";
    case "array": return [];
    case "object": return {};
    case "string": return `<${field.name}>`;
    default: return "<valor>";
  }
}
```

- [ ] **Step 4: Substituir o uso de `inputSchemaKeys` em `ToolCard`**

Em `mcp-docs-content.tsx:495-498`, substituir:

```ts
const catalogExamples = toolExamplesRecord(tool);
const sampleArgs: Record<string, unknown> = {};
const fields = tool.inputSchemaFields ?? tool.inputSchemaKeys.map((name) => ({
  name,
  type: "unknown" as const,
  optional: false,
}));
for (const f of fields.slice(0, 3)) {
  sampleArgs[f.name] = typedPlaceholder(f);
}
const fallbackExamples = buildExamples(base, tool.id, sampleArgs);
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx jest src/lib/__tests__/mcp-docs-build-examples.test.ts`
Expected: PASS.

- [ ] **Step 6: Rodar tsc + jest globais**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 7: Validar visualmente**

Abrir `/integracoes/servidor-mcp/docs`, expandir a tool `cadastro_parceiros_por_uf`. O exemplo cURL deve mostrar `"apenasClientes": true` (não `"..."`).

- [ ] **Step 8: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx src/lib/__tests__/mcp-docs-build-examples.test.ts
git commit -m "feat(mcp-docs): gerador de exemplos tipado (boolean/integer/date/enum)"
```

---

## Task 17: Auditar e atualizar `servidorMcpDocsTour`

**Files:**
- Modify: `src/lib/tours/servidor-mcp-tour.ts`

- [ ] **Step 1: Listar passos do tour de docs**

Run: `grep -A30 "servidorMcpDocsTour" src/lib/tours/servidor-mcp-tour.ts | head -60`
Identificar `targetSelector` de cada passo.

- [ ] **Step 2: Conferir cada selector contra o DOM atual**

Para cada `data-tour='X'`, rodar:
Run: `grep -n "data-tour=\"X\"" src/components/integracoes/servidor-mcp/mcp-docs-content.tsx`

Selectors esperados que ainda existem (Task 9 e 13 mantiveram):
- `mcp-nav` (no servidor-mcp-nav, não tocamos)
- `mcp-docs-passos` (na seção Como começar, linha 877 do original; mover para a nova seção `#como-comecar`)
- `mcp-docs-tools-head` (cabeçalho das tools, agora em `#tools-leitura`)
- `mcp-docs-tool` (primeira tool, mantido no `ToolCard isFirst`)

Se algum selector não existe no DOM novo, ajustar:
- Mover `data-tour="mcp-docs-passos"` para o `<ol>` em "Como começar".
- Mover `data-tour="mcp-docs-tools-head"` para o `<h2>` em "Tools de leitura".

- [ ] **Step 3: Aplicar `data-tour` na nova estrutura**

Em "Como começar" (Task 11), adicionar atributo no `<ol>`:

```tsx
<ol data-tour="mcp-docs-passos" className="space-y-2 text-sm">
```

Em "Tools de leitura" (Task 13), adicionar no `<h2>`:

```tsx
<h2 data-tour="mcp-docs-tools-head" className="text-xl font-semibold">Tools de leitura</h2>
```

- [ ] **Step 4: Validar com tour**

Abrir `/integracoes/servidor-mcp/docs`, clicar no botão de tour (`?` ao lado do título). Cada passo deve apontar para o elemento correto.

- [ ] **Step 5: Commit**

```bash
git add src/components/integracoes/servidor-mcp/mcp-docs-content.tsx
git commit -m "fix(mcp-docs-tour): preserva data-tour selectors após reorganização do sidebar"
```

---

## Task 18: Verificação completa

**Files:** nenhum

- [ ] **Step 1: Build limpo**

Run: `rm -rf .next && npx tsc --noEmit && npx eslint src --max-warnings=0 && npx jest`
Expected: tudo verde, 0 warnings ESLint.

- [ ] **Step 2: Regenerar snapshot final**

Run: `npm run gen:mcp-catalog`
Expected: sem mudanças adicionais no JSON (ele já foi commitado no Task 5).
Se houver mudanças, commitar: `git add src/lib/mcp-catalog-snapshot.json && git commit -m "chore(mcp-catalog): regenera snapshot final"`.

- [ ] **Step 3: Subir dev server**

Run: `npm run dev` (background).

- [ ] **Step 4: Smoke test E2E manual no browser**

Página /integracoes/servidor-mcp/docs:
- Sidebar mostra 3 grupos.
- "Início" renderiza com endpoint.
- "Conceitos" mostra 4 cards.
- "Como começar" lista 4 passos.
- "Autenticação" tem rótulo "Exemplo: primeira chamada de leitura autenticada".
- "Headers obrigatórios" tem tabela e card de geração de UUID.
- "Tools de leitura" e "Tools de escrita" são seções separadas.
- Tool `cadastro_parceiros_por_uf` mostra `"apenasClientes": true` (não `"..."`).
- Tool `cadastros.res_partner.update` mostra exemplo cURL com APENAS Authorization, Content-Type, Idempotency-Key (sem X-Mcp-User-Id, sem SERVICE_TOKEN).
- "Operar por dentro" tem 4 sub-seções e snippet TypeScript.

Página /integracoes/servidor-mcp/chaves:
- Modal "Nova chave" mostra 11 módulos.
- Cadastros expõe 5 ações (Criar, Atualizar, Excluir, Arquivar, Transicionar).
- Vendas/Compras/Financeiro/Fiscal/Contábil/Produção/RH/Projeto têm "Leitura e escrita" desabilitado com tooltip ao hover.
- Modal não estoura a viewport; scroll interno funciona; footer sempre visível.

- [ ] **Step 5: Documentar achados se houver bugs**

Qualquer bug encontrado vira sub-task de correção, com commit dedicado.

---

## Task 19: Code review automatizado

**Files:** nenhum

- [ ] **Step 1: Rodar /gsd-code-review**

No chat principal do Claude Code, invocar `/gsd-code-review` apontando para o diff da branch desde o início desse plano (`feat/f4-leitura-expansao` foi o ponto de partida; commitar tudo aqui é incremento sobre o último commit já remoto).

Expected: REVIEW.md gerado em `.planning/<phase>/REVIEW.md` com classificação por severidade.

- [ ] **Step 2: Aplicar fixes high/critical**

Para cada finding classificado HIGH ou CRITICAL, criar commit de fix:

```bash
git add <arquivos>
git commit -m "fix(<área>): <descrição do fix>"
```

LOW/MEDIUM são opcionais.

---

## Task 20: UI review

**Files:** nenhum

- [ ] **Step 1: Rodar /gsd-ui-review**

Invocar `/gsd-ui-review` apontando para as duas páginas tocadas.

Expected: UI-REVIEW.md com 6 pilares (legibilidade, hierarquia, espaçamento, cor/contraste, interação, microcopy).

- [ ] **Step 2: Aplicar fixes visuais**

Commits dedicados para cada ajuste.

---

## Self-review do plano (executado pelo writer)

**Cobertura da SPEC:**
- D1 (3 grupos no sidebar) → Task 9 ✅
- D2 (modo interno some do exemplo público de escrita) → Task 13 ✅
- D3 (cadastros em MCP_MODULES) → Task 1 ✅
- D4 (Archive em WRITE_ACTIONS) → Task 2 ✅
- D5 (archive em ACTION_CODE_TO_WRITE) → Task 3 ✅
- D6 (segmento "Leitura e escrita" desabilitado) → Task 7 ✅
- D7 (placeholder tipado) → Task 5 (gerador) + Task 16 (consumer) ✅
- D8 (npm run gen:mcp-catalog) → Task 5 step 5, Task 8, Task 18 step 2 ✅
- D9 (modal validação empírica) → Task 8 ✅
- D10 (sem mudança em auth) → não há task de mudança, ok ✅

Critérios de aceitação 1-10: todos endereçados em Task 18 step 4 + Tasks de Code/UI review.

**Sem placeholders:** revisado. Todos os "..." em snippets são literais (placeholder semântico do gerador novo). Sem "TBD" / "implementar depois" / "similar a Task N".

**Type consistency:** `WriteAction` consistente entre tasks. `CatalogInputField` exportado em Task 5 e consumido em Task 16. `typedPlaceholder` definido em Task 16. `LevelSegmented.writeDisabled` consistente entre componente (Task 7 step 2) e caller (Task 7 step 3).

Plano pronto para execução inline.
