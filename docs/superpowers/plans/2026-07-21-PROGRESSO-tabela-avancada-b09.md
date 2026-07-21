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
