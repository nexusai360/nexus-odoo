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

### Pedidos & Entregas , FEITA E VALIDADA (commit 9fe1cfdc)
3 abas: Visão geral / Mapa / Pendentes. KPIs (608 demandas, R$146,3M, 109
atrasadas, a receber), donut por etapa, mapa do Brasil de demandas, lista de
pendentes com chips de filtro por prazo (contagem) + busca + badges de previsão.

### Visão Geral (home executiva) , FEITA E VALIDADA (commit 9c7599fa)
6 KPIs globais + mapa do Brasil em destaque + 2 donuts (vendas por marca /
estoque por família) + atalhos drill-in gated por capability. Fix importante:
ícones lucide não cruzam server->client; composição virou VisaoGeralScreen client.

### Agenda , FEITA E VALIDADA (commit a3062902)
Elevada ao cap 02: layout 2 colunas (calendário mensal + painel do dia lateral).
Clicar num dia seleciona (realce violeta); painel lista eventos do dia com hora,
tipo, local, colaboradores e excluir; "Novo evento" cria no dia selecionado;
eventos coloridos por tipo na célula. Validado por screenshot com eventos de
teste (depois removidos). Reusa actions diretoria-agenda; sem mudança de schema.

### Limpeza (commit e7736dd0)
Removidos órfãos: vendas-charts.tsx, vendas-mapa-comparativo.tsx,
pedidos-pendentes-table.tsx (substituídos pelos *-screen.tsx).

## STATUS: as 5 áreas da Diretoria estão reconstruídas/elevadas e validadas.
Nada mergeado (regra F6/cliente). Branch feat/menu-diretoria pushada.

## Feedback do cliente (2026-06-29) , FASE A feita, FASE B especificada
**FASE A , ajustes de qualidade (commit e8d084a0, VALIDADO por screenshot):**
- KPIs abreviados (R$ X,Y mi / R$ N mil) com valor cheio no hover , resolve o
  estouro na Visão geral. Módulo `kit/format.ts`. Aplicado em Visão geral e Pedidos.
- Pílulas de período enxutas: Hoje / Esta semana / Este mês / Este ano / Tudo /
  Personalizado (removidos ano anterior e últimos 7/30/90).
- Mapa do Brasil maior; tooltip e ranking com "% do total" (não "% do líder");
  hover no mapa realça o estado no ranking lateral.
- Sync automático: `/api/diretoria/freshness` + FreshnessBadge dá soft-refresh
  quando o ciclo nativo grava timestamp novo (sem refresh manual).

**FASE B , construtor modular (SPEC: 2026-06-29-diretoria-construtor-modular-SPEC.md):**
Decisões do cliente: provar em Estoque & Compras primeiro; layout duplo (oficial
global + pessoal). A infra do builder JÁ existe (schema DiretoriaRelatorio/Bloco,
catalogo.ts com travas, loaders/layout-repo/gating, grid-relatorio/render-componente)
, REAPROVEITAR. Onda 1: catálogo A-*, grid 4×4 arrastável (react-grid-layout),
modo de edição com paleta, persistência dupla, filtros globais. É grande , execução
dedicada. Próximo passo: auditar a infra do builder e executar a Onda 1.

### Pendências/melhorias (próxima onda, opcional, dependem de feedback)
- A7 drill-in da compra com itens da OC: NÃO viável hoje (não existe
  FatoCompraItem no schema; só FatoCompra cabeçalho). Exigiria ingestão de itens.
- Agenda: month picker multi-mês (1/2/3/6/12) e anexos (cap 02), se desejado.
- "Maior pedido"/"Operações" da tela Vendas vêm de fato_pedido (mistura
  vendas/compras/transferências); filtrar só venda quando houver campo de tipo.
- Polimento responsivo fino (mobile) e revisão reduced-motion.

## Pendências/melhorias registradas
- BrazilMap: tooltip deve SEGUIR o mouse (hoje fixo top-left) e sumir fora do
  país; revisar tamanho/choropleth (reclamação do cliente). Fazer na aba Vendas.
- A7 drill-in (itens da OC + 10 KPIs): a query `queryComprasAtivas` não traz
  itens nem vrPago por OC; enriquecer quando for fazer o detalhe da compra.

## Construtor modular , ONDA 1 FEITA E VALIDADA (commits dfdb09cc, 6b6f1f26, 72e29663)
Rota `/diretoria/relatorios` = construtor de Estoque & Compras:
- Componentes IDENTIFICADOS no catálogo (A-01,A-02,A-03,A-04,A-05,A-06,A-07,A-08,
  A-09,K-01), com badge do id + nome + selo de fonte.
- Grid de OITAVOS (8x8) via react-grid-layout: modo view (estático) e modo
  edição (mãozinha p/ arrastar, redimensionar pelas bordas com travas por tipo,
  paleta p/ adicionar, X p/ remover).
- Salvar OFICIAL (admin/super_admin) ou PESSOAL; "Restaurar oficial" apaga o
  pessoal. Persistência via DiretoriaRelatorio (isPadrao/donoUserId) + x,y no
  configJson (sem migration). Cascata pessoal>oficial>padrão-em-código.
- Renders BI de qualidade (KpiButton/DonutChart/DataTable) , sem barras chapadas.
- E2E validado: salvar+carregar preservam meio-passo (5 de 8); travas clampam;
  restaurar cai p/ oficial. tsc + 21 testes do builder verdes. Screenshot view+edição.

### Onda 2 (próxima, não feita)
- Integrar o construtor às telas com ABAS (cada aba = tela montável) e adicionar
  submenu/entrada no menu (hoje só via URL /diretoria/relatorios).
- Espalhar catálogo p/ Vendas (C-*), Pedidos (B-*), Visão (V/G-*), Agenda.
- Filtros globais (período + UF/local) publicados às pílulas → componentes que
  consomem re-renderizam; filtro por componente interno.
- RBAC fino (capabilities diretoria.layout.edit / .global) em capabilities.ts
  (hoje: editar pessoal = tem acesso; oficial = admin/super_admin por role).
- Responsivo mobile (breakpoints do react-grid-layout) e renomear campos de
  schema p/ oitavos (larguraOitavos/alturaOitavos) via migration cirúrgica.
