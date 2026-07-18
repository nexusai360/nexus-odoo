# PLAN v3 (FINAL) , Diretoria: Relatório de Entregas Parciais + Estoque real/demonstração (Lote 1)

> Ciclo da metodologia cumprido: v1 → Review 1 adversarial (16 achados) → v2 → Review 2 2× mais profunda (17 achados) → **v3**.
> Rastreio: `[R1:x]` = achado da review 1, `[R2:x]` = achado da review 2.
> Origem: reunião do dono com o colega de logística (2026-07-18). Perícia de código em 4 frentes.
> **Este é o documento de execução.** As decisões D-a/D-b/D-c (§4) precisam do "ok" do dono antes do fim da Onda A/C respectiva; o resto executa direto.

---

## 1. Objetivo do Lote 1

Entregar, na Diretoria, as **duas prioridades** do dono, sem regredir os PRs #189–195 (em produção):

1. **Relatório de Entregas Parciais** , sub-aba nova em "Pedidos & Entregas": uma linha por item dos pedidos com saldo a entregar, com as colunas operacionais do colega, e o topo com **três visões de valor** (total do pedido · saldo a atender venda · saldo a atender custo). Reconcilia a estranheza "61 mi × 21 mi".
2. **Estoque real e de demonstração** mais fiéis: inverter o card na Visão Geral, tratar "em transferência" como próprio, corrigir a classificação dos locais reais (DSTOCK que falta, "terceiro que é nosso"), e mostrar demonstração em dois blocos (nossos depósitos × em cliente).

Lote 2 (fora daqui): desmembramento de kits (BOM).

---

## 2. Verdades do código que governam o plano (perícia + 2 reviews)

- Card "Demandas a entregar" (R$ 21,2 mi) = `queryIndicadoresDemandas`→`carregarAbertas`, **sempre grampeado no corte** (`janelaClampada`, `pedidos.ts:74`), recorta empresa e **UF do usuário em memória** via `siglaDeUf`/`escopoDe` (`pedidos.ts:35,267`); pedido com UF nula = `"??"` é **excluído** sob escopo de UF. `[R1:C1][R2:M-1]`
- `enriquecerComAAtender` **agrega por pedido** (`Map<pedidoId>`, `pedidos.ts:135,153,168`); a lógica de "a atender por item" (piso zero `:146`, fallback `status.ok ? aAtender : cheia` `:148`, custo/venda unitários `:150-151`) vive dentro do loop, **não exportada**. `[R2:C-1]`
- `classificacao` de local é materializada em `fato_estoque_local` **e copiada para `fato_serial_saldo`** no build (`fato-serial-saldo.ts:52-53,68`; ordem local→serial). `[R1:C3][R2:A-5]`
- `ClassificacaoLocal = "fisico"|"demonstracao"|"fora"` é **contrato**: 8 tools MCP + `queryEstoqueDemonstracao` + A-13 dependem; `mcp/lib/classificacao.ts` tem **números cravados na string que o LLM lê** ("fisico ... R$ 29,85 mi", "Terceiros / Demonstração R$ 1,56 mi"). `[R1:C4][R2:A-4]`
- `classificarLocal` (`classificacao-local.ts:45-58`) usa nome+estrutura Odoo; **showroom id 35 = vitrine NOSSA** (sob "Próprio") mapeada como `demonstracao`; prefixo "Terceiros / Demonstração" = **remessa ao cliente**. `fato_estoque_local` **não expõe `usage`/tipo Odoo** , só `tipo` 'S'/'A' (`fato-estoque-local.ts:37-53`, sem `usage`). `[R2:A-1][R2:M-3]`
- `fato_financeiro_titulo` tem `pedidoId` (indexado), `vrSaldo`, `notaFiscalId`, `pedidoFaturado`, `formaPagamentoNome` (99,98%). Parcela do pedido **não** tem saldo/quitação. O predicado de "vencido em aberto" canônico é `queryTitulosVencidos` (`financeiro.ts:411-417`: `vrSaldo>0`, `dataVencimento<inicioDoDia`, `dataDocumento>=corteAtualDate()`, `filtrarTitulosExternos`) , mas não devolve `participanteId`. `queryContasAReceber` aceita **um** `participanteId` e exclui carteira , impróprio para reuso direto. `[R1:A6][R2:A-2]`
- Pedidos `bucketDemanda='ABERTA'` são pré-faturamento: título deles é **carteira** (`notaFiscalId=null`), excluída de `totalAReceber` (`financeiro.ts:297-298`). `[R1:A7]`
- "A receber"/"A pagar" da Visão Geral **já** vêm de `fato_financeiro_titulo` (`page.tsx:72`→`queryContasAReceber`). `[R1:B15]`
- Estoque não tem `empresaId` (grupo inteiro); card de estoque hoje mostra `valorEstoque` ÷ índice (31,4) como principal, custo puro (29,8) no hint. `[R1:B16]`

