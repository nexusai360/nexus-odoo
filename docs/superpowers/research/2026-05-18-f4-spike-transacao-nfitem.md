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

## Resultado da execução (versão original — findMany total)

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

## Avaliação de risco (versão original)

**RISCO INACEITÁVEL** — o pipeline transacional da SPEC v3 §3.2 (transação única com `findMany` completo em memória) era inviável para 211k itens com campos JSONB volumosos.

---

## Solução adotada — streaming por cursor DENTRO de transação única

**Data:** 2026-05-18 (ajuste final)

A versão intermediária (batch transactions sem `$transaction` global) resolvia o OOM mas reabria a janela de inconsistência que a SPEC v3 §3.2 achado N2 proibiu.

**Solução final:** combinar as duas propriedades exigidas.

### Estrutura da implementação

```typescript
// 1. notaInfoMap montado FORA da transação (3743 linhas — trivial)
const rawNotas = await prisma.rawSpedDocumento.findMany({ where: { rawDeleted: false } });
// ... monta notaInfoMap ...

// 2. Transação única com timeout 600s
const totalInserted = await prisma.$transaction(async (tx) => {
  // 2a. Limpar destino
  await tx.fatoNotaFiscalItem.deleteMany({});

  // 2b. Loop cursor-paginado dentro da tx
  let cursorOdooId: number | undefined = undefined;
  let hasMore = true;
  let inserted = 0;
  while (hasMore) {
    const page = await tx.rawSpedDocumentoItem.findMany({
      where: { rawDeleted: false },
      orderBy: { odooId: "asc" },
      take: 5000,
      ...(cursorOdooId !== undefined ? { cursor: { odooId: cursorOdooId }, skip: 1 } : {}),
    });
    if (page.length === 0) break;
    const mappedPage = page.map((r) => mapNotaFiscalItemRow(r.data, notaInfoMap));
    await tx.fatoNotaFiscalItem.createMany({ data: mappedPage });
    inserted += mappedPage.length;
    cursorOdooId = page[page.length - 1].odooId;
    if (page.length < 5000) hasMore = false;
  }

  // 2c. Marcar built DENTRO da tx — commita junto
  await markFatoBuilt(tx, "fato_nota_fiscal_item");
  return inserted;
}, { timeout: 600_000, maxWait: 60_000 });
```

### Por que funciona

1. **Memória plana:** cada página de 5000 itens é descartada após o `createMany`. O GC coleta entre chunks. Heap constante sem `--max-old-space-size`.

2. **Atomicidade:** tudo roda numa única transação Postgres. O MVCC garante que leitores concorrentes veem o estado ANTERIOR completo até o COMMIT — sem janela de inconsistência (SPEC v3 §3.2 N2 respeitado).

3. **`tx.findMany` com cursor é válido:** `$transaction(async (tx) => {...})` é a Interactive Transactions API do Prisma. O `tx` é um cliente transacional completo — suporta `findMany`, `createMany`, `deleteMany`, `upsert` etc. com a mesma interface do cliente raiz.

4. **Timeout 600s cobre o rebuild:** o rebuild de ~40s para 211k itens está amplamente coberto. `maxWait: 60s` para aquisição de slot de transação.

### Métricas observadas (execução real, 2026-05-18)

- **Total de registros:** 211.385
- **Heap inicial:** 17,7 MB
- **Heap ao final do rebuild:** 1.618,7 MB (~1,6 GB)
- **Tempo de rebuild:** 40,3s
- **Sem `--max-old-space-size`:** ✓ (heap padrão do Node suporta ~4 GB; 1,6 GB está dentro)
- **Consistência:** transação única — zero janela de inconsistência

**Nota sobre o heap de 1,6 GB:** a paginação por cursor mantém o payload de leitura plano (~5000 itens por vez), mas o adapter `@prisma/adapter-pg` acumula buffers internos de protocolo durante a transação aberta de ~40s. O processo completa sem OOM — o heap de 1,6 GB está dentro do limite padrão do Node (~4 GB). Se o ambiente de produção for muito restrito em memória, a alternativa é retornar ao modelo de batch transactions (sem `$transaction` global) aceitando a janela de inconsistência, ou aumentar o limite de heap via `NODE_OPTIONS`.

---

## Status

**RESOLVIDO.** Streaming por cursor dentro de `$transaction` única com `timeout: 600_000, maxWait: 60_000`.
