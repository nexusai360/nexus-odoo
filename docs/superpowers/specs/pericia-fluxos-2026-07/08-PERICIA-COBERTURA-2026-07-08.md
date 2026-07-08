# 08 , PERÍCIA DE COBERTURA (2026-07-08) , o que foi entregue x o que falta

> Auditoria adversarial em 5 frentes paralelas (Opus, read-only) confrontando o
> escopo prometido (dossiê 03/04/05/07 + decisões) contra o código E o dado real
> (`nexus_odoo_l1`). Baselines: demanda ABERTA=395/R$77,6M; receita externa real
> =R$96,2M (1376 notas); intragrupo eliminado ~41,6%.

## VEREDITO EM UMA LINHA
O **núcleo** da feature está entregue e correto (motor de classificação, colunas
materializadas, `fato_pedido_item`, as 5 tools novas, diretoria pedidos+estoque, Nex
tabela+imersão, e as 14 tools fiscais de faturamento via métricas canônicas). O que
**passou batido** é a "propagação para TODA a plataforma" (§7 do dossiê + filosofia
"mesma fonte, mesma verdade"): várias telas/tools **não adotaram** a verdade nova e
exibem números inflados; e 2 decisões de venda futura não foram implementadas.

## ✅ COMPLETO E CORRETO (confirmado no dado real)
- `fato_pedido_item` (19.292 itens, 100% de cobertura da demanda ABERTA).
- Colunas `bucket_demanda` / `categoria_operacao` (fato_pedido) e `is_venda_externa`
  (fato_nota_fiscal) + builder pós-passo incremental `fato-pedido-classificacao`.
- 5 tools novas: `comercial_demanda_em_aberta`, `comercial_demanda_por_produto`,
  `comercial_estoque_disponivel`, `comercial_pedido_situacao`, `comercial_seriais_produto`.
- 14 tools fiscais de faturamento/receita/ponte (via `src/lib/metrics/fiscal/*`,
  `ehNotaIntragrupo`) , total bate R$96,2M. "Fase 2.5 correto" confirmado PARA ESSAS.
- Relatório 2.0 (`src/lib/metrics`) , todas as métricas de receita corretas.
- Diretoria/pedidos (bucket_demanda, 395/R$77,6M) e diretoria/estoque (disponível).
- Nex: tabela GFM + drill etapa→pedido + imersão com produtos/estoque (desta sessão).
- Decisão #1 (produto por QUANTIDADE) e #3 (PEÇAS entram como venda, via CFOP) , ok.

## ❌ GAPS , P0 (números inflados que o usuário VÊ)
1. **Diretoria/Vendas + Visão-geral: faturamento BRUTO R$167,6M vs REAL R$96,2M (+74%).**
   `src/lib/diretoria/queries/vendas.ts` filtra por `natureza ILIKE '%venda%'` e NÃO
   elimina intragrupo; não usa `is_venda_externa`. Afeta `queryIndicadoresVendas`,
   `queryVendasPorUf`, `queryVendasPorMarca`, `queryMargemEstimada`, `queryFormasPagamento`.
   `PorMarca`/`MargemEstimada` nem filtram `situacao='autorizada'` (incluem canceladas).
   Visão-geral herda (KPI faturamento, ticket, mapa do Brasil).
2. **8 tools comerciais de pedido contam pedidos NÃO-venda (mistura demanda com
   transferência/anomalia).** `pedidos_por_etapa`, `pedido_travados_por_etapa`,
   `contar_pedidos`, `pedidos_periodo`, `pedidos_listar_top_valor`, `pedidos_por_vendedor`,
   `pedidos_por_uf`, `pedidos_atrasados` , todas partem de `etapa_finaliza`, nenhuma usa
   `categoria_operacao`/`bucket_demanda`. "Abertos" pela lógica atual = **654/R$153,4M**
   vs **395/R$77,6M** reais (~2x). Os 259 extras: entrada_anomala 145, sem_cfop 25,
   remessa 19, bonificação 5, transferência 2.
3. **3 tools fiscais somam toda saída sem venda-externa.** `fiscal_notas_emitidas`
   (R$378M vs R$96,2M), `fiscal_notas_emitidas_por_produto`, `fiscal_produtos_faturados`
   filtram só `entrada_saida='1'` , incluem transferência/remessa/CT-e/não-autorizada
   no ranking de "produtos faturados".

## ❌ GAPS , P1 (decisões não implementadas / conflito)
4. **#4a Venda futura 5922/6922 no faturamento , CÓDIGO FAZ O OPOSTO DA DECISÃO.**
   `cfop-mapa.ts` mapeia 5922/6922 → SIMPLES_FAT com `ehReceita=false` (reconhece no
   x117/remessa), e há teste travando isso. R$1,68M/31 notas ficam fora do faturamento.
   A decisão #4a dizia contar na emissão. **É conflito decisão × código: precisa da
   definição do usuário (com a Mariane) antes de mexer** , mudar às cegas pode duplicar
   receita.