---

## 3. Decisões travadas com o dono (2026-07-18)
- Relatório com **as três visões** de valor. · **Sub-aba "Entregas parciais"** em Pedidos & Entregas. · 1º lote = Entregas parciais + estoque real/demo + KPIs A receber/A pagar; kits no lote 2.

## 4. Decisões a CONFIRMAR com o dono (defaults seguros adotados)
- **D-a) Corte no relatório** `[R1:C1/C2]`: default **GRAMPEADO** (respeita a regra durável). O KPI de custo só reconcilia com o card no escopo idêntico (corte+empresa+UF). Toggle "incluir anteriores à data de análise" existe como 2ª visão rotulada, **default off**. Não remover o corte sem o "ok" dele.
- **D-b) Grão de "bloqueado"** `[R1:A7]`: default **por CLIENTE** (qualquer título `a_receber` vencido em aberto do cliente, carteira incluída). Confirmar se carteira vencida conta ou só nota emitida.
- **D-c) Card de estoque invertido** `[R1:B16]`: default custo puro (29,8) em cima, índice (0,95→31,4) embaixo. Confirmar, pois 31,4 é o número "oficial" replicado em outras telas.

## 5. Decisões menores
- **"Nº do mérito"**: T0.1 investiga raw `sped.documento.referenciado`. Não há campo no `fato_pedido`. Se só no raw → coluna **pendente** (expor = fato+schema+resync, fora do Lote 1). `[R1:B14]`
- **Modalidade × Operação**: mesmo `operacaoNome` → **1 coluna "Operação / Modalidade"**.

---

## 6. Ondas e tasks

> TDD onde há lógica. UI inline + `ui-ux-pro-max` + perícia de UI por bloco. Sem travessão. Números de produção são **a medir** (asserção de teste é algébrica, nunca o número cravado `[R2:B-1]`).

### ONDA 0 , Investigação contra o dado real (sem UI; destrava premissas)

- **T0.1 , Nº do mérito.** Investigar `raw_sped_documento_referenciado` (`model-catalog.ts:120`), `raw_sped_documento`, `fato_pedido`. Saída: campo+local OU "pendente".
- **T0.2 , De-para real dos locais + RAW + CRAVAR origem/destino.** `SELECT` em `fato_estoque_local` (nome_completo, classificacao, estoque_em_maos, calcula_extrato_saldo, temProprietario) **e** leitura do `raw_estoque_local.data` para `usage`/tipo Odoo. Produzir uma **tabela por local** dizendo: classificação HOJE → classificação ALVO. Cravar explicitamente: (a) DSTOCK "terceiro que é nosso" (hoje `fora`? → `fisico`), (b) locais em **transferência/trânsito** (detectáveis por nome/usage? → decide TC.2a vs TC.2b), (c) **JDSDEMO** (hoje `fisico` ou `demonstracao`? → destino demonstração/nossos) `[R2:C-2/M-12]`, (d) showroom 35 (nossa vitrine → bloco "nossos") `[R2:M-3]`, (e) "Terceiros / Demonstração" (→ bloco "em cliente"). Esta tabela é a fonte da verdade das Ondas C.
- **T0.3 , Confirmar fonte A receber/A pagar.** Ler `visao-geral-screen.tsx` + `financeiro.ts`. Esperado: já do título → TD.2 vira verificação. `[R1:B15]`
- **T0.4 , Medir as 3 bases no escopo do card.** Contra `nexus_odoo_l1`: (a) Σ `vrProdutos` header ABERTA (grão-pedido distinct), (b) Σ saldo a atender × venda, (c) Σ saldo a atender × custo. Confirmar (c) no escopo do card == 21,2 mi. Registrar os 3 números reais.
- **T0.5 , Baseline dos seriais.** Medir A-06 (contagem físicos) e idade média ANTES, para comparar o delta pós-reclassificação. `[R1:C3]`

