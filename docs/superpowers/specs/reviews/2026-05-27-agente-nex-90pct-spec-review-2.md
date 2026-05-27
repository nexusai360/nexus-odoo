# Review #2 (mais profunda) — SPEC v2 Agente Nex ≥90%

**Reviewer:** Claude Code (Opus 4.7), modo crítico máximo
**Spec revisada:** SPEC v2
**Postura:** caçar o que a Review #1 deixou passar, o que v2 escondeu ao endereçar, e premissas que continuam frágeis mesmo após ajuste.
**Resultado:** **19 achados materiais**. v2 está melhor que v1 mas tem 6 CRIT que **impedem PLAN** sem v3.

---

## Achados críticos (CRIT — bloqueiam PLAN)

### CRIT-A: V2 anti-invenção está sub-especificado para ser implementável

> v2 § 3.1 A12 V2: "calcula somas, contagens, médias e percentuais plausíveis das linhas e verifica se o número bate dentro de ε=1%."

**Problemas técnicos:**
1. "Somas plausíveis" = quais subconjuntos? **Combinatorial explosion**: lista de 100 títulos tem 2^100 subconjuntos.
2. ε=1% — esse valor é chute. Se ε é muito frouxo, valida invenção próxima; se muito estrito, rejeita arredondamento de centavos.
3. "Médias" — média do quê? Da coluna `vrSaldo`? De `dataVencimento`? Spec não enumera colunas.
4. Para tool `comercial_pedidos_por_etapa` (linhas com `nome, totalPedidos, valorTotal`), o LLM pode dizer "419 pedidos não-cancelados" → o número é sub-soma do `totalPedidos` filtrando linhas com `etapa != "Cancelado"`. V2 precisa **enumerar TODOS os filtros possíveis** ou aceitar qualquer sub-soma. Inviável.

**Sem definição explícita, V2 não pode ser implementado.**

**Fix obrigatório (vai pra v3):**
- Definir conjunto **finito e enumerável** de "cálculos canônicos" por tool:
  - `SUM(vrSaldo)` para a lista inteira
  - `SUM(vrSaldo)` para top-K (K=5, 10, 20)
  - `COUNT(*)`, `COUNT(DISTINCT participanteNome)`
  - `AVG(vrSaldo)`, `MAX(vrSaldo)`, `MIN(vrSaldo)`
  - `SUM(vrSaldo) WHERE diasAtraso > 0`
  - `SUM(vrSaldo) WHERE participanteNome = X` (para cada participante presente)
- Lista por tool, hardcoded em `mcp/lib/responder.ts` junto com formatador.
- ε = R$ 0,01 + 0,1% (separa erro de centavo de erro real).
- Se número não bate em nenhum cálculo canônico **e não está em pergunta** → flagra.

---

### CRIT-B: "Subagent cego" não é cego — viés metodológico continua

> v2 § 6.4: "subagent Opus separado com prompt isolado, sem acesso ao laudo nem à spec."

**Problemas reais:**
1. **Subagent é spawn pelo mesmo orchestrator.** Mesma sessão, mesmo contexto da conversa anterior — Claude Code main agent já viu tudo. Garantir "sem acesso" exige `Agent` tool com prompt **explicitamente** isolado, sem passar contexto da conversa.
2. **Mesmo modelo (Opus 4.7).** Vieses sistêmicos do modelo são compartilhados entre o que escreveu o laudo, a spec e o que vai gerar R17.
3. **Briefing do judge sou eu que escrevo.** Não há blindagem real.

**Implicação:** R17 vai "concordar com a spec" porque foi produzido na mesma matriz cognitiva. Métrica de 85% pode ser fake.

**Fix obrigatório (vai pra v3):**
- **Opção A (forte):** humano (você, o usuário) escreve 30+ perguntas inéditas em produção e marca a área canônica. Subagent só gera 70 paráfrases dos R11-R16. Total ≥100.
- **Opção B (mais forte):** judge de R17 é **outro modelo** (GPT-4, Gemini) com briefing simplificado. Cross-check entre judges.
- **Opção C (mínima):** subagent é spawnado com `subagent_type=Explore` ou `Plan` (não-creative) e instrução de **só** ler `Conversation` rows de produção (title NULL) e reformular. Sem briefing v3 no contexto.

Spec atual implica opção C parcial. Não basta.

---

### CRIT-C: Tempo de implementação completamente ausente

> v2 § 9 sequencia 11 PRs sem mencionar duração.

