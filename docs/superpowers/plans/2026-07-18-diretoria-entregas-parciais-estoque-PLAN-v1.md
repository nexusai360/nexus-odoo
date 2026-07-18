# PLAN v1 , Diretoria: Relatório de Entregas Parciais + Estoque real/demonstração (Lote 1)

> Origem: reunião do dono com o colega de logística (transcrição 2026-07-18).
> Perícia de código: 4 frentes (menu/diretoria, demanda/entregas, estoque/locais, kits/BOM).
> Metodologia: este é o v1. Passa por Review 1 (adversarial) → v2 → Review 2 (2× mais profunda) → v3.
> Escopo travado com o dono (AskUserQuestion 2026-07-18): ver §3.

---

## 1. Objetivo do Lote 1

Entregar, na Diretoria, as **duas prioridades** que o dono deu, sem regredir o que os PRs #189–195 já colocaram em produção:

1. **Relatório de Entregas Parciais** (sub-aba nova em "Pedidos & Entregas"): lista, por item, os pedidos com saldo a entregar, com as colunas operacionais que o colega usa hoje no Odoo, e o topo mostrando **três visões de valor** (total do pedido · saldo a atender a venda · saldo a atender a custo). Resolve de vez a estranheza "61 mi × 21 mi": os dois números passam a conviver na mesma tela, rotulados.
2. **Estoque real e de demonstração** mais fiéis: inverter o card de valor em estoque na Visão Geral, tratar "em transferência" como próprio, corrigir a classificação dos locais reais (DSTOCK que falta, "terceiro que é nosso"), e separar o painel de demonstração em dois blocos (nossos depósitos × em cliente).

Fora do Lote 1 (vai para o Lote 2): **desmembramento de kits** (BOM), rateio de valor Matrix/acessórios.

---

## 2. Estado atual (o que a perícia encontrou)

### Já existe e NÃO pode regredir
- Menu Diretoria por rotas: `Visão geral | Vendas | Pedidos & Entregas | Estoque & Compras | Agenda`. Fonte: `src/lib/diretoria/capabilities.ts`, `src/lib/diretoria/access.ts`.
- Sistema de "construtor modular": cada tela é `page.tsx` (server, roda queries em `Promise.all`) → `*Montavel.tsx` (sub-abas client `Tabs` + `ConstrutorGrid`) → blocos em `src/components/diretoria/blocos/blocos-*.tsx`. Layout salvo por `carregarLayout`/`salvarLayout`.
- Filtros globais de período + empresa acima das sub-abas (`DiretoriaFiltros`), corte de dados (`src/lib/corte-dados.ts`) grampeando o início das análises.
- **Card "Demandas a entregar" = saldo a atender, a custo, R$ 21,2 mi** (`queryIndicadoresDemandas` → `valorDoPedido` = `valorAAtenderCusto`, em `src/lib/diretoria/queries/pedidos.ts`). Regra em `docs/kpis-diretoria.md` §6.
- **KPI "Valor em estoque" = físico/nosso, R$ 31,4 mi** (`queryIndicadoresEstoque` sobre `fato_estoque_saldo` × `fato_produto.precoCusto` ÷ índice 0,95, filtrado por `whereLocal("fisico")`). `docs/kpis-diretoria.md` §5.
- **Estoque de demonstração já tem bloco A-13** (`queryEstoqueDemonstracao`, R$ 1,56 mi).
- **Seriais A-06** (saldo positivo + local, 2.511) e **Necessidade de compra A-14** já prontos.
- **Classificação de locais** físico/demonstração/fora em `src/lib/estoque/classificacao-local.ts` (por estrutura do Odoo: `estoque_em_maos`/`calcula_extrato_saldo`/`proprietario_local_id` + raiz da árvore `nome_completo`; showroom id 35 e prefixo "Terceiros / Demonstração").

