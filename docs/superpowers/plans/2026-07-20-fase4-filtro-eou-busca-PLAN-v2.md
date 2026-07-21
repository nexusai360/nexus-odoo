# Fase 4 , Motor de filtro E/OU aninhado + busca inteligente (B-09 Entregas Parciais) , PLAN v2

> **For agentic workers:** Executar TASK a TASK com TDD. UI **SEMPRE inline** na sessão principal (regra do projeto: layout nunca vai para subagente). Steps usam checkbox (`- [ ]`).
> **v2 incorpora a review adversarial** (`2026-07-20-review-plano-fase4.md`): 3 ALTOS (semântica de lista p/ facets do mesmo campo; motor ciente de `tipo:"data"`; alegação falsa de "Relatórios idênticos"), 4 MÉDIOS, 4 BAIXOS.

**Goal:** Dar ao B-09 (tabela de Entregas Parciais) um motor de filtro personalizado E/OU aninhado e uma busca inteligente por facets ("Campo: valor"), reaproveitando o motor `filtro-avancado.ts` e os componentes de builder já existentes, sem regredir as outras 7 telas que usam o mesmo DataTable e sem produzir "tabela vazia sem explicação".

**Architecture:** Reuso máximo. O motor `src/lib/reports/filtro-avancado.ts` (árvore `Grupo`/`Condicao`, conector **E/OU**, `compilarFiltro` → predicado client-side) já existe e casa com a decisão D1. **Esta é a primeira vez que `compilarFiltro` é ligado a uma UI viva** (a aba "Avançado" dos Relatórios serializa na URL mas NUNCA aplica , é write-only, confirmado: nenhum `get("filtroAvancado")`/chamada a `compilarFiltro` fora dos testes). Por isso o motor é endurecido aqui (tipos `data`, guards de valor vazio, operador de lista). Os componentes visuais de builder (`GrupoBuilder`/`CondicaoRow`) já existem em `filters-dialog.tsx` e são **puros** (controlados por `onChange`), logo extraíveis. O DataTable ganha uma prop aditiva `filtroAvancado?` que insere um estágio no pipeline client-side (`busca → facets → filtro E/OU → sort`) e um botão "Filtros" no padrão `Popover`+`Button` já usado. A busca inteligente evolui o input de busca com sugestões de facet que viram condições de **lista por campo** (semântica de facet: OU dentro do campo, E entre campos).

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Tailwind v4, base-ui (`Popover`, `Button`, `Input`, `Dialog`), lucide-react. Zero dependência nova. Estado client-side efêmero (`useState`/`useMemo`).

## Global Constraints

- **Proibido travessão `—`** em qualquer texto. Usar vírgula/parênteses/dois-pontos.
- **Nada vai para produção sem "sim" explícito do dono.** Só na branch `feat/entregas-parciais-base-calculo`, local.
- **UI nunca delegada a subagente.** Inline + `ui-ux-pro-max` já consultada.
- **Aditivo e não-regressivo.** DataTable usado em 8 arquivos: mudança via **prop opcional** com default que preserva o atual. Só o B-09 liga `filtroAvancado`.
- **Design system:** violet (`#7c3aed`) via `violet-500`, tokens (`bg-card`, `text-muted-foreground`, `border-border`), **componentes do DS** (`<Input>`, `<Button>`, `<Popover>`), ícones **Lucide** (zero emoji), dark/light conferidos.
- **RSC→client:** `data-table.tsx:1` e `blocos-pedidos.tsx:1` são `"use client"`. `ColumnDef` não tem campo-função (só `key/header/tipo/tagCores/corKey/statusMapa/ocultaInicial`) , `compilarFiltro(columns)` recebe só dados serializáveis. Fronteira segura.
- **Fonte única do motor:** toda avaliação passa por `compilarFiltro`. Nunca duplicar.

---

## Decisões de design da v2 (fixadas pela review)

