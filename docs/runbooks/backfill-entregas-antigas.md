# Runbook , Back-fill dos pedidos antigos em aberto (Fase 1B)

> Traz para o cache os pedidos de venda em aberto anteriores a 2026 (o mais antigo tem
> `data_orcamento` de 2024-11-27) para a metrica "Demanda a entregar", SEM apagar historico e
> SEM reinundar o cache com os itens de NOTA pre-2026. Codigo: Tasks 1-5 da Fase 1B.
> Script: `scripts/backfill/entregas-antigas.ts` (core em `src/worker/backfill/entregas-antigas.ts`).
> Sem travessao (regra do projeto).

## Fonte unica do recuo

O recuo mora num literal PERMANENTE em `src/worker/sync/corte.ts`:

```
OVERRIDE_INGESTAO = Map { "pedido.documento" -> "2024-11-01", "sped.documento.item" -> "2024-11-01" }
```

Lido de forma IDENTICA por `corteDomain`, `corteDomainHerdado` (reconcile), `dominioAtendimento()`
(atendimento) e `montaAlvosPurge` (purge), via `corteIngestaoDe(model)`. Um lugar so: reconcile,
atendimento e limpeza nunca divergem sobre ate onde o cache guarda cada modelo.

## HAZARD DE ROLLBACK , LER ANTES DE QUALQUER REVERT (review ALTO)

A sobrevivencia dos pedidos antigos depende 100% do literal `OVERRIDE_INGESTAO` continuar
deployado. Um rollback de imagem, ou um `git revert` do commit do override, para uma versao
pre-1B faz o proximo reconcile diario recalcular `vivos(pedido) = data_orcamento >= 2026-01-01`
e marcar TODO pedido de 2024-11 a 2025 como `rawDeleted = true`. Isso e EXATAMENTE o PR#168,
disparado por um rollback aparentemente inocente.

Protecoes:
- Ha um teste que TRAVA o conteudo do override (`corte.test.ts`, "contem EXATAMENTE ..."). Um
  revert que remova o override quebra a suite antes de chegar em producao.
- **Se um rollback para uma versao sem o override for MESMO necessario, NAO basta reverter a
  imagem: os antigos serao remarcados no proximo reconcile.** Para preservar os antigos num
  cenario de rollback, ou (a) manter o override no cherry-pick, ou (b) aceitar a perda e
  re-rodar este back-fill depois de reintroduzir o override. Nunca reverter o override sozinho.

## Orfao por design (review MEDIO#3) , documentado, sem perda

O back-fill NAO traz a nota-pai (`sped.documento`): so `pedido.documento` e `sped.documento.item`
tem override. Em tese, o `documento_id` de um item antigo poderia apontar para uma linha ausente
em `raw_sped_documento` (orfao). Medido ao vivo na Task 0: para os 55 pedidos em aberto de hoje,
o `min(documento_id.data_emissao)` dos itens e **2026-03-04** (as notas-pai desses itens sao
recentes e ja estao no cache), entao na pratica **nao ha orfao** hoje. Mas o design nao garante
isso para um pedido antigo hipotetico cuja nota-pai seja pre-2026: nesse caso o `documento_id`
ficaria orfao. Isso e tolerado porque `fato_pedido_item` deriva SO de `raw_sped_documento_item` e
NAO faz join com a nota-pai. Qualquer consulta FUTURA que junte item -> nota-pai precisa tratar o
orfao (LEFT JOIN), sob risco de sumir o item antigo em silencio.

## Volume esperado do back-fill (review BAIXO#5) , medido na Task 0

O recuo do HEADER e por DATA (`data_orcamento >= 2024-11-01`), de TODOS os status e tipos, nao so
os em aberto. Medido no Odoo ao vivo:
- **80 headers** `pedido.documento` no range 2024-11-01 a 2025-12-31 (todos os status/tipos).
- Desses, **55 sao pedidos de venda em aberto** (etapa nos 27 da whitelist), que viram
  `bucket_demanda = 'ABERTA'` (~R$ 13,4 mi). Os demais viram FECHADA/IGNORAR e somem pela
  whitelist e pelo clamp de leitura (nao vazam para faturamento/a-receber).
