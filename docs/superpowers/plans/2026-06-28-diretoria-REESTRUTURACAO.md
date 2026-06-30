# Diretoria , REESTRUTURAÇÃO TOTAL (norte para a próxima sessão)

> Documento-mestre. O cliente REJEITOU as telas atuais (simplórias, "tudo lista",
> sem navegação/filtros/interação) e autorizou **jogar a UI fora e refazer do
> zero**, igualando ou SUPERANDO o HTML dele. Esta é a estrutura para construir
> certo na PRÓXIMA SESSÃO. Ler junto: a perícia completa do HTML em
> `docs/superpowers/specs/pericia-html/MESTRE/00-INDICE.md` (+ capítulos 01-07).

## 1. Diagnóstico , por que o que existe hoje é ruim (jogar fora a UI)
A UI atual das telas de Diretoria (`/diretoria/*`) e a "prévia do construtor"
(`/diretoria/relatorios`) são INACEITÁVEIS. Problemas concretos (feedback do cliente):
- Telas viraram **uma coluna gigante de cards + listas cruas** empilhadas. Sem
  setorização, sem navegação interna, sem hierarquia.
- **KPIs estáticos demais** ("um monte de KPI de merda"). No HTML, vários KPIs são
  **botões que filtram/configuram a tela inteira** ao clicar.
- **Listas sem filtro, sem busca, sem paginação**, gigantes.
- **Sem interatividade/animação/inteligência**: no HTML, hover mostra detalhe,
  clicar em barra/estado/fatia filtra o resto da tela, KPIs selecionam.
- **Mapa do Brasil** mal dimensionado (ora gigante, ora minúsculo) e com
  diferenciação de cor (choropleth) ruim.
- **Vírgulas soltas** em células vazias (deveria ser "-").
- Gráficos pobres (barras chapadas). Só o donut salvou.
- Sensação geral: "lixo simplório", "perde feio para o HTML".

## 2. O ALVO (não-negociável)
Construir telas que **não percam para o HTML** (e idealmente o superem), seguindo o
Design System do projeto (dark + violeta), com **liberdade para reinventar/melhorar**.
Pilares:
1. **Navegação setorizada de verdade.** Cada domínio é uma área com sub-navegação
   (abas/tabs ou sub-rotas). Ex.: Estoque & Compras tem abas: Visão / Estoque /
   Seriais / Compras / Fornecedores. Não despejar tudo numa página rolável.
2. **KPIs interativos (cards-botão).** Clicar num KPI seleciona/filtra a tela
   (estado compartilhado). Estado visual de selecionado. Como no HTML.
3. **Filtros + busca + paginação** em TODA lista/tabela. Período, UF, fornecedor,
   texto. Nada de lista crua de centenas de linhas.
4. **Interatividade rica:** hover com tooltip/realce; clicar em fatia/barra/estado
   filtra o restante; transições 150-300ms; reduced-motion respeitado.
5. **Gráficos de alto nível** (Recharts + donut SVG já feito): donut/pizza, barras
   com eixo/tooltip, linha/tendência, treemap quando fizer sentido. NUNCA barra
   chapada de CSS solta.
6. **Mapa do Brasil premium:** tamanho equilibrado (nem gigante nem minúsculo),
   choropleth com boa escala de cor, tooltip que segue o mouse e some fora do país
   (o cliente AMOU esse comportamento , ver print aprovado / perícia B4), clique
   na UF filtra a tela.
7. **Densidade BI** (ui-ux-pro-max "Data-Dense Dashboard"): grid compacto, padding
   contido, máxima informação útil, hierarquia clara, setores bem separados.
8. **Acabamento:** sem vírgula em vazio (usar "-"); colunas alinhadas; tipografia
   tabular em números; estados vazios desenhados.

## 3. Arquitetura de navegação proposta (revisável)
Menu Diretoria (sidebar) com áreas; cada área é uma tela com **abas internas**:
- **Visão Geral** , home executiva: KPIs globais clicáveis + mapa + destaques +
  atalhos. (abas: Resumo / Mapa / Alertas)
- **Vendas (C)** , abas: Indicadores / Por estado / Por marca / Pedidos /
  Pagamentos / Comparativo de estados.
- **Pedidos & Demandas (B)** , abas: Pendentes / Mapa / Pedido (drill-in) /
  Máquinas / Itens ativos.
- **Estoque & Compras (A+K)** , abas: Estoque / Distribuição / Seriais / Catálogo
  & ideal / Compras (A7 detalhe) / Fornecedores (A8 matriz).
- **Agenda** , calendário 2 colunas interativo (perícia cap 02).
- (Construtor de relatórios montável = fase posterior; NÃO é prioridade agora.)
Sub-navegação: usar `tabs` (base-ui/shadcn-like) com rota `?aba=` ou segmentos.
Estado de filtro compartilhado por área (período/UF/seleção) via contexto client.