1. **Operador programático `esta_em_lista`** (membership) para a busca inteligente: acumula valores do MESMO campo com semântica OU, espelhando o `colFiltros` nativo (`data-table.tsx:340-347`). `valor` serializa a lista com separador `` (unit separator, improvável no dado). Ele **NÃO entra em `OPERADORES`** (a lista visível do builder manual) , é usado só programaticamente pela busca inteligente. Resolve ALTO-1 e MÉDIO-4.
2. **Motor ciente de `tipo`.** `igual/diferente/maior/menor` passam a olhar o tipo da coluna: `numero/moeda` → comparação numérica; `data` → comparação lexicográfica de ISO `YYYY-MM-DD` (que é cronológica); demais → string. Conserta o bug latente de `maior/menor` fazerem `Number()` incondicional (ALTO-2).
3. **`OPERADORES` filtrado por tipo na UI.** `CondicaoRow` mostra só os operadores válidos para o tipo do campo escolhido e usa o input adequado (`type=date` para data, `type=number` para numero/moeda, texto senão). `CampoOpcao` ganha `tipo?` (opcional → texto, preserva o filters-dialog). (ALTO-2/MÉDIO-1)
4. **Guards de valor vazio.** `contem`/`nao_contem` com `valor === ""` são **inertes** (retornam `true`), para não zerar a tabela enquanto o usuário ainda digita. (MÉDIO-2)
5. **`grupoVazio()` é fábrica única** exportada do módulo extraído; `filters-dialog.tsx` passa a importá-la (hoje tem sua própria `GRUPO_VAZIO()`). (BAIXO-2)
6. **Alegação corrigida (ALTO-3):** a aba "Avançado" dos Relatórios é write-only (não aplica filtro). A extração preserva a renderização; a chegada dos operadores novos + input condicional na aba Avançado é **mudança intencional e aceita**, não regressão.

---

## File Structure

| Arquivo | Papel | Ação |
|---|---|---|
| `src/lib/reports/filtro-avancado.ts` | Motor: tipos, `OPERADORES`, `compilarFiltro`, `grupoVazio`, helper `operadoresParaTipo`. | Modificar (aditivo) |
| `src/lib/reports/filtro-avancado.test.ts` | Testes do motor. | Modificar (data, lista, guards) |
| `src/components/reports/filtro-avancado-builder.tsx` | **NOVO.** `GrupoBuilder` + `CondicaoRow` puros, extraídos. Client. | Criar |
| `src/components/reports/filters-dialog.tsx` | Dialog dos Relatórios (URL). | Modificar (importa do módulo extraído + `grupoVazio`) |
| `src/components/charts/data-table-filtro.tsx` | **NOVO.** Botão "Filtros" + Popover + builder + estado. `contarCondicoes`. Client. | Criar |
| `src/components/charts/data-table-busca.tsx` | **NOVO.** `montarSugestoes` (pura) + `BuscaInteligente` (input + dropdown facet). Client. | Criar |
| `src/components/charts/data-table.tsx` | DataTable genérico. | Modificar (prop `filtroAvancado`, estágio pipeline, toolbar, busca) |
| `src/components/charts/data-table.test.tsx` | Testes do DataTable. | Modificar |
| `src/components/diretoria/blocos/blocos-pedidos.tsx` | Monta o B-09. | Modificar (liga `filtroAvancado`) |

---

## Task 1: Endurecer o motor , tipos, operadores, guards, lista, `grupoVazio`, `operadoresParaTipo` (TDD)

**Files:**
- Modify: `src/lib/reports/filtro-avancado.ts`
- Test: `src/lib/reports/filtro-avancado.test.ts`

**Interfaces:**
- Produces:
  - `type Operador = "igual"|"diferente"|"contem"|"nao_contem"|"vazio"|"preenchido"|"maior"|"menor"|"esta_em_lista"`
  - `OPERADORES: OperadorMeta[]` (visíveis, **sem** `esta_em_lista`)
  - `const SEP_LISTA = ""`
  - `function grupoVazio(): Grupo`
  - `function operadoresParaTipo(tipo: string): Operador[]`
  - `compilarFiltro` atualizado (data-aware, guards, membership)

- [ ] **Step 1: Escrever os testes que falham** (novos `describe` em `filtro-avancado.test.ts`):

