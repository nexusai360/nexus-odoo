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

Rodada 2 de correções (mesma sessão):
- **✅ #7 decisão #2** , `comercial_demanda_por_produto` aceita `empresaId` + prompt 8-cortes.
- **✅ #12 imersão "o que falta"** , pendência PRECISA materializada (fato_pedido.pendencia_etapa,
  derivada dos gatilhos da etapa). E2E: GERA BOLETO → "falta liberar o financeiro".
- **✅ #8 `fiscal_vendas_produto_por_empresa`** , exclui intragrupo (is_venda_externa).
- **✅ CI** , `fato_pedido_item` faltava no FATO_CATALOG (drift-guard vermelho desde a Onda B);
  registrado; CI voltou a verde (lint/typecheck/jest 3374/build).

Rodada 3 (mesma sessão):
- **✅ Infra: worker** , estava em crash-loop por falta das envs do Odoo (o compose usa
  `${ODOO_URL}` do shell, não do `.env.local`). Recriado com `docker compose -p nexus-odoo
  --env-file .env.local up -d --force-recreate --no-deps worker`. Rodando, sincronizando.
- **✅ #6 `fato_serial` enriquecido** , builder ganhou passo cruzando
  `raw_sped_documento_item_rastreabilidade` → item → nota de saída autorizada, preenchendo
  `data_saida` e `local_nome` (4870/8699 com saída, 4614 com local; parados ficam sem saída).
  Imagem `nexus-odoo:local` rebuildada (via `app`) + worker recriado com o código novo, então
  a materialização (pendencia_etapa + fato_serial) é mantida nos próximos ciclos.

Rodada 4 (retomada 2026-07-08, tarde , OOM que zerava a demanda):
- **✅ CAUSA RAIZ do "demanda 0" no cache** , ao retomar, `categoria_operacao`/
  `bucket_demanda` estavam 100% NULL (0 de 2332). Diagnóstico (systematic-debugging):
  o worker morria de **OOM** no ciclo, em `fato_produto` (logo após `fato_nota_fiscal_item`),
  ANTES de `fato_pedido_classificacao` rodar. Causa: **imagens base64 LEGADAS** (image_*,
  170KB-1.7MB/linha) presas no jsonb `data` das raws sincronizadas ANTES de 2026-06-16
  (raw_sped_produto ~774MB, raw_sped_produto_lote_serie ~3.3GB, raw_res_partner, etc).
  O `field-selection` só barra dados NOVOS; o incremental não re-limpa quem não mudou,
  e o banco de DEV nunca rodou o cleanup (`_prod-db-cleanup-images.py` é só prod). O
  builder `fato_produto` faz `findMany` do jsonb inteiro → carregava ~668MB no heap → OOM.
  A "estabilidade em 399" da sessão anterior vinha do script `.mts` manual, que mascarava.
- **✅ Correção (na raiz):** `scripts/strip-raw-images-local.sh` (novo, idempotente)
  removeu image% de todas as raws de dev + VACUUM FULL (recuperou ~4GB). Heap do worker
  1024→2048 como margem pós-incidente (pico real pós-limpeza ~888MB). E2E: ciclo COMPLETO
  do worker roda sem OOM; demanda ABERTA = 399 pedidos / R$79,1M materializada.
- **Nota p/ merge/prod:** prod tem o MESMO legado. Antes/depois do deploy, rodar
  `python3 scripts/_prod-db-cleanup-images.py --apply` uma vez (com o field-selection já
  ativo em prod, o que já é o caso). Sem isso, o worker de prod pode reincidir no OOM.

Rodada 5 (retomada 2026-07-08, noite , venda futura + sync + pendências menores):
- **✅ Venda futura (resposta da Mariane)** , a nota 5922/6922 (simples faturamento) NÃO
  movimenta estoque, logo NÃO é demanda; a demanda é a remessa x117 (5117/6117, "venda de
  fato"). Aplicado: `simples_faturamento` removido de `CATEGORIAS_DEMANDA` (classifica-operacao.ts).
  Faturamento segue na remessa x117 (flag mantida). E2E: demanda 397 mantida; os 10 pedidos
  simples_faturamento agora IGNORAR. Resposta registrada em 09-PERGUNTA-MARIANE. (commit ca5baae3)
- **✅ #3 "lentidão do sync" , NÃO era o sync.** Medido: os 119 modelos incrementais
  sincronizam em ~18s (search_read ~10s paralelo). A "lentidão de minutos" era ARTEFATO do OOM
  , o worker morria nos builders e deixava o lock de ciclo preso; os "ciclo ainda rodando
  (lock), pulado" eram o cron vendo o lock zumbi. Com o OOM corrigido, o ciclo completo
  (sync+builders) roda em ~1min. Nenhum código a mudar.
- **✅ #13 modelo 55/65** , `notaEhVendaExterna` agora aceita NF-e (55) E NFC-e (65), alinhado
  à spec (era só 55). Propaga à materialização (que usa a função). Sem impacto no dado (100%
  modelo 55 hoje). TDD.
- **✅ #10 queries legadas órfãs removidas** , `queryFaturamentoPeriodo`/`queryFaturamentoPorCliente`
  (reports/fiscal.ts) tinham 0 chamadores; removidas + testes/imports limpos (tsc/jest verdes).
- **#9 `is_venda_externa` , NÃO está mais órfã** (a Rodada 1 reapontou diretoria/vendas.ts e
  mcp/vendas-produto-por-empresa.ts para a coluna). O único resíduo é `metrics` recomputar em
  memória com a MESMA regra (intragrupo+cfop) , mesmo número, não é divergência nem bug.
  Consolidar metrics na coluna é refactor de baixo valor/risco; fica documentado, não feito.

Pendências menores restantes (aceitas/documentadas, sem impacto):
- **#9 `is_venda_externa` órfã** , metrics recomputa e dá o mesmo número (consolidação futura).
- **#10 reports legado `queryFaturamentoPeriodo/PorCliente`** órfãs (remover no futuro).
- **#13 `is_venda_externa` usa `modelo='55'`** (spec pedia 55/65; sem impacto no dado atual).

## Resposta direta à pergunta do usuário
- **A demanda (bucket_demanda) chegou aos dois lugares certos** (tools comerciais +
  diretoria/pedidos), com números idênticos (395/R$77,6M). ✅
- **Relatório 2.0 (metrics) não tem módulo de demanda por design** (demanda vive em
  fato_pedido, não em fato_nota_fiscal) , não é gap.
- **O que NÃO propagou é o FATURAMENTO REAL (sem intragrupo)**: a diretoria/vendas
  mostra R$167,6M (+74%) e 3 tools fiscais + 8 comerciais de pedido usam lógica antiga.
  Esse é o risco concreto, e valida a preocupação do usuário.
