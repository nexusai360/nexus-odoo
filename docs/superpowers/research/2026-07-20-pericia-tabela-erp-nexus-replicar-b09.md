# Perícia da tabela avançada do ERP Nexus e plano de réplica no B-09 (Entregas Parciais)

> Pedido do dono (2026-07-20): reformular COMPLETAMENTE a tabela do B-09 para
> ficar igual (ou melhor) à tabela do ERP Nexus (`localhost:3300/vendas`). O
> nosso B-09 hoje é pobre: busca pequena, DOIS filtros redundantes, paginação
> bugada. Esta perícia mapeia o código-fonte real do ERP Nexus (mesma base de
> código) e define como replicar no nexus-odoo.

## 0. Onde vive o código (ERP Nexus)

Projeto: `Projetos Internos/ERP Nexus` (name `nexus-odoo`, MESMA stack: Next 16
RSC, TS, Tailwind v4, base-ui, lucide). Rota `/vendas` → `VendasApp`.

| Arquivo (`src/components/modulos/`) | Linhas | Papel |
|---|---|---|
| `ui.tsx` | 790 | **Primitivos GENÉRICOS**: Checkbox, Select (combobox que substitui `<select>`), Popover, Modal, Btn, Tooltip, **SeletorColunas**, **useResizeColunas + ResizeHandle**, **Paginacao** (+ DropUp). |
| `vendas/vendas-lista.tsx` | 731 | **A tela-mãe**: toolbar, searchbar-com-chips + busca inteligente, painel "Filtros e agrupar" tri-coluna, pills de estado, seleção em lote, view Lista (tabela) + Kanban, pipeline filtro→sort→paginação→agrupamento multinível, favoritos, persistência. |
| `vendas/vendas-filtros.ts` | 239 | **Modelo (dados puros)**: `ColunaDef`, `CampoDef` (por domínio), `OPERADORES` por tipo, árvore `Regra`/`GrupoRegras` + `testaNo` (avaliador recursivo genérico). |
| `vendas/filtro-avancado.tsx` | 228 | **Modal de filtro personalizado** genérico: SeletorCampo (busca + comuns/todos + domínio), ValorInput adaptativo, GrupoBloco recursivo TODAS/QUALQUER, contagem ao vivo, Aplicar/Descartar. |
| `vendas/vendas-visoes.tsx` | 230 | Views **Calendário / Pivô / Gráfico** (CSS puro, sem libs). |
| `module-shell.tsx` | 295 | Casca do módulo (não é a tabela; header/nav/command-palette). |
| `vendas/vendas-app.tsx` | 132 | Orquestra estado mock e navega lista⇄detalhe. |

**Zero dependências novas** em toda a tabela: sem TanStack, @dnd-kit, zustand,
nuqs. Tudo `<table>` HTML + `useState`/`useMemo` + pointer events + localStorage.
Idêntico ao nosso stack → porte sem tradução.

## 1. Inventário de recursos (o alvo, confirmado nas 12 telas de referência)

1. **Searchbar grande que cresce por chips.** Chips de FILTRO (violeta) e de
   AGRUPAMENTO (verde) vivem dentro da própria barra; "Limpar tudo" à direita.
2. **Busca inteligente** (`vendas-lista.tsx:197-212`): ao digitar, dropdown com
   `Contém "X"` + facetas das colunas de texto VISÍVEIS (`Cliente: …`,
   `Vendedor: …`). Enter escolhe a 1ª; clique vira chip. Facet SERIALIZÁVEL
   (`{kind,campo,valor}` → predicado por `matchFacet`), persiste sem funções.
3. **Um único "Filtros e agrupar"** (`:471-538`): Popover tri-coluna →
   **Filtros** (presets rápidos + "Filtro personalizado…"), **Agrupar por**
   (multinível, ordem numerada 1º/2º/3º), **Favoritos** (Salvar esta visão +
   lista). (Nosso B-09 tem DOIS botões redundantes → remover ambos.)
4. **Filtro personalizado** (`filtro-avancado.tsx`): modal TODAS/QUALQUER,
   aninhável, **seletor de campo com BUSCA** (não `<select>` nativo) agrupado por
   domínio (Comercial/Financeiro/Logística/Fiscal…), operadores adaptativos ao
   tipo, **contador de resultados ao vivo**, Aplicar/Descartar.
5. **Agrupamento multinível com subtotais** (`vendas-lista.tsx:281-300`): recursão
   que achata em nós grupo/linha, `count` + `soma` por nível, cabeçalho
   "Nível: valor · N · R$…", grupos começam FECHADOS, expandir/colapsar,
   indentação por nível.
6. **5 views** (`:58-64`): Lista, Kanban (colunas por situação), Calendário (por
   data), Pivô (dimensão×dimensão com totais), Gráfico (barras). Ícones no topo.