```ts
import { compilarFiltro, grupoVazio, operadoresParaTipo, SEP_LISTA, type Grupo } from "./filtro-avancado";
const colT = [{ key: "obs", header: "Obs", tipo: "texto" }] as never;
const colD = [{ key: "prev", header: "Prevista", tipo: "data" }] as never;

test("grupoVazio() retorna objeto novo a cada chamada", () => {
  expect(grupoVazio()).toEqual({ conector: "E", itens: [] });
  expect(grupoVazio()).not.toBe(grupoVazio());
});

test("nao_contem só filtra quando há valor (guard de vazio)", () => {
  const g: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "nao_contem", valor: "" }] };
  const p = compilarFiltro(g, colT);
  expect(p({ obs: "qualquer" })).toBe(true); // inerte enquanto vazio
  const g2: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "nao_contem", valor: "urgente" }] };
  const p2 = compilarFiltro(g2, colT);
  expect(p2({ obs: "normal" })).toBe(true);
  expect(p2({ obs: "URGENTE já" })).toBe(false);
});

test("contem com valor vazio é inerte (não zera a tabela)", () => {
  const g: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "contem", valor: "" }] };
  expect(compilarFiltro(g, colT)({ obs: "x" })).toBe(true);
});

test("vazio/preenchido usam trim e ignoram valor", () => {
  const gv: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "vazio", valor: "" }] };
  expect(compilarFiltro(gv, colT)({ obs: "  " })).toBe(true);
  expect(compilarFiltro(gv, colT)({ obs: "a" })).toBe(false);
  const gp: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "preenchido", valor: "" }] };
  expect(compilarFiltro(gp, colT)({ obs: "a" })).toBe(true);
  expect(compilarFiltro(gp, colT)({ obs: null })).toBe(false);
});

test("data: maior/menor comparam ISO cronologicamente (não Number)", () => {
  const g: Grupo = { conector: "E", itens: [{ campo: "prev", operador: "maior", valor: "2026-07-10" }] };
  const p = compilarFiltro(g, colD);
  expect(p({ prev: "2026-07-15" })).toBe(true);
  expect(p({ prev: "2026-07-01" })).toBe(false);
  const gi: Grupo = { conector: "E", itens: [{ campo: "prev", operador: "igual", valor: "2026-07-15" }] };
  expect(compilarFiltro(gi, colD)({ prev: "2026-07-15" })).toBe(true);
});

test("esta_em_lista: membership OU dentro do campo (case-insensitive)", () => {
  const g: Grupo = { conector: "E", itens: [{ campo: "obs", operador: "esta_em_lista", valor: ["SP","RJ"].join(SEP_LISTA) }] };
  const p = compilarFiltro(g, [{ key: "obs", header: "UF", tipo: "texto" }] as never);
  expect(p({ obs: "SP" })).toBe(true);
  expect(p({ obs: "rj" })).toBe(true);
  expect(p({ obs: "ES" })).toBe(false);
});

test("operadoresParaTipo devolve conjuntos coerentes", () => {
  expect(operadoresParaTipo("data")).toEqual(["igual","diferente","maior","menor","vazio","preenchido"]);
  expect(operadoresParaTipo("numero")).toEqual(["igual","diferente","maior","menor","vazio","preenchido"]);
  expect(operadoresParaTipo("texto")).toEqual(["igual","diferente","contem","nao_contem","vazio","preenchido"]);
  expect(operadoresParaTipo("tag")).toEqual(["igual","diferente","contem","nao_contem","vazio","preenchido"]);
});
```

- [ ] **Step 2: Rodar e ver falhar.** `npx jest src/lib/reports/filtro-avancado.test.ts` → FAIL.

- [ ] **Step 3: Implementar (aditivo)** em `filtro-avancado.ts`:

```ts
export type Operador =
  | "igual" | "diferente" | "contem" | "nao_contem"
  | "vazio" | "preenchido" | "maior" | "menor"
  | "esta_em_lista";

export const SEP_LISTA = "";

// Visíveis no builder manual (esta_em_lista fica de fora: é programático).
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

export function grupoVazio(): Grupo {
  return { conector: "E", itens: [] };
}

export function operadoresParaTipo(tipo: string): Operador[] {
  if (tipo === "data" || tipo === "numero" || tipo === "moeda" || tipo === "percentual") {
    return ["igual", "diferente", "maior", "menor", "vazio", "preenchido"];
  }
  return ["igual", "diferente", "contem", "nao_contem", "vazio", "preenchido"];
}
```

