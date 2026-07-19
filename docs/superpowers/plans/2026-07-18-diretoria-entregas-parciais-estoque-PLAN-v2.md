# PLAN v2 , Diretoria: Relatório de Entregas Parciais + Estoque real/demonstração (Lote 1)

> v2 = v1 + aplicação da Review 1 adversarial (16 achados: 4 críticos, 3 altos, 6 médios, 3 baixos).
> Próximo: Review 2 (2× mais profunda) → v3.
> Mudanças estruturais desta versão estão marcadas com `[R1:Cx]` apontando o achado que as motivou.

---

## 1. Objetivo do Lote 1

Na Diretoria, entregar as **duas prioridades** do dono sem regredir os PRs #189–195 (em produção):

1. **Relatório de Entregas Parciais** (sub-aba nova em "Pedidos & Entregas"): por item, os pedidos com saldo a entregar, com as colunas operacionais do colega, e o topo com **três visões de valor** (total do pedido · saldo a atender venda · saldo a atender custo). Reconcilia a estranheza "61 mi × 21 mi".
2. **Estoque real e de demonstração** mais fiéis: inverter o card na Visão Geral, tratar "em transferência" como próprio, corrigir a classificação dos locais reais (DSTOCK que falta, "terceiro que é nosso"), e mostrar demonstração em dois blocos (nossos depósitos × em cliente).

Lote 2 (fora daqui): desmembramento de kits (BOM).

---

## 2. Estado atual (perícia) , resumo

Ver v1 §2 para o mapa completo. Pontos que a Review 1 tornou críticos:

- O card "Demandas a entregar" (R$ 21,2 mi) sai de `queryIndicadoresDemandas`→`carregarAbertas`, que **sempre grampeia no corte** (`janelaClampada`, `pedidos.ts:74`) e recorta por **empresaId** e **userUfs (RBAC)** (`page.tsx:45,66`). `[R1:C1/M11]`
- `classificacao` de local é materializada em `fato_estoque_local` **e copiada para `fato_serial_saldo`** no builder (`src/worker/fatos/fato-serial-saldo.ts:52`, dependência em `registry.ts:58-63`). Reclassificar muda os seriais A-06 e a idade média. `[R1:C3]`
- `ClassificacaoLocal = "fisico"|"demonstracao"|"fora"` é contrato: `locais-por-classificacao.ts:27-28` diz que as tools do Nex expõem exatamente esses três valores; `queryEstoqueDemonstracao` e A-13 dependem de `"demonstracao"`. `[R1:C4]`
- `fato_financeiro_titulo` **tem** `pedidoId` (indexado), `vrSaldo` e `formaPagamentoNome` (99,98%). A **parcela do pedido não tem saldo/quitação** (só `valor`, `parcelaFaturada`) , imprópria para "vencido em aberto". `[R1:A6]`
- Pedidos `bucketDemanda='ABERTA'` são pré-faturamento: o título deles é **carteira** (`notaFiscalId=null`), **excluída** de `totalAReceber` (`financeiro.ts:297-298`). `[R1:A7]`
- "A receber"/"A pagar" da Visão Geral **já vêm** de `fato_financeiro_titulo` (`queryContasAReceber`/`queryContasAPagar`), não do faturamento. `[R1:B15]`

---

## 3. Decisões travadas com o dono (2026-07-18)

- Relatório mostra **as três visões** de valor.
- **Sub-aba "Entregas parciais"** dentro de "Pedidos & Entregas".
- 1º lote = Entregas parciais + estoque real/demo + KPIs A receber/A pagar. Kits no lote 2.

## 4. Decisões a CONFIRMAR com o dono (defaults seguros já adotados) `[R1:C1,C2,A7,B16]`

Estas nasceram da Review 1. O plano adota um default seguro e segue; o dono confirma ao ver o v3.

