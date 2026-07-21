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
### Ajustes finais da Fase 2 (feitos, commitados)
- Texto da tag na COR do Odoo (color-mix 65% hex + 35% --foreground), não branco.
- Ponto final removido do nome da etapa.
- Coluna Financeiro virou ÍCONE: `CircleCheck` (Liberado, verde) / `CircleX`
  (Bloqueado, vermelho), 18px, strokeWidth 2.25, com Tooltip instantâneo (delay 0,
  sem title nativo). Status é BINÁRIO (só essas 2 categorias). Novo `tipo:"status"`
  aditivo no DataTable (icone por CHAVE, RSC-safe). Commits eb1cd6d1 e anteriores.
- Listas confirmadas: 27 etapas (nome cru -> customizado) e 8 operações do relatório
  (dono NÃO quer mexer no nome das operações).

## FASE 3 , CONCLUÍDA E PERICIADA (colunas completas do oficial)

Commit `a95cc284`. Planner+review: `2026-07-20-fase3-colunas-completas.md` (com a
seção "REVIEW ADVERSARIAL APLICADA v2": 1 ALTO + 3 MÉDIO aplicados).
As 12 colunas do relatório oficial entraram no B-09 **sem migration e sem rebuild
de worker** (tudo query + UI, padrão da Fase 2):
- 6 já no fato: Orçamento, Prevista, Contrato (`data_validade`), Emitente,
  Valor cheio, Vendedor. CNPJ/CEP do `fato_parceiro`; Código do `fato_produto`;
  Unitário derivado (`valorCheio/qtd`); Observações + Obs entrega via batch em
  `raw_pedido_documento` (join 100%).
- Helpers puros `isoData`/`precoUnitarioItem`/`extrairObsPedido` (TDD).
- DataTable ganhou `ocultaInicial` (aditivo RSC-safe): as 12 novas nascem OCULTAS
  (opt-in no seletor). Seletor ganhou busca + Marcar/Limpar (guard ≥1 visível).
  Busca e filtro-por-coluna passam a operar só nas colunas VISÍVEIS.
- **Verde:** tsc limpo, jest 26 (query) + suíte (falhas só model-catalog
  PRÉ-EXISTENTE e 2 por ENOSPC de disco, não regressão), eslint limpo.
- **Perícia contra o cache real:** unitário derivado bate com `vr_unitario`
  (drift de centavo 1,39% = 3222/231034, aceito); datas sem off-by-one
  (fato==raw); CNPJ/CEP/obs conferidos em pedidos ABERTA reais; não-regressão
  (só B-09 declara `ocultaInicial`, as outras 6 telas do DataTable intactas).
- **PENDÊNCIAS honestas da Fase 3:**
  - Validação VISUAL por screenshot (dark/light) NÃO capturada (sem ferramenta de
    screenshot + disco a 98%). Código tsc/eslint/jest verde; dado conferido. Dono
    valida no browser.
  - `TODO(dono)`: confirmar semântica de "Contrato" (usa `data_validade`) e a
    fonte de "Obs entrega" (hoje `obs_produtos`, quase sempre vazia).
  - **ALERTA DE AMBIENTE:** disco a 98% (408Mi livres). A suíte completa falha por
    ENOSPC. Liberar espaço antes das fases seguintes (TDD pesado).

## FASE 4 , CONCLUÍDA E PERICIADA (filtro E/OU aninhado + busca inteligente)

Planner v1 -> review adversarial (subagente Opus) -> planner v2, tudo em
`docs/superpowers/plans/2026-07-20-fase4-filtro-eou-busca-PLAN-v2.md` e o review
em `2026-07-20-review-plano-fase4.md` (3 ALTOS + 4 MÉDIOS + 4 BAIXOS aplicados).
Implementação inline (UI não delegada), 6 commits TDD (d0607c01..após):
- **T1 motor** (`filtro-avancado.ts`): reuso do `compilarFiltro`, endurecido
  para a 1ª ligação a UI viva (a aba Avançado dos Relatórios era write-only).
  Novos operadores `nao_contem`/`vazio`/`preenchido` (visíveis) e `esta_em_lista`
  (programático, busca por facets, `SEP_LISTA`=U+001F). Motor ciente de tipo:
  `data` compara ISO lexicográfico (cronológico), `maior`/`menor` não fazem mais
  `Number()` cego (evita NaN que zerava a tabela, ALTO-2). Guards: `contem`/
  `nao_contem` com valor vazio são inertes (MÉDIO-2). Helpers `grupoVazio()`,
  `operadoresParaTipo()`. 33/33 testes.
