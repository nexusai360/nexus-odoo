# PLAN 5 , Perícia do dado: o job de atendimento (`quantidade_a_atender`) (2026-07-19)

> Perícia do dado ANTES de planejar. Conclusão curta: **NÃO HÁ CÓDIGO A FAZER.** O job, o builder
> e o wiring já foram entregues (PR #189, 2026-07-13) e estão corretos. O campo estava 100% NULL no
> **dev** só porque o worker está parado nesta base , provado rodando o rebuild (0 → 19.316).

## O que o PLAN 5 pretendia (doc-mãe §J/§5)

Fazer `fato_pedido_item.quantidade_a_atender` popular (o "a atender" REAL), em vez de cair na
quantidade cheia. Sem ele, a diretoria soma o pedido inteiro como pendente mesmo já entregue.

## Achado: a cadeia inteira já existe e está correta

1. **Job** `src/worker/sync/atendimento.ts` (`syncAtendimento`): relê `sped.documento.item` do Odoo
   IGNORANDO `write_date` (o campo é COMPUTADO no Odoo e o incremental não o mantém fresco),
   regrava o raw inteiro. Paginado (OOM-safe), com cancelamento cooperativo.
2. **Builder** `src/worker/fatos/fato-pedido-item.ts` (`SQL_REBUILD_PEDIDO_ITEM`): materializa
   `quantidade_a_atender_pedido` → `quantidade_a_atender` (com guarda de cast: `false`/não-numérico
   vira NULL, nunca zero, para não fazer o pedido valer R$ 0).
3. **Wiring** `src/worker/index.ts` (`JOB_ATENDIMENTO`, 04:00 BRT + pull inicial no boot):
   `syncAtendimento` → `rebuildFatoPedidoItem` → `markFatoBuilt(CHAVE_BUILD_ATENDIMENTO)`. O
   marcador de build é a barreira que as consultas leem para confiar na coluna (senão caem no valor
   cheio com aviso). Tudo automático em produção.

## Por que o campo estava NULL no dev (e não é bug)

Medido no cache dev `nexus_odoo_l1`:
- `fato_build_state.job_atendimento` = **2026-07-13 21:47** (o job JÁ rodou uma vez).
- `raw_sped_documento_item`: dos **19.345** itens de pedido (pedido_id, qtd>0), **19.316 têm
  `quantidade_a_atender_pedido` NUMÉRICO** (valores 0,1,2,4...); 0 com `false`. O raw está bom.
- `fato_pedido_item.quantidade_a_atender`: **0 de 20.353 preenchidos** , o FATO estava desatualizado.

Ou seja: o raw tinha o dado, mas o `fato_pedido_item` não era reconstruído desde então (o worker
está PARADO no dev, então o ciclo/rebuild de 04:00 nunca rodou aqui). **Rodei `rebuildFatoPedidoItem`
manualmente: 0 → 19.316 preenchidos.** Prova de que o código está correto e era só o build.

## Impacto (a valor de venda, cache, foto de agora)

- A atender **REAL** (`quantidade_a_atender`): ~R$ 469 mi.
- A atender **CHEIO** (quantidade total): ~R$ 512 mi.
- Diferença (~R$ 43 mi) = o que já foi entregue e não deveria contar como pendente. O mecanismo
  reduz a superestimação, como esperado.

## Recomendação

**Nenhuma tarefa de código.** Em produção o campo popula sozinho (job 04:00 + pull inicial). No dev,
basta subir o worker (ou rodar o job) para manter; já deixei o `fato_pedido_item` reconstruído com o
"a atender" real nesta base. Se um ciclo incremental rodar no dev e sobrescrever o raw sem o campo
computado (comportamento conhecido, ver cabeçalho de `atendimento.ts`), o próximo job de atendimento
(04:00) restaura. O PLAN 5 do roadmap está, na prática, **ENTREGUE** , esta perícia só o comprovou.
