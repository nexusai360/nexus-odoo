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
  - [x] TB.8 `comercial_demanda_por_produto` (qtd; PISO BLACK 2096, T600X 772). Catalogo 126.
  - [x] TB.10 `comercial_estoque_disponivel` (dominio comercial p/ nao mexer goldens estoque).
    E2E: T600X saldo 549 - demanda 772 = -223 (precisa comprar); 484 produtos negativos.
    produto_id do T600X e 52 (o "[99]" e codigo no nome). Catalogo 127.
  - [x] TB.11 RBAC: tools sao dominio comercial, catalogo filtrado ja cobre; integration.test valida.
  - [~] REBUILD FINAL imagem app em andamento (background) p/ worker rodar fato_pedido_item.
    Ao terminar: docker compose up -d --force-recreate worker + validar.
  ONDA B COMPLETA (5 tools de valor: demanda_em_aberta, pedido_situacao, demanda_por_produto,
  estoque_disponivel + fato_pedido_item). Catalogo 127, integracao 53/53.
- **Onda A** (faturamento venda-real nas ~7 métricas + reports/queries, baseline anti-regressão).
- **Onda C** (seriais: auditar fato_serial existente , JA tem localNome/dataSaida de lote_serie).
- **Onda D** (tabela no Nex nos 2 renderers + diretoria API/menu/RBAC/painéis).
- **Fechamento** (goldens finais + regen snapshot , já feito parcialmente por tool).

## Estado dos containers (fechamento Onda B)
- Imagem nexus-odoo:local rebuildada 03:30 (tem fato_pedido_item + classificacao).
- Worker recriado; roda os 2 builders novos no ciclo. bucket ABERTA=395, item=19292 estaveis.

## Onda C (seriais) , ACHADO da auditoria
`fato_serial` (8699) vem com data_saida e local_nome VAZIOS em 100% (o raw
raw_sped_produto_lote_serie TEM data_venda/data_baixa/local_id/documento_baixa_id/
motivo_baixa, mas vem vazio; parece so seriais em estoque atual, sem historico de
saida). "Seriais parados vs saidos" precisa cruzar raw_sped_documento_item_rastreabilidade
(serial <-> item de nota) para o que ja saiu. Onda C = builder novo (nao so auditar).

## Onda A (faturamento venda-real) , VALIDADA, JA CORRETA na Fase 2.5 (2026-07-08)
Mapeamento: 7 metricas principais JA usam o core de venda-externa (receita-consolidada,
por-cliente/cfop/empresa/regime/uf-canon, serie-mensal). E2E de paridade:
- receitaConsolidada.receitaExterna = R$97,6M (venda a cliente externo).
- intragrupo eliminado = R$69,5M (41,6% do total R$167M) , a triangulacao que o usuario
  queria fora JA esta fora.
- is_venda_externa materializado = R$96,7M (consistente; ~1% menor por exigir modelo=55).
Conclusao: o faturamento de venda NAO precisa de reescrita (evita regressao). As metricas
"bruto/autorizado/entrada/nao-autorizado" sao intencionalmente brutas (conciliacao).
REFINAMENTOS OPCIONAIS (baixo impacto, ~1-2%): (a) filtro modelo=55 no core; (b) LIQUIDO
descontando devolucoes de venda (T0.5, entrada fin.4 CFOP 1202/2202 = R$1,78M = 1,8%).
Fazer so se o usuario pedir; nao sao bloqueadores.

## Onda C (seriais) , COMPLETA (2026-07-08)
Tool comercial_seriais_produto: parados (em estoque, sem saida) vs saidos (serial em
nota de saida autorizada), cruzando raw_sped_documento_item_rastreabilidade -> item ->
nota. E2E: T600X 1570 seriais, 301 parados, 1269 sairam. Catalogo 128, integracao 53/53.

## ESTADO GERAL: Ondas 0/A/B/C COMPLETAS. Falta so a Onda D (UI).
Backend da inteligencia de demanda 100% pronto e testado no dado real. 6 tools novas
(demanda_em_aberta, pedido_situacao, demanda_por_produto, estoque_disponivel,
seriais_produto + fato_pedido_item). Faturamento de venda validado (Fase 2.5, intragrupo
41,6% fora). Catalogo 128, integracao 53/53. Tudo LOCAL, nada em producao.

## Próxima ação , ONDA D (UI, contexto fresco + ui-ux-pro-max OBRIGATORIO)
1. Tabela no Nex: estender MarkdownLite (novo Block type:"table", parser separador
   ---|---) TDD, aplicar nos 2 renderers (src/components/agent/agent-message.tsx +
   src/components/agent/monitoramento/markdown-snapshot.tsx), tratar protectValues/NBSP,
   estilo ui-ux-pro-max (header/zebra/numeros a direita/overflow-x). Fallback textual WhatsApp.
2. Regra de prompt identity-base.ts: ensinar as 6 tools novas + responder em tabela +
   resumo + lista etapa:qtd + follow-ups (sugerir cortes por empresa/cliente/vendedor).
3. Diretoria: API/menu/RBAC/paineis de demanda e estoque (paridade de dado com as tools).
Refinamentos Onda A (modelo=55, liquido devolucoes ~1,8%) opcionais.
  ANTES (snapshot dos numeros atuais de src/lib/metrics/fiscal/*), conferir quais ja
  usam o core (Fase 2.5, receita externa) e so tocar as divergentes; E2E de paridade
  MCP fiscal == dashboard (reports/queries/fiscal.ts). NAO regredir os canonicos.
- Onda C (seriais): builder cruzando rastreabilidade + tool comercial_seriais_produto.
- Onda D (tabela no Nex): UI na sessao principal + ui-ux-pro-max; estender MarkdownLite
  (Block table) nos 2 renderers (agent-message.tsx + agent/monitoramento/markdown-snapshot.tsx);
  fallback textual WhatsApp; + diretoria (API/menu/RBAC/paineis).
Notas jest: NAO importar Prisma value no codigo do mcp (usar $queryRaw com valor
parametrizado, ex. ILIKE ${padrao}); casts de int em jsonb via CASE regex; goldens
integration.test +1 por tool (hoje 127; COMERCIAL_IDS=25) + gen:mcp-catalog.
