# Dissecação do sistema de tabela/filtros/views do "ERP Nexus" (para reaproveitar no nexus-odoo)

Data: 2026-07-20
Projeto dissecado (só leitura): `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus`
Autor: pesquisa de engenharia (Frente A)

---

## 0. Achado que muda tudo antes de ler o resto

O projeto "ERP Nexus" **é a mesma base de código do nexus-odoo**. O `package.json` dele tem
`"name": "nexus-odoo"` e a descrição "Plataforma de dados do ERP Odoo da Matrix Fitness Group,
dashboard e MCP". Ele tem `src/lib/reports`, `diretoria`, `agente`, `integracoes/servidor-mcp`,
`relatorios-2` (construtor) e um `motor/odoo` com os módulos OCA. Ou seja: é um fork/cópia mais
avançada (ou paralela) do próprio nexus-odoo, com o MESMO stack. Isso é a melhor notícia possível
para portabilidade: **não há tradução de stack a fazer**, o que se porta é praticamente drop-in.

Segundo achado: existem **DOIS sistemas de tabela distintos** convivendo no repo, e é preciso não
confundi-los:

1. **O protótipo "estilo Odoo" (`src/components/modulos/`)** , é ELE que implementa os 8 itens dos
   prints (searchbar inteligente, filtros e agrupar, filtro aninhado, seletor de colunas com
   arraste, agrupamento multinível, 5 views, chips). É **client-side puro**, roda sobre **dados
   mock** (`src/lib/modulos/vendas-mock.ts`), e a rota `/vendas` faz `notFound()` em produção
   (`src/app/vendas/page.tsx` , "preview de layout, só em dev"). Nenhuma linha toca Prisma. É um
   protótipo funcional de UX, sem backend.

2. **O sistema de produção de relatórios (`src/components/charts/data-table.tsx` +
   `src/lib/reports/**`)** , server-driven: Server Components chamam queries Prisma sobre o cache
   Postgres, montam `ReportSection` e renderizam templates (entre eles `DataTable`). Tem seu
   próprio `ColumnDef`, sort/filter em `data-table-utils`, export CSV e um compilador de filtro
   aninhado serializável (`src/lib/reports/filtro-avancado.ts`) pensado para a F6. Este é o que já
   está em produção, mas é bem mais simples visualmente que o protótipo (não tem o painel
   tri-coluna, nem agrupamento multinível, nem as 5 views).

O que o pedido descreve (os 8 itens) vive no **sistema 1**. A avaliação de porte tem que casar o
sistema 1 (UX rica, client-side) com a arquitetura server-driven do sistema 2.

---

## 1. Stack do ERP Nexus (idêntico ao nexus-odoo)

Do `package.json`:

- **Framework:** Next.js `16.2.2` (App Router), React `19`, TypeScript.
- **UI:** `@base-ui/react ^1.3.0`, Tailwind v4 (`@tailwindcss/postcss ^4`, `tw-animate-css`),
  `class-variance-authority`, `clsx`, `tailwind-merge`, `shadcn` (presente nas deps), `cmdk`
  (command palette), `lucide-react ^1.7.0` (ícones), `framer-motion ^11`, `sonner` (toasts).
- **Dados/infra:** Prisma v7 (`@prisma/client`, `@prisma/adapter-pg`), `pg`, `bullmq`, `ioredis`,
  `next-auth ^5 beta`, `@modelcontextprotocol/sdk`, `recharts` (gráficos de produção),
  `react-day-picker`, `react-grid-layout`, `xlsx`, `pgsql-parser`.

**Ausências reveladoras (o protótipo NÃO usa nenhuma lib de tabela/estado/DnD):**

- **Sem TanStack Table.** Toda a tabela é `<table>` HTML nativo com lógica manual.
- **Sem dnd-kit / react-dnd.** O arraste de reordenação de colunas é feito à mão com **pointer
  events** (`onPointerDown` + listeners de `pointermove`/`pointerup` no window, cálculo de
  `translateY`). Ver `SeletorColunas` em `ui.tsx`.
- **Sem zustand / redux / jotai.** Estado é 100% `useState`/`useMemo` local do componente.
- **Sem nuqs / estado na URL.** A persistência é via `localStorage` (chave por seção), não via
  query string. A rota não carrega estado de filtro no server.

