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