### ONDA A , Relatório de Entregas Parciais , backend (TDD)

- **TA.0 , Extrair invariante de atendimento compartilhado.** `[R2:C-1]` Criar função pura `aAtenderDoItem(item, status): { aAtender, custoLinha, vendaLinha }` (piso zero + fallback `status.ok` + unitários) em módulo compartilhado. **Refatorar `enriquecerComAAtender` para chamá-la**, sem mudar comportamento. Verificação: todos os testes atuais de demanda/card seguem verdes (regressão zero) , o card R$ 21,2 mi não muda.
- **TA.1 , Query por item.** `queryEntregasParciais(prisma, filtros)` em novo `src/lib/diretoria/queries/entregas-parciais.ts`: `fato_pedido` (`bucketDemanda='ABERTA'`) join `fato_pedido_item` join `fato_parceiro` (UF+cidade) join `fato_produto` (custo), usando **`aAtenderDoItem`** por linha. Nasce com `filtros.ignorarCorteDados?: boolean` (default false → `janelaClampada`) `[R2:M-2]`. Aplica `empresaId` e **UF pela mesma `siglaDeUf`, excluindo "??" sob escopo** `[R2:M-1]`. Colunas: nº pedido, UF, cidade, produto, qtd a atender, valor venda a atender, valor custo a atender, família, marca, operação/modalidade, etapa. **Sem** "valor total do pedido" por linha `[R1:M8]`. Testes com fixtures.
- **TA.2 , Bloqueio por cliente (query batched única).** `[R2:A-2]` `statusBloqueioPorCliente(prisma, participanteIds)`: **uma** query sobre `fato_financeiro_titulo` com o **predicado idêntico** a `queryTitulosVencidos` (`vrSaldo>0`, `dataVencimento < inicioDoDia(hoje)`, `dataDocumento >= corteAtualDate()`, `tipo="a_receber"`, `filtrarTitulosExternos`), **carteira incluída** (D-b), agrupando por `participanteId` em memória (sem N+1; tabela ~5,5k, full-scan ok). Ponto de switch documentado: se D-b virar "só nota emitida", somar `notaFiscalId != null`. Testes: cliente vencido / em dia / sem título / só carteira vencida.
- **TA.3 , Forma de pagamento por pedido.** De `fato_financeiro_titulo` por `pedidoId`. Testes.
- **TA.4 , KPIs (3 visões), grão correto.** `[R2:A-3]` `indicadoresEntregasParciais`: "Total do pedido (venda)" computado sobre **grão-pedido DISTINCT** (`carregarAbertas`/`fato_pedido`), **nunca** sobre o join explodido; "a atender venda" e "a atender custo" aditivos por item. Teste **algébrico**: Σ(item aAtender×custo) == `valorAAtenderCusto` do mesmo conjunto (não o número de produção). `[R2:B-1]`

### ONDA B , Relatório de Entregas Parciais , UI (inline, ui-ux-pro-max)