Conclusão de stack: o protótipo é **zero-dependência** para a parte de tabela. Isso é ótimo para
porte (nada novo para instalar) e ruim para robustez (tudo é código próprio a manter).

---

## 2. Mapa dos 8 itens dos prints para arquivos exatos

Diretório-núcleo: `src/components/modulos/vendas/` (+ `src/components/modulos/ui.tsx` de
primitivos, + `src/lib/modulos/vendas-mock.ts` de dados/domínio).

| # | Item do print | Arquivo(s) principal(is) | O que faz |
|---|---|---|---|
| 1 | Barra de busca inteligente (sugere "Contém X", "Cliente:", "Vendedor:"...) | `vendas/vendas-lista.tsx` (memo `sugestoes`, l.197-212; render do dropdown l.459-467) | Deriva facets do texto digitado cruzando com colunas visíveis |
| 2 | Botão "Filtros e agrupar" (3 seções) | `vendas/vendas-lista.tsx` (Popover l.471-538) | Painel tri-coluna FILTROS / AGRUPAR POR / FAVORITOS |
| 3 | Filtro personalizado (modal aninhado TODAS/QUALQUER) | `vendas/filtro-avancado.tsx` (228 l.) + motor em `vendas/vendas-filtros.ts` | Construtor de árvore de regras + preview de contagem ao vivo |
| 4 | Busca de campo categorizada (CLIENTE, COMERCIAL...) + "Mostrar todos" | `vendas/filtro-avancado.tsx` (`SeletorCampo`, l.51-97); catálogo em `vendas/vendas-filtros.ts` (`CAMPOS`, `CampoGrupo`) | Dropdown de campo com busca, filtro comum vs todos, rótulo do grupo |
| 5 | Seletor de colunas (buscar, tudo/limpar, arraste, lock) | `modulos/ui.tsx` (`SeletorColunas`, l.359-560; `useResizeColunas` l.569+; `ResizeHandle` l.670+) | Painel em portal, DnD por pointer events, colunas obrigatórias travadas |
| 6 | Agrupamento aninhado na lista com subtotais | `vendas/vendas-lista.tsx` (memo `flat`, l.281-300; render dos `<tr>` grupo l.615-624) | Recursão por níveis, contagem + soma por grupo, expand/collapse |
| 7 | 5 modos de view (Lista, Kanban, Calendário, Pivô, Gráfico) | `vendas/vendas-lista.tsx` (Lista l.575, Kanban l.660) + `vendas/vendas-visoes.tsx` (Calendário, Pivô, Gráfico) | Cada view é uma "lente" sobre a mesma `lista` filtrada |
| 8 | Chips de filtro/agrupamento + "Limpar tudo" | `vendas/vendas-lista.tsx` (render chips l.431-443; `limparTudo` l.223) | Chips vinho (filtro) e verde (agrupamento), botão limpar |

Orquestração e casca:
- `vendas/vendas-app.tsx` (132 l.) , monta o módulo, mantém estado dos pedidos, busca global do header, navega Lista/Detalhe/Novo.
- `modulos/module-shell.tsx` (295 l.) , top-bar com busca global (command-palette, atalho Cmd/Ctrl+K), seletor de empresa, tema, abas internas.
- `vendas/vendas-pedido.tsx` (746 l.) , tela de detalhe do pedido (fora do escopo tabela).
- `vendas/vendas-produtos.tsx` (661 l.) e `vendas/produtos-filtros.ts` , a MESMA maquinaria de filtro reaproveitada para Produtos (prova que `filtro-avancado.tsx` e `vendas-filtros.ts` são genéricos).
- `lib/modulos/vendas-mock.ts` (486 l.) , tipo `Pedido`, enums (`PedidoStatus`), labels, badges, helpers (`totalPedido`, `formatBRL`, `numeroExibicao`) e o array `PEDIDOS`. É o "domínio" fake.