- **D-a) Corte de dados no relatório** `[R1:C1/C2]`. Regra durável do projeto: toda leitura de histórico respeita a data de corte. **Default = relatório GRAMPEADO pelo corte** (igual ao card). O KPI "saldo a atender custo" **só reconcilia com o card R$ 21,2 mi neste escopo** (corte + empresa + UF). Se o dono quiser ver pedidos anteriores ao corte, isso é um **toggle rotulado** ("incluir pedidos anteriores à data de análise") como 2ª visão, e a reconciliação com o card passa a valer só na visão grampeada. **Não** remover o corte por padrão.
- **D-b) Grão de "bloqueado"** `[R1:A7]`. A reunião: "bloqueado = cliente com conta a receber em atraso/vencida". **Default = por CLIENTE (`participanteId`)**: o pedido fica "bloqueado" se o cliente tem **qualquer título `a_receber` vencido em aberto** (`vrSaldo>0`, `dataVencimento < hoje`, pós-corte, não intragrupo), **incluindo carteira** (título de pedido ainda não faturado). Confirmar se carteira vencida conta ou só título de nota emitida.
- **D-c) Card de estoque invertido** `[R1:B16]`. Hoje o principal é `valorEstoque` (÷ índice 0,95 = R$ 31,4 mi, o número "oficial" replicado em outras telas) e o hint é o custo puro (R$ 29,8 mi). A reunião pede **custo (29,8) em cima, 0,95 embaixo**. Default = inverter a hierarquia (custo principal, índice secundário). Confirmar que ele quer o custo puro como número principal na Visão Geral (diverge do número "oficial" das outras telas).

## 5. Decisões abertas menores

- **"Nº do pedido do mérito"**: T0.1 investiga o **raw `sped.documento.referenciado`** (`model-catalog.ts:120`) e o raw do documento. `fato_pedido` não tem campo de referência externa (confirmado). Se existir só no raw, expor exige fato+schema+resync (fora do Lote 1) → coluna entra como **pendente**. `[R1:B14]`
- **Modalidade × Operação**: são o mesmo `operacaoNome` (o catálogo C-05 já chama de "Modalidades de operação"). **1 coluna "Operação / Modalidade"** até o dono pedir separação.

---

## 6. Ondas e tasks

> TDD onde há lógica. UI inline + `ui-ux-pro-max` + perícia de UI. Sem travessão. Números de produção (61/21/77,6/31,4/29,8) são **a medir**, nunca premissa cravada de teste `[R1:M13]`.

### ONDA 0 , Investigação contra o dado real (sem UI, destrava premissas)

- **T0.1 , Campo do "nº do mérito".** Investigar `raw_sped_documento`, `raw_sped_documento_referenciado` e `fato_pedido`. Saída: campo mapeado (e onde) OU "só no raw / inexistente → coluna pendente". `[R1:B14]`
- **T0.2 , De-para real dos locais (inclui o RAW).** Além de `SELECT nome_completo, classificacao, estoque_em_maos, calcula_extrato_saldo, temProprietario FROM fato_estoque_local`, ler o **RAW do local** (`raw_estoque_local.data`) para o campo de **uso/tipo Odoo** (`usage`/`tipo_local`: internal/transit/customer/inventory). Identificar com nome+usage: (a) DSTOCK "terceiro que é nosso" e onde cai hoje, (b) locais **em transferência/trânsito** e se são detectáveis por nome/usage (se não forem, TC.2 vira "adicionar coluna ao fato" , escopo maior, sinalizar), (c) **JDSDEMO** , confirmar se hoje é `fisico` (inflando o 31,4) ou `demonstracao` `[R1:A5/M12]`, (d) demonstração em cliente (nota). Saída: tabela de-para real + viabilidade de detecção → alimenta TC.*.
- **T0.3 , Confirmar fonte de "A receber"/"A pagar".** Ler `visao-geral-screen.tsx` + `financeiro.ts`. Esperado: já vêm do título. Saída: "já correto" (provável → TD.2 vira verificação) ou lista de correção. `[R1:B15]`
- **T0.4 , Medir as 3 bases no ESCOPO do card.** Contra `nexus_odoo_l1`, **com corte + sem filtro de empresa/UF (grupo)** e depois no escopo do card: (a) Σ `vrProdutos` header ABERTA, (b) Σ saldo a atender × preço venda, (c) Σ saldo a atender × custo. Confirmar que (c) no escopo do card == R$ 21,2 mi. Registrar os três números reais (não assumir 61/21). `[R1:C1/M13]`
- **T0.5 , Medir impacto da reclassificação nos seriais.** Antes de TC.*, medir A-06 (contagem de seriais físicos) e idade média atuais, para comparar o delta depois. `[R1:C3]`

### ONDA A , Relatório de Entregas Parciais , backend (TDD)

