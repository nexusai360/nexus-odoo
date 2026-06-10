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
- [ ] **Fase 1 (PRÓXIMA) , Tabela de Regras + Faturamento por operação fiscal (CFOP/categoria).**
      - Tabela de regras parametrizável (CFOP → categoria/eh_receita/...), versionada + TDD.
      - Métrica `faturamentoPorOperacaoFiscal` (item.vr_produtos por CFOP e por categoria).
      - Tool MCP `fiscal_faturamento_por_operacao_fiscal`. Mantém `por_operacao` (natureza) limpa.
      - Reconciliação produtos×vr_nf.
- [ ] Fase 2 , Intercompany + receita consolidada externa (marcação + matriz + métrica/tool).
- [ ] Fase 3 , Ponte de reconciliação (tool `ponte_faturamento`).
- [ ] Fase 4 , Margem aproximada (preco_custo + ressalva).
- [ ] Futuro (bloqueado): DRE/lucro/EBITDA/caixa quando contábil/financeiro sincronizarem.

## Pendências paralelas (de antes, não perder)
- Issue 1 (natureza): limpar/consolidar a quebra `faturamento_por_operacao` (nome
  truncado/redundante). Pode ser subsumida pela Fase 1 (CFOP) + limpeza leve da natureza.
- Issue 2 (UI): rótulos específicos por tool em `src/lib/agent/progress-labels.ts`
  (ex.: "faturamento por empresa", "faturamento por operação") + animação ESCALONADA
  dos chips no reasoning trail (`src/components/agent/agent-message.tsx`). Causa: todo
  `fiscal_*` vira o mesmo rótulo "faturamento" → 2 tools viram 2 chips idênticos.

## Estado atual / próxima ação concreta
- FEITO: perícia (Fase 0) escrita; #79 (streaming) mergeado; branch em main.
- PRÓXIMO: escrever **SPEC v1 da Fase 1** em `docs/superpowers/specs/`, rodar as 2 reviews
  adversariais (subagentes Opus), gerar SPEC v3; depois PLAN v1 → 2 reviews → v3; execução.

## Verificação obrigatória (regra de raiz)
- Toda métrica/tool: TDD + E2E contra o cache REAL (subir/exercer, conferir números).
- Rebuild de container conforme CLAUDE.md §2.1 antes de validar (mcp para tools).
