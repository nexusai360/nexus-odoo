# PROGRESSO , Milestone Financeiro + Fase 5 (regime tributário)

> Ponto de retomada (modo autônomo, autorizado pelo usuário 2026-06-10: "faça todo
> o mapeamento do financeiro + a Fase 5, me chame quando terminar").
> Ler junto: `docs/superpowers/research/2026-06-10-financeiro-regime-discovery.md`.
> Branch: `feat/nex-reconstrucao` (worktree). Deploy já estável (deploy calmo).

## Escopo recalibrado pela DISCOVERY (regra de raiz #6)
- **Financeiro JÁ está construído** (~14 tools ativas no catálogo, fatos populados e
  sincronizando). Trabalho = VERIFICAR E2E contra cache real + lacunas + descoberta.
  NÃO rebuild.
- **Fase 5 (regime) é construível**: `sped.empresa.regime_tributario` existe e está
  preenchido no Odoo (1=Simples, 2=Simples excesso, 3=Presumido, 3.1=Real, 4=MEI),
  só não sincronizamos. Build = sync + de-para CNPJ→regime + `fiscal_faturamento_por_regime`.
- **Bloqueado/fora:** DRE/lucro/EBITDA (contábil vazio na fonte, `raw_contabil_lancamento=0`).

## Roadmap (cada frente = ciclo da metodologia)
- [x] **Discovery** (financeiro + regime) , dado real confrontado. DOC escrito.
- [ ] **Frente A , Financeiro (verificação + lacunas):**
  - [ ] Inventário fino das 14 tools (o que cada uma cobre) + checar se há lacuna real
        (por cliente/fornecedor, por centro de resultado, recebido x previsto).
  - [ ] E2E contra cache real: cada tool bate com SQL independente (a receber aberto
        R$64,2mi / a pagar aberto R$394,8mi / vencidos / fluxo de caixa).
  - [ ] Construir só as lacunas reais (se houver), no padrão honesto.
- [ ] **Frente B , Fase 5 (regime):**
  - [ ] SPEC v1 → 2 reviews adversariais Opus (validadas no cache) → v3.
  - [ ] PLAN v1 → 2 reviews → v3.
  - [ ] Execução TDD: sync `regime_tributario` (sped.empresa) → cache; de-para
        CNPJ→regime; métrica `faturamentoPorRegime` (reusa camada canônica
        `_itens-venda-grupo`/`receitaConsolidada`); tool `fiscal_faturamento_por_regime`
        + formatador + trigger + registro no catálogo + integration.test count.
  - [ ] E2E real (números cravados por regime), conferência + jest COMPLETO, rebuild mcp.
  - [ ] PR + merge (autorizado; deploy calmo estável).
- [ ] Atualizar STATUS/HISTORY; chamar o usuário com resumo final.

## Dado real (cravado na discovery)
- Regime por empresa: Lucro Real = Jds, Jht SP; Presumido = Cs, Ijht Premium Car,
  Jht DF; Simples = JHT Brasília, Jib, Jmf, Ks. (medido em sped.empresa ao vivo.)
- Financeiro: a receber aberto R$64,2mi (2.676 tit, 318 vencidos); a pagar aberto
  R$394,8mi (3.856, 3.385 vencidos); fato_financeiro_titulo 8.389, movimento 13.401.

## Estado atual / próxima ação
- FEITO: discovery (DOC + script `scripts/discovery/regime-tributario.ts`), PROGRESSO.
- FEITO: **SPEC v1 → 2 reviews adversariais Opus (fiscal + arquitetura) → SPEC v3**
  (`docs/superpowers/specs/2026-06-10-f5-faturamento-por-regime-design.md`). As reviews
  acharam 2+2 BLOCKERs materiais, todos endereçados na v3 (resumo na §0 da spec).
- PROVAS no dado real fechadas (decisivas p/ execução):
  - `regime_tributario` é `store=false` → vem por **leitura direcionada** (`search_read`
    fields explícitos `["id","regime_tributario","company_id"]`); NÃO tocar `field-selection` global.
  - **Ponte CNPJ:** `sped.empresa.company_id`/`participante_id` trazem o CNPJ no label, mesmo
    formato do `empresaNome` do fato → `parseEmpresaNome` casa por dígitos. **1 raiz→1 regime** confirmado.
  - **Mapa CNPJ-raiz → regime (cravado):** Simples=07390039/33718546/34461908/45424185;
    Presumido=10557556/35156509/62673999; Real=18282961/34161829.
  - **Base única:** compor sobre `_itens-venda-grupo` (canônico, pós-F2.5); reconciliar contra
    `receitaConsolidada` (individual E externa por regime). NÃO usar faturamento-por-empresa (vrNf+natureza).
- FEITO: **PLAN** (`plans/2026-06-10-f5-faturamento-por-regime-plan.md`).
- FEITO: **T1** schema + migration `dim_empresa_regime` (aplicada no dev, resolve --applied, prisma generate). commit 87d8350.
- FEITO: **T2** helper `src/lib/fiscal/regime/regime.ts` (REGIME_LABELS, regimeLabel, cnpjRaiz; 7 testes). commit 03efa99.
- FEITO: **T3** builder `src/worker/fatos/dim-empresa-regime.ts` (`mapearRegimePorRaiz` puro 5 testes +
  `rebuildDimEmpresaRegime(prisma,odoo)` leitura direcionada) + CLI `scripts/build-dim-empresa-regime.ts`.
  **dim populado no dev: 9 raízes** (07390039→1, 10557556→3, 18282961→3.1, 33718546→1, 34161829→3.1,
  34461908→1, 35156509→3, 45424185→1, 62673999→3). commit 5db25ce.
- **PRÓXIMO , T4** métrica `src/lib/metrics/fiscal/faturamento-por-regime.ts`: compor sobre
  `_itens-venda-grupo.ts` (canônico; tem empresaId/empresaNome + marcação intragrupo por item),
  por empresa → `parseEmpresaNome(empresaNome).cnpj` → `cnpjRaiz` → join `dimEmpresaRegime` →
  agrega por regime `{regimeCodigo,regimeLabel,receitaIndividual,receitaExterna,qtdEmpresas,qtdNotas,
  empresas[]}` + bucket `regime_nao_mapeado` (valor+cobertura%) + `regimeSnapshotAtual`. cnpj=null→não_mapeado.
  TDD. **Invariantes E2E (T7):** Σ receitaIndividual == receitaConsolidada.receitaIndividualTotal;
  Σ receitaExterna == receitaConsolidada.receitaExterna; cobertura≥99,5%.
- **T5** tool `mcp/tools/fiscal/faturamento-por-regime.ts` + `fmtFaturamentoPorRegime` (FORMATADORES,
  ressalva honesta: regime ATUAL; individual inclui intragrupo) + barrel `mcp/tools/fiscal/index.ts` +
  trigger ESTRITO `tool-triggers.data.ts` + embeddingText≥25.
- **T6** gates catálogo: TODAS asserções de contagem em integration.test (read+1, total+1, bucket fiscal+1),
  regen `npm run gen:mcp-catalog` (mcp-catalog-snapshot.json), golden cov-, tsc raiz+mcp.
- **T7** E2E real `src/lib/reports/__tests__/e2e/f5-regime.e2e.ts` (invariantes acima) + rebuild app+mcp+worker
  (§2.1, worker via `docker compose build app`) + smoke + jest COMPLETO + conferência fiscal.
- **T8** PR+merge (deploy calmo estável) + STATUS/HISTORY.
- **WIRING PROD (pendência T3):** dim populado por CLI; em prod rodar a CLI 1x pós-deploy (regime é
  estático). Refinamento opcional: wirar no ciclo snapshot (FATO_BUILDERS é prisma-only; precisa de odoo →
  achar a orquestração do snapshot). Documentar no runbook.
- Depois de F5: **verificação do FINANCEIRO** (14 tools já existem; E2E contra cache real + lacunas). Chamar usuário no fim.

## Verificação obrigatória (regra de raiz)
- TDD + E2E contra cache real; rebuild mcp (CLAUDE.md §2.1) antes de validar; jest COMPLETO + conferência antes do push.
