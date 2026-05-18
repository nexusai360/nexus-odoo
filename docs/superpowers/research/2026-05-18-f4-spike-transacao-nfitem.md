# Spike: Medição de Risco da Transação de fato_nota_fiscal_item

**Data:** 2026-05-18
**Task:** C.2 — achados P-I5, R2-C1, R2-I3
**Executado por:** subagente (Claude Sonnet 4.6)

---

## Configuração do spike

- **Fonte:** `raw_sped_documento_item` com `rawDeleted=false`
- **Total de itens:** ~211.385 (raw_sped_documento_item)
- **Pipeline replicado:** leitura de `raw_sped_documento` → `notaInfoMap`, leitura de `raw_sped_documento_item` → mapeamento com desnormalização (`dataEmissao`/`entradaSaida`), transação única com `deleteMany` + `createMany` chunked de 5.000 + `markFatoBuilt`
- **Chunk size:** 5.000
- **Timeout configurado:** 120.000 ms (2 min)
- **Ambiente:** dev local (Docker Postgres porta 5436)
- **Node:** v24.14.0

---

## Resultado da execução

**O processo morreu com OOM (Out of Memory) antes de abrir a transação.**

```
raw_sped_documento: 3743 registros
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

O crash ocorreu no stack trace de `JsonParser` → `Array.map` — ou seja, durante o `findMany` de `raw_sped_documento_item` (211k registros com campos JSONB volumosos), ao desserializar os 211k objetos JSON em memória.

- **Tempo até o crash:** ~20 segundos (no mapeamento em memória, não chegou à transação)
- **Pico de heap estimado:** > 4 GB (processo abortou em 4.073 MB com OOM)
- **Memória inicial:** 17,7 MB
- **Erro de driver:** N/A — o processo morreu antes de abrir a transação
- **Transação:** não iniciada

---

## Avaliação de risco

**RISCO INACEITÁVEL** — o pipeline transacional da SPEC v3 §3.2 (transação única chunked com `findMany` completo em memória) é inviável para 211k itens com a estratégia atual de `findMany` sem paginação/streaming.

A estratégia de carregar todos os 211k registros JSONB em memória com um único `findMany` esgota o heap do Node.js (~4 GB) antes mesmo de abrir a transação.

---

## Contexto da decisão (conforme CLAUDE.md §5 e plano C.2 Step 3)

O subagente **não cria nem implementa um caminho alternativo**. C.3 permanece, no plano, como transação única — a decisão de como resolver o OOM é do **humano**. Possíveis caminhos (para o humano decidir):

1. **Streaming/cursor em vez de `findMany` total** — processar os 211k itens em lotes de leitura (ex.: `findMany` paginado por `odooId`, batch de 10k), montando o `notaInfoMap` antes e acumulando chunks. Isso mantém a transação única mas evita carregar tudo em memória de uma vez.
2. **Aumentar o heap do Node** (`NODE_OPTIONS=--max-old-space-size=8192`) — solução operacional; pode funcionar dependendo do ambiente de produção.
3. **Build incremental por `odooId`** — conforme a SPEC §3.2 já prevê como evolução futura (não transação única).
4. **Transação por chunk de escrita** — abandonar a atomicidade total; aceitar janelas de inconsistência breves em troca de footprint de memória controlado.

---

## Status

**BLOQUEADO — aguardando decisão do humano.**

A execução da Onda C para após C.2. Task C.3 não será executada até que o humano decida o caminho.