Sistema de produção (referência para o porte real):
- `src/components/charts/data-table.tsx` (735 l.) , DataTable server-friendly com `ColumnDef<T>`.
- `src/components/charts/data-table-utils.ts` , `sortRows`, `filterRows`, `toggleSortStack`, `SortEntry`.
- `src/lib/reports/filtro-avancado.ts` , tipos `Condicao`/`Grupo`/`GrupoItem` + `compilarFiltro` (predicado serializável, pensado para F6).
- `src/lib/reports/**` , catálogo, domínios, queries por domínio (`queries/comercial.ts`, `financeiro.ts`, `estoque.ts`, `pedido-historico.ts`, etc), `build-chips.ts`, `filters.ts`, `periodo.ts`.

---

## 3. Modelagem do estado (tipos centrais, transcritos)

### 3.1 Colunas , `vendas/vendas-filtros.ts`

```ts
export interface ColunaDef {
  key: string;
  label: string;
  sortable: boolean;
  numeric: boolean;
  padrao: boolean;          // visível no conjunto default curado
  obrigatoria?: boolean;    // sempre visível, não desmarcável nem reordenável (lock)
  valor: (p: Pedido) => string | number;  // valor p/ ordenação/agrupamento/busca
}
export const COLUNAS: ColunaDef[] = [ /* numero(obrigatoria), cliente, data, vendedor, empresa, total, status ... */ ];
export const COLUNA_BY_KEY: Record<string, ColunaDef> = ...;
```

Nota-chave: `valor` é uma **função**, portanto `ColunaDef` NÃO é serializável (não vai para
localStorage nem JSON). O que persiste são só as **keys** (arrays `ordem` e `vis`).

### 3.2 Campos de filtro/agrupamento , `vendas/vendas-filtros.ts`

```ts
export type CampoTipo = "texto" | "opcao" | "numero" | "data" | "tags";
export type CampoGrupo = "Cliente" | "Comercial" | "Datas" | "Financeiro" | "Logística" | "Fiscal";

export interface CampoDef {
  key: string;
  label: string;
  tipo: CampoTipo;
  grupo: CampoGrupo;        // categoria no seletor de campo (CLIENTE, COMERCIAL...)
  comum: boolean;          // aparece na aba "campos comuns" vs "todos"
  opcoes?: { valor: string; label: string }[];
  get: (p: Pedido) => string | number | string[];
  grupoKey?: (p: Pedido) => string;  // chave legível p/ agrupar (ex.: mês, label do status)
}
export const CAMPOS: CampoDef[] = [ ... ];      // ~19 campos curados
export const CAMPO_BY_KEY: Record<string, CampoDef> = ...;
```

### 3.3 Operadores adaptativos ao tipo , `vendas/vendas-filtros.ts`

```ts
export interface OperadorDef { op: string; label: string; args: 0 | 1 | 2; }

export const OPERADORES: Record<CampoTipo, OperadorDef[]> = {
  texto:  [contem, naocontem, igual, comeca, definido(0 args), vazio(0 args)],
  opcao:  [igual, diferente],
  numero: [igual, maior, menor, entre(2 args)],
  data:   [em, antes, depois, entre(2 args)],
  tags:   [contemtag, naocontemtag],
};
```

`args` diz quantos inputs de valor a regra mostra (0 = "está definido/não definido", 2 = "entre").

### 3.4 Árvore de regras (filtro aninhado) , `vendas/vendas-filtros.ts`

```ts
export interface Regra {
  id: string; tipo: "regra";
  campo: string; op: string; valor: string; valor2?: string;
}
export interface GrupoRegras {
  id: string; tipo: "grupo";
  conector: "todas" | "qualquer";   // TODAS = E, QUALQUER = OU
  filhos: (Regra | GrupoRegras)[];  // recursivo -> aninhamento arbitrário
}
export type NoRegra = Regra | GrupoRegras;
```

Esta estrutura É serializável (só dados), por isso persiste em localStorage e em favoritos.

### 3.5 Estado do container de lista , `vendas/vendas-lista.tsx`

