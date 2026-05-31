# PLAN , B4 Comercial: cotação + comissão

> Sobre a SPEC v3 (`specs/2026-05-31-b4-comercial-cotacao-comissao-spec.md`).
> PLAN v1 → review #1 → v2 → review #2 → v3 (final). Tasks atômicas.

## v1 (rascunho)
T1 schema (2 raw + 2 fato). T2 migration. T3 builders + teste. T4 query layer +
tools. T5 wiring. T6 verificação.

## Review #1 , achados
- T1/T2 já feitos no spike desta sessão (schema + migration aplicada via pg +
  resolve). **Risco:** a migration foi marcada aplicada pelo método antigo (o do
  bug do B2). PRECISA validar que as tabelas `fato_cotacao`/`fato_comissao`
  EXISTEM de fato no banco antes de seguir (não confiar no "resolve"). Vira T0.
- T4 junta query layer + 2 tools num passo só (épico). Quebrar: query layer é uma
  task, cada tool sua própria unidade.
- Falta task explícita de bump dos testes (integration + model-catalog) e do
  BI_SCHEMA_REFERENCE , no B3 isso quase passou batido. Virar tasks próprias.

## v2 (revisada)
Tasks reordenadas com T0 de verificação de tabelas e decomposição de T4.

## Review #2 , granularidade/integração/testabilidade
- Cada task verificável isolada? Sim, exceto "wiring" que agrupava 4 registries.
  Decompor: registry, FATO_FONTE, FATO_CATALOG, MODEL_CATALOG, BI_REF são checagens
  distintas (cada uma com seu teste/efeito). Mantê-las numa task só esconde
  inconsistência (foi o que deixou B2 sem builder registrado). SEPARAR.
- Testabilidade do E2E: como validar 0 reg? Critério: build_state gravado +
  tool retorna estado "ok/vazio" com _RESPOSTA "não operado" (NÃO "preparando").
  Explicitar o comando de verificação.

## v3 (FINAL)

**T0 , validar tabelas no banco (anti-bug-B2).** `SELECT to_regclass('fato_cotacao'),
to_regclass('fato_comissao'), to_regclass('raw_pedido_documento_cotacao'),
to_regclass('raw_pedido_comissao')` → todas não-nulas. Se faltar, aplicar via
`prisma migrate deploy`. (Tabelas já criadas nesta sessão; T0 confirma.)

**T1 , schema.** 2 raw + 2 fato em `prisma/schema.prisma` conforme SPEC v3. (Feito;
revalidar `prisma validate` + `generate`.)

**T2 , migration.** `20260531110000_b4_comercial_cotacao_comissao/migration.sql`
aditiva. (Feita/aplicada; marcada no histórico.)

**T3 , builder FatoCotacao** (`fato-cotacao.ts`) + map. Lê `raw_pedido_documento_cotacao`,
`markFatoBuilt("fato_cotacao")`. (Feito; cobrir no teste T5.)

**T4 , builder FatoComissao** (`fato-comissao.ts`) + map. (Feito; cobrir no teste.)

**T5 , teste de map** (`fato-comercial-b4.test.ts`): cotacao (status/ehCompra/m2o),
comissao (base/alíquota/valor/participante), defensivo (campo ausente → null/0).

**T6 , query layer** (`comercial-cotacao.ts`): `queryCotacoes`+`fatoCotacaoCount`,
`queryComissoes`+`fatoComissaoCount`. Filtros: cotação por status+ehCompra;
comissão por participanteId+pedidoId.

**T7 , tool `comercial_cotacoes`** (factory honesta, domínio comercial).

**T8 , tool `comercial_comissoes`** (idem).

**T9 , registrar tools** no índice comercial (`mcp/tools/comercial/index.ts`).

**T10 , FATO_BUILDERS**: registrar `rebuildFatoCotacao` + `rebuildFatoComissao`
(cycle incremental). Conferir import E entrada no array (anti-bug-B2).

**T11 , FATO_FONTE** (freshness): fato_cotacao→pedido.documento.cotacao,
fato_comissao→pedido.comissao.

**T12 , FATO_CATALOG** (painel): 2 entradas, domínio "Comercial".

**T13 , MODEL_CATALOG**: +2 raws (pedido.documento.cotacao, pedido.comissao).

**T14 , BI_SCHEMA_REFERENCE**: +2 tabelas (fato_cotacao, fato_comissao).

**T15 , integration test**: COMERCIAL_IDS +2; bumps de contagem (visível 87→89,
bruto 96→98); manager não tem comercial (não muda); viewer-comercial +2.

**T16 , model-catalog test**: 120→122.

**T17 , verificação**: tsc + eslint + jest verdes. E2E: rodar os 2 builders no
cache → 0/0 linhas + build_state gravado; conferir que a tool sai de "preparando"
para "ok"/"não operado".

**T18 , commit + push.**

### Frontend
Nenhum (sem `ui-ux-pro-max`): os 2 fatos aparecem no painel via FATO_CATALOG.

### Critério de saída
Todas as tasks verificáveis isoladas; nenhuma esconde >1 unidade; suíte verde;
E2E confirma 0/0 + build gravado; tools honestas auto-ativáveis.
