# PLAN v1 , Inteligência de Demanda, Faturamento de Venda Real, Estoque Disponível e Seriais

> Base: SPEC v3. Tarefas bite-sized, verificáveis isoladamente. TDD onde há lógica.
> Todo número conferido com SELECT no cache real (E2E). Tudo LOCAL; merge só com "sim".
> Passa por 2 reviews antes da execução (PLAN v2, v3).

## Convenções
- Cada tarefa: **arquivo(s)** · **ação** · **verificação** (comando + resultado esperado).
- Rebuild de container conforme mapa (CLAUDE.md §2.1). Não editar arquivo compartilhado
  de barrel/index em paralelo (o orquestrador integra).
- Branch: feat/menu-diretoria (worktree atual).

---

## ONDA 0 , Núcleo de classificação + materialização (base de tudo)

**T0.1 , Fixtures de teste do dado real.**
Arquivo: `src/lib/fiscal/regras/__fixtures__/etapas-operacoes.ts`.
Ação: exportar amostras reais (etapas com gatilhos, operações com CFOP, notas com
modelo/finalidade/natureza/participante) tiradas do dossiê 01/02/03, para os testes.
Verificação: `npx tsc --noEmit` verde.

**T0.2 , `classificaEtapaDemanda` (TDD).**
Arquivos: `src/lib/fiscal/regras/classifica-etapa-demanda.ts` (+ `.test.ts`).
Ação: função pura `(etapa:{tipo,flags,nome}) → 'ABERTA'|'FECHADA'|'IGNORAR'` pelos
gatilhos (`aprova_pedido`, `finaliza_faturamento`, `finaliza_pedido_confirmando`,
`finaliza_pedido_cancelando`) + exceções (Nota emitida e não entregue → ABERTA; nota
sem `finaliza_estoque`/sem movimento → ABERTA). Teste primeiro (casos do dossiê 03 §4).
Verificação: `npx jest classifica-etapa-demanda` verde; casos-chave (Emite NF
Consumidor Final=FECHADA; GERA BOLETO=ABERTA; Cancelado=IGNORAR).

**T0.3 , `classificaOperacao` (TDD), reusando `regras`+`grupo`.**
Arquivos: `src/lib/fiscal/regras/classifica-operacao.ts` (+ `.test.ts`).
Ação: `(operacaoNome, cfop, participanteId, empresaId, participantesGrupo) →
{categoria, entraFaturamentoVenda, entraDemanda, intragrupo}`. Intragrupo via
`ehNotaIntragrupo`/participantes do core (NÃO join novo). CFOP via `regras`.
Categorias do dossiê 02 §5. Peças=VENDA_EXTERNA; venda futura=VENDA_FUTURA; venda à
ordem 5117/6117/5119/6119=VENDA_EXTERNA (destinatário externo).
Verificação: jest verde; "VENDA DE BEM DO ATIVO IMOBILIZADO" NÃO é VENDA_EXTERNA.

**T0.4 , `isVendaExterna(nota)` no core.**
Arquivos: estender `src/lib/metrics/fiscal/_itens-venda-grupo.ts` (+ teste).
Ação: `entrada_saida='1'` AND `situacao_nfe='autorizada'` AND `modelo='55'` AND venda
por CFOP/`natureza_operacao_id` AND `ehNotaIntragrupo=false`. Reusa o core existente.
Verificação: jest; E2E: `SELECT` do bruto externo bate com o core atual (não regride).

**T0.5 , Migration: colunas derivadas.**
Arquivos: `prisma/schema.prisma` + migration.
Ação: `fato_pedido.categoria_operacao text?`, `fato_pedido.bucket_demanda text?`,
`fato_pedido.dias_parado int?` (opcional), `fato_nota_fiscal.is_venda_externa bool?`.
Índices em `categoria_operacao`, `bucket_demanda`, `is_venda_externa`.
Verificação: `npx prisma migrate dev` aplica em dev; `npx prisma generate` ok.
Aviso: schema mudou → protocolo `agente schema-changed` (dev apenas, não prod).

**T0.6 , Builder de pós-passo `fato_pedido_classificacao`.**
Arquivos: `src/worker/fatos/fato-pedido-classificacao.ts` + registro POR ÚLTIMO em
`src/worker/fatos/registry.ts`.
Ação: após todas as bases, UPDATE em `fato_pedido` (categoria_operacao, bucket_demanda
via helpers) e `fato_nota_fiscal.is_venda_externa`. Sem tocar a ordem das bases.
Verificação: rodar builder em dev; `SELECT count(*) FILTER(bucket_demanda='ABERTA')`
coerente; rebuild `app` (imagem nexus-odoo:local) + `worker` recreate.

---

## ONDA A , Faturamento de venda real (não depende de item) , com baseline

**TA.1 , Baseline anti-regressão.**
Arquivo: `scripts/baseline-faturamento.ts` (scratch).
Ação: snapshot dos números atuais de cada métrica fiscal contra o cache (JSON).
Verificação: arquivo gerado; usado para comparação nas tarefas seguintes.