- **TB.1 , Fiar query na page.** `queryEntregasParciais` no `Promise.all` de `pedidos/page.tsx` + ampliar `PedidosData` (`pedidos-screen.tsx`).
- **TB.2 , Sub-aba no montável.** `entregas` no array `ABAS` (`pedidos-montavel.tsx:17`) + `PADROES_ABA` na page + **importar ícone Lucide**; verificar que o conteúdo é renderizado por `layoutsPorAba[id]` genericamente (sem ramo hardcoded). `[R2:M-5]`
- **TB.3 , Registrar blocos.** Ids novos no domínio B em `catalogo.ts` + `case` em `renderBlocoPedidos`.
- **TB.4 , Bloco KPIs (3 visões).** `KpiButton`/`kit`. Base declarada em cada card; "Total do pedido" avisa que **inclui o já entregue** `[R2:M-4]`.
- **TB.5 , Bloco tabela.** `DataTable` (busca/sort/export CSV). Colunas TA.1 + badge liberado/bloqueado + forma de pagamento. Estados vazio/loading/erro acionáveis.
- **TB.6 , Toggle de corte (melhoria da review, gated D-a, default off).** `[R2:B-3]` Liga `filtros.ignorarCorteDados` só nesta tela, rotulado. Se D-a não aprovado, fica default-off (não é dead code: a assinatura já prevê o parâmetro).
- **TB.7 , Perícia de UI** (reuso, violet `#7c3aed`/tokens, dark+light, 375px, Lucide, RSC→client, estados).

### ONDA C , Estoque real / demonstração , guiada pela tabela T0.2

- **TC.1 , Inverter card estoque (Visão Geral).** `visao-geral-screen.tsx:81-89`: principal = custo (29,8), secundário = índice. Gated D-c. Perícia de UI.
- **TC.2a , Transferência = físico (se detectável por nome/prefixo).** Editar `classificacao-local.ts` + testes cobrindo o(s) local(is) reais da T0.2.
- **TC.2b , [CONDICIONAL, vira ONDA/PR própria se T0.2 disser "não detectável"] expor `usage`/tipo no fato.** `[R2:A-1]` Migration (schema) + `mapLocalRow`/builder + **resync do raw** + protocolo de schema (`agente schema-changed`, aviso entre worktrees). NÃO executar dentro de uma task de UI; se acionada, replaneja como sub-onda com sua própria verificação.
- **TC.3 , DSTOCK "terceiro que é nosso" → físico.** Incluir no `fisico` o(s) local(is) da T0.2 (id/prefixo) + testes.
- **TC.3b , [CONDICIONAL] JDSDEMO `fisico → demonstracao`.** `[R2:C-2]` Só se T0.2 confirmar que hoje é físico. Ajuste explícito em `classificarLocal` + teste. Declara a interação de contagem (sai do físico, entra na demo).
- **TC.4 , Demonstração em 2 blocos SEM novo enum.** `[R1:C4][R2:M-3]` Manter `classificacao="demonstracao"`. Helper de partição por id/prefixo: **showroom 35 + JDSDEMO = "nossos depósitos"**; **"Terceiros / Demonstração" = "em cliente"**. Ajustar `queryEstoqueDemonstracao` (dois grupos + subtotal) e A-13 (dois blocos no mesmo painel, nossos em cima). Não tocar `localIdsPorClassificacao("demonstracao")`. Testes + perícia de UI.
- **TC.5 , Atualizar descrições/tools MCP.** `[R2:A-4]` Reescrever `mcp/lib/classificacao.ts` (`DESCRICAO_CLASSIFICACAO` + comentários com números) e conferir as 8 tools de estoque (`mcp/tools/estoque/*`) contra o cache. Testes de paridade que cravam constantes são atualizados com o **número novo justificado** (nunca "ajustado até passar").
- **TC.6 , Rebuild dos DOIS fatos, por ÚLTIMO.** `[R2:A-5]` Após TC.2a/2b/3/3b/4: rebuild `fato_estoque_local` **e** `fato_serial_saldo` (ordem local→serial), via `docker compose build app` + recreate worker (worker sem build próprio, CLAUDE.md §2.1). Conferir delta A-06/idade vs T0.5.
- **TC.7 , Perícia de UI** dos blocos tocados.

