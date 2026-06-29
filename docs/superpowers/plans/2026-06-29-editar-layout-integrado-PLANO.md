# Editar layout DENTRO das telas reais , PLANO (direção corrigida pelo cliente)

> Decisão do cliente (2026-06-29, definitiva): **NÃO existem telas montáveis
> separadas.** A tela é a MESMA tela real (Estoque/Vendas/Pedidos, com as ABAS).
> Quem tem permissão ativa um botão **"Editar layout"** em cima dela, reorganiza/
> redimensiona os componentes e salva **global** (todos) ou **pessoal** (um
> usuário, dentro do nível de permissão). O modo de edição vive DENTRO da tela.

## Já feito nesta sessão
- RECUADO: deletadas as páginas `/diretoria/relatorios`, `-vendas`, `-pedidos` e
  removidos os itens de menu "montável". Menu volta só às telas reais.
- MANTIDO p/ reuso: blocos ricos `src/components/diretoria/blocos/blocos-{estoque,
  vendas,pedidos}.tsx`, `charts/{ranking-cards,distribuicao-dinamica,serie-temporal}`,
  `builder/construtor-grid.tsx` (vira base do GridEditavel), `kit/format` (rotuloUf/
  nomeLimpo/ufValida), `derivar-estoque`, catálogo, `layout-repo`/`layout`/`gating`.

## A construir (próxima sessão, contexto fresco)

### 1. `GridEditavel` (extrair/adaptar de construtor-grid.tsx)
Componente client que renderiza UM conjunto de componentes num react-grid-layout.
Props: `tela` (chave de persistência, ex.: `"estoque:visao"`), `componentes:
{id,titulo,fonte,travas,render()}[]`, `layoutPadrao`, `editando` (CONTROLADO DE
FORA), `podeEditarGlobal`, `onSalvar`. Tira do construtor-grid as barras de período/
filtro (essas, se existirem, ficam na tela). Mantém: mount-gate (hydration),
paleta no modo edição, salvar global/pessoal/restaurar.

### 2. Alças , CORRIGIR (cliente odiou "bolinha + traço")
- SÓ **quadradinhos nas 4 diagonais** (se/sw/ne/nw), pequenos.
- Ficam **violeta quando o mouse passa no BLOCO** (hover do react-grid-item),
  não exigir mirar no handle.
- Em **todas as bordas (n/s/e/w)**: handle funcional INVISÍVEL, só o **cursor**
  de resize (`ns-resize`/`ew-resize`) ao passar o mouse na borda. Área de pega
  larga. Nada de bolinha/traço cinza no meio.
- Cantos redimensionam **altura E largura juntas** (já é o comportamento do
  react-grid-layout para se/sw/ne/nw; garantir que os 4 estejam em resizeHandles).

### 3. Quadrantes maiores (enchem a tela)
Cliente: estica ao máximo (8) e o bloco não passa de ~75% da altura da tela.
Aumentar `ROW_H` (hoje 64) para ~96-104, OU calcular rowHeight pela altura útil.
Validar que 8 unidades verticais ≈ tela cheia.

### 4. Integração nas telas reais (estoque/vendas/pedidos-screen)
Cada *-screen.tsx tem `<Tabs>` com abas. Por aba, o conteúdo passa a ser um
`<GridEditavel tela={"area:aba"} componentes={...} editando={editando} .../>`.
Um botão **"Editar layout"** no topo (gated por capability; super_admin/admin =
global, demais = pessoal) controla `editando` para TODAS as abas. Cada aba salva
seu layout (tela = `area:aba`). Mapear os componentes de cada aba reusando os
blocos-{estoque,vendas,pedidos} já prontos.

### 5. Tabela (DataTable) , faltam 3 coisas
- **Filtro por coluna**: botão "Filtros" (popover) que filtra por valores de
  colunas (estilo Router `DomainMultiSelect`). Manter busca, seletor de colunas,
  compacto, exportar (cliente gosta).
- **Paginação no padrão** (3 zonas): ESQUERDA "Mostrando X-Y de Z" · MEIO
  ‹ PageJump › · DIREITA "N por página" (50/100/500; menos que isso, ajustar).
  Hoje está agrupado à direita , reposicionar em 3 zonas.
- **Drill-down**: usar `expandDetail` em mais tabelas (compras, pendentes,
  fornecedores), painel rico (ref: Detalhes da chamada do Consumo).

### 6. Gráficos , mais acabados
- Donut: cliente prefere o **DonutChart clássico com LEGENDA LATERAL** (lista
  com bolinha+valor+%, "Clique numa fatia para filtrar") em vez do DonutWithCenter
  só-tooltip. Reusar `components/diretoria/charts/donut-chart.tsx` (clássico) nos
  blocos, OU dar legenda lateral. Manter hover/realce.

## Validação
Screenshot sempre (scripts/diretoria-render-user.ts + diretoria-screenshot.ts;
render-check@local.test / Teste@12345). ui-ux-pro-max obrigatório. NÃO mergear (F6).
