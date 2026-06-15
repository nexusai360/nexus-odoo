# PLAN , Fase 5: `fiscal_faturamento_por_regime` (sobre SPEC v3)

> Execução TDD inline (Opus). Spec: `specs/2026-06-10-f5-faturamento-por-regime-design.md`.
> Duplo-check de implementação coberto pela review de arquitetura da spec (gates,
> migration, builder, store=false, ponte CNPJ). 1 review focada de ordering/atomicidade.

## Tasks (cada uma verificável isolada)

- **T1 , Schema + migration `dim_empresa_regime`.** Model Prisma novo
  (`cnpjRaiz String @id`, `regimeCodigo String`, `regimeLabel String`, `atualizadoEm DateTime`).
  Migration manual `prisma/migrations/<ts>_dim_empresa_regime/migration.sql` (CREATE TABLE +
  GRANT p/ roles MCP). Aplicar no dev via SQL direto (tabela nova = sem drift). `npx prisma generate`.
  Verif: `\d dim_empresa_regime` no cache + `migrate status` sem reset.

- **T2 , Helper de regime (puro, TDD).** `src/lib/fiscal/regime/regime.ts`:
  `REGIME_LABELS` (1→"Simples Nacional", 2→"Simples (excesso)", 3→"Lucro Presumido",
  3.1→"Lucro Real", 4→"MEI"); `cnpjRaiz(cnpj)` (só dígitos, 8 primeiros, tolerante a ZWJ/NB);
  `parseCnpjDoLabel(label)` (reusa/espelha `parseEmpresaNome`). Testes: Unicode ZWJ/hífen-NB, null.

- **T3 , Builder `dim-empresa-regime` (TDD com Odoo mockado).**
  `src/worker/fatos/dim-empresa-regime.ts`: leitura direcionada `searchRead("sped.empresa",[],
  ["id","regime_tributario","company_id"])`; parseia CNPJ do label `company_id`; reduz a raiz;
  **asserta 1 raiz→1 regime** (lança em divergência); upsert em `dim_empresa_regime`.
  Registrar em `FATO_BUILDERS` ciclo `snapshot`. Testes: mapa da discovery, assert divergência,
  golden `Cs(35156509)→3`. Rodar o builder real 1x p/ popular o dev.

- **T4 , Métrica `faturamentoPorRegime` (TDD).**
  `src/lib/metrics/fiscal/faturamento-por-regime.ts`: compõe sobre `_itens-venda-grupo`
  (canônico), agrupa por empresa → cnpjRaiz(parseEmpresaNome) → join `dim_empresa_regime`,
  agrega por regime `{regime_codigo,label,receitaIndividual,receitaExterna,qtdEmpresas,
  qtdNotas,empresas[]}` + `regime_nao_mapeado` (valor+cobertura%) + `regimeSnapshotAtual`.
  `cnpj=null`→não_mapeado. Default período ano corrente. Testes: agregação, bucket, cobertura.

- **T5 , Tool + formatador.** `mcp/tools/fiscal/faturamento-por-regime.ts` (ToolEntry+withFreshness+
  período); `fmtFaturamentoPorRegime` em FORMATADORES (`mcp/lib/responder.ts`) com ressalva honesta
  (regime ATUAL; individual inclui intragrupo; sem lucro). Barrel `mcp/tools/fiscal/index.ts`.
  Trigger ESTRITO em `tool-triggers.data.ts`. embeddingText ≥25.

- **T6 , Gates de catálogo.** Atualizar TODAS as asserções de contagem em `integration.test.ts`
  (ler nºs exatos: read+1, total+1, bucket fiscal+1), golden `cov-`, regenerar
  `mcp-catalog-snapshot.json` (`npm run gen:mcp-catalog`), embedding-text. tsc raiz+mcp.

- **T7 , E2E real + verificação.** `src/lib/reports/__tests__/e2e/f5-regime.e2e.ts`:
  `Σ receitaIndividual == receitaConsolidada.receitaIndividualTotal`; `Σ receitaExterna ==
  receitaConsolidada.receitaExterna`; cobertura≥99,5%; regimes == mapa discovery.
  Rebuild app+mcp+worker (§2.1) + smoke da tool. **jest COMPLETO** + conferência fiscal verdes.

- **T8 , PR + merge** (autorizado; deploy calmo estável). STATUS/HISTORY.

## Ordem/dependências
T1→T2→T3→(T4 depende T3 populado)→T5→T6→T7→T8. T2 paraleliza com T1.

## Riscos
- Migration: tabela nova = baixo risco; aplicar SQL direto no dev, migration file p/ prod.
- store=false: já provado que `searchRead` direcionado traz o regime.
- Rebuild: worker via `docker compose build app` (não `build worker`).