E `avaliarCondicao` reescrito (ciente de tipo + guards + lista):
```ts
  function avaliarCondicao(row: T, c: Condicao): boolean {
    if (!c.campo) return true;
    const rawVal = row[c.campo];
    const tipo = typeMap[c.campo] ?? "texto";
    const isNumeric = tipo === "numero" || tipo === "moeda" || tipo === "percentual";
    const isData = tipo === "data";
    const s = String(rawVal ?? "");

    switch (c.operador) {
      case "igual":
        if (isNumeric) return Number(rawVal) === Number(c.valor);
        return s.toLowerCase() === c.valor.toLowerCase();
      case "diferente":
        if (isNumeric) return Number(rawVal) !== Number(c.valor);
        return s.toLowerCase() !== c.valor.toLowerCase();
      case "contem":
        if (c.valor === "") return true; // inerte enquanto vazio
        return s.toLowerCase().includes(c.valor.toLowerCase());
      case "nao_contem":
        if (c.valor === "") return true; // inerte enquanto vazio
        return !s.toLowerCase().includes(c.valor.toLowerCase());
      case "vazio":
        return s.trim() === "";
      case "preenchido":
        return s.trim() !== "";
      case "maior":
        if (isNumeric) { const n = Number(c.valor); return Number.isNaN(n) ? false : Number(rawVal) > n; }
        if (isData) return s !== "" && s > c.valor; // ISO lexicográfico = cronológico
        return s.toLowerCase() > c.valor.toLowerCase();
      case "menor":
        if (isNumeric) { const n = Number(c.valor); return Number.isNaN(n) ? false : Number(rawVal) < n; }
        if (isData) return s !== "" && s < c.valor;
        return s.toLowerCase() < c.valor.toLowerCase();
      case "esta_em_lista": {
        const vals = c.valor.split(SEP_LISTA).filter((v) => v !== "").map((v) => v.toLowerCase());
        if (vals.length === 0) return true; // inerte
        return vals.includes(s.toLowerCase());
      }
      default:
        return true;
    }
  }
```

- [ ] **Step 4: Rodar e ver passar.** `npx jest src/lib/reports/filtro-avancado.test.ts` → PASS (novos + antigos).

- [ ] **Step 5: Commit** `feat(fase4): endurece motor de filtro (data-aware, guards, esta_em_lista, grupoVazio)`.

---

## Task 2: Extrair `GrupoBuilder`/`CondicaoRow` para módulo compartilhado (por tipo + DS)

Move os componentes puros de `filters-dialog.tsx` para arquivo próprio; adapta `CondicaoRow` para (a) filtrar operadores pelo tipo do campo, (b) usar o input adequado, (c) esconder o valor em `vazio`/`preenchido`, mantendo o `<Input>` do DS. `filters-dialog.tsx` passa a importar tudo (inclusive `grupoVazio`).

> **Não-regressão real (ALTO-3):** a aba "Avançado" dos Relatórios é write-only (o param `filtroAvancado` é serializado em `filters-dialog.tsx:578` e nunca aplicado). A extração preserva a renderização; a chegada dos operadores novos + input condicional é mudança **intencional**. Verificação = `tsc` + render da aba Avançado + `jest src/components/reports/`.

**Files:**
- Create: `src/components/reports/filtro-avancado-builder.tsx`
- Modify: `src/components/reports/filters-dialog.tsx`

**Interfaces:**
- Produces (export):
  - `type CampoOpcao = { value: string; label: string; tipo?: string }`
  - `function CondicaoRow(props: { condicao: Condicao; campos: CampoOpcao[]; onChange: (n: Condicao) => void; onRemove: () => void }): JSX.Element`
  - `function GrupoBuilder(props: { grupo: Grupo; campos: CampoOpcao[]; onChange: (n: Grupo) => void; onRemove?: () => void; depth?: number }): JSX.Element`
- Consumes: `Grupo, Condicao, GrupoItem, OPERADORES, operadoresParaTipo, isGrupo, grupoVazio` de `@/lib/reports/filtro-avancado`; `Input`, `Button` do DS; `cn`; lucide.