```ts
type View = "lista" | "kanban" | "calendario" | "pivo" | "grafico";
type Modo = "cotacoes" | "pedidos" | "afaturar";

// Chip = facet de filtro SERIALIZÁVEL (predicado derivado de kind/campo/valor, sem função)
interface Chip { id: string; campo: string; kind: string; valor: string; label: string }
interface Nivel { campo: string; label: string }     // um nível de agrupamento
interface Sort  { campo: string; dir: "asc" | "desc" }
interface Favorito {
  id: string; nome: string; padrao: boolean;
  snap: { chips: Chip[]; niveis: Nivel[]; busca: string; pill: string;
          vis: string[]; ordem: string[]; sorts: Sort[]; arvore: GrupoRegras | null };
}
```

Estados vivos no componente (via `useState`): `busca`, `chips`, `niveis`, `arvore`, `pill`,
`view`, `sorts`, `ordem` (todas as colunas em ordem), `vis` (quais visíveis), `pagina`,
`porPagina`, `sel` (Set de ids selecionados), `expandidos` (Set de ids de grupo abertos),
`favoritos`. Tudo local, nada em contexto global.

### 3.6 ColumnDef do sistema de produção , `src/components/charts/data-table.tsx`

```ts
export interface ColumnDef<T> {
  key: keyof T & string;
  header: string;
  tipo: "texto" | "numero" | "moeda" | "percentual" | "tag" | "tags" | "data";
  tagCores?: Record<string, string>;  // mapa valor -> classe Tailwind do badge
}
```

Muito mais enxuto que o `ColunaDef` do protótipo (não tem `valor`, `sortable`, `obrigatoria`): a
DataTable de produção lê o campo direto por `key` da row já pronta. É este o `ColumnDef` que o
`filtro-avancado.ts` importa para inferir tipo de campo.

### 3.7 Filtro serializável de produção , `src/lib/reports/filtro-avancado.ts`

```ts
export type Operador = "igual" | "diferente" | "contem" | "maior" | "menor";
export interface Condicao { campo: string; operador: Operador; valor: string; }
export interface Grupo { conector: "E" | "OU"; itens: GrupoItem[]; }
export type GrupoItem = Condicao | Grupo;          // recursivo
export function isGrupo(item: GrupoItem): item is Grupo { return "conector" in item; }
export function compilarFiltro<T>(grupo: Grupo, columns: ColumnDef<T>[]): (row: T) => boolean
```

É a mesma ideia do `GrupoRegras` do protótipo, com nomes diferentes (`E`/`OU` em vez de
`todas`/`qualquer`, `itens` em vez de `filhos`). Duas implementações paralelas do mesmo conceito.
Para o porte, unificar as duas é uma decisão a tomar (recomendação na seção 10).

---

## 4. Como a busca inteligente resolve o campo

Mecanismo em `vendas-lista.tsx`, memo `sugestoes` (l.197-212). NÃO há NLP nem parsing de prefixo
"campo:valor". A lógica é por **facet a partir das colunas visíveis**:

1. Sempre injeta uma sugestão genérica `Contém "<q>"` (kind `texto`, varre todos os campos).
2. Se a coluna `tags` está visível, injeta `Etiqueta contém "<q>"` (kind `tag`).
3. Para cada coluna de texto visível (exceto numero/tags/data/expiracao), coleta os **valores
   distintos** presentes na base (`[...new Set(base.map(col.valor))]`), filtra os que contêm o
   texto digitado e emite até 2 por coluna como `"<label da coluna>: <valor>"` (kind `col`).
4. Corta em 8 sugestões. Enter aceita a primeira.

Ou seja, "Vendedor: Marina Souza" aparece porque "marina" bate com um valor distinto da coluna
Vendedor, não porque o sistema entende a palavra "vendedor". O reconhecimento de campo é
**data-driven** (valores existentes), o que é elegante e barato, mas depende de ter a base inteira
em memória para varrer valores distintos. Cada sugestão vira um `Chip` serializável cujo predicado
é resolvido em `matchFacet(chip, pedido)` por um `switch (chip.kind)`.

---

## 5. Como o filtro aninhado (E/OU) é avaliado

Duas peças, ambas em `vendas/vendas-filtros.ts`:

- `testaRegra(row, regra, campoBy)` , avalia uma folha. Pega o valor bruto via `campo.get(row)`,
  e faz o switch por `campo.tipo` (tags: some/every includes; numero: casts + comparadores, `entre`
  usa min/max; data: comparação lexicográfica de ISO; texto/opcao: includes/startsWith/equals).