### Falta / é novo
- Relatório de Entregas Parciais como tela/export com todas as colunas: **não existe**. Query mais próxima: `comercial_demanda_em_aberta` (não explode por item, faltam colunas).
- **Status financeiro liberado/bloqueado por pedido**: não existe. Derivar de título vencido em aberto por `pedido_id`.
- **Forma de pagamento por pedido**: existe só na parcela (24% preenchida); a fonte boa é `fato_financeiro_titulo` (99,98%).
- **Cidade**: disponível em `fato_parceiro.cidade`, não lida hoje.
- **Modalidade × Operação**: hoje são o **mesmo** campo `operacaoNome`.
- **"Nº do pedido do mérito"**: nenhum campo com esse nome no cache (a esclarecer, ver §4).
- **"Em transferência" conta como próprio**: a classificação atual não trata trânsito explicitamente.
- **DSTOCK faltando / "terceiro que é nosso"**: precisa confronto com os locais reais.
- **Painel de demonstração em 2 blocos** (nossos × cliente): hoje é um bloco só.
- **Inverter card de valor em estoque** (Visão Geral): 29 mi principal, 0,95 embaixo.
- **Sigla da UF no mapa**.
- **Fonte dos KPIs "A receber"/"A pagar"** na Visão Geral: confirmar que vem de contas a receber/pagar (título), não do faturamento.

### Desmembramento de kits (Lote 2, contexto)
- A BOM já entra no cache como **raw** (`sped.produto.lista.material` + `.item`, catálogo `src/worker/catalog/model-catalog.ts:133-135`, models `schema.prisma:1477/1489/1501`). Falta: fato consultável + expor `tipo_kit_produto`/`lista_material_ativa_id` no `fato_produto` + lógica de rateio.

---

## 3. Decisões travadas com o dono (2026-07-18)

- **Base de valor do relatório**: mostrar **as três visões** (total do pedido · saldo a atender venda · saldo a atender custo).
- **Localização**: **sub-aba "Entregas parciais" dentro de "Pedidos & Entregas"**.
- **1º lote** = Entregas parciais + estoque real/demo + KPIs A receber/A pagar. Kits no lote 2.

## 4. Decisões abertas (não bloqueiam o começo)

- **"Nº do pedido do mérito"**: o dono não definiu. T0.1 investiga um campo de referência externa no pedido do Odoo; se não houver, a coluna entra como pendente (não bloqueia o resto).
- **Modalidade × Operação**: assumir 1 coluna ("Operação / Modalidade") até o dono pedir separação; documentar no relatório.
- **Corte de dados no relatório operacional**: o relatório é operacional (o colega usa range 2019–2030 = "tudo"). Decisão de desenho na T0.4/§6: o relatório de Entregas Parciais **não deve ser grampeado pelo corte de análise** (senão perde pedidos antigos ainda a entregar). Confirmar contra o dado.

---

## 5. Ondas e tasks

> Cada task: arquivo(s) alvo, o que fazer, verificação. TDD onde há lógica. UI sempre inline + `ui-ux-pro-max` + perícia de UI. Nada de travessão em texto/UI/commits.

### ONDA 0 , Investigação contra o dado real (destrava premissas, sem UI)

- **T0.1 , Campo do "nº do mérito".** Grep/`SELECT` no raw do pedido (`raw_sped_documento`, `raw_pedido_documento`, `fato_pedido`) por campos de referência externa (ex.: `referencia`, `pedido_cliente`, `documento_origem`, `observacao`). Saída: campo mapeado OU "não existe → coluna pendente". Sem código de produção.
- **T0.2 , De-para real dos locais de estoque.** `SELECT nome_completo, classificacao, estoque_em_maos, calcula_extrato_saldo, temProprietario FROM fato_estoque_local ORDER BY nome_completo`. Identificar: (a) o DSTOCK que não aparece e deveria (terceiro que é nosso), (b) locais "em transferência"/trânsito e onde caem hoje, (c) JDSDEMO (demonstração nossa) × demonstração em cliente. Saída: tabela de-para real → alimenta TC.2/TC.3/TC.4.
- **T0.3 , Fonte atual de "A receber"/"A pagar" na Visão Geral.** Ler `visao-geral-screen.tsx` + `src/lib/reports/queries/financeiro.ts` (`queryContasAReceber`/a pagar). Confirmar se já vem do título financeiro (contas a receber/pagar) ou do pedido/faturamento. Medir contra o cache. Saída: "já correto" ou "precisa corrigir → TD.2".
- **T0.4 , Medir as 3 bases de valor.** Contra `nexus_odoo_l1`: (a) Σ `vrProdutos` header dos ABERTA (esperado ≈ 61 mi), (b) Σ saldo a atender × preço venda, (c) Σ saldo a atender × custo (esperado = 21,2 mi, tem que bater com o card). Confirma que o custo fecha com o card e valida os rótulos. Decide o corte (§4).