- [ ] **Step 1:** Criar `filtro-avancado-builder.tsx` com `"use client"`, movendo `CondicaoRow` (`filters-dialog.tsx:229-288`) e `GrupoBuilder` (`:298-435`) verbatim, com seus imports.

- [ ] **Step 2:** Em `CondicaoRow`, tornar operadores e input cientes do tipo do campo selecionado:

```tsx
const campoTipo = campos.find((c) => c.value === condicao.campo)?.tipo ?? "texto";
const opsValidos = operadoresParaTipo(campoTipo);
const operadorSeguro = opsValidos.includes(condicao.operador) ? condicao.operador : opsValidos[0];
// no <select> de operador, iterar OPERADORES.filter(o => opsValidos.includes(o.value))
// e, se operadorSeguro !== condicao.operador, corrigir via onChange ao trocar de campo.
const mostraValor = operadorSeguro !== "vazio" && operadorSeguro !== "preenchido";
const inputType = campoTipo === "data" ? "date" : (campoTipo === "numero" || campoTipo === "moeda" || campoTipo === "percentual") ? "number" : "text";
{mostraValor && (
  <Input
    type={inputType}
    aria-label="Valor da condição"
    value={condicao.valor}
    onChange={(e) => onChange({ ...condicao, valor: e.target.value })}
    className="h-8 flex-1 text-sm" // manter classes equivalentes ao atual
  />
)}
```
Ao trocar o campo (onChange do select de campo), se o operador atual não é válido para o novo tipo, resetar para `opsValidos[0]`.

- [ ] **Step 3:** Em `filters-dialog.tsx`: remover as definições locais de `CondicaoRow`/`GrupoBuilder` e a função local `GRUPO_VAZIO`; importar:
```tsx
import { GrupoBuilder, type CampoOpcao } from "@/components/reports/filtro-avancado-builder";
import { grupoVazio, /* …tipos já importados… */ } from "@/lib/reports/filtro-avancado";
```
Trocar os usos de `GRUPO_VAZIO()` por `grupoVazio()` (`:532`, `:538`, `:553`).

- [ ] **Step 4: Verificar não-regressão.** `npx tsc --noEmit`; `npx jest src/components/reports/`. Abrir mentalmente/010 render da aba Avançado (operadores novos aparecem; input some em vazio/preenchido) , comportamento esperado.

- [ ] **Step 5: Commit** `refactor(fase4): extrai builder de filtro (por tipo + DS), unifica grupoVazio`.

---

## Task 3: `DataTableFiltroAvancado` (botão + Popover + builder + estado)

**Files:**
- Create: `src/components/charts/data-table-filtro.tsx`
- Test: `src/components/charts/data-table.test.tsx` (adiciona `contarCondicoes`)

**Interfaces:**
- Produces:
  - `function contarCondicoes(grupo: Grupo): number` (recursivo; conta folhas com `campo` preenchido, inclui `esta_em_lista`)
  - `function DataTableFiltroAvancado(props: { campos: CampoOpcao[]; grupo: Grupo; onChange: (g: Grupo) => void }): JSX.Element`
- Consumes: `GrupoBuilder`/`CampoOpcao` (T2), `Grupo`/`grupoVazio` (motor), `Popover`/`Button` (base-ui), lucide `Filter`.

- [ ] **Step 1: Teste de `contarCondicoes`:**
```ts
import { contarCondicoes } from "./data-table-filtro";
import { grupoVazio } from "@/lib/reports/filtro-avancado";
test("contarCondicoes ignora folha sem campo e conta aninhadas + lista", () => {
  expect(contarCondicoes(grupoVazio())).toBe(0);
  expect(contarCondicoes({ conector: "E", itens: [
    { campo: "uf", operador: "esta_em_lista", valor: "SP" },
    { campo: "", operador: "igual", valor: "" },
    { conector: "OU", itens: [{ campo: "marca", operador: "contem", valor: "x" }] },
  ] })).toBe(2);
});
```
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** botão (`variant=outline size=sm h-8 gap-1.5 text-xs`, `<Filter className="size-3.5">` + "Filtros" + badge `contarCondicoes` quando > 0, classe `bg-violet-500/15 text-violet-500`), `PopoverContent` `w-[min(92vw,34rem)]` com `GrupoBuilder` + rodapé "Limpar" (`onChange(grupoVazio())`, desabilitado quando 0). `aria-label` do botão inclui a contagem.
- [ ] **Step 4: Rodar e ver passar** + `tsc`.
- [ ] **Step 5: Commit** `feat(fase4): DataTableFiltroAvancado (botao + builder E/OU + contagem)`.

