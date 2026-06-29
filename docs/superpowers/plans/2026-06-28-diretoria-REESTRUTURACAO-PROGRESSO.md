# Diretoria , REESTRUTURAÇÃO TOTAL , PROGRESSO

Ponto de retomada da reconstrução do zero (norte: `2026-06-28-diretoria-REESTRUTURACAO.md`).
Branch `feat/menu-diretoria`. NÃO mergear sem autorização (regra F6/cliente).

## Fundação de UI (feita)
- KIT premium: `src/components/diretoria/kit/kpi-button.tsx` (KPI card-botão
  selecionável, tons semânticos) e `section-card.tsx` (card de seção denso).
- `DonutChart` estendido: `onSelect` + `selecionado` (fatia clicável filtra).
- `DataTable` estendido: prop `compactoInicial` (trunca textos longos, revela
  colunas numéricas). Reusado em todas as listas.
- Navegação por ABAS via `Tabs` (base-ui). Estado de filtro compartilhado client.
- Validação: `scripts/diretoria-render-user.ts` (user `render-check@local.test`
  / `Teste@12345`, super_admin) + `scripts/diretoria-screenshot.ts` (login +
  screenshot por aba, dark mode). Rodar: `npx tsx --env-file=.env.local
  scripts/diretoria-render-user.ts` e `npx tsx scripts/diretoria-screenshot.ts
  /diretoria/<rota> aba1,aba2,...`.

## Telas
### Estoque & Compras , FEITA E VALIDADA (commit 22277712)
6 abas: Visão geral / Estoque / Distribuição / Seriais / Compras / Fornecedores.
KPIs-botão, donuts clicáveis (filtram catálogo + navegam), chips de filtro,
busca/sort, matriz por fornecedor, dado real (R$49,4M, 1.894 modelos, 68 locais).
Interação clicar-fatia-filtra-catálogo comprovada por screenshot.
- GAP de dado honesto: `fato_serial` não tem custo/data/local/idade (0 de 8.699).
  A aba Seriais sinaliza e mostra só serial+modelo + agregação por modelo.

### Vendas , FEITA E VALIDADA (commit afc54404)
4 abas: Visão geral / Por estado / Por marca / Pagamentos. Barra de período (C1)
preservada + UF-scoping. MAPA do Brasil coroplético com tooltip que SEGUE o
cursor e some fora do país (BrazilMap refinado, era fixo no canto). Dado real
(R$59,4M este mês). Honestidade: "Operações dos pedidos"/"Maior pedido" vêm de
fato_pedido (misturam vendas/compras/transferências), rotulado; margem "estimada".

### Próximas áreas (a fazer, mesma régua)
- Pedidos & Demandas (cap 05): B1-B8, mapa por estado, drill-in. queries em
  src/lib/diretoria/queries/pedidos.ts.
- Visão Geral executiva.
- Agenda interativa (cap 02).
- Polimento global (reduced-motion, responsivo, saneamento "-").

## Pendências/melhorias registradas
- BrazilMap: tooltip deve SEGUIR o mouse (hoje fixo top-left) e sumir fora do
  país; revisar tamanho/choropleth (reclamação do cliente). Fazer na aba Vendas.
- A7 drill-in (itens da OC + 10 KPIs): a query `queryComprasAtivas` não traz
  itens nem vrPago por OC; enriquecer quando for fazer o detalhe da compra.