**Problema:** sem orçamento de tempo, planejamento é opaco. Estimativa conservadora deste reviewer:
- Onda 1.A: 1-2 dias (framework + 4 helpers + testes).
- Onda 1.B-C: 2-3 dias (22 tools × ~30min/tool de implementação + testes).
- Onda 1.D: 1 dia.
- Onda 1.E: 2-3 dias (regex de V1-V4, testes contra 281 CORRETO + 17 ERRADO, retry no run-agent, schema delta, briefing v3).
- **Onda 1 total: 6-9 dias úteis** se executor for Opus solo (CLAUDE.md proíbe Sonnet).
- Onda 2: 1 dia.
- Onda 3: 2-3 dias (6 tools).

**Total: 9-13 dias de trabalho focado.** Importante alinhar antes de iniciar.

**Fix (v3):** adicionar tabela com estimativa por onda e por PR. Marca para reavaliação a cada PR concluído.

---

### CRIT-D: Briefing v3 do judge sem definição estrutural

> v2 § 3 Fora menciona "briefing v3 atualizado para mencionar `_RESPOSTA` e `retryReason`."

**Vagueza:** o que muda exatamente?
- Novos patterns positivos: `usou_resposta_canonica`, `usou_top_por_participante`.
- Novo pattern negativo: `ignorou_resposta_canonica` (quando `_RESPOSTA` existia e LLM gerou texto divergente em fatos).
- Como tratar `retryReason ≠ null`?
  - Se retry resolveu → judge avalia a resposta final como qualquer outra.
  - Se retry não resolveu mas LLM acabou citando o número correto → ainda é CORRETO?
  - Se retry foi falso positivo (V2 disparou mas resposta original estava certa) → como detectar?

**Fix (v3):** anexar briefing v3 completo à spec, com:
- 4 patterns novos.
- 3 regras claras de avaliação envolvendo `retryReason`.
- Hash do briefing congelado.

---

### CRIT-E: PR10 (Onda 1.E) tem dependência hard de PRs 2-9

> v2 § 9: PRs sequenciais, mas spec não bloqueia explicitamente.

**Problema:** PR10 adiciona auto-validator que **verifica `_RESPOSTA`/`_DESTAQUE`/`_agregado` nos tool results**. Se PR2-PR9 não foram mergiados ainda, tools não retornam esses campos, validator V1-V3 nunca dispara, V2 dispara sempre (todos números não-derivados são suspeitos).

**Implicação:** PR10 só faz sentido pós-1.D. Se merge-trem fica desordenado (PR10 antes de PR2), regressão fica caótica.

**Fix (v3):**
- PR10 deve ter `addBlockedBy: [PR1..PR9]` formal.
- Branch `feat/agente-nex-90pct` pode acumular tudo antes de PR final único.
- OU: cada PR é isolado e PR10 só é aberto quando PR9 mergiado.

---

### CRIT-F: Estimativa de cura ainda otimista

> v2 § 1.1: "Onda 1 → 78%, Onda 1.5 → 85%, Onda 2 → 89%."

**Análise mais cética:**
- Onda 1 cobre 30-50 casos / 21-35% **se cada fix curar perfeitamente o caso que ataca**. Mas:
  - V2 vai disparar em casos que não eram pra disparar (falsos positivos) — pode REGREDIR alguns CORRETO atuais.
  - LLM pode resistir a `_RESPOSTA` literal (prompt diz "use como base, pode adaptar" — janela pra divergir).
  - `topPorParticipante` ajuda 8 casos só se LLM o usar; sem regra explícita no prompt, ele pode ignorar.
- Realista: **+5 a +12 pp em Onda 1**, levando %CORRETO médio de 71% (R11-R16 média) para **76-83%**.
- Onda 1 + 1.5 (validator active + prompt fix data): +2 a +4 pp adicional → 78-87%.
- Onda 2 (prompt completo): +3 a +6 pp → 81-93%.
- Onda 3 (tools novas): +2 a +5 pp → 83-98% (com 6 tools cobrindo gap restrito).

**O alvo de 95% é viável APENAS com Onda 4 (tuning + few-shot).**

**Fix (v3):** banda realista (não single point) + critério de saída por onda mais brando inicialmente, mais rigoroso depois.

---

## Achados altos (HIGH — afetam corretude ou viabilidade)

### HIGH-G: 281 CORRETO é amostra estatisticamente pequena para garantir 0 FP de V2

> v2 § 6.1: "rodar validateResponse contra as 281 respostas CORRETO de R11-R16. 0 falsos positivos."

