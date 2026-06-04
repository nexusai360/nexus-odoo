# Briefing , Roll-out da paginação nas tools de listagem (alavanca 2b)

> Contexto compartilhado para os subagentes da Fase D. Leia este arquivo + o
> template + a engrenagem ANTES de editar qualquer tool.

## Objetivo

Reduzir o custo por pergunta do Agente Nex: tools que retornam LISTAS GRANDES
devem entregar no máximo 10 itens por vez ao LLM, com metadados para o usuário
pedir "os próximos". Isso corta o input inflado da 2ª chamada do LLM.

## Arquivos de referência (LER PRIMEIRO, na íntegra)

1. `mcp/lib/paginacao.ts` , a engrenagem central: `paginacaoInputShape`,
   `resolverPaginacao`, `montarPaginacaoMeta`, `PaginacaoMeta`.
2. `mcp/tools/cadastros/parceiros-novos.ts` , o TEMPLATE canônico já aplicado.
   Copie exatamente esse padrão.
3. `mcp/tools/cadastros/parceiros-novos.test.ts` , o padrão de teste.

## O padrão (replicar em cada tool de lista grande)

Para CADA tool da sua lista:

1. **Input:** importe `paginacaoInputShape` e espalhe `...paginacaoInputShape` no
   objeto `inputSchema`. Se a tool já tinha um param de limite próprio (`limite`,
   `limit`, `top`, `max`), REMOVA-o e use o da engrenagem (default 10, máx 50).
   Atenção: se o param antigo era usado em outro lugar, ajuste.

2. **Query (SQL):** importe `resolverPaginacao`. No início da query:
   `const { limit, offset } = resolverPaginacao(input);`
   - Aplique `take: limit` E `skip: offset` no `findMany` (ou `LIMIT`/`OFFSET` no
     SQL cru via `$queryRaw`).
   - Garanta um `orderBy` ESTÁVEL com desempate por chave única:
     `orderBy: [{ <campo semantico>: "desc"|"asc" }, { <id unico>: "asc" }]`.
     Use o campo de ordenação que já existia (valor, data, nome, saldo...); se
     não havia, ordene pela métrica principal DESC. SEMPRE acrescente o desempate
     por id/odooId, senão "os próximos" repete ou pula item.
   - Faça (ou mantenha) um `count({ where })` com A MESMA cláusula `where` da
     página, para o `total` real.

3. **Envelope:** importe `montarPaginacaoMeta`. No handler, depois de obter
   `total` e `linhas`:
   `const { limit, offset } = resolverPaginacao(input);`
   `const paginacao = montarPaginacaoMeta(total, offset, limit, linhas.length);`
   - Se a tool usa `enriquecerEnvelope(...)`: passe `{ paginacao }` nas options.
     (O helper injeta `_PAGINACAO`, deriva `_listaTruncada` e o aviso.)
   - Se a tool monta `dados` à mão (como o template): adicione ao `dados`:
     `_listaTruncada: paginacao.temMais, _PAGINACAO: paginacao`.

4. **Schema `dados` (Zod):** adicione ao objeto `dados` (senão o `outputSchema`
   rejeita o campo injetado):
   `_PAGINACAO: z.any().optional(),`
   e, se ainda não houver, `_listaTruncada: z.boolean().optional(),`.

5. **Teste:** crie `<tool>.test.ts` espelhando o template. Cubra:
   - `take`/`skip` recebem `limit`/`offset`.
   - `orderBy` inclui o desempate.
   - `_PAGINACAO.total`/`temMais`/`proximoOffset` corretos.
   - default de `limit` = 10.
   Mocke `fatoBuildState.findMany` + `syncState.findMany` (freshness) + o
   modelo Prisma da tool (`findMany` + `count`). Veja o template para o setup.

## Regras de NÃO-fazer

- NÃO toque em tools de número agregado nem em listas naturalmente pequenas
  (ver a lista de "NÃO PAGINAR" do plano). Pagina só o que pode crescer.
- NÃO centralize a ordenação no helper , ela é por-tool.
- NÃO fatie array em memória se a query pode usar `take/skip` , use o SQL.
  Exceção: queries fuzzy/multi-fonte (ex.: busca textual que une ids de vários
  caminhos). Nessas, ordene o resultado final de forma estável e fatie
  `[offset, offset+limit)`; `total` = tamanho do conjunto encontrado. Documente
  no código que é exceção.

## Validação (rodar e deixar verde antes de retornar)

```bash
npx jest <seu-dominio> -i
npx tsc -p mcp/tsconfig.json --noEmit
```

## NÃO commitar

Apenas edite e deixe os testes verdes. O orquestrador commita por domínio.
Retorne: lista de arquivos alterados, tools paginadas, tools puladas (com motivo),
e qualquer desvio do padrão (ex.: query fuzzy tratada como exceção).
