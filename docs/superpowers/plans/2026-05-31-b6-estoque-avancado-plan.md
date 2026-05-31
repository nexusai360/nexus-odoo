# PLAN , B6 Estoque avançado (mín/máx)

> Sobre SPEC v3. PLAN v1 → review #1 → v2 → review #2 → v3.

## v1 → reviews
- Escopo enxuto (1 fato + 1 tool estoque). Domínio estoque válido → sem
  sempreVisivel, sem churn de todas as roles (só ESTOQUE_IDS +1).
- Review: confirmar se `estoque.minimo.maximo` já tem raw/está no MODEL_CATALOG
  (T0), para não duplicar (lição do B3/B5). Migration via `prisma migrate deploy`.
- Review: builder usa relNome para produto/local/unidade (m2o) , legibilidade.

## v3 (FINAL)
**T0** , checar se `raw_estoque_minimo_maximo` existe e se `estoque.minimo.maximo`
está no MODEL_CATALOG. Se não, adicionar ao catálogo + criar raw na migration.
**T1** , schema: FatoEstoqueMinMax (+ raw se necessário).
**T2** , migration aditiva via deploy.
**T3** , builder `fato-estoque-minimo-maximo.ts` + teste.
**T4** , query `estoque-minimo-maximo.ts` (query + count).
**T5** , tool `estoque_minimo_maximo` (dominio estoque) via makeHonestTool.
**T6** , registrar no índice estoque.
**T7..T10** , wiring: registry, FATO_FONTE, FATO_CATALOG ("Estoque"),
MODEL_CATALOG (se raw novo), BI_SCHEMA_REFERENCE.
**T11** , testes: integration (ESTOQUE_IDS +1; super_admin 90->91, bruto 99->100,
manager 27->28, viewer-estoque 13->14); model-catalog (+1 se raw novo).
**T12** , verif: tsc/eslint/jest + E2E (0 linhas + build). **T13** commit.

### Critério de saída
Suíte verde; fato no painel/BI; tool honesta gated em estoque; E2E 0 + build.
