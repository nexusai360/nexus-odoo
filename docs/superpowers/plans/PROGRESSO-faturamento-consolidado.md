# PROGRESSO , Milestone Faturamento Real Consolidado

> Ponto de retomada desta frente (modo autônomo). Atualizar a cada bloco/commit.
> Ler junto: `docs/superpowers/research/2026-06-09-pericia-faturamento-consolidado.md`
> (perícia/Fase 0, fundação) e `CLAUDE.md` (metodologia §6).

## Contexto / autorização
- Usuário colocou a sessão em **modo autônomo total** (2026-06-09): construir o
  subsistema de faturamento real consolidado seguindo a metodologia (spec → 2 reviews
  → spec v3 → plan → 2 reviews → plan v3 → execução TDD → verificação), corrigir bugs
  sozinho, mergear, e só chamar o humano quando 100%. Heartbeat ~15min. No ~80% de
  contexto: rodar `agente handoff "<prompt>"` pra abrir nova sessão e continuar.
- Branch: `feat/nex-reconstrucao` (resetada para `main` após merge do #79 streaming).

## Decisões canônicas (assumidas, documentadas na perícia §7)
- Intercompany: aparece no individual, ELIMINADO no consolidado (CPC 36).
- Bonificação: não é receita por padrão (categoria própria, parametrizável).
- Base "por operação": valor dos PRODUTOS por CFOP + reconciliação ao vr_nf.
- CFOP é a fonte canônica de operação (natureza do ERP é truncada/redundante).
- Limite duro: SEM contábil (fato_contabil_lancamento vazio) → sem DRE/lucro/EBITDA.
  Margem só aproximada (preco_custo, 79% cobertura). Não inventar lucro.

## Achado que justifica tudo
- Intercompany = R$ 440,4 mi (3.801 notas, ~24% do bruto). Externo = R$ 1,42 bi.
  Somar nota ingenuamente infla ~24%.

## Roadmap (cada fase = ciclo completo da metodologia)
- [x] Fase 0 , Perícia + viabilidade + tabela de regras (conceito). DOC escrito.
- [x] **Fase 1 , Tabela de Regras + Faturamento por operação fiscal (CFOP/categoria). CONCLUÍDA 2026-06-09.**
      - Tabela de Regras `src/lib/fiscal/regras/` (tipos/extrair/mapa/prefixo/classificar), 18 testes.
      - Métrica `faturamentoPorCfop` evoluída (item.vr_produtos, groupBy, agruparPor cfop|categoria,
        totalReceita/totalNaoReceita, semCfop, reconciliação). Tool `fiscal_faturamento_por_cfop`
        EVOLUÍDA (não nova) + formatador `fmtFaturamentoPorCfop` (2 ramificações + gap).
      - E2E real verde: total R$ 1,858 bi, receita R$ 1,316 bi (70,8%), semCfop R$ 23,3 mi,
        reconciliação 0,0061%. 7 regressões fiscais travadas. RADAR R-base-cfop.
      - Próximo passo desta fase: PR + merge (autorizado); depois Issue 2 (UI) em PR próprio.
- [~] **Fase 2 (EM ANDAMENTO) , Intercompany + receita consolidada externa.**
      - SPEC v1 → 2 reviews adversariais (fiscal + arquitetura, Opus, validadas no cache real)
        → **SPEC v3 PRONTA**: `docs/superpowers/specs/2026-06-09-f2-intercompany-receita-consolidada-design.md`.
      - Achados materiais aplicados (resumo na §0 da spec):
        - Marcação intercompany em CASCATA (documentoDigits do parceiro → fallback CNPJ do
          participante_nome → RAIZES_GRUPO). A def. só por doc PERDIA ~R$ 239 mi: via doc =
          3.801 notas/R$ 440,4 mi; via doc OU nome = 6.230 notas/R$ 679,5 mi (medido no dado).
        - Separar `intercompanyBrutoVrProdutos` (auditoria) de `receitaIntragrupoEliminavel`
          (~R$ 418 mi, só ehReceita) de `receitaExterna` (~R$ 898 mi). CPC 36 elimina só o leg de venda.
        - NADA de `$queryRaw`: DUAS QUERIES NATIVAS + join em memória (groupBy item por
          documentoId+cfopId + findMany notas), classificar por id-representante (igual F1),
          Number(Decimal), COUNT distinct nota. Sem migration.
        - Devolução (deduz) = entrada CFOP deduzReceita, NÃO finalidade=4 saída → vai pra Fase 3.
      - PLAN v1 → 2 reviews adversariais (Opus, validadas no cache) → PLAN v3
        (`docs/superpowers/plans/2026-06-09-f2-intercompany-receita-consolidada-plan.md`).
        Achados aplicados: cascata Unicode-tolerante (ZWJ/NB-hyphen) + gate 14 díg no CNPJ;
        E2E trava valores absolutos; testes dos 2 formatadores + allowlist real.
      - EXECUÇÃO TDD COMPLETA (Tasks 1-9): src/lib/fiscal/grupo/ (raízes+cnpj+participantes, 11
        testes), métricas receitaConsolidada e matrizIntercompany (sem queryRaw), 2 tools + 2
        formatadores + triggers. tsc 0, 327 testes verdes, mcp rebuildado.
      - **E2E real verde (números cravados):** receita externa = R$ 896.975.881,31; intragrupo
        eliminável = R$ 418.831.109,29 (31,8%); receita individual = R$ 1.315.806.990,60
        (== F1.totalReceita, reconciliação EXATA); intercompany bruto = R$ 719,2 mi; 6.339
        notas intra (a correção Unicode capturou +109 notas que escapavam). Matriz: 70 pares.
      - **PRÓXIMO: PR + merge.** Depois Fase 3.
- [x] **Fase 2.5 (CONCLUÍDA 2026-06-10) , Unificação + Confiabilidade.** Metodologia completa:
      SPEC v1 → 2 reviews adversariais Opus (validadas no cache) → SPEC v3 → PLAN v1 → 2 reviews → PLAN v3
      → execução TDD inline. Specs/plans: `docs/superpowers/{specs,plans}/2026-06-10-f2.5-unificacao-faturamento-*`.
      **Entregue:**
      1. **Unificação das 2 definições (R-faturamento-duas-definicoes FECHADO):** `fiscal_faturamento_periodo`,
         `_por_cliente`, `_mensal_serie` repontadas para a camada canônica (base `item.vrProdutos` + Tabela de
         Regras + eliminação intercompany). **`faturamento_periodo` grupo 2025 = R$ 325,5 mi** (era R$ 551,2 mi,
         **+69% inflado CONSERTADO**). Headline: grupo → receita externa real (CPC 36); empresa → individual da
         CNPJ com **paridade externa/intragrupo + flag "concentrador"** quando %elim>50% (ex.: Jds Matriz 94,8%).
         Core compartilhado `src/lib/metrics/fiscal/_itens-venda-grupo.ts` (groupBy + marcação por nota, sem
         $queryRaw); `receitaConsolidada` refatorada sobre o core com **saída idêntica** (conferência I3/I4 ao
         centavo nos 5 períodos). 2 métricas novas: `faturamentoSerieMensal`, `faturamentoPorClienteCanon`.
      2. **Blindagem intercompany (R-intercompany-fallback-fragil FECHADO):** `PARTICIPANTES_GRUPO_WHITELIST`
         (15 ids validados no cache: 2,9,10,11,12,13,14,15,16,19,20,21,22,23,24; excluídos os reciclados
         8722/8723/9552/7719). `ehNotaIntragrupo` agora whitelist→cadastro→nome. Delta = R$ 0 (blindagem, não
         correção; o fallback de nome já pegava tudo). Sentinela S0 (gate) prova que a eliminação nunca reduz
         abaixo do baseline pré-whitelist; S1 residual só-por-nome caiu para 2025=0 / acum=109 (whitelist cobriu).
      3. **Fix de período (R-periodo-acumulado FECHADO p/ Grupo B):** `resolverPeriodoFiscal` (default ano
         corrente) aplicado nas 7 tools do Grupo B (notas_emitidas, impostos_periodo, produtos_faturados,
         nao_autorizado, por_operacao, por_empresa, recebido). `contar_notas` EXCLUÍDO (sem período; ouro-fiscal-01
         crava 49.427). Grupo C (dfe/notas_recebidas) deixado sem default ano corrente (decisão: não esconder
         pendência antiga).
      **Conferência expandida:** S0/S3/S4 (gates) + S1/S2 (alertas) + `checkBanda`/`checkGte`. Todos verdes.
      **Verificação:** jest COMPLETO verde (380 suites / 2838 testes, inclui integration.test 104 tools,
      golden-schema, frozen-30); `f2-receita-consolidada.e2e.ts` bandas absolutas verdes; smoke test dos handlers
      contra cache real OK; mcp rebuildado. `f4-baseline` NÃO regravado (drift de dado do cache desde a última
      gravação; não é gate de CI; correção provada pela conferência exata + f2 E2E + jest).
      **DEFERIDO p/ Fase 2.6:** transparência sem-CFOP + 5949/6949 por finalidade (R-sem-cfop-transparencia) e as
      9 checagens restantes da conferência (R-conferencia-fiscal-expandir).
- [x] **Fase 2.6 (CONCLUÍDA 2026-06-10) , Transparência sem-CFOP + Confiabilidade da conferência.**
      Metodologia completa (spec v3 + plan v3, 2 reviews adversariais cada, validadas no cache). Specs/plans:
      `docs/superpowers/{specs,plans}/2026-06-10-f2.6-transparencia-conferencia-*`.
      - **Transparência (R-sem-cfop-transparencia FECHADO):** `faturamentoPorCfop` ganhou (aditivo)
        `semCfopPorFinalidade` (fin1 venda candidata R$ 11,84mi / fin4 devolução R$ 11,46mi) e
        `outrasNaoEspecificadas` (5949/6949). Formatador exibe 2 linhas com **rótulo honesto** ("substância a
        confirmar", não "venda escondida" , a auditoria provou que "outras" é majoritariamente não-venda).
        `semCfop` preservado; observação de reconciliação corrigida (notas sem item, não "tolerância").
      - **Conferência (R-conferencia-fiscal-expandir FECHADO):** +C1-C6 + primitivas `checkPct`/`checkBandaValor`.
        C1 órfãos base receita (gate ==0); C2 item vs cabeçalho-notas-sem-item (gate <0,01%, fecha ao centavo);
        C3 sentinela CFOP novo em "outras"; C4a inversão receita×natureza (R$ 906k); C5 log; C6 notas sem item (101).
      - **Verificação:** conferência (I1-I5+S0-S4+C1-C6) todos gates verdes; jest COMPLETO verde (380 suites /
        2841 testes; 104 tools/golden/frozen-30); smoke test da tool com as 2 linhas; mcp rebuildado. f4-baseline
        não regravado (drift de dado, não é gate CI).
- [x] **Fase 3 (CONCLUÍDA 2026-06-10) , Ponte de reconciliação (`fiscal_ponte_faturamento`).**
      Spec v3 + 2 reviews adversariais (validadas no cache). Tool NOVA (104→105) que compõe as métricas
      canônicas num waterfall: bruto → (−) não-receita por categoria → receita individual → (−) intragrupo
      eliminado → receita externa real. Métrica `ponteFaturamento` (compõe `faturamentoPorCfop` +
      `receitaConsolidada`, invariante `reconciliado`); tool + `fmtPonteFaturamento` (registrado em
      FORMATADORES) + flag concentrador por empresa; integration.test 105/114; entrada golden `cov-`; trigger;
      snapshot regenerado. E2E real: 2025 bruto R$ 659,6mi → externa R$ 325,5mi (reconciliado=true). jest
      COMPLETO verde (381 suites/2843); conferência gates verdes; mcp rebuildado + smoke test.
- [ ] ~~Fase 3~~ (movida acima, concluída).
- [x] **Fase 4 (CONCLUÍDA 2026-06-10, MILESTONE FECHADO) , Margem bruta aproximada (`fiscal_margem_aproximada`).**
      Métrica `margemAproximada` (1 query agregada por cfop_nome, classificação `ehReceita` em TS, fonte única;
      receita venda − custo Σqtd×preco_custo; flag `custoDesatualizadoProvavel`). E2E real: 2025 margem 23,1% /
      cobertura 99,9%; acum 11,0% / 84,8% (não-confiável , custo snapshot). Tool nova 105→**106**: fmt em
      FORMATADORES com ressalva honesta (não-lucro), integration.test 106/115, golden `cov-`, trigger, snapshot.
      jest COMPLETO verde (382 suites/2845); conferência gates verdes; tsc limpo. PR + merge pendente.
- [x] ~~Fase 4 (em execução)~~ , concluída acima. SPEC v3:
      2 reviews aplicadas: `docs/superpowers/specs/2026-06-10-f4-margem-aproximada-design.md`. Design travado:
      métrica `margemAproximada` (1 query `$queryRawUnsafe` parametrizada, JOIN item→`fato_produto` por
      `produto_id=odoo_id`, agrega por `cfop_nome` + flag custo presente; classifica `ehReceita` em TS via
      `classificarCfop` , fonte ÚNICA, NÃO estender o core). Retorna receitaVendaTotal, receitaComCusto,
      custoEstimado(Σ qtd×preco_custo), margemBrutaAproximada, percentualMargem, coberturaCusto,
      `custoDesatualizadoProvavel`. **Default ano corrente** (custo é snapshot atual → margem de anos antigos
      é lixo; só recente confiável: 2025 margem 23,14%, cobertura 99,94%; acum 10,96% NÃO-confiável).
      Tool nova (105→**106**): registrar fmt em `FORMATADORES` (só lá); integration.test 5 asserts 105→106 +
      114→115 + 2 comentários; FISCAL_IDS; golden `cov-71`; trigger; snapshot regen. Ressalva honesta: "margem
      BRUTA aproximada, NÃO lucro; cobertura X%; inclui venda intragrupo". TDD; conferência + jest COMPLETO antes
      de push; rebuild mcp + smoke. PR + merge (autorizado) , FECHA o milestone.
- [ ] Futuro (bloqueado): DRE/lucro/EBITDA/caixa quando contábil/financeiro sincronizarem.

## Pendências paralelas (de antes, não perder)
- Issue 1 (natureza): limpar/consolidar a quebra `faturamento_por_operacao` (nome
  truncado/redundante). Pode ser subsumida pela Fase 1 (CFOP) + limpeza leve da natureza.
- Issue 2 (UI): rótulos específicos por tool em `src/lib/agent/progress-labels.ts`
  (ex.: "faturamento por empresa", "faturamento por operação") + animação ESCALONADA
  dos chips no reasoning trail (`src/components/agent/agent-message.tsx`). Causa: todo
  `fiscal_*` vira o mesmo rótulo "faturamento" → 2 tools viram 2 chips idênticos.

## Estado atual / próxima ação concreta
- FEITO: perícia (Fase 0); #79 (streaming) mergeado; branch em main.
- FEITO: **SPEC v1 → 2 reviews adversariais (fiscal + arquitetura, Opus) → SPEC v3**.
  Arquivo: `docs/superpowers/specs/2026-06-09-f1-faturamento-operacao-fiscal-design.md` (v3).
  As reviews acharam coisa material (resumo na §0 da spec). Achados-chave já incorporados:
  - **A tool/métrica de CFOP JÁ EXISTE** (`src/lib/metrics/fiscal/faturamento-por-cfop.ts`,
    `mcp/tools/fiscal/faturamento-por-cfop.ts`, `fmtFaturamentoPorCfop` em `mcp/lib/responder.ts`,
    trigger em `mcp/catalog/tool-triggers.data.ts`). DECISÃO: **EVOLUIR a existente**, não criar nova.
  - Base → `vr_produtos` (escolha do usuário; difere de vrNf do item em só R$28k). RADAR ao migrar.
  - `groupBy` nativo por `cfopId` (138.088 itens, 58 CFOPs, 364 nulos), não findMany.
  - Tabela de Regras curada em `src/lib/fiscal/regras/` (tipos/cfop-mapa/cfop-prefixo/extrair-cfop/
    classificar/index). Precedência: transferência/serviço/ativo/entrada/devolução ANTES de venda.
  - Regressões fiscais a travar com teste: 6152≠venda; 6202=devolução de COMPRA (não deduz);
    5933/6933=serviço (não remessa); entrega futura x922(false)+x117(true) não dobra; sem-CFOP
    R$23,3mi linha própria+alerta; venda_ativo 5551/6551 fora de faturamento de mercadoria.
  - Issue 1 (natureza) e Issue 2 (UI rótulos+stagger) SAÍRAM do escopo da F1 → PRs próprios.
- FEITO: **PLAN v1 → 2 reviews adversariais (fiscal + arquitetura, Opus, validadas no cache real)
  → PLAN v3**. Arquivo: `docs/superpowers/plans/2026-06-09-f1-faturamento-operacao-fiscal-plan.md`.
  Achados materiais aplicados (resumo na §0 do plano):
  - Credenciais DB reais: `nexus`/`nexus_odoo_l1` (a spec usava `postgres`/`nexus_odoo`, errado).
  - 3 buracos de classificação corrigidos no mapa+regex+teste: 6932 (serviço transporte, R$160k)
    caía em remessa; 5949/6949 (R$11,78mi "outra saída") caía em remessa → `outras`; 6918
    (devolução consignação) caía em remessa → `devolucao_compra`.
  - Números cravados com SQL real: reconciliação produto×nota = R$113.198,89/0,006% (spec dizia
    0,06%, corrigido); delta de base vrNf→vrProdutos = R$28.432,83/0,0015% (confirmado).
  - Teste do formatador cravado em `mcp/lib/responder.test.ts`; humanizeName removido; sem_cfop
    confirmado no union; contrato do formatador (_DESTAQUE+topLinhasJson) validado.
  - 7+ testes de regressão fiscal travados.
- **PRÓXIMO (em execução):** execução TDD INLINE (CLAUDE.md §6[8]) das Tasks 1-11 do PLAN v3:
  regras (tipos→extrair→mapa→prefixo→classificar) → métrica → tool → formatador → testes →
  curadoria+triggers+RADAR → E2E real + rebuild mcp (§2.1) → PR + merge (autorizado).
  Depois: Issue 2 (UI) em PR próprio; Fases 2-4 do roadmap.

## Verificação obrigatória (regra de raiz)
- Toda métrica/tool: TDD + E2E contra o cache REAL (subir/exercer, conferir números).
- Rebuild de container conforme CLAUDE.md §2.1 antes de validar (mcp para tools).
