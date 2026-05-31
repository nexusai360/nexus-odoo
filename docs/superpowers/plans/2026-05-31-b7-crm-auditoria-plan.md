# PLAN , B7 CRM + Auditoria

> Sobre SPEC v3. PLAN v1 → review #1 → v2 → review #2 → v3.

## v1 → reviews
- T0: crm.pipeline e auditoria.regra são novos (raw+catálogo+fato). Confirmado.
- 2 fatos, 2 tools. crm tool gated (dominio crm); auditoria tool sempreVisivel
  (auditoria não é ReportDomain) → +1 em todas as roles no integration test
  (como B5). crm tool → CRM_IDS +1 (só roles com crm).
- Migration via prisma migrate deploy. Builders com relNome onde houver m2o.
- auditoria.log/.item NÃO entram (14 MI). Garantir que NÃO são adicionados ao
  MODEL_CATALOG (senão o worker tentaria sincronizar 14 MI).

## v3 (FINAL)
**T1** schema: RawCrmPipeline + RawAuditoriaRegra + FatoCrmPipeline + FatoAuditoriaRegra.
**T2** migration aditiva (2 raw + 2 fato) via deploy.
**T3** builders fato-crm-pipeline.ts + fato-auditoria-regra.ts + testes.
**T4** queries crm-pipeline.ts + auditoria-regra.ts.
**T5** tools: crm_pipeline_funis (dominio crm), auditoria_regras (sempreVisivel).
**T6** índices: crm tool no índice crm; auditoria → novo índice mcp/tools/auditoria
+ registro no catálogo.
**T7..T10** wiring: registry, FATO_FONTE, FATO_CATALOG ("CRM"/"Auditoria"),
MODEL_CATALOG (+2: crm.pipeline, auditoria.regra , NÃO log/.item),
BI_SCHEMA_REFERENCE (+2).
**T11** testes: integration (auditoria_regras sempreVisivel → todas roles +1;
crm_pipeline_funis → CRM_IDS +1, super_admin +2 no total -> ajustar via jest);
model-catalog +2.
**T12** verif tsc/eslint/jest + E2E (crm 0+build, auditoria 15+build). **T13** commit.

### Critério de saída
Suíte verde; 2 fatos no painel/BI; auditoria.log/.item fora; E2E confirma 0 e 15.