---

## Task 4: Integrar o filtro E/OU no pipeline do DataTable (prop aditiva)

**Files:**
- Modify: `src/components/charts/data-table.tsx`
- Test: `src/components/charts/data-table.test.tsx`

**Interfaces:**
- Consumes: `DataTableFiltroAvancado` (T3); `compilarFiltro`, `grupoVazio`, `type Grupo` (motor).
- Produces: `DataTableProps<T>` ganha `filtroAvancado?: boolean` (default `false`).

- [ ] **Step 1: Teste** em `data-table.test.tsx`. Preferir RTL de verdade (o harness já usa `render`/`fireEvent`): render `<DataTable filtroAvancado columns rows>` com 3 UFs, abrir "Filtros", adicionar `uf igual SP`, assert só SP visível. Se o `Popover` base-ui não montar no jsdom, testar o **pipeline**: (a) reset de página ao mudar grupo; (b) ordem `advFiltered` entra entre `colFiltered` e `sorted`. Não usar a função trivial `rows.filter(compilarFiltro())` como único teste (re-testa o motor, não o pipeline).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar:**
  - Imports: `import { DataTableFiltroAvancado } from "./data-table-filtro";` e `import { compilarFiltro, grupoVazio, type Grupo } from "@/lib/reports/filtro-avancado";` (NÃO importar `contarCondicoes` aqui , vive no componente; evita import não usado, BAIXO-1).
  - Prop `filtroAvancado = false` na desestruturação + no `interface`.
  - Estado: `const [grupoFiltro, setGrupoFiltro] = useState<Grupo>(grupoVazio);`
  - Campos: `const camposFiltro = useMemo(() => colunasVisiveis.map((c) => ({ value: c.key, label: c.header, tipo: c.tipo })), [colunasVisiveis]);`
  - Estágio (após `colFiltered`, `data-table.tsx:349`):
    ```ts
    const advFiltered = useMemo(() => {
      if (!filtroAvancado) return colFiltered;
      const pred = compilarFiltro(grupoFiltro, columns);
      return colFiltered.filter(pred);
    }, [filtroAvancado, colFiltered, grupoFiltro, columns]);
    ```
  - Trocar `sortRows(colFiltered, …)` → `sortRows(advFiltered, …)` **e** as deps do `useMemo` de `sorted` (`:351-354`) de `[colFiltered,…]` para `[advFiltered,…]` (BAIXO-4).
  - Reset de página: incluir `grupoFiltro` nas deps do `useEffect(setPagina(1))` (`:364-366`).
  - Toolbar: montar `{filtroAvancado && <DataTableFiltroAvancado campos={camposFiltro} grupo={grupoFiltro} onChange={setGrupoFiltro} />}` ao lado do seletor de Colunas.
  - CSV: `handleExport` usa `sorted` → já respeita o filtro.
- [ ] **Step 4: Rodar e ver passar** + `tsc`.
- [ ] **Step 5: Commit** `feat(fase4): DataTable ganha estagio de filtro E/OU (prop aditiva filtroAvancado)`.

---

## Task 5: Ligar o filtro avançado no B-09

**Files:** Modify `src/components/diretoria/blocos/blocos-pedidos.tsx` (o `<DataTable>` do `TabelaEntregasParciais`, ~linha 252).

- [ ] **Step 1:** Adicionar `filtroAvancado` ao `<DataTable>` do B-09 (só ele).
- [ ] **Step 2:** `npx tsc --noEmit`; `grep -n "filtroAvancado" src/components/diretoria` → só o B-09. Conferir que pedidos-pendentes, demandas-mais-paradas, demandas-por-estado, vendas, estoque, composicao-kit NÃO têm a prop.
- [ ] **Step 3: Commit** `feat(fase4): liga filtro E/OU no B-09 Entregas Parciais`.