**TA.2..TA.n , Uniformizar cada métrica** (uma tarefa por arquivo):
`src/lib/metrics/fiscal/faturamento-por-operacao.ts`, `-por-regime.ts`, `-por-cfop.ts`,
`-por-empresa.ts`, `-por-vendedor.ts`, `-recebido.ts`, `-autorizado.ts`.
Ação: aplicar o filtro `is_venda_externa` (coluna materializada) / helper; adicionar
métrica de devoluções de venda (entrada fin.4 CFOP 1202/2202) e o líquido onde couber.
Verificação por arquivo: jest + golden atualizado conscientemente + E2E (o número novo
bate com SELECT manual; e os canônicos da Fase 2.5 NÃO mudam , diff vs baseline).

**TA.last , Espelhar nos relatórios da diretoria.**
Arquivos: `src/lib/reports/queries/fiscal.ts` (e comercial se aplicável).
Ação: mesmos critérios. Verificação: E2E + tela da diretoria confere.

---

## ONDA B , Itens de pedido + tools de demanda/estoque

**TB.1 , Migration `fato_pedido_item`.**
Arquivos: `prisma/schema.prisma` + migration. Colunas do SPEC v3 §4.1. Índices
`pedido_id`, `produto_id`.

**TB.2 , Builder `fato_pedido_item` (derivação interna).**
Arquivos: `src/worker/fatos/fato-pedido-item.ts` + registro (após `fato_produto`).
Ação: LER `raw_sped_documento_item` com `jsonb_typeof(pedido_id)='array'` e
`quantidade>0`; join `fato_produto` para família/marca. NÃO chamar Odoo.
Verificação: `SELECT count(*)` ≈ linhas esperadas; cobertura 99% dos pedidos; E2E de
um pedido conhecido (itens batem).

**TB.3 , Tool `comercial_demanda_em_aberta`.**
Arquivos: `mcp/tools/comercial/demanda-em-aberta.ts` (+ query em metrics/reports) +
registro em `mcp/tools/comercial/index.ts` + `npm run gen:mcp-catalog`.
Ação: total, quebra por etapa, lista (ordenação padrão tempo parado = NOW - max
data_entrada da etapa atual; fallback data_aprovacao/orcamento). Consolidado/por empresa.
Verificação: jest + E2E (total bate com motor); atualizar contagens do catálogo/goldens.

**TB.4 , Tool `comercial_pedido_situacao`.**
Arquivos: `mcp/tools/comercial/pedido-situacao.ts` + registro.
Ação: trilha (fato_pedido_historico) + etapa atual + tempo parado + próxima etapa
inferida (rotulada) + gatilho pendente. Verificação: E2E com PV real.

**TB.5 , Tool `comercial_demanda_por_produto`.**
Arquivos: `mcp/tools/comercial/demanda-por-produto.ts` + registro.
Ação: ranking por QUANTIDADE, só etapas abertas, quantidade>0. Verificação: E2E bate
com SELECT.

**TB.6 , Tool `estoque_disponivel`.**
Arquivos: `mcp/tools/estoque/estoque-disponivel.ts` + registro.
Ação: saldo (fato_estoque_saldo) menos comprometido em demanda (fato_pedido_item em
pedidos abertos + venda futura) menos já faturado do mesmo pedido; destacar negativos.
Verificação: E2E T600X.

---

## ONDA C , Seriais

**TC.1 , Derivação de saída de serial.**
Arquivos: query/builder cruzando `raw_sped_documento_item_rastreabilidade` com nota.
**TC.2 , Tool `estoque_seriais`.** Parados vs saídos por produto. Verificação E2E.

---

## ONDA D , UX do Nex (tabela) + relatórios diretoria

**TD.1 , Parser de tabela GFM no `MarkdownLite`.**
Arquivos: `src/components/agent/agent-message.tsx` (+ `monitoramento/markdown-snapshot.tsx`).
Ação: `Block={type:"table",header,rows,align}`, parser do separador `---|---`; tratar
`protectValues`/NBSP nas células. Atualizar OS DOIS renderers.
Verificação: render de uma tabela de teste no chat e no monitor; sem quebra numérica.

**TD.2 , Estilo da tabela (ui-ux-pro-max, sessão principal).**
Ação: header, zebra, números à direita, `overflow-x:auto` mobile. Verificação: visual.

**TD.3 , Fallback textual WhatsApp.** Ação: quando canal=WhatsApp, versão textual.

**TD.4 , Regra de prompt do formato de resposta.**
Arquivos: `identity-base.ts`. Ação: instruir tabela + resumo + `etapa:qtd` + follow-ups.
Verificação: conversa real no Nex responde em tabela.

**TD.5 , Relatórios da diretoria (UI).**
Arquivos: `src/app/(protected)/diretoria/*`. Painéis de demanda/estoque. Verificação: tela.

---

## Verificação final (antes de propor merge, que exige "sim" do usuário)
- tsc raiz + mcp = 0; eslint = 0; jest verde; catálogo/goldens atualizados.
- Rebuild de todos os containers afetados; `/api/health` local ok.
- E2E do dossiê 03 §6 / SPEC v3 §9 (demanda, faturamento bruto/líquido, produto,
  estoque, seriais) conferidos com SELECT manual.
- Baseline: canônicos da Fase 2.5 inalterados.
