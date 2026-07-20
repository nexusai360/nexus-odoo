# PROGRESSO , Repaginação Entregas Parciais (ponto de retomada)

Branch: `feat/entregas-parciais-base-calculo` (local, NADA em produção).
Hub de decisões/pesquisa: `docs/superpowers/research/2026-07-20-entregas-parciais-repaginacao-pesquisa.md`.
Metodologia (D0): por fase = planner -> 1 review do planner -> implementa -> testa -> perícia -> avança. Sem spec nas próximas fases.

## Feito

- **Perícia completa** da divergência vs relatório oficial Odoo (ID 28). Decisões
  do dono D3-D9 registradas no hub. Causa da divergência cravada: 51 pedidos
  antigos ausentes do cache (corte de ingestão 2026-01-04), 17 etapas a mais,
  bug Cancelado, tudo quantificado.
- **Spec da Fase 1** (v3): `docs/superpowers/specs/2026-07-20-fase1-base-calculo-entregas-parciais.md`.
- **FASE 1A , CONCLUÍDA E VALIDADA** (12 commits na branch). Definição consistente
  de demanda: whitelist 27 etapas + tipo=venda (fonte única
  `src/lib/fiscal/regras/etapas-demanda-aberta.ts` + helper `bucketDoPedido`),
  whitelist autoritativa, demanda respeita a pílula (não o corte de leitura),
  consistência D8 nas 6 pontas, filtro empresa + estado vazio, docs atualizados.
  Perícia (feita por mim, inline): cache real 394 ABERTA / 0 fora dos 27 / 0
  cancelado / 0 não-venda; demanda R$ 25,4 mi pareada; tsc limpo; jest verde
  (1 falha model-catalog PRÉ-EXISTENTE, catálogo não tocado).
  ACHADO CORRIGIDO: worker dev antigo (PID morto) revertia a classificação;
  reclassifiquei (2578) e reiniciei o worker com código novo -> estável em 394.

## FASE 1B , CONCLUÍDA E VALIDADA (back-fill supervisionado por mim)

Código: 7 tasks (commits 0867a516..8d49cbc1), tsc limpo, jest verde, teste-trava
de rollback incluído. Back-fill executado por mim (supervisionado):
- 80 headers antigos (2024-2025) entraram; 55 viraram ABERTA; **51 pedidos
  pré-2026 com saldo a atender** (exatamente os 51 que faltavam da planilha).
- **0 registros marcados como removidos** (PR#168 evitado); reconcile reexecutado
  com worker novo NÃO re-remove (Aceite C ok); back-fill idempotente.
- Itens de nota estáveis (211.626 -> 211.628): as 172k notas NÃO entraram (cirúrgico).
- Demanda a entregar com antigos = **R$ 61,2 mi** (~igual ao oficial 60,7 mi);
  parcela antiga = **R$ 13.418.679** (bate na vírgula com a planilha oficial).
- Worker reiniciado com código 1B (override recuado), mantém estável.
Falta (quando for para produção): rebuild containers + rodar back-fill em prod +
NÃO deployar sem o teste-trava de rollback ativo. Runbook: `docs/runbooks/backfill-entregas-antigas.md`.

## FASE 2+ (visual) , em andamento

Metodologia (D0 refinada): planner v1 -> 1 review profunda -> planner v2 ->
implementação (UI SEMPRE inline + ui-ux-pro-max). Sem spec.
- **FASE 2 , tags de etapa coloridas: CONCLUÍDA.** Lógica (5 tasks: corEtapaValida,
  hexParaRgba/luminancia, derivarCorTag, formatarNomeEtapa com fix de sigla-prefixo,
  query devolve etapaCor+etapa formatado) + UI inline (DataTable ganha `corKey`
  aditivo, tag com cor derivada do hex do Odoo, texto text-foreground p/ contraste;
  busca só nas colunas visíveis; coluna Etapa do B-09 vira tag). Commits
  45187463..0fbbe3c9. tsc + jest (127) + eslint verdes. Planner+review:
  `2026-07-20-fase2-tags-etapa.md`, `2026-07-20-review-plano-fase2.md`.
  Validação visual no browser: PENDENTE (dev:fresh rodado, client regenerado,
  erro `fatoEstoqueLocal` era client desatualizado do dev, resolvido).
- **FASE 3+ (colunas completas, filtros, agrupamento, views): não iniciadas.**
  Base: protótipo ERP Nexus (mesma stack). Ordem no doc mestre seção 8.

- **FASE 1B , recuo cirúrgico do corte** (traz os ~51 pedidos antigos em aberto):
  planner pronto `docs/superpowers/plans/2026-07-20-fase1b-corte-antigos.md`
  (10 tasks). Review do planner RODANDO. Próximo: aplicar review -> executor da
  1B (delegado, TDD, commits) -> PERÍCIA inline (crítico: confirmar que reconcile
  NÃO apaga os antigos; volume de notas estável; demanda +R$ 13,4 mi em "Tudo").
  Segurança PR#168: recuar override (código) ANTES do back-fill (dado).

  **Review do planner 1B feita** (`2026-07-20-review-plano-fase1b.md`): núcleo
  anti-PR#168 PROVADO seguro. AJUSTES a aplicar antes de executar:
  - ALTO (rollback): a sobrevivência dos antigos depende do literal
    OVERRIDE_INGESTAO ficar em corte.ts. Rollback de imagem pré-1B faz o reconcite
    apagar 2024-2025. Adicionar TESTE travando o override + aviso de rollback no
    runbook. NÃO deployar sem isso.
  - Task 0: medir também `documento_id.data_emissao` (não só data_orcamento),
    cravar override pelo MENOR.
  - Órfão por design: nota-pai (sped.documento) NÃO é back-fillada; documento_id
    do item antigo fica órfão (sem perda; fato_pedido_item tolera). Aceite A checa
    `fato_pedido_item`, não só `fato_pedido`.
  - Aceite F: cobrir ~30 consumidores de fato_pedido (incl. vendas.ts,
    entregas-parciais.ts, pedidos-por-vendedor), não só 3.
  - BAIXO: medir volume antes do dry-run (header traz TODOS os pedidos 2024-2025,
    milhares, não ~51 , mas só pedidos, sem as 172k notas).

  **CAUTELA:** a 1B MUTA o cache (recua corte + back-fill do Odoo). Operação
  delicada; executar com supervisão direta, não delegada às cegas.

## Fases seguintes (2-8, ainda não iniciadas)

Tags de etapa coloridas, colunas completas (25 do oficial), filtro E/OU aninhado,
agrupamento multinível, seletor/reordenação de colunas, views (kanban/calendário/
pivô), salvar visão. Base: protótipo do ERP Nexus (mesma stack, client-side).
Pendência aberta P1 (D7): peças/consumidor final na demanda (dono revisa).