- Os **itens** desses pedidos (1106 medidos) em sua maioria JA estao no cache: as notas-pai deles
  sao 2026-03+, dentro do corte global, entao o delta de `item_pedido` no `--apply` tende a ser
  pequeno (0 a poucas centenas). Isto e esperado: o que faltava era o HEADER, nao o item.
- Referencia importante: este recuo NAO traz as ~172 mil notas pre-2026 (item de nota fica em
  2026 pela uniao de `corteDomainHerdado`). O operador nao deve se assustar: o dry-run mostra
  poucas dezenas de headers, nao milhares de itens de nota.

---

## SEQUENCIA INEGOCIAVEL (R1/PR#168) , NAO PULAR NEM REORDENAR

1. **Deploy do codigo com o override.** Merge das Tasks 1-5 para `main` -> deploy (Shepherd/CI).
   O override em `corte.ts` PRECISA estar em producao ANTES de qualquer back-fill. Inserir os
   antigos contra um corte global que ainda os exclua e o erro do PR#168.
2. **Congelar o purge.** NAO rodar `scripts/limpa/purge-pre-2026.ts --apply` durante a operacao.
3. **Parar o ciclo incremental** (sem corrida com o back-fill). Em prod, parar o container
   `worker`. Em dev: `docker compose stop worker`. O back-fill roda `tsx` contra Odoo+DB direto.
4. **DRY-RUN:** `npx tsx --env-file=.env.local scripts/backfill/entregas-antigas.ts`.
   Conferir a contagem de faltantes (headers e itens de pedido). Nao escreve nada.
5. **APLICAR:** `npx tsx --env-file=.env.local scripts/backfill/entregas-antigas.ts --apply`.
   Reconcilia header -> item -> atendimento e rebuilda os fatos. Idempotente.
6. **Rebuild da imagem do worker** (se o worker roda em container e o codigo de sync mudou):
   `docker compose build app && docker compose up -d --force-recreate worker`. O worker reusa a
   imagem `nexus-odoo:local`; `docker compose build worker` e NO-OP (ver CLAUDE.md). Conferir a
   data da imagem: `docker image inspect nexus-odoo:local --format '{{.Created}}'`.