### ONDA A , Relatório de Entregas Parciais , backend (TDD)

- **TA.1 , Query base explodida por item.** Novo `queryEntregasParciais(prisma, filtros)` em `src/lib/diretoria/queries/pedidos.ts` (ou módulo novo `entregas-parciais.ts`): `fato_pedido` (`bucketDemanda='ABERTA'`) join `fato_pedido_item` (grão de linha) join `fato_parceiro` (UF via `participanteId`, cidade) join `fato_produto` (custo). Reusa `enriquecerComAAtender` (piso em zero, marcador `job_atendimento`). Colunas por linha: nº pedido, UF, cidade, produto, qtd a atender, valor venda a atender, valor custo a atender, valor total do pedido (rateado/atribuído), família, marca, operação/modalidade, etapa. Testes com fixtures.
- **TA.2 , Status financeiro liberado/bloqueado.** Helper `statusFinanceiroPorPedido(prisma, pedidoIds)`: pedido "bloqueado" se tem título/parcela vencida em aberto (`fato_financeiro_titulo` ou `fato_pedido_parcela` com `dataVencimento < hoje` e não quitada). Referência: `queryPedidosAtrasados`/`comercial_pedidos_atrasados`. Testes cobrindo vencido/em dia/sem título.
- **TA.3 , Forma de pagamento por pedido.** Puxar de `fato_financeiro_titulo` por `pedido_id` (não da parcela). Testes.
- **TA.4 , KPIs do topo (3 visões).** `indicadoresEntregasParciais`: total do pedido (Σ header ABERTA), saldo a atender venda, saldo a atender custo. Testes conferem que custo == card (21,2 mi) nas fixtures.

### ONDA B , Relatório de Entregas Parciais , UI (inline, ui-ux-pro-max)

- **TB.1 , Sub-aba nova.** Adicionar `entregas` ao array `ABAS` em `src/components/diretoria/pedidos/pedidos-montavel.tsx` + entrada em `PADROES_ABA` na `src/app/(protected)/diretoria/pedidos/page.tsx`. Rótulo "Entregas parciais". Registrar os blocos novos no catálogo (`src/lib/diretoria/builder/catalogo.ts`, domínio B) e no `renderBlocoPedidos`.
- **TB.2 , Bloco de KPIs (3 visões).** Reusar `KpiButton`/`kit`. Cada card declara a base (regra de ouro `kpis-diretoria.md:424`): "Total dos pedidos (venda)", "Falta entregar (venda)", "Falta entregar (custo)". Sem inventar componente.
- **TB.3 , Bloco tabela detalhada.** Reusar `DataTable` (`src/components/charts/data-table.tsx`: busca, sort, export CSV). Colunas da TA.1 + status financeiro (badge liberado/bloqueado) + forma de pagamento. Vazio/loading/erro acionáveis.
- **TB.4 , Corte/range.** Garantir que o relatório opera na janela ampla (não grampeado pelo corte de análise, conforme T0.4), preservando os filtros de período/empresa quando o dono quiser recortar.
- **TB.5 , Perícia de UI** (reuso, design system violet `#7c3aed`/tokens, dark+light, 375px, ícones Lucide, RSC→client, estados). Corrigir achados na hora.

### ONDA C , Estoque real / demonstração

