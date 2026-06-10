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
- PRÓXIMO: inventário fino do financeiro (ler as 14 tools, mapear cobertura/lacuna) e,
  em paralelo conceitual, SPEC v1 da Fase 5 (regime). Seguir metodologia §6.

## Verificação obrigatória (regra de raiz)
- TDD + E2E contra cache real; rebuild mcp (CLAUDE.md §2.1) antes de validar; jest COMPLETO + conferência antes do push.
