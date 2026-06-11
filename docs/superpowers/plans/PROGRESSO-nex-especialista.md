# PROGRESSO , Milestone "Nex Especialista"

> Ponto de retomada entre sessões. Modo autônomo TOTAL autorizado pelo usuário
> (2026-06-11: "resolve isso tudo aí, confio em vc"; redesenhar o que precisar;
> orçamento LLM sem teto rígido , qualidade decide, custo desempata).
> Ler junto: SPEC v3 `docs/superpowers/specs/2026-06-11-nex-especialista-design.md`
> e LAUDO `docs/superpowers/research/2026-06-11-laudo-forense-agente-nex.md`.
> Branch: `feat/nex-reconstrucao` (worktree).

## Grafo de fases
A0 (instrumentação) → A1 (A/B preliminar + troca) → B (contrato de lista) →
C (filtros/composição) → A2 (A/B confirmatório) → D (prompt 2.0) → E (blindagem).
Cada fase: plano próprio (bite-sized) + 2 reviews quando material → execução TDD
→ E2E real → commit atômico → atualizar ESTE arquivo.

## Estado
- [x] LAUDO forense completo (commit 9fd47f9) , causas: modelo mini, listas sem
  contrato (84 tools, só 3 declaram ordenação), filtros faltantes, prompt-remendo.
- [x] SPEC v1 → 2 reviews adversariais Opus (18 achados, 3 BLOCKERs) → **SPEC v3**.
  Achados-chave aplicados: golden atual NÃO roda LLM (chama tool.handler direto);
  só 4/124 kpiOuro; gate de contrato deve ser incremental; AutoValidator integrado;
  composição multi-eixo + follow-up contextual no escopo; A/B roda 2x (A1/A2).
- [x] **Fase A0 , Instrumentação** (commit 708f4cb):
  - [x] A0.3 pre-flight: OpenAI ok; OpenRouter SALDO ZERO (testar Claude exige
        o usuário creditar; slug certo é anthropic/claude-sonnet-4.6 / opus-4.7 /
        opus-4.8 , o catalog.ts interno tem sonnet-4.7 que NÃO existe lá).
  - [x] A0.1 harness scripts/ab-cerebro.ts (runAgent+llmOverride, canal backtest,
        kpiOuro AO VIVO via fonteOuroSql, juiz alucinação via resultPreview novo
        no evento tool_result, custo end-to-end, toolsAceitas). Juiz calibrado.
  - [~] A0.2 kpiOuro: 4 casos com SQL-vivo; expandir para ≥60 segue pendente.
- [x] **Fase A1 , VEREDITO: MANTER gpt-5.4-mini.** A/B 60 casos:
  mini 83,3% tool / 4-4 kpi / 5 haluc / $0,0055 / 13,3s;
  gpt-5.4 81,7% / 4-4 / 6 haluc / $0,0384 (7x) / 20,0s.
  **Os 10 erros de seleção são IDÊNTICOS nos 2 modelos (interseção 100%) =
  estruturais, modelo não resolve.** Decomposição: ~6 são golden ruim
  (perguntas-placeholder "Consulta: servico buscar" sem termo , o router ATÉ
  ofereceu a tool; consertar o GOLDEN); ~4 são seleção entre tools irmãs
  (contabil_plano_de_contas × contabil_estrutura_conta → toolsAceitas/triggers).
  Anthropic não testado (OpenRouter 402, saldo 0; max_tokens 65536 do adapter
  agrava). Detalhes: docs/superpowers/research/ab-cerebro/*.json.
- [~] **Fase B , contrato de lista (EM CURSO):**
  - [x] Task-zero auditoria deterministica (78 tools com lista; doc
        2026-06-11-auditoria-contrato-lista.md). Gate incremental criado
        (mcp/__tests__/contrato-lista.test.ts + allowlist contrato-lista.data.ts).
  - [x] B.1 caso forense #1: financeiro_titulos_vencidos (orderBy valor desc +
        ordenadoPor + topMaiores + formatador declara). E2E real ✓ (d1f45b4).
  - [x] FINANCEIRO 12/12 migrado (af566ea). Allowlist 77→66.
  - [~] FISCAL (26 tools) + ESTOQUE/COMERCIAL/CADASTROS: 2 subagentes em
        paralelo (briefing com padrao canonico; allowlist integrada pelo
        orquestrador ao final).
  - [ ] B.6 AutoValidator enquadramento de lista (inline, em curso).
  - [ ] B.7 embeddingText audit das monetarias.
  - [ ] Demais dominios (contabil, sped, preco, servico, producao...) + esvaziar allowlist.
- [ ] Fase C , filtros + composição multi-eixo + follow-up (mineração das razoes).
- [ ] Fase A2 , A/B confirmatório.
- [ ] Fase D , prompt 2.0 + AutoValidator atualizado.
- [ ] Fase E , golden gate pre-push + métricas no STATUS.

## Fatos úteis (cravados na perícia de hoje)
- Modelo ativo: gpt-5.4-mini; custo p50 US$0,0044/turno; janela 12 msgs;
  router ativo (threshold 0.3, topK 3, oferta média 47-65 tools).
- Perícia: maio 69,6% correto; votos usuário 8/9 negativos.
- Caso forense #1: financeiro_titulos_vencidos sem orderBy nem topMaiores →
  "10 maiores" falsos (real: Johnson R$170,8mi). queryTitulosVencidos
  (src/lib/reports/queries/financeiro.ts) e handler são os alvos da Fase B.1.
- Truncagem real vive no guardToolResult (run-agent.ts ~141-189; 30/10 itens).
- Já corrigido em prod hoje: #94 cold start (batch embeddings), #95 financeiro
  provisorio + reconcile 3h (fantasmas R$172,7mi se autopurgam).
- Dev local: rodar `npm run dev:fresh` na pasta principal para o next dev pegar
  o código novo (o turno de 64,5s do print era processo velho).
