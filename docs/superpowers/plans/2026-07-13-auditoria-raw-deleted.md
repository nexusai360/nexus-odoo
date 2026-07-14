# Auditoria de `raw_deleted` nos builders de fatos (TA.2)

Data: 2026-07-13
Escopo: todos os arquivos de `src/worker/fatos/*.ts` (45 arquivos, excluindo `*.test.ts`).

## Contexto

As tabelas `raw_*` guardam o que veio do Odoo. Quando um registro some no Odoo, a
reconciliação marca `raw_deleted = true` em vez de apagar a linha. Os builders de fatos
leem essas raws; **um builder que não filtra `raw_deleted` copia linhas mortas para o
fato**, e a partir dali elas viram número na tela, no relatório e na resposta do agente.

Duas formas de leitura aparecem no código, e as duas precisam de guarda:

| Caminho | Filtro correto |
|---|---|
| Prisma (`prisma.rawXxx.findMany/count`) | `where: { rawDeleted: false }` (camelCase) |
| SQL cru (`$queryRaw` / `$executeRaw`) | `WHERE raw_deleted = false` (snake_case) |

A auditoria foi feita **lendo os arquivos**, não com grep pela string `raw_deleted`, que
enxerga só o caminho SQL e já produziu um resultado falso antes.

Contagens de linhas mortas medidas no cache local (`nexus_odoo_l1`) em 2026-07-13.

## Tabela da auditoria

| Builder | Raw lida | Filtra? | Mortas hoje | Risco |
|---|---|---|---|---|
| fato-apuracao.ts | raw_sped_apuracao | sim (Prisma) | 0 / 9 | ok |
| fato-auditoria-regra.ts | raw_auditoria_regra | sim (Prisma) | 0 / 15 | ok |
| fato-carta-correcao.ts | raw_sped_carta_correcao | sim (Prisma) | 0 / 19 | ok |
| fato-carteira-cobranca.ts | raw_finan_carteira | sim (Prisma) | 0 / 11 | ok |
| fato-certificado.ts | raw_sped_certificado | sim (Prisma) | 4 / 15 | ok |
| fato-cheque.ts | raw_finan_cheque | sim (Prisma) | 0 / 0 | ok |
| fato-comissao.ts | raw_pedido_comissao | sim (Prisma) | 0 / 0 | ok |
| fato-compra.ts | raw_pedido_documento | sim (Prisma) | 81 / 2.538 | ok |
| fato-conta-contabil.ts | raw_contabil_conta | sim (Prisma) | 0 / 934 | ok |
| fato-contabil-conta-referencial.ts | raw_contabil_conta_referencial | sim (Prisma) | 0 / 2.216 | ok |
| fato-contabil-lancamento.ts | raw_contabil_lancamento | sim (Prisma) | 0 / 0 | ok |
| fato-contabil-lancamento-item.ts | raw_contabil_lancamento_item | sim (Prisma) | 0 / 0 | ok |
| fato-cotacao.ts | raw_pedido_documento_cotacao | sim (Prisma) | 1 / 1 | ok |
| fato-crm-pipeline.ts | raw_crm_pipeline | sim (Prisma) | 0 / 0 | ok |
| fato-dfe.ts | raw_sped_consulta_dfe_item | sim (Prisma) | 1 / 13.271 | ok |
| fato-estoque-local.ts | raw_estoque_local | sim (Prisma) | 1 / 390 | ok |
| fato-estoque-minimo-maximo.ts | raw_estoque_minimo_maximo | sim (Prisma) | 0 / 0 | ok |
| fato-estoque-movimento.ts | raw_estoque_extrato | sim (Prisma) | 0 / 24.306 | ok |
| fato-estoque-saldo.ts | raw_estoque_saldo_hoje + raw_sped_produto | sim (Prisma, nas duas) | 0 / 4.193 e 34 / 3.908 | ok (não lê `raw_estoque_saldo`, que tem 4.233 mortas e ninguém consome) |
| fato-financeiro-lancamento-item.ts | raw_finan_lancamento + raw_finan_lancamento_item | sim (Prisma, nas duas) | 2.859 / 15.314 e 4.291 / 19.054 | ok |
| fato-financeiro-movimento.ts | raw_finan_fluxo_caixa | sim (Prisma) | 7.454 / 36.804 | ok |
| fato-financeiro-saldo.ts | raw_finan_banco_saldo_hoje | sim (Prisma) | 0 / 10 | ok |
| fato-financeiro-titulo.ts | raw_finan_lancamento (Prisma) + raw_sped_documento (SQL) | sim (nas duas) | 2.859 / 15.314 e 414 / 13.695 | ok |
| fato-mdfe.ts | raw_sped_mdfe | sim (Prisma) | 0 / 0 | ok |
| fato-nota-fiscal.ts | raw_sped_documento | sim (Prisma) | 414 / 13.695 | ok |
| fato-nota-fiscal-item.ts | raw_sped_documento (SQL) + raw_sped_documento_item (Prisma, cursor) | sim (nas duas) | 414 / 13.695 e 1.519 / 235.054 | ok |
| fato-parceiro.ts | raw_sped_participante (SQL) | sim | 1 / 7.335 | ok |
| **fato-pedido-classificacao.ts** | raw_pedido_etapa (SQL, filtra), raw_pedido_documento (SQL, filtra), **raw_sped_documento_item (SQL, CTE `itens`)** | **NÃO, nas 2 funções** | **1.519 / 235.054** | **vazava agora, CORRIGIDO** |
| fato-pedido.ts | raw_pedido_etapa + raw_pedido_documento | sim (Prisma, nas duas) | 1 / 231 e 81 / 2.538 | ok |
| fato-pedido-historico.ts | raw_pedido_documento_historico | sim (Prisma) | 176 / 14.784 | ok |
| fato-pedido-item.ts | raw_sped_documento_item (SQL) | sim (`i.raw_deleted = false`) | 1.519 / 235.054 | ok, corrigido antes nesta sessão (ingeria 1.010 itens mortos) |
| fato-pedido-parcela.ts | raw_pedido_parcela | sim (Prisma) | 1.343 / 5.150 | ok |
| fato-pix.ts | raw_finan_pix | sim (Prisma) | 0 / 0 | ok |
| fato-preco.ts | raw_sped_tabela_preco_regra | sim (Prisma) | 0 / 12.009 | ok |
| fato-producao-processo.ts | raw_producao_processo | sim (Prisma) | 0 / 1 | ok |
| fato-produto.ts | raw_sped_produto (SQL) | sim (`raw_deleted = false`) | 34 / 3.908 | ok |
| fato-produto-parado.ts | raw_estoque_saldo_hoje + raw_estoque_saldo_hoje_duracao_dias | sim (Prisma, nas duas) | 0 / 4.193 e 0 / 4.193 | ok |
| fato-referencia.ts | 15 raws de referência (ncm, cfop, cest, cnae, nbs, natureza_operacao, unidade, cst_*, municipio, pais, estado) | sim (Prisma, em todas) | 0 em todas | ok |
| fato-reinf-evento.ts | raw_reinf_evento | sim (Prisma) | 0 / 1 | ok |
| fato-remessa-bancaria.ts | raw_finan_remessa | sim (Prisma) | 0 / 7 | ok |
| fato-retorno-bancario.ts | raw_finan_retorno | sim (Prisma) | 0 / 8 | ok |
| fato-retorno-item.ts | raw_finan_retorno_item | sim (Prisma) | 0 / 42 | ok |
| **fato-serial.ts** | raw_sped_produto_lote_serie (SQL, filtra) + **raw_sped_documento_item_rastreabilidade (SQL, UPDATE de enriquecimento)** | **NÃO, na rastreabilidade** | **1.328 / 55.800** | **vazava agora, CORRIGIDO** |
| fato-servico.ts | raw_sped_servico | sim (Prisma) | 0 / 336 | ok |
| dim-empresa-regime.ts | nenhuma raw (lê Odoo/dim) | , | , | ok |
| snapshot-estoque-diario.ts | nenhuma raw (lê `fato_estoque_saldo`) | , | , | ok |
| fato-build-state.ts, registry.ts, odoo-relational.ts, _coerce.ts | nenhuma raw (infra/helpers) | , | , | ok |

