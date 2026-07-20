# SPEC , Fase 1: Base de cálculo do Relatório de Entregas Parciais (v3 FINAL)

> Pesquisa e decisões: `docs/superpowers/research/2026-07-20-entregas-parciais-repaginacao-pesquisa.md`.
> Reviews aplicadas: `2026-07-20-review1-spec-fase1.md`, `2026-07-20-review2-spec-fase1.md`.
> Regra do projeto: sem travessão (em dash). Status: v3 (pronta para virar plano).

## 1. Objetivo e princípio-mestre (D8)

**"Demanda a entregar" é UMA métrica, com UM número, IGUAL em toda ponta.** Nada
de valor diferente entre telas. Isso exige duas coisas:
- **Definição única (GLOBAL):** whitelist de 27 etapas + `tipo=venda`, na fonte
  única `fato_pedido.bucket_demanda`, lida igual por Diretoria, Relatórios 1.0/2.0
  e Nex.
- **Janela única (GLOBAL para esta métrica):** a demanda a entregar NÃO é
  recortada pelo corte de leitura de data. Pedido de 2024 ainda não entregue é
  demanda hoje. O corte de 2026 segue valendo para OUTRAS métricas (faturamento, a
  receber), nunca para demanda a entregar.

Consequência boa (Review 2): com isso, KPI do relatório == card da diretoria ==
Nex volta a ser VERDADE por construção. Some a contradição da v2.

## 2. Decomposição em duas entregas (reduz risco)

- **Fase 1A , DEFINIÇÃO CONSISTENTE (baixo risco, alto valor).** Whitelist + tipo
  venda + demanda sem recorte de data + pareamento das 4 pontas. Vale para tudo
  que JÁ está no cache (2026-01-04 em diante). Corrige Cancelado, pareia telas.
- **Fase 1B , TRAZER OS PEDIDOS ANTIGOS (alto risco, engenharia de sync).** Recuo
  cirúrgico da ingestão para trazer os ~51 pedidos em aberto pré-2026. Depende de
  1A pronta. É a parte que a Review 2 mostrou ser mais espinhosa.

Entregar 1A primeiro, validar consistência, depois 1B.

## 3. Fase 1A , requisitos

- **RF-A1 , Constante única.** `ETAPAS_DEMANDA_ABERTA` (Set dos 27 ids) em
  `src/lib/fiscal/regras/`. `// TODO(dono): revisar inclusao de pecas/consumidor
  final na demanda (D7)`.
- **RF-A2 , Whitelist AUTORITATIVA + tipo=venda.** Nas 2 funções de
  `fato-pedido-classificacao.ts` (`classificarPedidosDoRaw` L120-148,
  `rebuildFatoPedidoClassificacao` L206-234):
  `bucket = (op.entraDemanda && tipo==='venda' && ETAPAS_DEMANDA_ABERTA.has(etapaId)) ? ABERTA : ...`.
  Pertença ao conjunto vence flags. Remover `ehExcecaoNotaEmitidaNaoEntregue` (226
  está no conjunto). Nota Review 2: hoje remove 0 linhas por tipo (410 ABERTA
  todas venda) e ~16 por etapa; é correção estrutural, não cosmética.
- **RF-A3 , Gate de operação preservado** (exclui intragrupo). RISCO LATENTE M2:
  27 etapas hoje vazias podem, no futuro, receber pedido com CFOP de transferência
  e cair em IGNORAR mesmo no whitelist. Registrar, não bloquear.
