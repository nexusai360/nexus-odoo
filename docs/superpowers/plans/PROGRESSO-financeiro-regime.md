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
- PRÓXIMO: **PLAN v1 → 2 reviews → PLAN v3** (tasks TDD: migration manual `dim_empresa_regime` →
  builder direcionado `FATO_BUILDERS` ciclo snapshot → métrica `faturamentoPorRegime` → tool+fmt+triggers
  estritos → gates de catálogo enumerados → E2E real + rebuild app+mcp+worker §2.1 + jest COMPLETO →
  PR+merge). Depois: verificação do FINANCEIRO (E2E das 14 tools existentes + lacunas). Chamar usuário no fim.

## Verificação obrigatória (regra de raiz)
- TDD + E2E contra cache real; rebuild mcp (CLAUDE.md §2.1) antes de validar; jest COMPLETO + conferência antes do push.
