# Faturamento de venda pela OPERAÇÃO fiscal + filtro por empresa (2026-07-11)

## O problema (o número da Visão geral estava errado)

O faturamento da diretoria contava como venda o que não era venda. A causa é o critério
usado para marcar uma nota como venda:

- `fato_nota_fiscal.is_venda_externa` era materializado por
  `notaEhVendaExterna(saída + autorizada + modelo 55/65 + CFOP de receita + não intragrupo)`.
- O **CFOP de receita não separa venda de "venda interna"** (transferência faturada entre
  empresas do grupo: mesma natureza, CFOP de venda), nem de serviço, outra saída, entrega
  futura e ativo imobilizado. E ainda **derrubava a venda que não tem item no cache**
  (julho/2026: 1 nota de R$ 3.220,00).
- As métricas (agente Nex/MCP) e os relatórios eram ainda piores: filtravam por **natureza**,
  e "venda" e "venda interna" têm a MESMA natureza ("VENDA DE MERCADORIA...").

## A regra certa (provada contra o dado real)

O campo que o Odoo usa para dizer o que é venda é a **OPERAÇÃO FISCAL** da nota
(`sped.documento.operacao_id`, ex.: `[3, "AOP1 - Venda LR"]` x `"AOP1 - Venda interna LR"`):

```
operação contém "venda"  E  operação NÃO contém "interna"  E  finalidade_nfe <> '4' (devolução)
```

Conferido no cache real (`nexus_odoo_l1`, julho/2026), o número do dono:
**R$ 7.242.504,80 em 136 notas** (bate com o Odoo).

Medições que descartaram os atalhos:
- só natureza (excluir devolução/transferência/...) + intragrupo = 7.966.211,82 (439 notas). ❌
- operação-venda + CFOP de receita = 7.239.284,80 (135 notas) , perde a venda sem item. ❌
- operação-venda (+ modelo 55/65, + não intragrupo) = **7.242.504,80 (136 notas)**. ✅

## O que mudou

1. **Cache** , `fato_nota_fiscal` ganhou `operacao_id`/`operacao_nome`;
   `fato_nota_fiscal_item` ganhou `operacao_id`/`operacao_nome`/`finalidade_nfe`
   (desnormalizados da nota-mãe). Migration `20260711222115_fato_nota_fiscal_operacao`.
2. **Worker** , os builders populam a operação; `fato-pedido-classificacao` materializa
   `is_venda_externa` pela nova regra (e não precisa mais visitar os itens para isso).
3. **Regra pura** , `src/lib/fiscal/regras/nota-venda-externa.ts` passa a exigir operação de
   venda; o CFOP saiu da condição (segue disponível para as métricas por CFOP).
4. **Unificação** , `metrics/fiscal/faturamento-autorizado` (agente Nex/MCP) e
   `reports/queries/fiscal` (relatórios) pararam de filtrar por natureza e passaram a ler
   `is_venda_externa`: agente, relatórios e dashboard na MESMA verdade.
5. **Filtro por empresa** no dashboard da diretoria (`searchParam` `empresa`, deep-link),
   reaplicado em KPIs, mapa por estado e listas. Cards sem recorte por empresa (estoque,
   contas, demandas) passam a dizer "grupo inteiro" em vez de fingir que filtraram.
6. **E2E** , `src/lib/reports/__tests__/e2e/faturamento-venda-operacao.e2e.ts` crava
   7.242.504,80 / 136 notas nas três camadas e a quebra por empresa fechando o total.

## Status

- [x] Schema + migration
- [x] Builders do worker (nota, item, classificação)
- [x] Regra pura pela operação + testes
- [x] Métricas e relatórios lendo a coluna materializada
- [x] Filtro por empresa no dashboard (UI + queries)
- [x] tsc + eslint + jest (3.897 testes) verdes
- [ ] Rebuild do cache local + E2E cravando o número (dependia do Docker local)
- [ ] Merge para `main` , **human-gated: dispara auto-deploy em produção**

## Nota sobre o projeto irmão (ERP Nexus)

A mesma correção foi feita no ERP Nexus (branch `feat/faturamento-venda-operacao`), que não
tem a coluna materializada: lá a regra vive em `src/lib/metrics/_shared/venda.ts` e é aplicada
no where das três camadas. Mesma regra, realidades diferentes.
