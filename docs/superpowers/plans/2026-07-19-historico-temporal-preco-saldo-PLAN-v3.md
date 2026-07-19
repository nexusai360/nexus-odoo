# Histórico temporal de preço e saldo , PLAN v3 (final, executado)

> Versão final do plano. Parte do PLAN v2 e aplica os 9 achados da review #2 do plano
> (marcados `[M-n]`). Este documento é também o registro do que foi de fato executado e dos
> desvios de execução, para a perícia e para a próxima sessão.

**Base:** `PLAN-v2.md` (estrutura das 6 ondas) + SPEC v3. Só as mudanças da v3 estão detalhadas
aqui; o que não é citado ficou como na v2.

## Achados da review #2 do plano aplicados

- **`[M1]` UPDATE de vigente escalava com o total de chaves no bootstrap.** A desmarca agora é
  gateada em `vigentes.length > 0` (na base não há vigente a desmarcar) **e** fragmentada em
  lotes de 500 chaves (`captura-serie.ts:LOTE_UPDATE`). Não roda mais um `OR` de 12 mil termos.
- **`[M2]` `createMany` de ~12k linhas furava o limite de bind params do PG.** O insert vai em
  lotes de 500 (`LOTE_INSERT`) dentro da transação. **Provado no E2E:** o bootstrap de 12.008
  preços concluiu (`status=base, gravadas=12008`), sem estourar.
- **`[M3]` teste do gate não isolava `runBuilders`.** `processors.test.ts` agora **mocka**
  `../fatos/registry` (runBuilders → `[{nome:"fato_preco",ok:true},...]`) e as duas capturas.
  O gate `cron`/`ondemand` é provado sem I/O real.
- **`[M4]` corpo ilustrativo do wiring divergia do real.** A edição preservou o `pool` de
  concorrência 5 e o `try/catch` de isolamento verbatim; só a assinatura ganhou `origem` e o
  bloco de captura entrou após o `runBuilders` existente. Nada do laço foi reescrito.
- **`[M5]` destravamento do dead-state sem teste.** O E2E de saldo agora roda `K` capturas com
  o fato encolhido e estável e assere que a `K+1` vira `status="base"`. **Verde.**
- **`[M6]` `captura-saldo` sem filtro de nulos.** Escrito com código completo e o mesmo filtro
  `{ produtoId: { not: null }, localId: { not: null } }` do preço.
- **`[M7]` código morto na Task 7.** A linha `rawAlvo` (filtro JSON suspeito, `as never`) foi
  removida: o E2E altera `fato_preco` direto, não precisa do raw.
- **`[M8]` janela órfã de concorrência (hard-timeout libera lock).** Risco de borda conhecido e
  documentado (bootstrap de 12k fecha bem antes dos 10 min do hard-timeout). Não bloqueante.
- **Falsos positivos descartados pela review** (formatação de Decimal simétrica, string→Decimal
  no Prisma, campos de `fato_estoque_saldo`, `runBuilders`/`processReconcileCycle`): confirmados
  na execução , `tsc` limpo e E2E verdes.

## Desvios de execução (honestos)

- **Migration aplicada via `psql` direto, não via `prisma migrate dev`.** O banco dev tinha um
  **drift preexistente** (a migration `20260719003000_fato_lista_material_item` foi modificada
  após aplicada), e `migrate dev` exigiria **reset** do banco (apagaria o cache dev inteiro).
  Solução: `migrate diff` para gerar o SQL, migration escrita à mão só com as 3 tabelas + os
  índices parciais (o drift alheio de `fato_lista_material_item` **não** entrou), aplicada com
  `psql`, e `migrate resolve --applied` para registrar no `_prisma_migrations`. **Em produção**
  o banco não tem esse drift, então `prisma migrate deploy` aplica o `migration.sql` limpo.
- **Rebuild de container (Onda 6) foi no-op no dev.** Só `db` e `redis` rodam como container
  aqui; `app`/`mcp`/`worker` rodam via `tsx`/`npm` local. Os E2E via `tsx` já exerceram o
  código real contra o cache real. Em produção, o merge dispara CI → imagem → deploy.
- **Travas de drift (Onda 6).** As 3 tabelas novas quebraram duas travas (`fatos-catalog` e
  `bi-schema-reference`). São tabelas de captura append-only, **sem builder** no `FATO_BUILDERS`
  (como o `fato_estoque_saldo_snapshot`): entraram na lista de exceção do `fatos-catalog` e
  foram **documentadas** no `BI_SCHEMA_REFERENCE` (a ponta BI da §4.9).

## Estado final

Todas as 6 ondas executadas e verdes: `tsc` (raiz + mcp) limpo, `jest` 4386 passando, 3 E2E
contra o cache real (captura de preço, captura de saldo, consultas) todos OK, fatos de origem
conferidos intactos (12.009 / 4.622). Sem PR/merge sem liberação do dono (PR #196).
