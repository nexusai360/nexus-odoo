# PROGRESSO , Tabela avançada no B-09 (réplica do ERP Nexus)

Branch: `feat/entregas-parciais-base-calculo` (local, NADA em produção).
Pedido do dono (2026-07-20): reformular COMPLETAMENTE a tabela do B-09 Entregas
Parciais para ficar igual (ou melhor) à tabela do ERP Nexus (localhost:3300/vendas).
Perícia do código-fonte: `docs/superpowers/research/2026-07-20-pericia-tabela-erp-nexus-replicar-b09.md`.
Decisões: Ondas 0-5 completas; views Lista + Kanban por etapa + Calendário; rótulo E/OU.

## FEITO (commits 3681614f, 0e6056bc, 735fdd81)

- **Onda 0 , fundação portada** (`src/components/tabela-avancada/`): `ui.tsx`
  (primitivos 1:1, DS idêntico) + `motor-filtro.ts` (OPERADORES por tipo, árvore
  Regra/GrupoRegras, `testaNo`, LABEL_CONECTOR E/OU). 10 testes do motor verdes.
- **Onda 1 , catálogo do B-09** (`tipos.ts` + `entregas-catalogo.tsx`): 28
  colunas, campos por domínio (Pedido/Cliente/Produto/Comercial/Datas/Financeiro/
  Observações), AGRUPAMENTOS, e `celula()` reusando cor de etapa + ícone de
  status financeiro (Fases 2/3).
- **Ondas 2-5 , tabela completa** (`tabela-avancada.tsx` + `filtro-avancado.tsx`
  + `visoes.tsx`) e **ligada no B-09** (`blocos-pedidos.tsx`):
  - searchbar grande + chips + busca inteligente por facets;
  - UM "Filtros e agrupar" (presets + filtro E/OU aninhado com busca de campo +
    contador ao vivo + agrupar multinível numerado + favoritos);
  - agrupamento multinível com subtotais; multi-sort; seletor de colunas
    (buscar + reordenar por arraste + coluna travada); redimensionar (drag +
    duplo-clique); compacto; exportar CSV; paginação corrigida;
  - views Lista + Kanban por etapa + Calendário por data prevista;
  - persistência por tela (localStorage). Removidos os 2 filtros redundantes.
  - Tabela nova SÓ no B-09; `data-table.tsx` segue nas outras 7 telas.

## VERDE
- tsc limpo; eslint limpo; jest FULL 4495 passam / 1 falha model-catalog
  PRÉ-EXISTENTE (worker/catálogo não tocado). +10 testes novos do motor.

## PENDENTE (bloqueio de ambiente)
- **Validação VISUAL no browser NÃO feita: Docker travado** (não responde em
  15s; o B-09 precisa do DB na porta 5436 para renderizar com dados reais).
  Precisa reiniciar o Docker Desktop; então `agente up` / `npm run dev:fresh`
  e validar no browser (dark/light): lista, kanban, calendário, filtro E/OU,
  agrupamento, reordenar/redimensionar colunas, paginação, busca inteligente.
- **`next build`** rodando para validar compilação client/server real.

## Simplificações da v1 (dono ajusta)
- Sem seleção em lote (entregas só exporta; sem confirmar/faturar/cancelar).
  Exportar gera CSV de TODAS as linhas filtradas.
- Presets: só "Financeiro bloqueado" (facet simples). "Sem previsão"/"Vendas
  futuras" exigem operador (não facet) , adicionar depois se o dono quiser.
- Kanban só por etapa; Calendário só por prevista (dimensões fixas na v1).

## PRÓXIMO
1. Ler o resultado do `next build` (corrigir se acusar).
2. Dono reinicia Docker -> subir dev -> perícia visual dark/light -> corrigir.
3. Ajustes finos de UX que aparecerem na validação visual.

## AJUSTES DO DONO (2026-07-21, apos ver no browser) , ENTREGUES

Commits 643c9e88 (1/5/6) e 18594c0d (2/3/4). Dev no ar, 0 erros de runtime,
validado por screenshot (lista + calendario). tsc/eslint limpos.

1. **Grid**: tabelas crescem ate 12 unidades na vertical (era 8; horizontal
   segue 8). `ALTURAS` ate 12 + `alturaMax` da tabela=12 em
   `src/lib/diretoria/builder/catalogo.ts`. TabelaAvancada virou altura-fluida
   (h-full; lista/kanban/calendario preenchem o bloco).
2. **Calendario**: seletor Dia/Semana/Mes (segmented control estilo tema),
   ancorado em HOJE (usa `new Date()`, nao mais o mes com mais dados), semana de
   SEGUNDA a DOMINGO, titulos (mes "Julho 2026", semana "dd/mm , dd/mm/aaaa",
   dia "dd/mm/aaaa"), hoje destacado, mais espaco vertical em semana/dia.
   Reescrito em `visoes.tsx` (VistaMes/VistaSemana/VistaDia).
3. **Kanban**: seletor da DIMENSAO na toolbar (Select com busca; usa
   `agrupamentos`) + barra de busca fixa por coluna. `kanbanDim` no estado.
4. **Detalhe do pedido**: componente `DetalhePedido` (inline, substitui a view)
   com TODAS as colunas + Voltar + navegar anterior/proximo. Estado `detalhe`;
   `onAbrir` ligado em lista/kanban/calendario (clique na linha/card).
5. **Lista**: cabecalho `text-sm` (sem uppercase), maior.
6. **Seletor de colunas**: movido do header para a TOOLBAR (`SeletorColunas`
   ganhou prop `rotulo`), so no modo lista; removida a coluna-extra do corpo ->
   corrige o vazamento do painel ao rolar lateral.

RESPOSTA AO DONO: grid = 8 horizontais x 8 verticais (agora ate 12 na vertical p/ tabelas).

PENDENTE: dono avaliar no browser (especialmente detalhe do pedido e kanban por
dimensao) e pedir ajustes finos ou autorizar merge. Nada em prod sem sim dele.

## CALIBRACAO (2026-07-21, 2a rodada de ajustes) , ENTREGUE

Commit apos 18594c0d. tsc/eslint limpos, 0 erros de runtime, validado por screenshot.
- **Calendario**: dias vazios da semana = "Sem registro" (nao virgula); tela do dia
  vazio redesenhada (icone CalendarOff + msg clean); range da semana com hifen
  "dd/mm/aaaa - dd/mm/aaaa"; cabecalho reorganizado (periodo CENTRALIZADO entre as
  setinhas, seletor Dia/Semana/Mes a DIREITA, botao "Hoje" REMOVIDO).
- **Detalhe do pedido** (DetalhePedido redesenhado): numero em destaque (2xl) +
  cliente; campos por `detalheSpan` (cliente/produto/emitente/operacao largos=2,
  observacoes/obsEntrega=linha inteira=4), texto completo sem truncar; filtro por
  NUMERO do pedido no topo (digita->filtra sugestoes->clica->navega). `ColunaDef`
  ganhou `detalheSpan`; catalogo marca os longos.

PENDENTE: dono avaliar; possiveis novos ajustes finos; depois autorizar merge.