**Problema:** 281 amostras é OK para `±5% IC95`, mas em produção V2 vê 5000+ turnos/mês. Mesmo 0,5% de FP = 25 turnos/mês com retry indevido. Pior, alguns desses são CORRETO que viram retry → resposta retry pode degradar.

**Fix:**
- Critério adicional: rodar V2 contra **todos os 4914 CORRETO históricos** (rows pre-existentes da `ConversationQualityEvaluation` com `aderencia >= 4` da escala antiga, considerados acertos). FP rate ≤ 0,5% (≤ 25 falsos em 5000).
- Se exceder, ajustar regras antes de promover de shadow para active.

---

### HIGH-H: `_RESPOSTA` formatador exige decisão de design por tool — spec só mostra 1

> v2 § 4.2 dá apenas exemplo de `formatadorContasAPagar`. Restam ~24 formatadores indefinidos.

**Casos não-óbvios:**
- `estoque_top_movimentados`: lista, não totalizada. `_RESPOSTA` = `"Top {N} produtos mais movimentados no período: produto Y com Z movimentações..."`? Ou só `"N produtos movimentados, top Y é Z"`? Decisões abertas.
- `comercial_pedidos_por_etapa`: matriz com `etapa × {n, valor}`. `_RESPOSTA` em uma frase é difícil.
- `cadastro_buscar_parceiro`: pode trazer 1 ou 50 parceiros. `_RESPOSTA` varia.
- `bi_consulta_avancada`: SQL dinâmico — `_RESPOSTA` precisa inferir intent da consulta?

**Implicação:** spec subestima trabalho. Cada formatador é 20-40 minutos de design + teste.

**Fix:**
- Adicionar à v3 tabela com `_RESPOSTA` esqueleto para cada uma das 25 tools.
- Cada esqueleto: 1 sentence describing what `_RESPOSTA` deve dizer + lista de campos do `_DESTAQUE` usados.
- Sem isso, PLAN não consegue decompor em microtarefas.

---

### HIGH-I: Não há A/B test para isolar contribuição de cada validador

> v2 tem flags `validatorV{1-4}Enabled` mas não tem plano de medir cada um.

**Problema:** se V2 contribui 80% da melhoria e V1 contribui 5%, manter V1 é caro (latência) sem benefício. Sem A/B, decisão é cega.

**Fix (v3):**
- Antes de promover Onda 1 para active, rodar R17 4x em shadow:
  1. Só V1.
  2. Só V2.
  3. Só V3.
  4. Só V4.
- Identificar contribuição individual via diferença de `retryRate`.
- Decisão informada de quais ativar.

---

### HIGH-J: Lista de termos para V3 "sem tool" cresce sem mecanismo

> v2 § 3.1 A12 V3: "lista de termos: 'meta', 'margem', 'liquidez', 'região', 'estado', 'marca', 'vendedor cadastrado', etc."

**Problema:** lista hardcoded vira dívida técnica. Como evoluir? Por config? Por PR? Sem mecanismo, fica engessado.

**Fix (v3):**
- Mover lista para tabela `AgentForbiddenTerms` (model novo) ou config JSON em `AgentSettings.foraDoEscopoTerms`.
- Permite atualização via UI sem PR/deploy.
- v3 pode manter hardcoded mas registra como dívida.

---

### HIGH-K: Persistência de `retryHint` em texto livre — superfície LGPD

> v2 § 5: `retryHint String? @map("retry_hint")`.

**Problema:** `retryHint` é instrução corretiva que pode conter trechos do `toolResults` (números, nomes). Aumenta superfície de dados sensíveis persistidos.

**Fix (v3):**
- Sanitizar `retryHint` antes de persistir (truncar a 500 chars, remover PII).
- Ou armazenar só **código da regra** (V1/V2/V3/V4) e **detalhe categorizado**, não texto livre.

---

### HIGH-L: Latência p95 ≤ 12s pode ser violada com timeout retry de 5s

> v2 § 4.4: `timeoutMs: 5000` no retry.
> v2 § 7.1: "SLA: p50 ≤ 6s, p95 ≤ 12s."

**Análise:** primeira call ~ 4s + tool exec ~1s + LLM final ~ 2s + validator <1s + retry call ~ 4s = ~ 11s no caso de retry. Estamos no limite.

Se validador V2 dispara em 20% dos turnos (estimativa alta possível), p95 sobe naturalmente para 11s. Margem zero.

