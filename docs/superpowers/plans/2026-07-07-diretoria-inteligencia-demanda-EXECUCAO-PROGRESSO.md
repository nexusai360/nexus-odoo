# PROGRESSO da EXECUÇÃO , Inteligência de Demanda (retomada)

> Ponto de retomada da execução. Atualizado a cada tarefa/commit. Ler junto com
> SPEC v3, PLAN v3 (deltas) + PLAN v2 (corpo) e o dossiê `pericia-fluxos-2026-07/`.

## Estado da metodologia
- Dossiê exaustivo: COMPLETO (pericia-fluxos-2026-07/00-07).
- SPEC v1 → v2 → v3: COMPLETO (3 verificações; v3 é a final).
- PLAN v1 → v2 → v3: COMPLETO (processo sequencial correto; v3 = corpo v2 + deltas).
- Processo de reviews SEQUENCIAIS corrigido na raiz (CLAUDE.md global + projeto).

## Núcleo existente a REUSAR (não recriar)
- `src/lib/fiscal/regras/` , `classificarCfop(cfop)` retorna {categoria, ehReceita,
  deduzReceita, afetaEstoque, ehIntercompanySeGrupo}. Categorias: venda, exportacao,
  servico, transferencia, devolucao_venda, devolucao_compra, remessa, retorno,
  simples_faturamento, bonificacao, venda_ativo, entrada_anomala, sem_cfop, outras.
- `src/lib/fiscal/grupo/` , `ehNotaIntragrupo`, `RAIZES_GRUPO`, whitelist.
- `src/lib/metrics/fiscal/_itens-venda-grupo.ts` , CORE de venda-externa/intragrupo.

## PONTO DE DECISÃO revisado (venda futura) , IMPORTANTE
O núcleo JÁ classifica `5922` (venda futura) como `simples_faturamento, ehReceita=false`
(comentário do teste: "entrega futura nao dobra"). Ou seja, a Fase 2.5 conta a venda
futura na SAÍDA REAL (remessa de entrega futura), não no simples faturamento, para não
duplicar. Isso é o OPOSTO da decisão 07 #4 (contar na emissão). DECISÃO REVISADA
(alinhar com o núcleo, que é o correto e já implementado): venda futura entra no
faturamento na SAÍDA REAL, não no simples faturamento. Para estoque, segue comprometida
até a saída. Ajustar SPEC v3 §2 e a decisão 07 #4 na Onda A. Registrado para não
reintroduzir duplicação.

## Ondas (PLAN v3)
- **Onda 0** (núcleo + materialização): **COMPLETA** (commitada). E2E real:
  demanda ABERTA=395 pedidos/R$77,6M, FECHADA=810, IGNORAR=1112; venda externa=1376
  notas/R$96,7M. Builder roda em uma passada (CTE distinct on) + updateMany.
  - [x] T0.0/T0.1 dispensados (baseline será feito na Onda A; testes usam dado real inline).
  - [x] T0.2 `classificaEtapaDemanda` (TDD 7/7).
  - [x] T0.3 `classificaOperacao` (TDD 6/6) , CFOP já extraído do item.
  - [x] T0.4 `notaEhVendaExterna` (TDD) , +filtro modelo='55'.
  - [x] T0.5 `notaEhDevolucaoDeVenda`+`faturamentoLiquido` (TDD) , entrada fin.4 CFOP 1202/2202.
  - [x] T0.6 colunas derivadas (ALTER idempotente em dev; migration formal fica p/ merge, drift F6).
  - [x] T0.7 builder `fato_pedido_classificacao` (incremental, por último, updateMany).
  - CASO DE BORDA (refino futuro, irrisório): "Transf. DF x Sergipe" (7 pedidos, R$103k)
    tem itens com CFOP 5102 (venda) e participante não detectado como grupo → ABERTA.
    Verdade fiscal (CFOP) prevalece; revisar intragrupo da filial Sergipe depois.
  - OBS T0.3 antiga: Venda futura 5922 entraDemanda=true, entraFaturamentoVenda=false.
  - [ ] T0.4 `isVendaExterna` no core (TDD).
  - [ ] T0.5 devolução de venda / líquido (TDD) , item cfop 1202/2202.
  - [ ] T0.6 migration colunas derivadas.
  - [ ] T0.7 builder `fato_pedido_classificacao` (incremental, por último, UPDATE set-based).
- **Onda A** faturamento venda-real (TA.1-9, baseline, dois codepaths, paridade).
- **Onda B** fato_pedido_item (derivação; campos H1: vr_custo_estoque, local_reserva_livre_id)
  + tools demanda/estoque.
- **Onda C** seriais (auditar fato_serial existente primeiro).
- **Onda D** tabela no Nex (estender MarkdownLite nos 2 renderers) + diretoria (API/menu/RBAC/painéis).
- **Fechamento** goldens (H2: 114→119 x4, 123→128, COMERCIAL 21→24, ESTOQUE 11→13,
  L322/659 32→34, L333/678 17→19) + regen snapshot.

- **Onda B** (itens + tools): EM ANDAMENTO.
  - [x] TB.5 tool `comercial_demanda_em_aberta` (query queryDemandaEmAberta + wrapper +
    catálogo 124 + goldens; integração 53/53). E2E SQL: 395 pedidos/R$77,6M.
  - [x] TB.7 `comercial_pedido_situacao` (imersão: trilha + tempo parado). E2E PV-1471.
  - [x] TB.1+TB.2 `fato_pedido_item` (derivação; 19292 itens/2428 pedidos/familia 99,7%).
    Produto+demanda (qtd, ABERTA): PISO BLACK 2096, T600X 772. Casts int via CASE regex.
  - [ ] TB.8 `comercial_demanda_por_produto` (quantidade; usa fato_pedido_item + bucket ABERTA).
  - [ ] TB.10 `estoque_disponivel` (saldo fato_estoque_saldo - comprometido; ATENCAO: acertar
    matching de produto_id item x saldo , T600X deu saldo 0 no teste, verificar id).
  - [ ] TB.11 RBAC das tools novas.
  - [ ] REBUILD FINAL da imagem app (inclui fato_pedido_item no worker) + recriar worker.
    (Imagem 02:55 tem classificacao mas NAO item; tabela item populada por run inline, worker
    atual nao a toca nem zera. Rebuild agrupado no fim da Onda B.)
- **Onda A** (faturamento venda-real nas ~7 métricas + reports/queries, baseline anti-regressão).
- **Onda C** (seriais: auditar fato_serial existente , JA tem localNome/dataSaida de lote_serie).
- **Onda D** (tabela no Nex nos 2 renderers + diretoria API/menu/RBAC/painéis).
- **Fechamento** (goldens finais + regen snapshot , já feito parcialmente por tool).

## Próxima ação
TB.7 `comercial_pedido_situacao` (usa fato_pedido_historico, não depende de fato novo) OU
TB.2 `fato_pedido_item` (destrava produto/estoque). Nota jest: NÃO importar `Prisma`
value de @/generated/prisma/client em código lido pelo mcp (quebra com import.meta);
filtrar/compor em TS ou usar $queryRaw sem interpolação condicional.
