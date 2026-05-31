# PLAN , B5 Produção

> Sobre SPEC v3. PLAN v1 → review #1 → v2 → review #2 → v3.

## v1
T1 schema (1 raw + 1 fato). T2 migration. T3 builder+teste. T4 tool. T5 wiring. T6 verif.

## Review #1
- T0 faltando: confirmar enum ReportDomain. FEITO: `producao` NÃO é domínio →
  tool será `sempreVisivel` (padrão de `producao_status_dominio`). Factory
  honest-tool precisa suportar tool sem `dominio` + `sempreVisivel`.
- Migration: usar `prisma migrate deploy` (fix permanente), nunca resolve manual.

## v2 / Review #2
- Tool sempreVisivel afeta a contagem de TODAS as roles no integration test
  (cada role vê +1). Não hardcodar números no escuro: rodar jest e corrigir o que
  ele apontar (estratégia usada no B3/B4).
- `tempo` (monetary) exposto cru, sem unidade inventada.

## v3 (FINAL)
**T0** , confirmado: `producao` não é ReportDomain → `sempreVisivel: true`.
**T1** , schema: `RawProducaoProcesso` (raw_producao_processo) + `FatoProducaoProcesso`
(fato_producao_processo: odooId, ordem, nome, descricao, tempo Decimal).
**T2** , migration aditiva via `prisma migrate deploy`.
**T3** , factory `makeHonestTool`: tornar `dominio` opcional + aceitar `sempreVisivel`.
**T4** , builder `fato-producao-processo.ts` + teste de map.
**T5** , tool `producao_processos` (sempreVisivel, honesta).
**T6..T10** , wiring: registry, FATO_FONTE, FATO_CATALOG ("Produção"),
MODEL_CATALOG (+1 -> 123), BI_SCHEMA_REFERENCE (+1), índice de tools (onde
registrar a tool de produção , avaliar: dominios-vazios ou novo índice produção).
**T11** , integration test: nova tool sempreVisivel → ajustar contagens (via jest)
+ adicionar ID à lista apropriada. model-catalog 122->123.
**T12** , verif: tsc/eslint/jest verdes + E2E (builder popula 1 linha + build_state).
**T13** , commit.

### Critério de saída
Suíte verde; fato no painel/BI; tool honesta sempreVisivel; E2E 1 linha + build.