7. **Seletor de colunas** (`ui.tsx:359-561`): buscar coluna, selecionar
   tudo/limpar, **reordenar por arraste na alça** (pointer events, preview ao
   vivo com transform), **coluna travada** (cadeado `Lock`, obrigatória não
   desmarca nem move), mostrar/ocultar.
8. **Redimensionar coluna** (`ui.tsx:569-685`): arrasta a divisória (pointer
   events), **duplo-clique mede o conteúdo real (Range/TreeWalker) e ajusta ao
   mínimo que mostra tudo**, persiste largura por coluna. `table-auto`→`table-fixed`.
9. **Multi-sort por header** (`vendas-lista.tsx:348-363`): clique cicla asc→desc→
   remove; ordem de clique = prioridade (badge 1º/2º); "Remover ordenação".
10. **Abas/pills de situação** (`:92-113`, `:541-556`): quick-filter mais usado.
11. **Seleção em lote** por checkbox (linha + "todos") com barra de ações.
12. **Paginação** (`ui.tsx:718-789`): "Mostrando X-Y de Z" + "Página N de M"
    (dropdown com **campo que FILTRA a lista de páginas** ao digitar e navega no
    clique) + "N por página". **É isto que conserta o bug do nosso B-09.**
13. **Compacto + Exportar** (o dono aprovou os dois; manter).
14. **Favoritos / salvar visão** + **persistência localStorage** por tela
    (`:165-193`): colunas (ordem+vis), sorts, níveis, chips, view, pill, busca,
    porPagina, árvore, favoritos.

## 2. Arquitetura e o que é genérico vs específico

**Fluxo:** `base: Row[]` (linhas já carregadas) → **pipeline**
`lista` (pill + busca global + chips-facet[OU-no-campo/E-entre-campos] +
`testaNo(árvore)`) → `listaOrdenada` (multi-sort) → paginação (slice) →
`flat` (agrupamento multinível) → render (`celula()` por tipo).

- **GENÉRICO (copiar ~1:1):** todo o `ui.tsx` (primitivos), o motor
  `Regra`/`GrupoRegras`/`testaNo`/`OPERADORES` de `vendas-filtros.ts`, o
  `filtro-avancado.tsx` inteiro (recebe `campos`/`campoBy`/`campoPadrao`), e a
  MECÂNICA da `vendas-lista.tsx` (estado, pipeline, agrupamento, seleção, sort,
  resize, persistência).
- **ESPECÍFICO de vendas (recriar para o B-09):**
  - `COLUNAS`/`CAMPOS` (as `ColunaDef`/`CampoDef` com `valor(row)`/`get(row)`
    tipados a `Pedido`) → recriar `entregas-filtros.ts` com as ~28 colunas do
    B-09 e os campos por domínio (Pedido/Cliente/Produto/Fiscal/Financeiro/Logística).
  - `celula()` (render por coluna) → adaptar aos tipos do B-09: texto, moeda,
    data, **tag colorida da etapa** (já temos, Fase 2), **status financeiro
    ícone** (já temos, Fase 2). Reusar o que as Fases 2/3 produziram como CONTEÚDO.
  - Ações em lote (confirmar/faturar/cancelar) → não se aplicam a "entregas";
    manter só Exportar (e talvez nenhuma ação em lote na v1).
  - Views Kanban/Calendário/Pivô/Gráfico → redefinir as dimensões do domínio
    (ex.: Kanban por etapa, Calendário por data prevista, Pivô etapa×mês/UF×etapa,
    Gráfico por etapa/UF/vendedor). **Decisão do dono sobre quais entram.**

## 3. Impacto no que já existe (Fases 1-4)

- **Fases 1A/1B (dados):** intactas e essenciais — a `base` do B-09 (demanda a
  entregar, 27 etapas, pedidos antigos) continua sendo a fonte.
- **Fase 2 (tag de etapa colorida + status financeiro ícone):** reaproveitada
  como CONTEÚDO das células na tabela nova.
- **Fase 3 (28 colunas):** reaproveitada — vira o catálogo `COLUNAS` do B-09.
- **Fase 4 (filtro E/OU no `data-table.tsx` atual):** **superada** pela tabela
  nova (o dono viu e quer o modelo do ERP). O `data-table.tsx` atual e a Fase 4
  continuam servindo as OUTRAS 7 telas; o B-09 passa a usar a tabela avançada
  nova. Nada se perde: o motor `filtro-avancado.ts` da Fase 4 e o do ERP são
  equivalentes (E/OU ≡ TODAS/QUALQUER).

**Decisão de arquitetura proposta:** criar a tabela avançada como **componente
novo** (`src/components/tabela-avancada/**`, portado do ERP Nexus) e usá-la
**só no B-09** por ora, com dados reais client-side. Não tocar o `data-table.tsx`
das outras telas. Depois, se o dono quiser, propaga para estoque/vendas/etc.

## 4. Diferenças do nosso B-09 hoje (o que remover/corrigir)

