# DOSSIÊ DE PERÍCIA , Fluxos, Etapas, Operações e Regras de Negócio (Odoo Tauga)

> **Fonte da verdade deste tema. Passar sessão por sessão. NÃO virar spec ainda.**
> Objetivo (ordem do usuário 2026-07-07): antes de qualquer spec, virar **expert
> de TODOS os fluxos** (não só venda lucro real), de cada etapa, de cada gatilho,
> de cada operação, e do modelo de dados, para depois desenhar a arquitetura
> (fatos e tools novos) e só então rodar a metodologia (SPEC v1→v3, PLAN v1→v3,
> execução). Tudo aqui foi investigado direto no cache real `nexus_odoo_l1` +
> prints da tela de etapas do Odoo + transcrição da reunião com a Mariane.

## Índice

- **00** (este) , índice, progresso, estado de retomada.
- **01-fluxos-e-etapas.md** , TODOS os fluxos por tipo de operação, etapas na
  ordem, gatilhos (o que cada etapa aciona). O coração do dossiê.
- **02-operacoes.md** , as 126 operações, classificação por tipo e por flags
  `gera_faturamento/gera_estoque/gera_financeiro`; venda-real vs interna.
- **03-classificacao-demanda-e-faturamento.md** , buckets de demanda
  (aberta/fechada/ignorar) e de faturamento de venda real + intragrupo,
  fundamentados nos gatilhos das etapas.
- **04-capacidades-e-modelo-dados.md** , capacidades novas (demanda detalhada com
  imersão no pedido, estoque disponível, seriais parados, produto com mais
  demanda), fatos e tools a criar, e os GAPS de dado.
- **05-requisitos-produto-ux.md** , requisitos do usuário (tabela no Nex, listagem
  das demandas, lista por etapa, follow-ups, relatórios da diretoria) + minhas
  sugestões críticas.
- **06-inventario-e-metodologia.md** , inventário dos pontos da plataforma a
  periciar e o plano metodológico.
- Resumo executivo anterior: `../2026-07-07-pericia-demanda-e-faturamento-venda-real.md`.

## Fontes cruzadas
1. **Reunião com a Mariane** (admin comercial) , transcrição de áudio (na conversa).
2. **9 prints da tela "Etapas da venda"** do Odoo Tauga (config de etapas e gatilhos).
3. **Cache Postgres `nexus_odoo_l1`** (containers `nexus-odoo-db-1`) , investigação
   direta: `fato_pedido` (2316), `fato_pedido_historico` (12371 linhas/2163
   pedidos), `raw_pedido_etapa` (229), `raw_pedido_operacao` (126),
   `fato_nota_fiscal` + `_item`, `fato_estoque_saldo`, `fato_serial` (8699),
   `raw_sped_documento_item_rastreabilidade` (54308).

## ACHADOS QUE MUDAM TUDO (resumo dos críticos)
1. **`vr_nf` NÃO prova emissão de nota** , quase todo pedido tem `vr_nf>0`,
   inclusive `Aprovado`, `Input financeiro`, `GERA BOLETO`. Classificar por ETAPA.
   (detalhe em 03)
2. **Demanda aberta é por ETAPA + gatilho.** A etapa que emite a NF de venda ao
   consumidor final (`finaliza_faturamento=true` no contexto de venda ao cliente
   final, ex.: `Emite NF Consumidor Final`) é o que FECHA a demanda. (01/03)
3. **Faturamento de venda real = filtrar operações e intragrupo.** Só 1276 de 2316
   pedidos são `(venda)`; e dentro de venda ainda há remessa/bonificação/
   armazenagem/venda-futura e vendas intragrupo a excluir. (02/03)
4. **NÃO existe tabela de itens de pedido no cache.** Só há itens de NOTA (pós
   emissão). Logo "produto com mais demanda", "estoque disponível = saldo menos
   reservado em demanda" e "seriais em demanda" são HOJE não computáveis , exigem
   um fato novo `fato_pedido_item`. (04)
5. **`fato_serial` está fraco** (8699 seriais, todos sem `local_nome` e sem
   `data_saida`). Rastreabilidade real de serial por nota vive em
   `raw_sped_documento_item_rastreabilidade` (54308). (04)
6. **`fato_pedido_historico` é rico** (trilha por pedido com tempo por etapa),
   viabiliza a "imersão no pedido" (por onde passou, onde está, há quanto tempo).
   Único senão: `etapa_tipo` vem nulo no histórico (usar a config da etapa). (04)

## PROGRESSO (estado de retomada)
- [x] Reunião + prints + transcrição cruzados.
- [x] Mineração: etapas (gatilhos), operações (flags), fluxos por tipo (histórico),
      estoque, serial, itens de nota, rastreabilidade.
- [x] Achados críticos consolidados.
- [ ] **Escrevendo os módulos 01 a 06 do dossiê** (em andamento).
- [ ] Validar 2 pontos com o usuário/Mariane (métrica R$/qtd; grupo x empresa).
- [ ] (depois, com autorização) SPEC v1 → reviews → v3 → PLAN → execução.

## Pendências de input (não bloqueiam o dossiê, bloqueiam a SPEC)
1. Métrica de demanda e "produto com mais demanda": valor (R$), quantidade, ou ambos?
2. Demanda consolidada do grupo ou por empresa (com filtro)?
3. Confirmar `Peças` como venda que entra no faturamento; tratamento de `Venda Futura`.