### ONDA D , Mapa UF + verificação financeira

- **TD.1 , Sigla da UF no mapa.** `brazil-map.tsx` (+ `uf-data.ts`/`uf-paths.gen.ts`): sigla no centroide, legível dark+light, label externo/tooltip para estados pequenos. Perícia de UI.
- **TD.2 , A receber/A pagar , VERIFICAÇÃO.** Confirmar (T0.3) que já vêm do título; corrigir só se divergir + atualizar `kpis-diretoria.md`. `[R1:B15]`
- **TD.3 , Perícia de UI.**

### ONDA E , Verificação e fechamento

- **TE.1 , Verde total.** `tsc` (raiz + mcp) + `eslint` + `jest`.
- **TE.2 , E2E contra cache real, DELTAS COMO FÓRMULA.** `[R2:C-2/A-4]` Rebuild via `app`. Conferir: (i) relatório reconcilia com o card no escopo grampeado; (ii) **Δ KPI físico = +DSTOCK +transferência −JDSDEMO** (fórmula fechada a partir da T0.2, não "só sobe") `[R1:M10]`; (iii) A-06/idade/necessidade mudam de forma **conferida** vs T0.5; (iv) A-13 (2 blocos) soma o mesmo total de demonstração de antes ± JDSDEMO; (v) **8 tools MCP** batem com o cache e as descrições refletem os números novos.
- **TE.3 , Docs.** `kpis-diretoria.md` (relatório + 3 bases; classificação transferência/DSTOCK/JDSDEMO; demo 2 blocos sem enum; bloqueio por cliente), `STATUS.md`, `docs/RADAR.md` (achados adiados, ex.: nº do mérito, TC.2b se não acionada).
- **TE.4 , Auto-perícia final** (CLAUDE.md): confrontar cada task com o código; caçar regressão em seriais, KPI de estoque, demanda, **tools do Nex** e Relatórios 2.0 (`reports/queries/estoque.ts` EscopoLocal); invariantes (corte, contrato do enum, base declarada, RSC→client, dedup do header). Corrigir na hora.

---

## 7. Invariantes (não violar)
- Contrato do enum `ClassificacaoLocal` (3 valores). · Cadeia `fato_estoque_local → fato_serial_saldo` (rebuild na ordem). · Corte grampeado por default (exceção só D-a). · Reconciliação custo×card só no mesmo escopo. · Saldo/vencido sempre de `fato_financeiro_titulo`. · Header do pedido nunca por linha; total sobre grão-pedido distinct. · UF pela `siglaDeUf`, "??" excluído sob escopo. · Descrições das tools MCP não podem mentir número. · Rebuild via `app`. · Não tocar a worktree órfã `feat-diretoria-estoque-pedidos-pagamentos`.

## 8. Sequência de PRs
- **PR 1** (Ondas 0+A+B): Relatório de Entregas Parciais (prioridade nº 1). Merge gated pelo dono.
- **PR 2** (Ondas C+D): Estoque real/demo + mapa + verificação financeira. (Se TC.2b for acionada, ela é um PR/sub-onda à parte por causa da migration + protocolo de schema.)
- **Lote 2** (futuro): desmembramento de kits (BOM).

## 9. Riscos residuais conhecidos
- TC.2b (migration de `usage`) pode transformar "transferência = próprio" numa onda de schema , só se T0.2 provar que trânsito não é detectável por nome. Sinalizado, não escondido.
- `enriquecerComAAtender` lê o catálogo inteiro de produtos por chamada (`pedidos.ts:129`); o relatório herda +1 varredura no `Promise.all`. Aceitável hoje; se a page ficar lenta, unificar a leitura de custo. `[R2:B-2]`