- **Remover os DOIS filtros redundantes** (o "Filtros" E/OU da Fase 4 + o
  "Filtrar por coluna" de facetas). Vira UM "Filtros e agrupar".
- **Busca pequena → searchbar grande com chips + busca inteligente.**
- **Paginação bugada → Paginacao do ERP** (campo filtra páginas + navega).
- **Sem agrupamento/views/reordenação/redimensionamento → adicionar todos.**
- **Manter** o que presta: modo Compacto e Exportar.

## 5. Plano de réplica (ondas) , proposta

> Metodologia: cada onda = implementação inline (UI, `ui-ux-pro-max`) + testes +
> perícia. Nada em produção sem "sim" do dono. Tudo client-side sobre a base real.

- **Onda 0 , Fundação portada:** copiar `ui.tsx` (primitivos: Select, Popover,
  Modal, Btn, Tooltip, Checkbox, **SeletorColunas**, **useResizeColunas/ResizeHandle**,
  **Paginacao**) e o motor `Regra`/`GrupoRegras`/`testaNo`/`OPERADORES` para
  `src/components/tabela-avancada/`. Conferir que casam com nosso DS (violet,
  tokens). Testes dos puros (testaNo, agrupamento, resize-helpers).
- **Onda 1 , Catálogo do B-09:** `entregas-filtros.ts` com as ~28 `ColunaDef`
  (reusando Fases 2/3) e os `CampoDef` por domínio. `celula()` do B-09 (tag de
  etapa, status ícone, moeda, data).
- **Onda 2 , Tabela + Lista + toolbar:** o componente-mãe (portado da
  `vendas-lista.tsx`) com searchbar+chips, busca inteligente, pills, multi-sort,
  seletor+reorder+resize de colunas, paginação, compacto, exportar. Sem
  agrupamento/views ainda (view Lista só).
- **Onda 3 , Filtros e agrupar:** o Popover tri-coluna + `filtro-avancado.tsx`
  (modal com busca de campo) + agrupamento multinível com subtotais + chips.
- **Onda 4 , Views:** Kanban/Calendário/Pivô/Gráfico adaptadas ao domínio
  (dimensões a confirmar com o dono).
- **Onda 5 , Favoritos + persistência + polimento** (dark/light, a11y, 375px).

## 6. Decisões do dono (antes/junto da implementação)

1. **Escopo desta rodada:** portar a tabela inteira (Ondas 0-5) ou começar pelo
   essencial (Ondas 0-3: tabela + filtros + agrupar) e deixar views/favoritos
   para depois? (Recomendo 0-3 primeiro, entrega o "grosso" rápido.)
2. **"E/OU" vs "TODAS/QUALQUER"** no filtro personalizado: a Fase 4 fixou D1 =
   "E/OU"; o ERP usa "TODAS/QUALQUER". Manter D1 (E/OU) ou adotar o rótulo do ERP?
3. **Quais views** fazem sentido para Entregas: Lista (certo) + quais de
   Kanban(por etapa)/Calendário(por prevista)/Pivô/Gráfico?
4. **Ações em lote:** entregas têm alguma ação em lote (ex.: exportar seleção)
   ou só Exportar tudo?
5. **Presets de filtro** do domínio (ex.: "Financeiro bloqueado", "Sem previsão",
   "Vendas futuras"): quais entram?
6. **Só no B-09** agora (recomendado) ou já generalizar para as outras telas?

## 7. DECISÕES DO DONO (2026-07-20) , fecham o escopo

- **Escopo: Ondas 0-5 COMPLETAS** nesta rodada (inclui views e favoritos).
- **Views: Lista + Kanban por ETAPA + Calendário.** SEM Pivô e SEM Gráfico.
  - Kanban: uma coluna por etapa do pedido (as 27 etapas de demanda aberta),
    card com pedido/cliente/valor a atender; agrupar visualmente por etapa.
  - Calendário: pedidos posicionados por DATA (usar `prevista`; fallback
    `orcamento`). Célula do dia lista os pedidos daquele dia.
- **Rótulo do filtro: E / OU** (mantém D1 da Fase 4). No motor portado,
  mapear `todas`→"E" e `qualquer`→"OU" na apresentação; internamente pode
  manter os identificadores, mas o texto na tela é E/OU.
- **Defaults assumidos (dono ajusta se quiser):** tabela nova SÓ no B-09 agora
  (data-table.tsx segue nas outras 7 telas); ação em lote = apenas Exportar
  seleção (entregas não confirmam/faturam); presets de filtro propostos:
  "Financeiro bloqueado", "Sem previsão de entrega", "Vendas futuras
  (CFOP 5922/6922)" , validar com o dono na entrega.
- **Reuso:** Fases 2/3 (tag de etapa colorida, status financeiro ícone, as 28
  colunas) viram o catálogo/células da tabela nova.