- **TC.1 , Inverter card "Valor em estoque" (Visão Geral).** Em `visao-geral-screen.tsx`: número principal = R$ 29,8 mi (valor a custo do próprio) / R$ 31,4 mi (com índice) conforme o que o card mostra hoje; mover o 0,95 (índice) para a linha secundária. Só troca de hierarquia visual, sem mudar o cálculo. Perícia de UI.
- **TC.2 , "Em transferência" = próprio.** Conforme T0.2, ajustar `src/lib/estoque/classificacao-local.ts` para que locais de trânsito/transferência (mercadoria nossa a caminho) classifiquem como `fisico`. Testes em `classificacao-local.test.ts` cobrindo o(s) local(is) reais. Rebuild `fato_estoque_local` (worker → `docker compose build app` + recreate worker, CLAUDE.md §2.1).
- **TC.3 , DSTOCK "terceiro que é nosso".** Incluir no `fisico` o(s) local(is) identificado(s) na T0.2 que são nossos mas hoje caem em "fora". Ajuste em `classificacao-local.ts` (id ou prefixo específico) + testes.
- **TC.4 , Demonstração em 2 blocos.** Sub-classificar demonstração em `demonstracao_propria` (JDSDEMO, nossos depósitos) × `demonstracao_cliente` (nota de demonstração / showroom em cliente). Ajustar `classificacao-local.ts` (novo valor ou flag) + `queryEstoqueDemonstracao` + bloco A-13 para render em dois blocos no mesmo painel (nossos em cima, cliente embaixo), com subtotal cada. Testes + perícia de UI.
- **TC.5 , Perícia de UI** dos blocos de estoque tocados.

### ONDA D , Mapa UF + KPIs A receber/A pagar

- **TD.1 , Sigla da UF no mapa.** Em `src/components/diretoria/brazil-map/brazil-map.tsx` (+ `uf-data.ts`/`uf-paths.gen.ts`): renderizar a sigla no centroide de cada estado, legível nos dois temas, sem poluir estados pequenos (label externo/tooltip quando não couber). Perícia de UI.
- **TD.2 , Fonte de "A receber"/"A pagar".** Só se a T0.3 apontar divergência: apontar os KPIs para contas a receber/pagar (título financeiro), não faturamento. Atualizar `docs/kpis-diretoria.md` no mesmo commit.
- **TD.3 , Perícia de UI.**

### ONDA E , Verificação e fechamento

- **TE.1 , Verde total.** `tsc` (raiz + mcp) + `eslint` + `jest` na worktree.
- **TE.2 , E2E contra cache real.** Rebuild dos containers afetados (worker/mcp se builder/queries mudaram); medir os números do relatório e do estoque contra `nexus_odoo_l1`; conferir que o card 21,2 mi e o novo KPI de custo batem, e que o estoque físico não regrediu.
- **TE.3 , Docs.** Atualizar `docs/kpis-diretoria.md` (nova regra do relatório de entregas parciais, nova classificação de locais transferência/DSTOCK/demo-2-blocos, fonte A receber/A pagar), `STATUS.md`, `docs/RADAR.md` se houver achado adiado.
- **TE.4 , Auto-perícia final** (CLAUDE.md): confrontar cada task com o código, caçar regressão em estoque/demanda, invariantes (corte de dados nas leituras novas, RSC→client, base declarada nos cards). Corrigir na hora.

---

## 6. Riscos e invariantes

- **Corte de dados** (`corte-dados.ts`): toda leitura nova de histórico respeita o corte, EXCETO o relatório de entregas parciais operacional (decisão §4, confirmar T0.4). Não amarrar ingestão à data da tela (CLAUDE.md).
- **Estoque é do grupo** (sem `empresaId` em `fato_estoque_*`): o filtro de empresa não recorta saldo/seriais; manter o aviso da UI.
- **Rebuild de container** (CLAUDE.md §2.1): mudou builder/worker → `docker compose build app` + recreate worker (o worker não tem build próprio).
- **Base declarada** (`kpis-diretoria.md:424`): todo card de dinheiro declara a base (venda/custo/pedido).
- **Reuso de componente** (perícia de UI): `DataTable`, `KpiButton`, `DonutChart`, `SectionCard` já existem; proibido criar concorrente.
- **Não tocar a worktree órfã** `branches/feat-diretoria-estoque-pedidos-pagamentos` (isolamento por branch).

## 7. Sequência de PRs

- **PR 1** (Ondas 0+A+B): Relatório de Entregas Parciais (a prioridade nº 1). Merge gated pelo dono.
- **PR 2** (Ondas C+D): Estoque real/demo + mapa + KPIs A receber/A pagar.
- Lote 2 (futuro): desmembramento de kits.