## 4. O que MANTER vs REFAZER
MANTER (é bom e custou caro):
- **Perícia completa do HTML** (`pericia-html/MESTRE/**`) , a fonte da verdade.
- **Queries de dado já testadas** em `src/lib/diretoria/queries/{vendas,estoque,pedidos}.ts`
  (TDD verde): indicadores, por UF/marca/família, formas de pgto, modalidades,
  margem estimada, catálogo, seriais, compras ativas, resumo/matriz de fornecedor,
  indicadores avançados (cobertura/giro). REUSAR como camada de dados.
- **Schema + builders**: FatoCompra, FatoSerial, DiretoriaEvento*, RBAC (Onda 0).
- **BrazilMap** (`src/components/diretoria/brazil-map/`) , refinar tooltip/tamanho.
- **DonutChart** (`src/components/diretoria/charts/donut-chart.tsx`) , bom, reusar.
- **RBAC 2 níveis** (capabilities + access) , manter.
REFAZER DO ZERO (jogar fora):
- TODAS as PÁGINAS `src/app/(protected)/diretoria/*/page.tsx` (layout/UX ruim).
- O "construtor/prévia" `/diretoria/relatorios` + `src/components/diretoria/builder/**`
  + `src/lib/diretoria/builder/**` (conceito adiado; UI pobre). Pode remover do menu
  (já removido) e, se quiser, do código.
- Componentes de render pobres (barras CSS chapadas).

## 5. Processo OBRIGATÓRIO na próxima sessão
- **ui-ux-pro-max em TUDO de frontend, sempre** (rodar o `--design-system` e
  `--domain chart/ux`; aplicar densidade Data-Dense). Exigência explícita do cliente.
- **Validar SEMPRE por screenshot ANTES de dizer pronto** (nunca cego, nunca prévia
  pobre): playwright já instalado (`--no-save`); user de teste
  `render-check@local.test` / `Teste@12345` (super_admin), criar/deletar via tsx;
  chromium screenshot em `/tmp`; `npm run dev:fresh` se o Turbopack ficar stale.
- **NÃO mostrar "prévia" ao cliente** , só telas completas e boas.
- TDD nas queries; SQL cirúrgico (NUNCA `db push`; drift da worktree nex-reconstrucao);
  commits atômicos; NÃO mergear sem autorização (regra F6/cliente).
- Construir **uma área por vez, completa e linda**, validando por screenshot, e só
  então a próxima. Começar por **Estoque & Compras** (foco do cliente), com a
  navegação por abas + KPIs-filtro + tabelas com filtro/paginação + mapa/gráficos.

## 6. Roteiro de construção (próxima sessão)
1. **Fundação de UI**: componente de sub-navegação (Tabs), layout de área (header +
   barra de filtros global + abas), tokens de densidade, e um KIT de blocos
   premium (KPI-card clicável, ChartCard, DataTable com busca/sort/paginação,
   StatPill, EmptyState). Validar visual isolado.
2. **Estoque & Compras** completo, por abas, igualando o HTML (cap 03+04): KPIs
   interativos, donuts, mapa (se aplicável), catálogo+ideal, seriais com busca,
   A7 detalhe da compra (drill-in), A8 matriz com filtros. Screenshot a cada aba.
3. **Vendas** (cap 06): C1-C10, comparativo, período, KPIs-filtro. Screenshot.
4. **Pedidos & Demandas** (cap 05): B1-B8, mapa, drill-in. Screenshot.
5. **Visão Geral** executiva. Screenshot.
6. **Agenda** interativa (cap 02). Screenshot.
7. Polimento global: animações, reduced-motion, responsivo, saneamento ("-").

## 7. Referências
- Perícia: `docs/superpowers/specs/pericia-html/MESTRE/00-INDICE.md` (+ 01-07).
- SPEC v3: `docs/superpowers/specs/2026-06-28-diretoria-v2-SPEC.md` (catálogo/dados).
- Prints do HTML enviados pelo cliente (2026-06-28 ~22h): mostram o nível visual e
  de interação a alcançar (KPIs-filtro, navegação, densidade).
- HTML-fonte: `~/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`.
- Design System: ui-ux-pro-max "Data-Dense Dashboard" + identidade dark/violeta.

## 8. Tom da entrega
O cliente está (com razão) muito insatisfeito. A próxima sessão deve entregar algo
que ele olhe e diga "agora sim". Não economizar em qualidade visual, navegação e
interatividade. Reinventar onde melhorar. Validar com os próprios olhos (screenshot)
antes de mostrar. Sem desculpa, sem prévia pobre.