- `testaNo(row, no, campoBy)` , recursão: se folha, `testaRegra`; se grupo, `conector === "todas"
  ? filhos.every(testaNo) : filhos.some(testaNo)`. Grupo sem filhos retorna `true`.

O construtor (`filtro-avancado.tsx`) manipula a árvore imutavelmente com helpers `clonaGrupo`,
`atualiza(no, id, fn)` (recursa por id e aplica), `remove(grupo, id)`. "Nova regra" faz
`filhos: [...filhos, novaRegra()]`; "Aninhar grupo" adiciona um `GrupoRegras` filho com conector
`qualquer`. O preview de contagem é `base.filter(row => testaNo(row, arvore)).length` recalculado
por `useMemo` a cada mudança. Ao aplicar, a árvore inteira vira o estado `arvore` da lista, e entra
no pipeline como `(!arvore || testaNo(p, arvore))`.

O pipeline completo de filtragem da lista (memo `lista`, l.235-246) combina em AND:
`pred(pill)` E `busca global (hay includes)` E `chips agrupados por campo (OR dentro do mesmo
campo, AND entre campos)` E `arvore (filtro personalizado)`. Detalhe fino: chips do mesmo `campo`
são OR entre si, chips de campos diferentes são AND , comportamento clássico de facets.

Tudo é predicado em memória sobre o array. **Não há geração de SQL/where.** (O `compilarFiltro`
de produção também gera predicado JS, não SQL; a query ao Postgres é feita antes, pelas funções de
`src/lib/reports/queries/**`, e o filtro avançado roda sobre o resultado já materializado.)

---

## 6. Como o agrupamento multinível com subtotais é computado

Memo `flat` em `vendas-lista.tsx` (l.281-300). Recebe os itens da página (`pageItems`, já filtrados
e ordenados e paginados) e os `niveis` ativos (array ordenado; a ordem é a prioridade 1º, 2º...).

- Sem níveis: `pageItems.map(p => ({ kind: "linha", pedido, level: 0 }))`.
- Com níveis: função recursiva `rec(ps, depth, prefix)`:
  1. Se `depth >= niveis.length`, emite linhas folha nesse nível.
  2. Senão, agrupa `ps` num `Map<chave, Pedido[]>` usando `keyGrupo(nivel.campo, p)` (que usa
     `campo.grupoKey` quando existe , ex.: mês legível, label de status).
  3. Ordena os grupos por chave, e para cada grupo emite um nó `{ kind: "grupo", id, level,
     label, count, soma }` onde `soma = grp.reduce(total)`. Se o grupo está expandido
     (`expandidos.has(gid)`), recursa para o próximo nível dentro dele.

O resultado é uma **lista achatada** (array de nós grupo/linha com `level`), que o `<tbody>`
renderiza. Os grupos começam **fechados**; o `id` do grupo é o caminho hierárquico
(`prefix/campo:label`) para o Set de expandidos funcionar por nó. A indentação visual é
`paddingLeft: level * 1.25rem`. Cada linha de grupo mostra `label · count · formatBRL(soma)`. O
`tfoot` de total geral só aparece quando não há agrupamento (l.643).

Importante para o porte: o agrupamento roda **sobre a página corrente**, não sobre o conjunto
inteiro (a paginação é aplicada antes do flatten). É uma decisão de protótipo que num backend real
precisaria de repensar (paginar grupos, não linhas) , ver seção 10.

---

## 7. As 5 views

Todas são "lentes" sobre a mesma `lista` filtrada; o `view` é um `useState` e o switch de render
está em `vendas-lista.tsx`.

- **Lista** (l.575-657) , `<table>` nativo com colgroup de larguras redimensionáveis, header com
  ordenação multi-coluna por clique (ciclo asc -> desc -> remove, badge de prioridade), seleção em
  lote (checkbox + barra de ações), agrupamento, paginação, seletor de colunas no canto.
- **Kanban** (l.660-690) , colunas fixas por `PedidoStatus` (cotacao/enviada/pedido/cancelado),
  cada coluna com contagem + soma no topo, cards com número/total/cliente/vendedor/tag.
