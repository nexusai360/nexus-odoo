# F6 , Expansão: cobrir TODOS os domínios + mais componentes

> Branch `feat/nex-reconstrucao`. **F6 SÓ LOCAL.** Data: 2026-06-28.
> Pedido do usuário: "mapeie e cubra todos os fatos da plataforma para gerar relatórios
> profundos de qualquer parte" + "mais componentes/gráficos/elementos".
> Base: o gerador (cérebro) já está pronto e dirigido por um catálogo de métricas
> DERIVADO do `source-registry`. Cobrir um domínio = REGISTRAR suas fontes (não construir
> fato novo). Mapeamento feito por workflow (4 mapeadores Opus).

## 1. Achado central (do mapeamento)

**Nenhum domínio precisa de camada de fatos nova.** TODOS os domínios de negócio já têm
`fato_*`/`dim_*` no Prisma E uma query auditada pronta em `src/lib/reports/queries/*`. O
`source-registry.ts` só registrava estoque. Cobrir um domínio = **wrappar a query existente
numa `FonteDef`** (mesmo padrão das 8 fontes de estoque) + **curar as métricas** no
`metric-catalog.ts`. O compositor/revisor/render já funcionam para qualquer (fato, shape).

## 2. Recipe para registrar um domínio (mecânico, ~1 commit por domínio)

1. **`source-registry.ts`:** importar as queries do domínio; criar 1 `FonteDef` por fato com
   `contract` (fato, modeloFonte, dominio, shapes, campos) + `produtores` que chamam a query
   e devolvem `RawSourceData` (`{linhas, kpis?, freshness:null}`). Mapear:
   - KPIs escalares → shape `kpis` (`kpis: {chave: valor}`).
   - série temporal → shape `serieTemporal` (linhas `{mes, ...numericos}`).
   - agregação por dimensão → shape `agregacaoCategorica` (linhas `{rotulo, valor}`).
   - listagem → shape `tabela` (linhas com as colunas do contrato; detalhe aninhado vira
     drilldown automático via `__detalhe`).
   Adicionar as fontes ao `REGISTRY`.
2. **`metric-catalog.ts`:** uma entrada em `CURADORIA` por medida, chave
   `${fato}|${shape}|${campoKpi ?? ""}`, com `{id, rotulo, descricao, pergunta, formato,
   chartPreferido}`. shape/série/dimensões são derivados (não redeclarar).
3. **(se faltar filtro)** `FiltrosFonte`/`FiltrosRuntime`: hoje têm
   `armazemId, familiaId, marca, faixaDias, sentido, periodoDe, periodoAte`. Outros domínios
   pedem: `empresaId`, `participanteId`, `situacao`, `tipo`, `natureza`, `documento`,
   `fornecedor` , adicionar conforme a query usa (e ligar nos produtores + `report-filters`).
4. **Teste:** asserir que `listarMetricas({dominiosPermitidos:[dominio]})` traz as métricas
   esperadas; rodar produtor contra dado real (tsx).
5. **Pronto:** o pipeline já cobre todos os domínios registrados (`dominiosRegistrados()`).

## 3. Status de cobertura por domínio

| Domínio | Status | Queries a wrappar (fonte) |
|---|---|---|
| **Estoque** | FEITO (onda 1) | estoque.ts (8 fontes) |
| **Financeiro** | FEITO (onda 2) | querySaldoContas, queryCaixaPeriodo, queryFluxoCaixa, queryResultadoPorConta |
| Financeiro , títulos | a fazer | queryContasAReceber/Pagar/TitulosVencidos (TAB+KPI+quebra); cobranca-bancaria.ts (baixas/retornos/remessas) |
| **Comercial** | a fazer | queryPedidosPeriodo/PorEtapa/PorVendedor (KPI+CAT), queryPedidosAtrasados/ParcelasAVencer (TAB+KPI), pedido-historico (gargalo por etapa) |
| **Fiscal** | a fazer | queryFaturamentoPeriodo, queryNotasEmitidas/Recebidas (TAB+KPI+topMaiores), queryFaturamentoPorCliente, queryProdutosFaturados, queryImpostosPeriodo, dfe (por fornecedor) |
| **Contábil** | a fazer | queryPlanoDeContas, queryContaReferencial (populados); lançamento/razão (estrutural 0 reg) |
| **Cadastros** | a fazer | queryContarParceiros (9 KPIs), queryParceirosPorUf (CAT) |
| Preços/Serviços/Produção/Referência | a fazer | TAB simples; baixo valor imediato |
| Estruturais 0 reg | registrar com guarda | mdfe, reinf, cheque, pix, cotacao, comissao, contábil-lançamento, crm, min/max , só renderizam quando o Odoo operar (checar `fato_build_state` + count) |

**Ordem sugerida de valor:** Comercial → Fiscal → Financeiro-títulos → Cadastros → Contábil.

## 4. Mais componentes (2 eixos)

### 4.1 Ativar o que JÁ existe (baixo custo, só o gerador emitir)
- **`KpiCard.delta`** (variação % com seta, já no componente) → bloco/flag `KpiStrip` com
  `metricasAnterior` (mesmo objeto do período anterior). "R$ X, +12% vs mês passado".
- **`InteractiveBarChart` `stacked`/multi-série** → blocos `StackedBar`/`MultiBar`
  (faturamento por mês quebrado por categoria; entradas vs saídas).
- **`InteractiveAreaChart` `stacked`** → `StackedArea` (composição no tempo).
- **`DonutWithCenter` `secondaryValue`** → donut com 2 totais no centro.
- **`agruparOutros`** (de `charts/pie-chart.tsx`) portar para o PieChart do gerador quando há
  muitas fatias (financeiro/comercial têm dezenas).
- **`DataTable` rico** (`charts/data-table.tsx`: multi-sort, seletor de colunas, CSV,
  `expandDetail`) → bloco `DataTableDrill`/`DataTableExport` (hoje o builder usa o
  `ReportDataTable` simples; o drilldown básico já foi ativado via `__detalhe`).

### 4.2 Componentes NOVOS de alto valor (recharts já instalado)
- **Waterfall/cascata** (DRE: receita → custos → margem) , altíssimo valor financeiro/contábil.
- **Funnel** (pipeline comercial: lead → orçamento → pedido → faturado).
- **Gauge/radial** (% de meta atingida).
- **Sparkline** (mini-tendência embutida no KPI).
- **Combo barra+linha** (`ComposedChart`: faturamento vs ticket médio).
- **Treemap** (participação hierárquica família → produto).
- **Tabela pivô/cross-tab** (agregação 2D com totais , fiscal/contábil).

Cada novo componente vira: (a) componente em `components/charts/` reusando `colors.ts` +
`ChartTooltip` + estados; (b) novo `ReportTemplate` em `src/lib/reports/types.ts` +
`TEMPLATES_ONDA1`; (c) `descreverComponente` no `component-catalog.ts` + `compat.ts`; (d) um
shape em `ShapeDerivado` se o dado exigir (ex.: waterfall/pivô); (e) branch no
`report-renderer.tsx`; (f) novo bloco na gramática (`plano-types.ts`) que o build expande.

## 5. Não-objetivos / guardas
- Estruturais 0 reg: registrar mas esconder a métrica quando `count(*)==0` (sinal honesto).
- F6 SÓ LOCAL. Caminho com LLM real BILHA a API do cliente , passe visual é decisão dele.

> **Status:** estoque + financeiro registrados e provados. Recipe documentado. Próximas
> ondas: domínios restantes (mecânico) + componentes novos (waterfall/funnel/gauge...).
