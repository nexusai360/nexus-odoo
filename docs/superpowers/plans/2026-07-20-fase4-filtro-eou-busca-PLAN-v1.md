# Fase 4 , Motor de filtro E/OU aninhado + busca inteligente (B-09 Entregas Parciais) , PLAN v1

> **For agentic workers:** Executar TASK a TASK com TDD. UI **SEMPRE inline** na sessão principal (regra do projeto: layout nunca vai para subagente). Steps usam checkbox (`- [ ]`).

**Goal:** Dar ao B-09 (tabela de Entregas Parciais) um motor de filtro personalizado E/OU aninhado e uma busca inteligente por facets ("Campo: valor"), reaproveitando o motor `filtro-avancado.ts` e os componentes de builder já existentes, sem regredir as outras 7 telas que usam o mesmo DataTable.

**Architecture:** Reuso máximo. O motor `src/lib/reports/filtro-avancado.ts` (árvore `Grupo`/`Condicao`, conector **E/OU**, `compilarFiltro` → predicado client-side) já existe e já casa com a decisão D1. Os componentes visuais de builder (`GrupoBuilder`/`CondicaoRow`) já existem dentro de `filters-dialog.tsx` (hoje acoplado à URL dos Relatórios) e são **puros** (controlados por `onChange`), logo extraíveis para um módulo compartilhado. O DataTable ganha uma prop aditiva `filtroAvancado?` que insere um estágio no pipeline client-side (`busca → facets → filtro E/OU → sort`) e um botão "Filtros" na toolbar no mesmo padrão `Popover`+`Button` já usado. A busca inteligente evolui o input de busca existente com um dropdown de sugestões de facet.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, base-ui (`Popover`, `Button`, `Input`, `Dialog`), lucide-react. Zero dependência nova (sem TanStack/dnd-kit). Estado client-side efêmero (`useState`/`useMemo`), igual ao resto do DataTable.

## Global Constraints

- **Proibido travessão `—`** em qualquer texto (UI, código, docs, commits). Usar vírgula/parênteses/dois-pontos.
- **Nada vai para produção sem "sim" explícito do dono.** Trabalho só na branch `feat/entregas-parciais-base-calculo`, local.
- **UI nunca delegada a subagente.** Toda UI é inline na sessão principal + `ui-ux-pro-max` já consultada.
- **Aditivo e não-regressivo.** O DataTable é usado em 8 arquivos. Toda mudança é via **prop opcional** com default que preserva o comportamento atual. Só o B-09 liga `filtroAvancado`.
- **Design system:** violet (`#7c3aed`) via classes `violet-500`, tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`), ícones **Lucide** (zero emoji), dark/light conferidos.
- **RSC→client:** funções `valor`/`get`/componentes de coluna não atravessam como prop; o filtro opera sobre chaves serializáveis (`row[campo]`), igual ao motor atual.
- **Fonte única do motor:** não duplicar lógica de avaliação; tudo passa por `compilarFiltro`.

---

## File Structure

| Arquivo | Papel | Ação |
|---|---|---|
| `src/lib/reports/filtro-avancado.ts` | Motor: tipos `Grupo`/`Condicao`/`Operador`, `OPERADORES`, `compilarFiltro`. | Modificar (aditivo: novos operadores) |
| `src/lib/reports/filtro-avancado.test.ts` | Testes do motor. | Modificar (novos casos) |
| `src/components/reports/filtro-avancado-builder.tsx` | **NOVO.** `GrupoBuilder` + `CondicaoRow` puros, extraídos de `filters-dialog.tsx`. Client. | Criar |
| `src/components/reports/filters-dialog.tsx` | Dialog de filtro dos Relatórios (acoplado à URL). | Modificar (passa a importar do módulo extraído) |
| `src/components/charts/data-table-filtro.tsx` | **NOVO.** Botão "Filtros" + Popover/Dialog com o builder e estado local, para o DataTable. Client. | Criar |
| `src/components/charts/data-table-busca-inteligente.tsx` | **NOVO.** Input de busca com dropdown de sugestões de facet ("Campo: valor"). Client. | Criar |
| `src/components/charts/data-table.tsx` | DataTable genérico. | Modificar (prop `filtroAvancado`, estágio no pipeline, toolbar) |
| `src/components/charts/data-table.test.tsx` | Testes do DataTable. | Modificar (novos casos) |
| `src/components/diretoria/blocos/blocos-pedidos.tsx` | Monta o B-09 (`TabelaEntregasParciais`). | Modificar (liga `filtroAvancado`) |

---

## Task 1: Enriquecer o motor com operadores de gestão (aditivo, TDD)

Adiciona operadores que o dono precisa para "filtros inteligentes" e que hoje faltam: `nao_contem`, `vazio`, `preenchido`. Mantém os 5 existentes intactos. `vazio`/`preenchido` NÃO usam `valor`.

**Files:**
- Modify: `src/lib/reports/filtro-avancado.ts`
- Test: `src/lib/reports/filtro-avancado.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `type Operador` passa a incluir `"nao_contem" | "vazio" | "preenchido"`; `OPERADORES` ganha as 3 entradas; `compilarFiltro` avalia os 3.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// em filtro-avancado.test.ts, novo describe
import { compilarFiltro, type Grupo } from "./filtro-avancado";
const cols = [{ key: "obs", header: "Obs", tipo: "texto" }] as never;