- **Calendário** , `CalendarioView` em `vendas-visoes.tsx`. Grade 7 colunas construída com
  `new Date`, ancora no mês com mais pedidos, agrupa por dia, mostra até 3 por dia + "+N mais".
  Zero libs (não usa react-day-picker aqui).
- **Pivô** , `PivoView`. Cross-tab Vendedor x Mês somando `totalPedido`, com total de linha, total
  de coluna e total geral. Tudo em um `useMemo` que preenche `Map`s de célula/linha/coluna.
- **Gráfico** , `GraficoView`. Barras horizontais em CSS puro (divs com width %), toggle entre
  eixo "vendedor" e "situação". Não usa recharts (o sistema de produção usa recharts).

---

## 8. "Salvar visão" / favoritos / persistência

Dois mecanismos, ambos client-side, em `vendas-lista.tsx`:

1. **Persistência automática da última config** (l.162-193): a cada mudança, grava em
   `localStorage["vendas-lista:<modo>"]` um JSON com `{ ordem, vis, sorts, niveis, chips, view,
   pill, busca, porPagina, arvore, favoritos }`. Na montagem, hidrata (com migração de formato
   antigo `cols` -> `vis`+`ordem`). Guard `hidratado` evita salvar antes de ler.

2. **Favoritos nomeados** (l.326-343): `salvarFavorito` cria um `Favorito` com `snap` = fotografia
   serializável do estado inteiro (chips, niveis, busca, pill, vis, ordem, sorts, arvore) + flag
   `padrao`. `aplicarFavorito` reinjeta esse snap nos setters. Os favoritos vivem no mesmo blob de
   localStorage. O modal "Salvar esta visão" (l.700-719) coleta nome + "usar como padrão" e mostra
   um resumo do que será salvo.

Não há persistência server-side de views/favoritos , tudo é por navegador/dispositivo. Larguras de
coluna têm seu próprio storage (`useResizeColunas("vendas-lista-larg:<modo>")`).

O sistema de produção tem um caminho separado de persistência real: o Prisma tem `SavedReport`
(model gerado) e rotas `relatorios/d/[savedId]` / `relatorios-2/d/[savedId]` , esse é o mecanismo
"de verdade" para salvar relatórios/visões no banco, e é o que o porte deveria usar em vez do
localStorage.

---

## 9. Detalhe técnico do seletor de colunas (item 5, o mais "caro" de portar)

`SeletorColunas` em `modulos/ui.tsx` (l.359-560). Pontos que importam para reimplementar:

- Separa **ORDEM** (array `ordem` de todas as keys) de **VISIBILIDADE** (array `vis`). Obrigatórias
  ficam sempre no topo e travadas (`Lock`), não desmarcáveis nem arrastáveis.
- **Arraste por pointer events, sem lib**: `iniciarDrag` guarda `{ key, from, startY, dy, h }`;
  listeners globais de `pointermove` atualizam `dy`; `pointerup` calcula o índice alvo
  (`alvoDe` = round(dy/h) clampado abaixo das obrigatórias) e faz `splice` no array de ordem. O
  feedback ao vivo (`transformDe`) desloca as linhas vizinhas com `translateY` e transição CSS.
- O painel abre em **portal fixed** (`createPortal(..., document.body)`) reposicionado via
  `getBoundingClientRect` para não ser cortado pelo overflow da tabela; reposiciona em resize/scroll.
- Busca de coluna, "Selecionar tudo", "Limpar" (mantém só obrigatórias).
- `useResizeColunas` (l.569+) e `ResizeHandle` (l.670+) dão larguras redimensionáveis por arrastar
  a divisória do header, também por pointer events, também persistidas em localStorage.

É código bom e independente de domínio (recebe `ColunaOpc { key, label, obrigatoria? }`), mas é ~200
linhas de interação manual. Portável quase direto; só depende de `CheckboxView`, ícones lucide e
`cn`.

---

## 10. Portabilidade para o nexus-odoo , avaliação concreta

### 10.1 Diagnóstico da natureza do sistema