- **RF-A4 , Cancelado.** Sai pela whitelist (6, 123 fora dos 27). Validar 4 pontas.
- **RF-A5 , Demanda respeita a PÍLULA de período, não o corte de leitura global
  (D9).** A janela da demanda a entregar = a pílula selecionada no topo de Pedidos
  & Entregas (Hoje / Esta semana / Este mês / Este ano / Tudo / Personalizado),
  aplicada por `data_orcamento`. Regras:
  - As pílulas de intervalo (semana/mês/ano/personalizado) são a base de corte:
    recortam pelo intervalo exato, SEM clampar em `sync.corte_dados` (a pílula
    manda, não o corte de leitura global).
  - **"Tudo" = do primeiro pedido até hoje/futuro** (piso na data do pedido mais
    antigo; hoje já implementável via `janelaClampada` piso `2000-01-01`). É o
    único modo que traz os antigos (pós Fase 1B).
  - A pílula vale para TODAS as sub-abas e para o card "Demandas a entregar" da
    Visão geral: mesma pílula + mesma empresa => MESMO número (consistência D8).
  - Onde ajustar: `entregas-parciais.ts`, o card na Visão geral, e a leitura de
    demanda em `comercial.ts` (`queryDemandaEmAberta`, que o Nex/MCP reusa) para
    que respeitem a janela informada e não o corte global. Manter o corte de
    leitura para as OUTRAS métricas (faturamento, a receber).
- **RF-A8 , Filtro de empresa.** O filtro de empresa (emissora) do topo funciona
  em Entregas parciais, recortando B-08 e B-09 pela empresa selecionada,
  consistente com as demais sub-abas.
- **RF-A9 , Estado vazio por empresa sem entregas.** Se a empresa selecionada não
  tem entregas no período, mostrar um estado vazio informativo ("não há entregas
  para esta empresa neste período") em vez de tabela/KPIs zerados sem contexto. A
  empresa permanece na lista de opções (não remover). (UI detalhada nas fases de
  frontend; o requisito de dado/estado nasce aqui.)
- **RF-A6 , Restaurar a verdade KPI==card.** Os comentários/hints
  (`blocos-pedidos.tsx` L163, `atendimento-item.ts` L3) voltam a valer: mesma
  métrica, mesmo número. Ajustar textos se necessário.
- **RF-A7 , Documentação no mesmo commit.** `docs/kpis-diretoria.md` +
  `bi-schema-reference.ts` com a definição nova (whitelist 27 + tipo=venda + sem
  recorte de data para demanda).

## 4. Fase 1B , requisitos (recuo cirúrgico da ingestão)

- **RF-B1 , Override de corte por-modelo (contrato definido, resolve BLOCKER-3).**
  Introduzir um mapa de override `{ 'pedido.documento': dataISO, 'sped.documento.item': dataISO }`
  com FONTE ÚNICA (uma const/config, não espalhada). Consumido por, com assinaturas
  ajustadas: `corteDomain` e `corteDomainHerdado` (`reconcile.ts` L61, L94), e
  `DOMINIO_ATENDIMENTO` (`atendimento.ts` L38, hoje const congelada) , este último
  para o `a_atender` dos antigos ficar fresco. O override MORA num lugar só, e o
  purge lê o MESMO override.
- **RF-B2 , Filtro `pedido_id != false` no item (resolve BLOCKER-2, o volume).**
  `corteDomainHerdado('sped.documento.item')` deve, ao aplicar o override, filtrar
  `pedido_id != false`, trazendo SÓ itens de pedido (19.798) e NÃO os itens de
  nota (211.579, 91% do volume). Sem isso, o recuo inunda com as 172 mil notas que
  o "cirúrgico" quer evitar.
- **RF-B3 , Script one-off de back-fill dirigido (resolve BLOCKER-1).** Não existe
  reconcile dirigido (`processReconcileCycle` roda o catálogo inteiro por timer;
  `reconcileModel` é modelo-inteiro). Criar script que: (a) com o override já
  recuado, busca no Odoo os pedidos de venda em aberto pré-2026 (etapa nos 27) +
  seus itens de pedido; (b) ingere; (c) roda `atendimento.ts` para eles; (d)
  rebuild dos fatos. Idempotente e reexecutável.
- **RF-B4 , Ordem e timing seguros (resolve IMPORTANT-3 e R1/PR#168).** Sequência:
  1) recuar o override (fonte única) ANTES de qualquer back-fill; 2) pausar/lidar
  com o ciclo incremental de 3min para não inflar `a_atender` transitório; 3)
  back-fill dirigido; 4) rodar atendimento; 5) rebuild fatos; 6) rebuild
  containers. O reconcile e o purge, lendo o mesmo override, não re-removem os
  antigos.