**Fix (v3):**
- Reduzir timeout retry para 3s (suficiente para resposta curta com hint).
- Adicionar métrica `retry_duration_ms` por turno.
- Definir kill switch: se p95 do dia anterior > 12s, desativa auto-validator automaticamente (vai pra shadow).

---

### HIGH-M: A6 transportadora ainda parcialmente especificada

> v2 § 7.5 R-2: "Se não estiver, bloquear A6 transportadora-papel."

**Vagueza:** "bloquear" significa? Tool não devolve resultado se `papel=transportadora`? Devolve erro? Spec não decide.

**Fix (v3):**
- Decisão explícita: se categoria não está sincronizada, `papel=transportadora` retorna `erro: "papelNaoSuportado"` no envelope, com `disponiveis: ["cliente","fornecedor","todos"]`.
- LLM aprende via prompt a não solicitar transportadora até R-2 ser resolvido.

---

### HIGH-N: Plano de rollout em produção ausente

> v2 não detalha como mover `autoValidatorMode` de `off` para `shadow` para `active`.

**Problema:** sem mecanismo, ninguém aciona. Validator nunca liga em prod.

**Fix (v3):**
- Adicionar § "Roteiro de ativação em produção":
  1. PR10 mergiado → `autoValidatorMode` migrado com default `off`.
  2. Super_admin habilita `shadow` via `/agente/configuracao` UI **após** verificar dashboard `/agente/monitoramento`.
  3. Após 48h de shadow com `retryRate ∈ [5%, 25%]` e sem alertas → promove para `active`.
  4. Se em qualquer momento `retryRate > 30%` ou `p95 > 12s`, volta para `shadow` automaticamente.
- UI: campo `autoValidatorMode` editável em `/agente/configuracao`.

---

## Achados médios (MED)

### MED-O: Estimativa de retryRate "5-25%" sem fundamento empírico

V2 menciona faixa, mas é chute. Sem dados, kill switch (`retryRate > 30%`) é arbitrário. **Fix:** adicionar item ao plano de medição: medir `retryRate` em sub-conjunto controlado (10 turnos manuais) antes de definir banda.

### MED-P: R17 não inclui perguntas inéditas — só testa caso conhecido

> v2 § 6.4 e § 3.1 mencionam "subset dos R11-R16" para regressão E R17 100 turnos via subagent.

Mas R17 mistura conhecidos parafraseados + perguntas geradas pelo subagent. Razão 50/50? Não está claro. **Fix:** spec define 60% inéditas + 40% paráfrases.

### MED-Q: Fila de PENDENTE não gerenciada — vai acumular

Cada onda gera 100 novas avaliações. Sem plano de quem audita, fila cresce. **Fix:** acionar `pnpm tsx scripts/quality-audit/dump-pending.ts && commit-audit-results.ts` após cada bateria. Spec menciona como passo manual no roteiro.

### MED-R: A13 "gate suave" via system msg pode ser ignorado pelo LLM

> v2 § 3.1 A13: "system message inline: 'considere chamar tool X'".

`gpt-5.4-mini` pode ignorar system msg curto. **Fix:** monitorar se A13 efetivamente faz LLM chamar tool indicada (telemetria `gateRedirectFollowed: bool` em `McpAuditLog`). Se taxa < 60%, escalar para `tool_choice` forçado.

### MED-S: `docker compose build` no script de regressão é frágil

Falha de build → mensagem confusa. **Fix:** script `run-regression.ts` checa exit code do build, falha com mensagem clara antes de tentar rodar bateria.

---

## Resumo Review #2

| Severidade | Quantidade |
|-------------|------------|
| CRIT | 6 |
| HIGH | 8 |
| MED | 5 |
| **Total** | **19 achados materiais** |

A v2 melhorou significativamente vs v1 (24 → 19 achados, e nenhum dos críticos é repetido). Mas os **6 CRIT** são bloqueadores:

- **CRIT-A** (V2 sub-especificado): inviabiliza implementação direta.
- **CRIT-B** (subagent não é cego): inviabiliza confiança em R17.
- **CRIT-C** (tempo ausente): inviabiliza planejamento.
- **CRIT-D** (briefing v3 vago): inviabiliza avaliação.
- **CRIT-E** (PR10 sem block formal): risco de chaos de merge.
- **CRIT-F** (estimativa otimista): risco de gating em piso de meta.

**Recomendação:** SPEC v3 endereça os 6 CRIT como requisitos firmes + 8 HIGH com decisões + 5 MED com decisões ou registro como dívida técnica. Após v3, **iniciar PLAN** (writing-plans).