5. **#4b Venda futura sai do estoque disponível , NÃO implementado.** `queryEstoqueDisponivel`
   só desconta demanda ABERTA; venda futura vira FECHADA e segue contada como disponível.
6. **`fato_serial` (local_nome/data_saida) nunca enriquecido , 100% NULL (0/8699).**
   O builder lê a fonte vazia (`raw_sped_produto_lote_serie`) e nunca ligou a
   `raw_sped_documento_item_rastreabilidade` (54k linhas) que a spec mandava. A tool de
   seriais contorna via nota fiscal, mas o fato ficou inútil para outros consumidores.

## ⚠️ GAPS , P2 (robustez / consistência)
7. **#2 `queryDemandaPorProduto` sem recorte por empresa/cliente/vendedor** (só `limite`);
   prompt do Nex não instrui cortes por cliente/vendedor (só "por empresa" genérico).
8. **`fiscal_vendas_produto_por_empresa`** classifica receita por CFOP mas não exclui intragrupo.
9. **Coluna `is_venda_externa` está ÓRFÃ** , nenhum dos 3 sistemas a lê (metrics recomputa
   em memória; reports/diretoria usam natureza). Consolidar todos na coluna evita 3 caminhos.
10. **reports legado `queryFaturamentoPeriodo`/`queryFaturamentoPorCliente`** (fiscal.ts)
    seguem natureza-based (R$182M), hoje órfãs mas armadilha latente (remover/reapontar).
11. **UF-scoping** ignorado nos KPIs de vendas/demanda da diretoria/visão-geral.
12. **Nex "o que falta para avançar"** é heurístico pelo nome da etapa; `raw_pedido_etapa`
    (230, com gatilhos `finaliza_estoque/faturamento/financeiro`, `aprova_*`) permite
    torná-lo PRECISO. Cruzar com financeiro (boleto pago?) também enriquece (spec §5.4).
13. **is_venda_externa usa `modelo='55'`** só (spec pedia `IN ('55','65')`) , sem impacto
    no dado atual (100% modelo 55), mas desvio latente.

## RESOLUÇÃO (2026-07-08, mesma sessão da perícia)
Correções aplicadas (autorização "corrigir tudo agora"), local, com TDD + E2E:
- **✅ P0.1 diretoria/Vendas + Visão-geral** , faturamento agora REAL via
  `is_venda_externa` + `categoria_operacao='venda'`; E2E: R$96,2M (era R$167,6M).
  UF-scoping aplicado. (commit fix diretoria vendas)
- **✅ P0.2 tools comerciais de pedido** (7 de 8) , filtram `categoria_operacao='venda'`.
  E2E: "abertos" 457 (era 654), total 1206 (era 2317). `pedidos_atrasados` (parcela-based)
  não tocado (risco mínimo). (commit fix comercial)
- **✅ P0.3 fiscal_produtos_faturados** , só venda externa (documento_id das notas
  is_venda_externa). `notas_emitidas`/`notas_emitidas_por_produto` deixadas como LISTAGEM
  de documento (não são métrica de receita), por design. (commit fix fiscal)
- **✅ #4 Venda futura ENGATILHADA** , `src/lib/fiscal/regras/venda-futura-policy.ts`
  (2 toggles, padrão = reconhece no x117). Pergunta objetiva para a Mariane em
  `09-PERGUNTA-MARIANE-VENDA-FUTURA.md`. (commit venda futura)

Pendências remanescentes (P1/P2, não bloqueiam, menor visibilidade):
- **#6 [P1] `fato_serial` (local_nome/data_saida)** ainda 100% NULL , enriquecer o
  builder via `raw_sped_documento_item_rastreabilidade`. (a tool de seriais já contorna)
- **#7 [P2] `queryDemandaPorProduto` sem recorte empresa/cliente/vendedor**; prompt do
  Nex sem cortes explícitos por cliente/vendedor (decisão #2).
- **#8 [P2] `fiscal_vendas_produto_por_empresa`** não exclui intragrupo.
- **#9 [P2] `is_venda_externa` órfã** , metrics recomputa; consolidar todos na coluna.
- **#10 [P2] reports legado `queryFaturamentoPeriodo/PorCliente`** órfãs (armadilha latente).
- **#12 [P2] imersão "o que falta"** heurística; `raw_pedido_etapa` (gatilhos) permite precisão.
- **#13 [info] `is_venda_externa` usa `modelo='55'`** (spec pedia 55/65; sem impacto atual).

## Resposta direta à pergunta do usuário
- **A demanda (bucket_demanda) chegou aos dois lugares certos** (tools comerciais +
  diretoria/pedidos), com números idênticos (395/R$77,6M). ✅
- **Relatório 2.0 (metrics) não tem módulo de demanda por design** (demanda vive em
  fato_pedido, não em fato_nota_fiscal) , não é gap.
- **O que NÃO propagou é o FATURAMENTO REAL (sem intragrupo)**: a diretoria/vendas
  mostra R$167,6M (+74%) e 3 tools fiscais + 8 comerciais de pedido usam lógica antiga.
  Esse é o risco concreto, e valida a preocupação do usuário.
