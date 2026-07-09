# 04 , Capacidades novas, modelo de dados, fatos e tools a criar

> **CORREÇÃO (2026-07-07, pós-review):** onde este módulo diz que "produto com mais
> demanda / estoque disponível / seriais em demanda são NÃO computáveis por falta de
> itens de pedido no cache", está DESATUALIZADO. Comprovado: as linhas de item já
> existem em `raw_sped_documento_item` (join `data->'pedido_id'->>0 = fato_pedido.
> odoo_id`, 1 doc por pedido, ~99% de cobertura, 100% nas etapas abertas). Logo
> `fato_pedido_item` é DERIVAÇÃO INTERNA do cache (sem sync novo no Odoo). Ver
> `../2026-07-07-diretoria-inteligencia-demanda-SPEC-v2.md` §0/§4.1.

As capacidades que o usuário pediu se apoiam em quatro pilares de dado. Onde o
cache já sustenta, marco OK; onde falta, aponto o FATO novo.

## 1. Demanda em aberta detalhada + IMERSÃO no pedido
**Objetivo:** listar as demandas em aberto e, por pedido, dizer por onde passou,
onde está, há quanto tempo, o que falta para avançar.

**Dado:** `fato_pedido` (etapa atual, operação, empresa, vendedor, participante,
valores, `data_aprovacao`, `data_prevista`) + `fato_pedido_historico` (trilha: cada
etapa, `data_entrada`, `tempo_etapa_dias`) + config `raw_pedido_etapa` (gatilhos,
sequence, obs). **Status:** OK, tudo disponível. Senão: `etapa_tipo` vem nulo no
histórico (resolver lendo o tipo da config por `etapa_id`).

**O que dá para responder já:** "PV-xxxx está há N dias na etapa [X], já passou por
[trilha], aprovado em dd/mm, previsto para dd/mm, valor R$ Y". O "o que falta para
avançar" sai do gatilho da próxima etapa (ex.: falta `finaliza_estoque` = falta
confirmar separação; falta `finaliza_faturamento` = falta emitir a nota).

**Grafo de "próxima etapa":** o mapa teórico etapa→etapas seguintes não está 100%
no cache (não há tabela raw de etapa seguinte). Duas saídas: (a) inferir a próxima
etapa das transições mais comuns no `fato_pedido_historico` (dado real); (b) se
precisar do mapa teórico exato, capturar via JSON-RPC o campo de etapas seguintes
por operação. Recomendo (a) primeiro (barato e real).

## 2. Estoque disponível = saldo total menos reservado em demanda aberta
**Objetivo (exemplo do usuário):** 100 T600X em estoque, 80 em demanda aberta ⇒
disponível 20. Pode ficar negativo (vendeu 80, tem 60 ⇒ -20, precisa comprar 20).

**Dado:** `fato_estoque_saldo` (saldo por produto/local, com família/marca) OK para
o "total". **GAP CRÍTICO:** para o "reservado em demanda" preciso saber **quais
produtos e quantidades** estão nos pedidos em demanda aberta , e **isso não existe
no cache** (não há linha de item de pedido). Ver §5.

## 3. Produto com mais demanda
**GAP CRÍTICO:** mesmo problema. `fato_pedido` não tem itens; itens só existem em
`fato_nota_fiscal_item` (pós emissão, ou seja, já fora da demanda). Sem
`fato_pedido_item`, "produto com mais demanda" nos pedidos abertos é não
computável. Declarar limitação até criar o fato.

## 4. Seriais: em demanda vs parados
**Objetivo:** por número de série, saber o que já saiu (em nota) e o que está
parado em estoque.
**Dado:** `fato_serial` (8699) existe MAS está fraco: `local_nome` vazio em todos e
`data_saida` nulo em todos (não reflete saída). A rastreabilidade real de serial
por nota está em `raw_sped_documento_item_rastreabilidade` (54308 linhas: serial ↔
item de nota). **Ação:** enriquecer `fato_serial` (local, data_saida) e/ou construir
`fato_serial_movimento` cruzando com a rastreabilidade das notas. "Serial em
demanda" depende também de `fato_pedido_item` com serial (quando o pedido já
vincula serial na reserva).

## 5. FATO NOVO OBRIGATÓRIO , `fato_pedido_item`
Linhas de produto de cada pedido (o que foi pedido, produto, quantidade, valor,
serial/lote quando houver, local de reserva). Fonte no Odoo: as linhas do
documento de pedido (o worker já sincroniza o cabeçalho em `raw_pedido_documento`;
falta a linha de produto). **É a fundação de:** produto com mais demanda, estoque
disponível real, seriais reservados em demanda. Sem ele, três capacidades ficam
travadas. Prioridade máxima no plano.

## 6. FATOS e enriquecimentos a avaliar
- **`fato_pedido_item`** (novo, obrigatório) , itens do pedido.
- **Enriquecer `fato_serial`** , `local_nome`, `data_saida` (via rastreabilidade).
- **`fato_demanda_aberta`** (materialização opcional) , view/fato já classificado
  (pedido + bucket + tempo parado + valor), para relatórios e tools lerem barato.
  Alternativa: helper em query time. Decidir no plano (custo de sync vs latência).
- Coluna derivada de **classificação de operação** (categoria + entraFaturamento +
  entraDemanda) materializada em `fato_pedido`/`fato_nota_fiscal` para acelerar.

## 7. TOOLS de MCP a criar / ajustar
Novas:
- `comercial_demanda_em_aberta` , total + valor + quebra por etapa + lista (com
  ordenação configurável) + detalhamento por pedido.
- `comercial_demanda_por_produto` (depende de `fato_pedido_item`).
- `estoque_disponivel` , saldo menos reservado em demanda (depende de item).
- `comercial_pedido_situacao` , imersão: trilha + etapa atual + tempo parado + o
  que falta para avançar.
Ajustar (aplicar `classificaOperacao`/`isVendaExterna`): todas as
`fiscal/faturamento-*.ts`, `receita-consolidada.ts`, `ponte-faturamento.ts`,
`notas-emitidas*.ts`, `produtos-faturados.ts`, `vendas-produto-por-empresa.ts`,
`contar-notas.ts`, e as comerciais `pedidos-por-etapa.ts`,
`pedido-travados-por-etapa.ts`, `contar-pedidos.ts`, `pedidos-periodo.ts`,
`pedidos-listar-top-valor.ts`, `pedidos-por-vendedor.ts`, `pedidos-por-uf.ts`,
`pedidos-atrasados.ts`.

## 8. Filosofia (reforço do usuário)
O código faz o trabalho pesado e entrega a resposta pronta; a IA só formata. Uma
tool por pergunta complexa, validada e testada, alimentando tanto o Agente Nex
quanto os relatórios da diretoria (mesma fonte, mesma verdade).