---

## Task 6: Busca inteligente por facets ("Campo: valor") com semântica de lista

Ao digitar na busca do B-09, um dropdown sugere facetas das colunas de texto/tag que casam o termo. Selecionar acumula o valor numa condição `esta_em_lista` **por campo** no grupo raiz (OU dentro do campo, E entre campos) , resolve o "tabela vazia" do ALTO-1. A busca textual livre segue funcionando.

**Files:**
- Create: `src/components/charts/data-table-busca.tsx`
- Modify: `src/components/charts/data-table.tsx`

**Interfaces:**
- Produces:
  - `type Sugestao = { campo: string; label: string; valor: string }`
  - `function montarSugestoes(termo: string, colunas: { key: string; header: string; tipo: string }[], valoresPorColuna: Record<string, string[]>, limite?: number): Sugestao[]` (pura; só colunas `texto`/`tag`; case-insensitive; respeita `limite`, default 8)
  - `function adicionarFacetAoGrupo(grupo: Grupo, s: Sugestao): Grupo` (pura; se já há `esta_em_lista` para `s.campo` no nível raiz, acrescenta o valor à lista sem duplicar; senão cria a condição)
  - `function BuscaInteligente(props: { value: string; onChange: (v: string) => void; sugestoes: Sugestao[]; onEscolher: (s: Sugestao) => void }): JSX.Element`
- Consumes: `Grupo`/`Condicao`/`SEP_LISTA` (motor), `Input` (DS), lucide `Search`.

- [ ] **Step 1: Testes** (puros):
```ts
import { montarSugestoes, adicionarFacetAoGrupo } from "./data-table-busca";
import { SEP_LISTA, grupoVazio, compilarFiltro } from "@/lib/reports/filtro-avancado";
const cols = [
  { key: "uf", header: "UF", tipo: "texto" },
  { key: "valor", header: "Valor", tipo: "moeda" },
];
const vpc = { uf: ["SP","RJ","ES"], valor: ["100","200"] };
test("montarSugestoes casa texto/tag, ignora moeda, respeita termo/limite", () => {
  expect(montarSugestoes("sp", cols, vpc)).toEqual([{ campo: "uf", label: "UF", valor: "SP" }]);
  expect(montarSugestoes("", cols, vpc, 2).length).toBeLessThanOrEqual(2);
  expect(montarSugestoes("100", cols, vpc).length).toBe(0); // moeda fora
});
test("adicionarFacetAoGrupo acumula por campo com esta_em_lista (OU no campo)", () => {
  let g = adicionarFacetAoGrupo(grupoVazio(), { campo: "uf", label: "UF", valor: "SP" });
  g = adicionarFacetAoGrupo(g, { campo: "uf", label: "UF", valor: "RJ" });
  const cond = g.itens[0];
  expect(g.itens.length).toBe(1);
  expect("operador" in cond && cond.operador).toBe("esta_em_lista");
  const p = compilarFiltro(g, cols as never);
  expect(p({ uf: "SP" })).toBe(true);
  expect(p({ uf: "RJ" })).toBe(true);
  expect(p({ uf: "ES" })).toBe(false); // NÃO zera: SP OU RJ
});
```
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `montarSugestoes`, `adicionarFacetAoGrupo` (usa `SEP_LISTA`, dedup) e `BuscaInteligente` (input + `role="listbox"`/`option`, teclado ↑↓/Enter/Esc, `aria-activedescendant`).
- [ ] **Step 4: Fiar no DataTable** (MÉDIO-3): quando `filtroAvancado`, trocar o `<Input>` de busca por `<BuscaInteligente>`:
  ```ts
  const sugestoes = useMemo(
    () => (filtroAvancado ? montarSugestoes(query, colunasVisiveis, valoresPorColuna) : []),
    [filtroAvancado, query, colunasVisiveis, valoresPorColuna],
  );
  // value={query}; onChange={handleSearch}; onEscolher={(s) => { setGrupoFiltro((g) => adicionarFacetAoGrupo(g, s)); handleSearch(""); }}
  ```
  `montarSugestoes` usa `query` **vivo** (não `debouncedQuery`), para o dropdown não atrasar. `handleSearch("")` zera `query` e `debouncedQuery` (sem filtro textual fantasma).