Nota sobre `carregarParticipantesGrupo` (`src/lib/fiscal/grupo/participantes-grupo.ts`),
usado por `fato-nota-fiscal.ts` e `fato-pedido-classificacao.ts`: lê `fato_parceiro`
(já derivado e filtrado), não toca raw. Sem risco.

## Vazamentos encontrados e corrigidos

### 1. `fato-pedido-classificacao.ts` , raw_sped_documento_item sem guarda

O CTE `itens` (que escolhe o **CFOP representativo** de cada pedido, pegando o item de
maior quantidade) lia `raw_sped_documento_item` sem filtrar `raw_deleted`. As duas
funções do arquivo (`classificarPedidosDoRaw` e a de reclassificação sobre `fato_pedido`)
tinham a mesma consulta.

Consequência: um item já apagado no Odoo podia ser o "item de maior quantidade" do pedido
e ditar o CFOP. O CFOP alimenta `classificaOperacao`, que define a **categoria da operação**
e o **bucket de demanda**, portanto uma linha morta podia jogar um pedido vivo no balde
errado (ou tirá-lo da demanda).

Linhas mortas na raw hoje: **1.519** de 235.054.

Correção: `where coalesce(i.raw_deleted, false) = false and jsonb_typeof(...) = 'array'`,
nas duas consultas.

### 2. `fato-serial.ts` , raw_sped_documento_item_rastreabilidade sem guarda

O `UPDATE` de enriquecimento (que preenche `data_saida` e `local_nome` do serial a partir
da rastreabilidade item de nota) lia `raw_sped_documento_item_rastreabilidade` sem filtrar
`raw_deleted`. Um vínculo serial→item já apagado no Odoo podia marcar um serial como
"saiu" (com data e armazém de origem), quando na verdade ele continua parado.

Linhas mortas na raw hoje: **1.328** de 55.800.

Correção: `WHERE coalesce(r.raw_deleted, false) = false AND n.entrada_saida = '1' AND ...`.

A leitura principal do mesmo arquivo (`raw_sped_produto_lote_serie`) já filtrava.

## O que NÃO foi mexido

Nenhum outro builder foi tocado. Todos os demais já filtram `raw_deleted` no caminho que
usam, incluindo os casos de raw com muita linha morta (`raw_finan_fluxo_caixa` com 7.454,
`raw_finan_lancamento_item` com 4.291, `raw_pedido_parcela` com 1.343): estão protegidos.

`raw_estoque_saldo` (4.233 mortas), `raw_estoque_extrato_rastreabilidade` (8.147) e
`raw_estoque_saldo_rastreabilidade` (7.521) têm bastante linha morta mas **nenhum builder
as consome**, então não há vazamento por elas hoje.

## Verificação

- `npx tsc --noEmit`: passou.
- `npx jest src/worker/fatos`: suíte verde.