- **T2 builder** (`filtro-avancado-builder.tsx` NOVO): extrai `GrupoBuilder`/
  `CondicaoRow` (puros) de `filters-dialog.tsx`; `CondicaoRow` ciente de tipo
  (operadores filtrados, input date/number/text, valor some em vazio/preenchido,
  mantém `<Input>` do DS). `filters-dialog` importa e usa `grupoVazio()`.
  Não-regressão dos Relatórios: 94 testes verdes.
- **T3 controle** (`data-table-filtro.tsx` NOVO): botão Filtros (Popover+Button)
  + `contarCondicoes` (badge) + Limpar. 3/3.
- **T4 pipeline** (`data-table.tsx`): prop aditiva `filtroAvancado` (default
  false, 7 outras telas intactas); estágio `advFiltered=compilarFiltro` entre
  facets e sort; deps de `sorted` e reset de página incluem o grupo. Teste de
  integração (`data-table-filtro-integracao.test.tsx`) mocka o Popover (base-ui
  não posiciona no jsdom): recorta 4->2, Limpar restaura.
- **T5**: liga `filtroAvancado` só no B-09 (`blocos-pedidos.tsx`).
- **T6 busca inteligente** (`data-table-busca.tsx` NOVO): sugestões "Campo:
  valor" (texto/tag) com teclado ↑↓/Enter/Esc (combobox/listbox); escolher
  acumula `esta_em_lista` POR CAMPO (`adicionarFacetAoGrupo`) = OU no campo, E
  entre campos -> evita o tabela-vazia de SP AND RJ (ALTO-1). `query` vivo (não
  debounced); `handleSearch("")` ao escolher. 6/6.

**Verde:** tsc limpo; jest FULL 4485 passam / 1 falha (model-catalog
PRÉ-EXISTENTE, worker/catálogo NÃO tocado, último commit lá é #189); eslint
limpo. 124 testes de charts + 94 de reports (não-regressão).

**Perícia (auto, feita por mim):** confrontei código × plano v2. Verificado e
descartado como falso positivo: (a) não-regressão , só B-09 liga a prop; sem ela
o JSX cai no `<Input>` original idêntico. (b) RSC→client , tudo `"use client"`,
só dados serializáveis atravessam; `ColumnDef` sem campo-função. (c) coluna
`status`/`tag` do B-09 , valor da linha é string, filtro OK; busca exclui
numero/moeda/data/status/tags-array. (d) ALTO-1/ALTO-2/MÉDIO-2 cobertos por
teste. **Achado (pendência, não bug):** ocultar uma coluna que já tem condição
mantém o filtro ativo (compilarFiltro usa todas as columns) e o campo aparece em
branco no builder , NÃO é silencioso (badge conta + linha visível). Coerente com
"campos = colunas visíveis"; a pendência de filtro-em-coluna-oculta já está no
plano. Não corrigido por design.

**PENDÊNCIAS honestas da Fase 4:**
- **Validação VISUAL no browser (dark/light) NÃO capturada:** Docker indisponível
  nesta sessão (`docker ps` travou; cache na porta 5436 inacessível). A Fase 4 é
  100% client-side (filtro/busca sobre linhas já carregadas) , SEM query nova nem
  premissa nova sobre o dado, então o "E2E contra dado real" não se aplica; o
  render do DataTable com `filtroAvancado` já é exercido nos testes RTL. Falta só
  o olho no browser (dropdown posicionado, contraste dark/light). **Dono valida.**
- **Presets de filtro** ("a definir quais fazem sentido"): decisão do dono.
  Candidatos: Financeiro bloqueado / Sem previsão / Vendas futuras. NÃO inventado.

## FASE 4+ (não iniciadas) , PROMPT DE CONTINUAÇÃO

Retomar na branch `feat/entregas-parciais-base-calculo`. Fases 1A, 1B e 2
CONCLUÍDAS e validadas (ler este PROGRESSO + o hub
`docs/superpowers/research/2026-07-20-entregas-parciais-repaginacao-pesquisa.md`).
Iniciar a **FASE 3 , colunas completas** do relatório oficial que ainda faltam:
Orçamento, Prevista, Contrato/Validade, Emitente, CNPJ, CEP, Código do produto,
Unitário, Valor cheio, Observações, Obs Entrega, Vendedor. Algumas exigem
materializar campo novo no fato (vendedor, emitente, datas, obs); a maioria já
existe no raw. Cada coluna deve ser filtrável/agrupável (isso é Fase 4+).
Metodologia (D0): planner -> 1 review profunda -> planner v2 -> implementação
(UI SEMPRE inline + ui-ux-pro-max) -> testes -> perícia. UI NUNCA delegada.
Nada vai para produção sem "sim" explícito do dono. Depois: Fase 4 (filtro E/OU +
busca inteligente), 5 (agrupamento), 6 (colunas DnD), 7 (views + salvar visão),
tudo com base no protótipo do ERP Nexus (mesma stack, client-side).

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