- [ ] **Step 5: Rodar e ver passar** + `tsc`.
- [ ] **Step 6: Commit** `feat(fase4): busca inteligente por facets (esta_em_lista, sem tabela vazia)`.

---

## Task 7: Perícia + E2E contra o cache real + docs

- [ ] **Step 1: Suíte** `npx tsc --noEmit && npx jest && npx eslint src/components/charts src/components/reports src/lib/reports` , verde (falha pré-existente `model-catalog` tolerada; declarar).
- [ ] **Step 2: E2E no browser** (`npm run dev:fresh`), B-09: (a) filtro E/OU aninhado recorta e a contagem no botão bate; (b) `Prevista maior que <data>` recorta por data (não zera , validação do ALTO-2); (c) `vazio`/`preenchido` em "Obs entrega"; (d) busca inteligente: escolher UF SP e RJ mantém as duas (não zera , ALTO-1); (e) CSV exporta o recorte; (f) as outras 7 telas do DataTable seguem idênticas (sem botão Filtros, sem dropdown de facet). Screenshot dark + light.
- [ ] **Step 3: Perícia (auto).** Confrontar código × plano: pipeline na ordem (deps de `sorted` = `advFiltered`); prop aditiva (grep nas 8 telas); reset de página inclui `grupoFiltro`; sem import não usado; motor data-aware coberto por teste; a11y do dropdown; nenhum `<input>` cru (só `<Input>` do DS). Corrigir na hora.
- [ ] **Step 4: Docs.** Atualizar `2026-07-20-PROGRESSO-fase1.md` (Fase 4 concluída + pendências) e `docs/agents/HISTORY.md`.
- [ ] **Step 5: Commit** `docs(fase4): PROGRESSO e HISTORY com Fase 4 concluida e periciada`.

---

## Pendências / decisões do dono (não implementar sem "sim")

- **Presets de filtro** (hub, Fase 4: "a definir quais fazem sentido"). Candidatos: "Financeiro bloqueado", "Sem previsão", "Vendas futuras (CFOP 5922/6922)". **Decisão do dono.** Registrar `TODO(dono)` no código, não inventar.
- **Filtrar por coluna oculta:** hoje os campos do filtro são as colunas **visíveis** (evita filtro fantasma, review M3 anterior). Se o dono quiser oculta, revisitar com chip visível do que está ativo.
- **Persistência da visão** (salvar filtro) é **Fase 7**.

## Self-Review (v2)

- **Achados da review aplicados:** ALTO-1 (esta_em_lista + adicionarFacetAoGrupo, T1/T6), ALTO-2 (motor data-aware + operadoresParaTipo + input date, T1/T2), ALTO-3 (alegação corrigida + reconhecimento write-only, T2). MÉDIO-1 (`<Input>` do DS, T2), MÉDIO-2 (guards de vazio, T1), MÉDIO-3 (fiação query vivo + handleSearch"", T6), MÉDIO-4 (sugestões só texto/tag + esta_em_lista, T6). BAIXO-1 (sem import contarCondicoes no data-table, T4), BAIXO-2 (grupoVazio fábrica única, T1/T2), BAIXO-3 (teste de pipeline, não só predicado, T4), BAIXO-4 (deps de `sorted`, T4).
- **Cobertura da Fase 4 (hub):** motor E/OU + operadores (T1), builder reutilizável (T2), controle UI (T3), pipeline (T4), B-09 (T5), busca inteligente por facets (T6), perícia/E2E/docs (T7). Presets = pendência explícita.
- **Consistência de tipos:** `Operador`, `CampoOpcao{tipo?}`, `grupoVazio()`, `SEP_LISTA`, `Sugestao`, `adicionarFacetAoGrupo` usados de forma idêntica entre tasks.
- **Placeholders:** código real nos steps de motor/extração/pipeline/busca; testes provam comportamento (inclui os anti-"tabela vazia").
