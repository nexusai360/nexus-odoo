# Review adversarial , PLAN v1 Fase 4 (filtro E/OU + busca inteligente B-09)

Subagente Opus, confronto do plano contra o código real. Aplicada integralmente no PLAN v2.

## Premissas confirmadas verdadeiras (sem falso alarme)
- `GrupoBuilder`/`CondicaoRow` puros e extraíveis (`filters-dialog.tsx:229-288` e `:298-435`, só `onChange`).
- Pipeline `busca → facets → sort` (`data-table.tsx:331`/`:336`/`:351`). `valoresPorColuna` na `:292`. `<DataTable>` do B-09 na `:252`.
- Toolbar usa `Popover`+`Button` (`:505-524`).
- RSC→client inócuo: ambos `"use client"`; `ColumnDef` sem campo-função; `statusMapa.icone` já é chave string.
- Coluna "status"/Financeiro NÃO está quebrada: valor da linha é string `"Bloqueado"`/`"Liberado"` (`blocos-pedidos.tsx:209`).

## ALTOS (bloqueadores, aplicados no v2)
- **ALTO-1**: múltiplas sugestões do mesmo campo sob grupo raiz "E" → tabela vazia (`SP AND RJ`). Fix: operador `esta_em_lista` (membership, OU no campo) + `adicionarFacetAoGrupo`.
- **ALTO-2**: motor não trata `tipo:"data"`; `maior`/`menor` fazem `Number()` incondicional (`filtro-avancado.ts:117-127`) → `NaN` → zera. `igual` compara ISO cru vs. valor digitado. Fix: motor data-aware (ISO lexicográfico) + `operadoresParaTipo` + input `type=date`. Testes de data (ausentes) adicionados.
- **ALTO-3**: "Relatórios idênticos" é falso: (a) novos operadores + input condicional mudam a aba Avançado visível; (b) o `filtroAvancado` dos Relatórios é write-only (serializado em `filters-dialog.tsx:578`, nunca lido/aplicado). Fix: alegação corrigida; mudança reconhecida como intencional.

## MÉDIOS (aplicados)
- **MÉDIO-1**: usar `<Input>` do DS, não `<input>` cru.
- **MÉDIO-2**: `contem`/`nao_contem` com valor vazio → inerte (guard), senão zera a tabela.
- **MÉDIO-3**: busca inteligente , `montarSugestoes` sobre `query` vivo (não debounced); `onEscolher` chama `handleSearch("")` para não deixar filtro textual fantasma.
- **MÉDIO-4**: `igual` não casa `tipo:"tags"` (array); restringir sugestões a texto/tag e usar `esta_em_lista`.

## BAIXOS (aplicados)
- **BAIXO-1**: remover import não usado de `contarCondicoes` no data-table.
- **BAIXO-2**: `grupoVazio()` fábrica única (o filters-dialog já tinha `GRUPO_VAZIO()`).
- **BAIXO-3**: testar o pipeline (reset de página, ordem), não só o predicado trivial.
- **BAIXO-4**: atualizar deps do `useMemo` de `sorted` de `colFiltered` para `advFiltered`.

## Veredito
Abordagem estruturalmente sã (reuso do motor + prop aditiva + extração). Correções pontuais, sem repensar arquitetura. Os 3 ALTOS eram os bloqueadores; todos endereçados no v2.