- **TA.1 , Query base explodida por item.** `queryEntregasParciais(prisma, filtros)` em novo módulo `src/lib/diretoria/queries/entregas-parciais.ts`: `fato_pedido` (`bucketDemanda='ABERTA'`, janela grampeada no corte por default `[R1:C1/C2]`) join `fato_pedido_item` join `fato_parceiro` (UF+cidade) join `fato_produto` (custo). Aplica **`empresaId` e `userUfs`** como o card `[R1:M11]`. Reusa `enriquecerComAAtender` (piso zero, marcador `job_atendimento`). Colunas por linha: nº pedido, UF, cidade, produto, qtd a atender, valor venda a atender, valor custo a atender, família, marca, operação/modalidade, etapa. **NÃO** inclui "valor total do pedido" por linha (evita dupla contagem no export CSV) `[R1:M8]` , esse número vive só no KPI de topo. Testes com fixtures.
- **TA.2 , Status financeiro liberado/bloqueado.** `statusFinanceiroPorCliente(prisma, participanteIds)` `[R1:A6/A7]`: bloqueado se o cliente tem título `a_receber` com `vrSaldo>0`, `dataVencimento < inícioDoDia`, `dataDocumento >= corte`, não intragrupo (`filtrarTitulosExternos`), **carteira incluída** (default D-b). Fonte = `fato_financeiro_titulo` (nunca a parcela). Testes: cliente vencido / em dia / sem título / só carteira vencida.
- **TA.3 , Forma de pagamento por pedido.** De `fato_financeiro_titulo` por `pedidoId` (indexado). Testes.
- **TA.4 , KPIs do topo (3 visões).** `indicadoresEntregasParciais`: total do pedido (Σ header ABERTA), saldo a atender venda, saldo a atender custo. Teste confere: no escopo do card, o custo == card (valor medido em T0.4, não hard-coded). `[R1:C1/M13]`

### ONDA B , Relatório de Entregas Parciais , UI (inline, ui-ux-pro-max) `[R1:M9 decomposto]`

- **TB.1 , Fiar a query na page.** Adicionar `queryEntregasParciais` ao `Promise.all` de `src/app/(protected)/diretoria/pedidos/page.tsx` e ampliar `PedidosData` (`pedidos-screen.tsx`) com o novo bloco de dados.
- **TB.2 , Sub-aba no montável.** Adicionar `entregas` ao array `ABAS` em `pedidos-montavel.tsx` (rótulo "Entregas parciais") + entrada em `PADROES_ABA` na page.
- **TB.3 , Registrar blocos no catálogo.** Novos ids no domínio B em `src/lib/diretoria/builder/catalogo.ts` + `case` em `renderBlocoPedidos` (`blocos-pedidos.tsx`).
- **TB.4 , Bloco KPIs (3 visões).** Reusar `KpiButton`/`kit`. Cada card declara a base (`kpis-diretoria.md:424`): "Total dos pedidos (venda)", "Falta entregar (venda)", "Falta entregar (custo)".
- **TB.5 , Bloco tabela detalhada.** Reusar `DataTable` (busca/sort/export CSV). Colunas da TA.1 + status financeiro (badge liberado/bloqueado) + forma de pagamento. Estados vazio/loading/erro acionáveis.
- **TB.6 , Toggle de corte (opcional, default off).** Se o dono aprovar D-a, incluir toggle "incluir pedidos anteriores à data de análise" que remove o grampeamento **só nesta tela**, rotulado. Default desligado. `[R1:C1/C2]`
- **TB.7 , Perícia de UI** (reuso, tokens/violet `#7c3aed`, dark+light, 375px, Lucide, RSC→client, estados). Corrigir na hora.

### ONDA C , Estoque real / demonstração

- **TC.1 , Inverter card "Valor em estoque" (Visão Geral).** Em `visao-geral-screen.tsx:81-89`: principal = `valorEstoqueACusto` (R$ 29,8 mi), secundário = a linha do índice 0,95 `[R1:B16]`. Só hierarquia visual; cálculo intacto. Sujeito a D-c. Perícia de UI.
- **TC.2 , "Em transferência" = físico (condicional à T0.2).** Se detectável por nome/usage: ajustar `src/lib/estoque/classificacao-local.ts` (+ testes cobrindo o(s) local(is) reais). Se **não** detectável nos campos atuais do fato: sub-task extra para expor `usage`/tipo no `fato_estoque_local` (schema + builder + resync) antes de classificar `[R1:A5]`. Rebuild do fato via `app` (worker não tem build próprio).
- **TC.3 , DSTOCK "terceiro que é nosso" → físico.** Incluir no `fisico` o(s) local(is) da T0.2 (por id ou prefixo específico) + testes.
- **TC.4 , Rebuild dos DOIS fatos + conferir seriais.** Reclassificação exige rebuild de `fato_estoque_local` **e** `fato_serial_saldo` (ordem: local → serial) `[R1:C3]`. A-06 e idade média **vão mudar de propósito**; conferir o delta contra T0.5 (não tratar como "inalterado").
- **TC.5 , Demonstração em 2 blocos SEM novo enum.** Manter `classificacao="demonstracao"` `[R1:C4]`. Separar por dimensão ortogonal (helper que particiona os locais demo em "nossos depósitos" vs "em cliente" por id/prefixo de nome , ex.: showroom 35/nota de demonstração = cliente; JDSDEMO = nosso). Ajustar `queryEstoqueDemonstracao` para devolver os dois grupos + subtotal, e o bloco A-13 para render dois blocos no mesmo painel (nossos em cima, cliente embaixo). **Não** tocar o enum nem o filtro `localIdsPorClassificacao("demonstracao")`. Testes + perícia de UI.
- **TC.6 , Perícia de UI** dos blocos de estoque tocados.