7. **Subir o worker** de volta.
8. **Verificar (aceites A-F abaixo).**
9. **Observar 1 ciclo de reconcile** (ou forcar) e reconferir `rawDeleted = false` nos antigos
   (prova de que o PR#168 nao ocorreu).

---

## Aceites ao vivo (colar evidencias no PR)

Cache (so leitura): `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`.

### Aceite A , os antigos aparecem, item a item (fato_pedido E fato_pedido_item)

```sql
-- (A1) header antigo materializou em fato_pedido com bucket ABERTA:
select p.odoo_id, substring(p.data->>'data_orcamento' from 1 for 10) as data_orc,
       f.bucket_demanda, f.categoria_operacao
from raw_pedido_documento p
join fato_pedido f on f.odoo_id = p.odoo_id
where substring(p.data->>'data_orcamento' from 1 for 10) < '2026-01-01'
  and f.bucket_demanda = 'ABERTA'
order by data_orc asc;
-- Esperado: ~55 linhas (o conjunto vivo em aberto, ~R$ 13,4 mi).

-- (A2) OBRIGATORIO (review): o ITEM tambem materializou em fato_pedido_item para esses pedidos.
--      A FK e fato_pedido_item.pedido_id (schema Prisma: FatoPedidoItem.pedidoId @map pedido_id).
select count(*) as itens_antigos_no_fato,
       count(*) filter (where fi.cfop_id is not null) as com_cfop
from fato_pedido_item fi
where fi.pedido_id in (
  select p.odoo_id from raw_pedido_documento p
  where substring(p.data->>'data_orcamento' from 1 for 10) < '2026-01-01'
);
-- Esperado: itens_antigos_no_fato > 0. Se A1 > 0 mas A2 = 0, o item nao veio
-- (checar orfao / uniao herdada de corteDomainHerdado).
```

### Aceite B , volume de notas estavel (BLOCKER-2)

```sql
select count(*) as item_nota from raw_sped_documento_item
where coalesce(raw_deleted,false)=false and jsonb_typeof(data->'pedido_id') <> 'array';
```
Esperado: ~211.626 (tolerancia pequena por sync corrente). NAO pode ter ido para ~380k.
`item_pedido` (com `pedido_id`) PODE crescer acima de 19.880.

### Aceite C , reconcile nao re-remove os antigos (R1/PR#168)

Rodar 1 ciclo de reconcile (ou forcar) e reconferir:
```sql
select count(*) from raw_pedido_documento
where substring(data->>'data_orcamento' from 1 for 10) < '2026-01-01'
  and coalesce(raw_deleted,false)=false;
```
Esperado: igual a contagem pos-back-fill (nenhum antigo virou `rawDeleted = true`).

### Aceite D , purge nao apaga os antigos (R2/M3)

`npx tsx --env-file=.env.local scripts/limpa/purge-pre-2026.ts` (DRY-RUN). Conferir no relatorio
que `raw_pedido_documento` e `raw_sped_documento_item` NAO incluem os antigos em `a_deletar`
(limiar 2024-11-01), e que `raw_sped_documento` (nota) segue com limiar 2026-01-01.

### Aceite E , demanda pareada nas pontas (INV1/D8)

Comparar "demanda a entregar" na pilula "Tudo", mesmo periodo + mesma empresa, entre:
- Relatorio de entregas parciais (`src/lib/diretoria/queries/entregas-parciais.ts`);
- Card "Demandas a entregar" da Visao geral;
- Nex/MCP (`mcp/tools/comercial/demanda-em-aberta.ts`);
- Relatorios.
Todos devem dar o MESMO numero, agora incluindo os antigos (~R$ 13,4 mi a mais que antes).

### Aceite F , nenhuma metrica NAO-demanda incluiu os antigos (IMPORTANT-1)

Antes de 1B nao havia pedido pre-2026 no fato, entao um clamp esquecido nunca vazava; 1B torna o
clamp load-bearing. Checar TODOS os consumidores de `fato_pedido`, nao 3. Grep do clamp:

```bash
grep -rn "corteAtualDate\|janelaClampada\|resolverPeriodoCorte\|periodoWhere\|corteAtual" \
  src/lib/diretoria/queries/vendas.ts \
  src/lib/diretoria/queries/pedidos.ts \
  src/lib/diretoria/queries/entregas-parciais.ts \
  src/lib/reports/queries/comercial.ts \
  src/lib/reports/queries/pedido-historico.ts
```

Consumidores de `fato_pedido` a conferir (o clamp de leitura DEVE clampar em 2026, exceto o
caminho de demanda-a-entregar, que usa a pilula da Fase 1A):

- **Diretoria:** `src/lib/diretoria/queries/vendas.ts`, `.../pedidos.ts`,
  `.../entregas-parciais.ts` (demanda: pilula), `.../estoque.ts`.
- **Reports:** `src/lib/reports/queries/comercial.ts` (`janelaClampada`),
  `.../pedido-historico.ts`, `.../composicao-kit.ts`, `.../_search-helpers.ts`,
  `.../_search-universal.ts`.
- **Metrics/fiscal:** `src/lib/metrics/fiscal/faturamento-recebido.ts`.
- **MCP comercial (a maioria e wrapper fino de comercial.ts / usa periodo-corte.ts):**
  `contar-pedidos`, `demanda-em-aberta` (demanda), `demanda-por-produto`, `detalhar-pedido`,
  `pedido-situacao`, `pedidos-atrasados`, `pedidos-listar-top-valor`, `pedidos-periodo`,
  `pedidos-por-etapa`, `pedidos-por-uf`, `pedidos-por-vendedor` (usa `resolverPeriodoCorte`
  proprio, conferir a mao), `pedidos-sem-vendedor`, `tempo-medio-fechamento`,
  `vendedores-cadastrados`, `estoque-disponivel`.
- **MCP fiscal:** `faturamento-recebido`.

Check empirico (o guard real): rodar faturamento, a-receber e vendas-por-periodo em TODAS essas
superficies ANTES e DEPOIS do back-fill. Os numeros nao-demanda NAO podem mudar (seguem clampados
em 2026). Se algum consumidor de demanda NAO usa a pilula, ou algum consumidor nao-demanda perdeu
o clamp, corrigir na hora.

**Verificacao final:** `npx tsc --noEmit` + `npx jest` verdes; evidencias A-F coladas no PR.