O sistema dos 8 itens é **client-side puro sobre array em memória**. Ele recebe `base: Pedido[]`
(mock) e faz TUDO no cliente: filtra, agrupa, ordena, pagina, calcula subtotais e pivô. Não há
nenhum acoplamento a fetch/SQL. Isso tem duas consequências opostas:

- **A favor:** o motor de filtro/agrupamento/views é reutilizável tal e qual, e como o stack é
  idêntico (mesmo Next 16, base-ui, Tailwind v4, lucide, mesmo `cn`), os componentes compilam sem
  adaptação de imports (só ajustar aliases `@/`).
- **Contra:** ele assume "todos os registros na mão". No nexus-odoo real, a tabela de Pedidos pode
  ter dezenas de milhares de linhas vindas de query Prisma sobre o cache. Filtrar/agrupar/pivotar
  tudo no cliente não escala; a busca de facets (valores distintos) varrendo o array inteiro
  também não. Então o motor precisa migrar de "in-memory sobre tudo" para "server-driven".

### 10.2 O que porta direto (baixo esforço)

- `modulos/ui.tsx` inteiro (`SeletorColunas`, `useResizeColunas`, `ResizeHandle`, `Popover`,
  `Modal`, `Btn`, `Select`, `Checkbox`, `Paginacao`, `Tooltip`). Independente de domínio. Só checar
  colisão com componentes homônimos já existentes no nexus-odoo (`src/components/ui/**`) , há um
  `Checkbox`/`Select`/`Popover` de produção; decidir qual vence para não duplicar (regra do
  CLAUDE.md: reuso antes de criação).
- `vendas/filtro-avancado.tsx` (o modal de regras aninhadas) , genérico por design (recebe `campos`
  + `campoBy` + `base`). Porta direto; só troca a fonte de `base`.
- `vendas/vendas-visoes.tsx` (Calendário/Pivô/Gráfico em CSS puro) , portável, mas ver 10.4 sobre
  substituir o Gráfico por recharts (que o nexus-odoo já usa) para consistência de design system.
- Os **tipos/estruturas** (`ColunaDef`, `CampoDef`, `OPERADORES`, `Regra`/`GrupoRegras`, `Chip`,
  `Nivel`, `Sort`, `Favorito`) , copiar e manter. São o contrato do sistema.

### 10.3 O que precisa de adaptação (esforço médio/alto)

- **Fonte de dados.** Trocar `PEDIDOS`/`vendas-mock.ts` por uma query Prisma server-side sobre o
  cache (o nexus-odoo já tem `raw_pedido*` e `fato_pedido`; ver `src/worker/fatos/fato-pedido.ts` e
  `queries/pedido-historico.ts` no próprio ERP Nexus). A `VendasLista` viraria um client component
  que recebe as linhas via props do Server Component, OU (melhor) que busca por Server Action/route
  paginada.
- **Push-down de filtro/ordenação/paginação para o servidor.** Hoje é tudo no cliente. Para
  escalar, `busca`, `chips`, `arvore`, `sorts`, `pill` e paginação precisam virar parâmetros de uma
  query. Aqui o `GrupoRegras`/`compilarFiltro` teria que ganhar um tradutor para `Prisma.where`
  (ou SQL), o que hoje NÃO existe , ambos os motores (protótipo e produção) só geram predicado JS.
  Este é o maior item de trabalho: um "compilarParaWhere(arvore, campoMeta) -> Prisma.WhereInput".
- **Agrupamento com subtotais no servidor.** O flatten atual agrupa a página corrente no cliente.
  Num backend real, subtotais por grupo exigem `GROUP BY` (ou agregações Prisma) e uma estratégia
  de paginação por grupo. Reescrita da lógica de `flat`, mantendo o formato de saída (lista
  achatada de nós grupo/linha) para a UI não mudar.
- **Persistência de visões.** Trocar localStorage por `SavedReport` (Prisma) + Server Actions, para
  a visão salva seguir o usuário entre dispositivos e respeitar RBAC. O snapshot serializável
  (`Favorito.snap`) já está pronto para virar JSON de coluna.
- **Facets da busca inteligente.** Em vez de varrer o array, os valores distintos por campo viram
  um `SELECT DISTINCT` (cacheável) por coluna. A UI de sugestão não muda; muda só a fonte.