- **RF-B5 , Data de start.** Override recua para a data do pedido em aberto mais
  antigo (consulta ao vivo, ~2024-11), sem limite para frente.

## 5. Não-objetivos

Colunas, tags, filtros, agrupamento, views (fases 2+); KPIs melhores; kit; recuar
corte de leitura global das OUTRAS métricas; trazer histórico de notas/financeiro/
contábil pré-2026.

## 6. Invariantes e riscos

- **INV1 , métrica única:** demanda a entregar = mesmo número em toda ponta (D8).
- **INV2 , definição única:** whitelist 27 + tipo=venda na fonte única.
- **INV3 , whitelist autoritativa:** pertença vence flags.
- **R1 (PR #168):** override é fonte única lida por reconcile, atendimento e purge;
  recuar ANTES do back-fill.
- **R2 (volume):** `pedido_id != false` no item (RF-B2), senão 172 mil notas.
- **R3 (fato_pedido global sem corte):** trazer pedidos antigos ao fato global é
  aceitável PORQUE D8 quer demanda sem recorte; as OUTRAS métricas continuam
  clampando por conta própria (verificado: principais clampam). Garantir que
  nenhuma métrica não-demanda passe a incluir antigos indevidamente.
- **R4 (pedido sem item -> IGNORAR):** aceite verifica item a item.
- **R5 (rebuild):** fatos + containers app/mcp/worker (worker via `docker compose build app`).

## 7. Critérios de aceite (consultas ao vivo, com tolerância)

Fase 1A:
- Demanda a entregar dá o MESMO número no relatório, no card "Demandas a entregar",
  no Nex e nos Relatórios (query comparativa ao vivo).
- Cancelado (6, 123) e não-venda ausentes da demanda nas 4 pontas.
- Peças/consumidor final fora, com TODO(dono).
- `tsc` + jest + drift verdes; docs atualizados.

Fase 1B:
- Os pedidos antigos em aberto (conjunto vivo, ~R$ 13,4 mi) aparecem, e item a
  item: item veio, CFOP saiu do item, `entraDemanda=true`, `bucket=ABERTA`.
- Volume: contagem de itens de NOTA no cache não cresce materialmente (RF-B2 ok).
- Reconcile/purge subsequentes NÃO removem os antigos (rodar 1 ciclo e conferir).
- Relatório reproduz o oficial dentro da janela; demais métricas não-demanda
  inalteradas.

## 8. Plano de verificação (E2E contra dado real)

1. 1A: aplicar classificação, rebuild fatos+containers, comparar demanda entre as
   4 pontas (tem que bater), conferir Cancelado/não-venda fora.
2. 1B: recuar override, back-fill dirigido, atendimento, rebuild; conferir antigos
   item a item; conferir volume de notas estável; rodar 1 ciclo de reconcile e
   conferir que os antigos sobrevivem.

## 9. Questões abertas residuais (para o plano)

- QP1: medir/confirmar quais consumidores de `queryDemandaEmAberta` devem perder o
  clamp de data (todos que representam "demanda a entregar") e quais NÃO (se algum
  usa a mesma query para outra métrica com corte).
- QP2: definir o local físico do override (const em `corte.ts` exportada? config?)
  e as mudanças de assinatura mínimas em `reconcile.ts`/`atendimento.ts`.
- QP3: o script de back-fill usa o cliente Odoo existente (`src/worker/odoo/client.ts`);
  confirmar o domínio de busca (tipo=venda, etapa in 27, data_orcamento < corte).