### ONDA D , Mapa UF + KPIs A receber/A pagar

- **TD.1 , Sigla da UF no mapa.** `src/components/diretoria/brazil-map/brazil-map.tsx` (+ `uf-data.ts`/`uf-paths.gen.ts`): sigla no centroide, legível nos dois temas, label externo/tooltip para estados pequenos. Perícia de UI.
- **TD.2 , A receber/A pagar , VERIFICAÇÃO (não código provável).** Confirmar via T0.3 que já vêm do título. Só se houver divergência real, corrigir + atualizar `kpis-diretoria.md`. `[R1:B15]`
- **TD.3 , Perícia de UI.**

### ONDA E , Verificação e fechamento

- **TE.1 , Verde total.** `tsc` (raiz + mcp) + `eslint` + `jest`.
- **TE.2 , E2E contra cache real, com DELTAS ESPERADOS.** Rebuild dos containers afetados (via `app` para worker). Conferir: (i) relatório de entregas parciais reconcilia com o card no escopo grampeado; (ii) o KPI de estoque **sobe** exatamente pelo valor dos locais adicionados (DSTOCK+transferência) `[R1:M10]`; (iii) A-06/idade/necessidade de compra mudam de forma **conferida** contra T0.5, não "inalterada"; (iv) A-13 (2 blocos) soma o mesmo total de demonstração de antes.
- **TE.3 , Docs.** Atualizar `docs/kpis-diretoria.md` (relatório de entregas parciais + as 3 bases; classificação transferência/DSTOCK; demo em 2 blocos sem novo enum; regra de bloqueio por cliente), `STATUS.md`, `docs/RADAR.md` (achados adiados).
- **TE.4 , Auto-perícia final** (CLAUDE.md): confrontar cada task com o código; caçar regressão em seriais/estoque/demanda e nas tools do Nex; invariantes (corte nas leituras, contrato do enum, base declarada nos cards, RSC→client). Corrigir na hora.

---

## 7. Riscos e invariantes `[reforçados pela R1]`

- **Contrato do enum `ClassificacaoLocal`**: nunca introduzir valor novo; consumidores (A-13, tools Nex, `locais-por-classificacao`) dependem dos três. `[R1:C4]`
- **Cadeia de fatos de estoque**: `fato_estoque_local` → `fato_serial_saldo`; reclassificar exige rebuild dos dois na ordem certa. `[R1:C3]`
- **Corte de dados**: default grampeado em toda leitura nova (regra durável); exceção só por decisão explícita do dono (D-a). `[R1:C2]`
- **Reconciliação só no mesmo escopo**: custo do relatório == card apenas com corte+empresa+UF idênticos. `[R1:C1]`
- **Fonte financeira**: saldo/vencido sempre de `fato_financeiro_titulo`, nunca da parcela. `[R1:A6]`
- **Dupla contagem**: header do pedido não vai por linha na tabela. `[R1:M8]`
- **Estoque é do grupo** (sem `empresaId` em `fato_estoque_*`): manter aviso.
- **Rebuild** via `app` (CLAUDE.md §2.1). **Base declarada** nos cards. **Reuso** de `DataTable`/`KpiButton`/`DonutChart`.
- **Não tocar** a worktree órfã `branches/feat-diretoria-estoque-pedidos-pagamentos`.

## 8. Sequência de PRs

- **PR 1** (Ondas 0+A+B): Relatório de Entregas Parciais (prioridade nº 1). Merge gated pelo dono.
- **PR 2** (Ondas C+D): Estoque real/demo + mapa + verificação A receber/A pagar.
- Lote 2 (futuro): desmembramento de kits.