### 10.4 Acoplamentos ao domínio do ERP (o que NÃO é reutilizável cru)

- `vendas-mock.ts` (tipo `Pedido`, enums de status/entrega/fatura, labels, badges, helpers) , é o
  domínio de Vendas fake. No nexus-odoo, o "domínio" é o schema do cache Odoo. Substituir por tipos
  derivados do Prisma / dos fatos. As colunas/campos (`COLUNAS`, `CAMPOS`) são catálogos de Vendas
  específicos , servem de molde, mas cada tela (Pedidos, Estoque, Financeiro) precisa do seu.
- `QUICK` (filtros rápidos "Meus pedidos", "Alto valor > 50 mil", "Urgentes") , regras hardcoded no
  cliente (ex.: `p.vendedor === "Marina Souza"`). Regra do CLAUDE.md: a UI não deve reimplementar
  regra de negócio; isso teria que vir do domínio/servidor (quem é "eu" = usuário logado; o
  threshold de "alto valor" = config).
- `module-shell.tsx` usa `GRUPO_MOCK`/`USUARIO_MOCK` , trocar pelo shell real do nexus-odoo (que já
  tem sidebar, tema, auth). Provavelmente NÃO portar a casca; encaixar a `VendasLista` no
  `page-shell`/layout de produção existente.

### 10.5 Recomendação de estratégia de porte

1. **Não portar a casca (`module-shell`) nem o mock.** Encaixar o miolo no shell de produção.
2. **Portar o kit de UI (`modulos/ui.tsx`) deduplicando** contra `src/components/ui/**` do
   nexus-odoo (reusar os primitivos que já existem; trazer só os que faltam: `SeletorColunas`,
   `useResizeColunas`, o painel tri-coluna).
3. **Adotar UM motor de filtro serializável.** Hoje há dois (`vendas-filtros.ts` `GrupoRegras` e
   `reports/filtro-avancado.ts` `Grupo`). Unificar num só, e adicionar o tradutor para
   Prisma/where que nenhum dos dois tem , é o coração do trabalho server-driven.
4. **Definir a fronteira RSC->client com cuidado** (regra de raiz do projeto): `ColunaDef.valor`/
   `CampoDef.get`/`ColunaDef` com funções NÃO atravessam de Server para client component como prop.
   O catálogo de colunas/campos precisa viver no client, ou ser reconstruído no client a partir de
   chaves serializáveis vindas do server (o padrão do projeto: "ícone vira CHAVE, nunca
   componente" , aqui "coluna vira key, a função fica no client").
5. **Escala primeiro nas telas que já têm fato**: Pedidos (`fato_pedido` existe) é o melhor
   candidato piloto, espelhando exatamente o print. Estoque/Financeiro reusam o mesmo arcabouço.

### 10.6 Veredito de esforço

- Camada visual/UX (os 8 itens como componentes): **porte rápido**, dias, porque o stack é idêntico
  e o código é autocontido e sem libs externas.
- Torná-lo server-driven e escalável (push-down de filtro/ordenação/paginação/agrupamento para
  Prisma + persistência de visões em banco + facets via DISTINCT + tradutor `GrupoRegras ->
  where`): **o grosso do trabalho**, porque essa camada simplesmente não existe hoje (o protótipo é
  in-memory e o motor de produção só gera predicado JS pós-query). É onde uma spec/plano dedicados
  se pagam.

---

## Anexo , caminhos absolutos dos arquivos-chave

Protótipo (os 8 itens):
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/modulos/vendas/vendas-lista.tsx`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/modulos/vendas/vendas-filtros.ts`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/modulos/vendas/filtro-avancado.tsx`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/modulos/vendas/vendas-visoes.tsx`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/modulos/vendas/vendas-app.tsx`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/modulos/ui.tsx`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/modulos/module-shell.tsx`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/lib/modulos/vendas-mock.ts`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/app/vendas/page.tsx`

Produção (server-driven, referência do porte):
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/charts/data-table.tsx`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/components/charts/data-table-utils.ts`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/lib/reports/filtro-avancado.ts`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/lib/reports/types.ts`
- `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/ERP Nexus/src/lib/reports/queries/` (queries Prisma por domínio)