test("nao_contem: verdadeiro quando o texto NÃO inclui o valor", () => {
  const g: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "nao_contem", valor: "urgente" }] };
  const p = compilarFiltro(g, cols);
  expect(p({ obs: "entrega normal" })).toBe(true);
  expect(p({ obs: "PEDIDO URGENTE" })).toBe(false);
});

test("vazio: verdadeiro quando o campo é null/undefined/'' (ignora valor)", () => {
  const g: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "vazio", valor: "" }] };
  const p = compilarFiltro(g, cols);
  expect(p({ obs: "" })).toBe(true);
  expect(p({ obs: null })).toBe(true);
  expect(p({ obs: "algo" })).toBe(false);
});

test("preenchido: verdadeiro quando o campo tem conteúdo", () => {
  const g: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "preenchido", valor: "" }] };
  const p = compilarFiltro(g, cols);
  expect(p({ obs: "algo" })).toBe(true);
  expect(p({ obs: "   " })).toBe(false); // só espaços = vazio
  expect(p({ obs: null })).toBe(false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest src/lib/reports/filtro-avancado.test.ts`
Expected: FAIL (operadores desconhecidos).

- [ ] **Step 3: Implementar (aditivo)**

Em `filtro-avancado.ts`:
```ts
export type Operador =
  | "igual"
  | "diferente"
  | "contem"
  | "nao_contem"
  | "vazio"
  | "preenchido"
  | "maior"
  | "menor";

export const OPERADORES: OperadorMeta[] = [
  { value: "igual", label: "igual a" },
  { value: "diferente", label: "diferente de" },
  { value: "contem", label: "contém" },
  { value: "nao_contem", label: "não contém" },
  { value: "vazio", label: "é vazio" },
  { value: "preenchido", label: "não é vazio" },
  { value: "maior", label: "maior que" },
  { value: "menor", label: "menor que" },
];
```
No `switch` de `avaliarCondicao`, adicionar antes do `default`:
```ts
      case "nao_contem":
        return !String(rawVal ?? "")
          .toLowerCase()
          .includes(c.valor.toLowerCase());

      case "vazio":
        return String(rawVal ?? "").trim() === "";

      case "preenchido":
        return String(rawVal ?? "").trim() !== "";
```
E, no topo de `avaliarCondicao`, o guard `if (!c.campo) return true;` já cobre condição sem campo. Para `vazio`/`preenchido`, `c.valor` fica vazio e não é lido , OK.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest src/lib/reports/filtro-avancado.test.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/filtro-avancado.ts src/lib/reports/filtro-avancado.test.ts
git commit -m "feat(fase4): operadores nao_contem/vazio/preenchido no motor de filtro"
```

---

## Task 2: Extrair `GrupoBuilder`/`CondicaoRow` para módulo compartilhado

Move os dois componentes puros de `filters-dialog.tsx` para um arquivo próprio, para o DataTable reusar sem herdar o acoplamento à URL. Refactor sem mudança de comportamento (os Relatórios continuam idênticos). Também adapta `CondicaoRow` para **esconder o input de valor** quando o operador é `vazio`/`preenchido`.

**Files:**
- Create: `src/components/reports/filtro-avancado-builder.tsx`
- Modify: `src/components/reports/filters-dialog.tsx` (remove as definições locais, importa do novo módulo)

**Interfaces:**
- Produces (export do novo módulo):
  - `type CampoOpcao = { value: string; label: string }`
  - `function CondicaoRow(props: { condicao: Condicao; campos: CampoOpcao[]; onChange: (n: Condicao) => void; onRemove: () => void }): JSX.Element`
  - `function GrupoBuilder(props: { grupo: Grupo; campos: CampoOpcao[]; onChange: (n: Grupo) => void; onRemove?: () => void; depth?: number }): JSX.Element`
- Consumes: `Grupo`, `Condicao`, `GrupoItem`, `OPERADORES`, `isGrupo` de `@/lib/reports/filtro-avancado`.

- [ ] **Step 1: Criar o módulo** `filtro-avancado-builder.tsx` com `"use client"` no topo, movendo verbatim `CondicaoRow` (linhas ~222-288 de filters-dialog) e `GrupoBuilder` (linhas ~290-~440), com os imports que eles usam (`cn`, `Button`, `Input`, ícones lucide `Trash2`/`Plus`, tipos do motor). Exportar ambos + `CampoOpcao`.

- [ ] **Step 2: Ajustar `CondicaoRow`** para esconder o valor em `vazio`/`preenchido`:

```tsx
// dentro de CondicaoRow, o <input> de valor:
{condicao.operador !== "vazio" && condicao.operador !== "preenchido" && (
  <input
    aria-label="Valor da condição"
    value={condicao.valor}
    onChange={(e) => onChange({ ...condicao, valor: e.target.value })}
    className="..." // manter classes atuais
  />
)}
```

- [ ] **Step 3: Alterar `filters-dialog.tsx`** para remover as definições locais de `CondicaoRow`/`GrupoBuilder` e importar do novo módulo:

```tsx
import { GrupoBuilder, type CampoOpcao } from "@/components/reports/filtro-avancado-builder";
```
Remover as interfaces `CondicaoRowProps`/`GrupoBuilderProps` locais e os dois `function`.

- [ ] **Step 4: Verificar não-regressão**

Run: `npx tsc --noEmit`
Run: `npx jest src/components/reports/`
Expected: tsc limpo; testes dos Relatórios/filters verdes (comportamento idêntico).

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/filtro-avancado-builder.tsx src/components/reports/filters-dialog.tsx
git commit -m "refactor(fase4): extrai GrupoBuilder/CondicaoRow para modulo compartilhado (aditivo, sem regressao)"
```

---

## Task 3: Componente `DataTableFiltroAvancado` (botão + Popover + builder + estado local)

Cria o controle de filtro avançado que o DataTable vai montar na toolbar. Botão "Filtros" no padrão `Popover`+`Button variant=outline size=sm h-8`, com badge de contagem de condições ativas; conteúdo = `GrupoBuilder` com um grupo raiz; ações "Limpar" e fechar.

**Files:**
- Create: `src/components/charts/data-table-filtro.tsx`

**Interfaces:**
- Produces:
  - `function contarCondicoes(grupo: Grupo): number` (recursivo: conta folhas com `campo` preenchido)
  - `function DataTableFiltroAvancado(props: { campos: CampoOpcao[]; grupo: Grupo; onChange: (g: Grupo) => void }): JSX.Element`
  - `const GRUPO_VAZIO: Grupo = { conector: "E", itens: [] }`
- Consumes: `GrupoBuilder`/`CampoOpcao` (Task 2), `Grupo` (motor), `Popover`/`Button` (base-ui), lucide `Filter`, `X`.

- [ ] **Step 1: Escrever teste de `contarCondicoes`** (unidade pura, em `data-table.test.tsx` ou um `data-table-filtro.test.tsx`):

```ts
import { contarCondicoes, GRUPO_VAZIO } from "./data-table-filtro";
test("contarCondicoes ignora folhas sem campo e conta aninhadas", () => {
  expect(contarCondicoes(GRUPO_VAZIO)).toBe(0);
  expect(contarCondicoes({ conector: "E", itens: [
    { campo: "uf", operador: "igual", valor: "SP" },
    { campo: "", operador: "igual", valor: "" },
    { conector: "OU", itens: [{ campo: "marca", operador: "contem", valor: "x" }] },
  ] })).toBe(2);
});
```

- [ ] **Step 2: Rodar e ver falhar.** `npx jest data-table-filtro` → FAIL.

- [ ] **Step 3: Implementar o componente + helpers.** Botão com `<Filter className="size-3.5">` + rótulo "Filtros" + badge `contarCondicoes` quando > 0 (classe `bg-violet-500/15 text-violet-500`). `PopoverContent` largo (`w-[min(92vw,32rem)]`) com o `GrupoBuilder grupo={grupo} campos={campos} onChange={onChange}` e um rodapé com botão "Limpar" (seta `GRUPO_VAZIO`) desabilitado quando 0 condições. Acessibilidade: `aria-label` no botão inclui a contagem.

- [ ] **Step 4: Rodar e ver passar.** `npx jest data-table-filtro` → PASS. `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/data-table-filtro.tsx src/components/charts/data-table.test.tsx
git commit -m "feat(fase4): componente DataTableFiltroAvancado (botao + builder E/OU + contagem)"
```

---

## Task 4: Integrar o filtro E/OU no pipeline do DataTable (prop aditiva)

Liga o componente da Task 3 ao DataTable via prop opcional `filtroAvancado`. Insere o estágio `compilarFiltro` no pipeline, entre os facets e o sort. Reset de página. Campos = colunas visíveis (coerente com a regra de "filtro em coluna oculta some linha sem explicação" da review M3 anterior).

**Files:**
- Modify: `src/components/charts/data-table.tsx`
- Test: `src/components/charts/data-table.test.tsx`

**Interfaces:**
- Consumes: `DataTableFiltroAvancado`, `GRUPO_VAZIO`, `contarCondicoes` (Task 3); `compilarFiltro` (motor).
- Produces: `DataTableProps<T>` ganha `filtroAvancado?: boolean` (default `false`).

- [ ] **Step 1: Teste de integração** (React Testing Library) em `data-table.test.tsx`: renderiza `<DataTable filtroAvancado ...>` com 3 linhas, abre "Filtros", adiciona condição `uf igual SP`, e verifica que só a linha SP fica visível. (Se o teste de RTL for pesado, cobrir ao menos o pipeline: extrair uma função `aplicarFiltroAvancado(rows, grupo, columns)` e testá-la puramente.)

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.**
  - Import: `import { DataTableFiltroAvancado, GRUPO_VAZIO, contarCondicoes } from "./data-table-filtro";` e `import { compilarFiltro, type Grupo } from "@/lib/reports/filtro-avancado";`
  - Prop: adicionar `filtroAvancado = false` na desestruturação e no `interface DataTableProps<T>`.
  - Estado: `const [grupoFiltro, setGrupoFiltro] = useState<Grupo>(GRUPO_VAZIO);`
  - Campos: `const camposFiltro = useMemo(() => colunasVisiveis.map((c) => ({ value: c.key, label: c.header })), [colunasVisiveis]);`
  - Pipeline: inserir estágio após `colFiltered`:
    ```ts
    const advFiltered = useMemo(() => {
      if (!filtroAvancado) return colFiltered;
      const pred = compilarFiltro(grupoFiltro, columns);
      return colFiltered.filter(pred);
    }, [filtroAvancado, colFiltered, grupoFiltro, columns]);
    ```
    e trocar `sortRows(colFiltered, ...)` → `sortRows(advFiltered, ...)`.
  - Reset página: incluir `grupoFiltro` nas deps do `useEffect(setPagina(1))`.
  - Toolbar: montar `{filtroAvancado && <DataTableFiltroAvancado campos={camposFiltro} grupo={grupoFiltro} onChange={setGrupoFiltro} />}` ao lado do seletor de Colunas.
  - CSV: `handleExport` já usa `sorted` → respeita o filtro automaticamente.

- [ ] **Step 4: Rodar e ver passar.** `npx jest src/components/charts/data-table.test.tsx` + `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/data-table.tsx src/components/charts/data-table.test.tsx
git commit -m "feat(fase4): DataTable ganha estagio de filtro E/OU aninhado (prop aditiva filtroAvancado)"
```

---

## Task 5: Ligar o filtro avançado no B-09

**Files:**
- Modify: `src/components/diretoria/blocos/blocos-pedidos.tsx` (o `<DataTable>` do `TabelaEntregasParciais`, ~linha 252)

- [ ] **Step 1:** Adicionar a prop `filtroAvancado` ao `<DataTable ...>` do B-09 (só ele).
- [ ] **Step 2:** `npx tsc --noEmit` limpo; conferir que as outras telas (pedidos-pendentes, demandas-mais-paradas, demandas-por-estado, vendas, estoque, composicao-kit) NÃO ganharam a prop (grep).
- [ ] **Step 3: Commit** `feat(fase4): liga filtro E/OU no B-09 Entregas Parciais`.

---

## Task 6: Busca inteligente por facets ("Campo: valor")

Evolui o input de busca do B-09: ao digitar, um dropdown sugere facetas das colunas visíveis que casam com o termo ("UF: SP", "Vendedor: João"). Selecionar uma sugestão adiciona uma `Condicao {campo, operador: "igual", valor}` ao grupo de filtro raiz (unifica busca inteligente e filtro E/OU). A busca textual livre (comportamento atual) continua funcionando quando nenhuma sugestão é escolhida.

**Files:**
- Create: `src/components/charts/data-table-busca-inteligente.tsx`
- Modify: `src/components/charts/data-table.tsx` (usa o novo input quando `filtroAvancado`)

**Interfaces:**
- Produces:
  - `type Sugestao = { campo: string; label: string; valor: string }`
  - `function montarSugestoes(termo: string, colunas: {key: string; header: string; tipo: string}[], valoresPorColuna: Record<string, string[]>, limite?: number): Sugestao[]` (pura, testável)
  - `function BuscaInteligente(props: { value: string; onChange: (v: string) => void; sugestoes: Sugestao[]; onEscolher: (s: Sugestao) => void }): JSX.Element`
- Consumes: `valoresPorColuna` (já computado no DataTable, linha ~292), `Input` (base-ui), lucide `Search`.

- [ ] **Step 1: Teste de `montarSugestoes`** (pura): dado termo "sp" e coluna `uf` com valores `["SP","RJ","ES"]`, retorna `[{campo:"uf",label:"UF",valor:"SP"}]`; case-insensitive; respeita `limite`; ignora colunas numéricas/moeda (facet só de texto/tag).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `montarSugestoes` + `BuscaInteligente` (input + lista `role="listbox"` com `option`s, navegação por teclado ↑↓/Enter/Esc, `aria-activedescendant`). Selecionar chama `onEscolher`.
- [ ] **Step 4: Integrar no DataTable**: quando `filtroAvancado`, renderizar `<BuscaInteligente>` no lugar do `<Input>` de busca; `onEscolher(s)` faz `setGrupoFiltro(g => ({...g, itens: [...g.itens, {campo: s.campo, operador: "igual", valor: s.valor}]}))` e limpa o termo. A busca textual livre segue via `debouncedQuery`.
- [ ] **Step 5: Rodar e ver passar** + `tsc`.
- [ ] **Step 6: Commit** `feat(fase4): busca inteligente por facets (sugestao Campo: valor) no B-09`.

---

## Task 7: Perícia + E2E contra o cache real + docs

- [ ] **Step 1: Suíte completa** `npx tsc --noEmit && npx jest && npx eslint src/components/charts src/components/reports src/lib/reports` , tudo verde (falha pré-existente de `model-catalog` é tolerada; declarar).
- [ ] **Step 2: E2E no browser** (`npm run dev:fresh`), tela B-09: (a) filtro E/OU com grupo aninhado recorta as linhas certas conferindo a contagem; (b) `vazio`/`preenchido` em "Obs entrega"; (c) busca inteligente sugere e vira condição; (d) CSV exporta o recorte filtrado; (e) as outras 7 telas do DataTable seguem idênticas (sem botão Filtros). Screenshot dark + light.
- [ ] **Step 3: Perícia (auto).** Confrontar código × plano: pipeline na ordem certa; prop realmente aditiva (grep nas 8 telas); RSC→client sem componente atravessando; contagem de condições correta; reset de página; a11y do dropdown de busca. Corrigir na hora o que achar.
- [ ] **Step 4: Docs.** Atualizar o PROGRESSO (`2026-07-20-PROGRESSO-fase1.md`) com a Fase 4 concluída + pendências; registrar em `docs/agents/HISTORY.md`.
- [ ] **Step 5: Commit** `docs(fase4): PROGRESSO e HISTORY com Fase 4 concluida e periciada`.

---

## Pendências / decisões do dono (não implementar sem "sim")

- **Presets de filtro** (hub, Fase 4: "a definir quais fazem sentido aqui"). Candidatos do domínio: "Financeiro bloqueado", "Sem previsão de entrega", "Vendas futuras (CFOP 5922/6922)". **Decisão do dono** sobre quais entram. Registrar como `TODO(dono)` no código, não inventar.
- **Escopo dos campos do filtro:** hoje o plano usa **colunas visíveis** (evita filtro fantasma em coluna oculta). Se o dono quiser filtrar por coluna oculta, revisitar com chip visível do que está ativo.
- **Persistência da visão** (salvar filtro) é **Fase 7**, não entra aqui.

## Self-Review (v1)

- Cobertura: motor (T1), builder reutilizável (T2), controle de UI (T3), pipeline (T4), ligação B-09 (T5), busca inteligente (T6), perícia/E2E/docs (T7). Fase 4 do hub (filtro E/OU + busca por facets) coberta. Presets = pendência explícita do dono.
- Não-regressão: T2 e T4 têm passo dedicado de verificação das outras telas.
- Placeholders: código real nos steps de motor/extração/pipeline. Steps de RTL têm fallback para função pura testável (evita teste frágil de DOM).
