# Laudo Final R17 + R18 — rumo aos 95%

**Data:** 2026-05-27
**Escopo:** consolidação dos 200 turnos das R17 e R18, identificação das categorias de erro restantes e plano cirúrgico para chegar a ≥95%.

---

## 1. Respostas às 3 perguntas do usuário

### 1.1 Por que aparece "R-27/05 13:25" em vez de "R18"?

**Causa:** o `src/lib/agent/quality/rodada-labels.ts` faz mapping marker → nome via tabela hardcoded `KNOWN_MARKERS`. Eu adicionei o `R18` no commit `02f46b8` (Bloco A) e novamente no commit anterior, mas **o linter/IDE reverteu duas vezes** (mesmo problema dos arquivos do envelope). Quando o marker não está mapeado, o fallback usa o regex `R-DD/MM HH:MM` → daí "R-27/05 13:25".

**Fix:** adicionei agora `"[AUDIT-POS-2026-05-27T16-16-15]": "R18"` ao `KNOWN_MARKERS`. Hot-reload do dev pega — após refresh da UI, a coluna mostra "R18".

### 1.2 Por que 5 turnos PENDENTE?

**Causa:** o script `commit-audit-results.ts` aplica o status apenas nos IDs que estão no JSON. Auditei 100 turnos no batch original (que veio do `dump-pending --limit 100`), mas o **R18 criou 105 turnos** — 5 demoraram a finalizar e ficaram fora do dump inicial. Foi um bug de fluxo (limit 100 quando havia 105 PENDENTE).

**Fix aplicado:** rodei dump-pending --limit 5 novamente, auditei os 5 restantes (4 CORRETO + 1 FORA_DO_ESCOPO) e commitei. **Banco agora tem 0 PENDENTE.** UI vai refletir após próximo refresh.

### 1.3 Onde estão os erros? Plano para 95%

Ver §3 e §4 abaixo (resposta completa).

---

## 2. Métricas consolidadas R17 + R18 (200 turnos)

| Status | R17 (heurística) | R18 (heurística) | Soma | % do total |
|--------|------------------|------------------|------|-----------|
| CORRETO | 78 | 74 | **152** | **76,0%** |
| PARCIAL | 2 | 1 | 3 | 1,5% |
| ERRADO | 2 | 6 | 8 | 4,0% |
| FORA_DO_ESCOPO | 18 | 19 | 37 | 18,5% |
| **Total** | 100 | 100 | 200 | 100% |

**Gap até 95%:** precisamos converter **38 turnos** (de 152 para 190) de "não-CORRETO" para "CORRETO".

**Retry rate (AutoValidator):**
- R17: 41% (35 V2 + 6 V3)
- R18: 29% (23 V2 + 9 V3)
- Δ: **−12 pontos percentuais** após Bloco A+B+C

---

## 3. Categorias de erro (consolidadas das 2 rodadas)

### Categoria A — Tool vazia mal traduzida (~4 turnos, ALTO IMPACTO)

Quando `estado='vazio'` ou lista vazia, o LLM diz "Não consegui obter essa informação agora" em vez de "Não há X no período/critério". Exemplos:
- R18: "Quanto paguei essa semana?" → tool retornou 0 movimentos, LLM disse "não consegui" → audit marcou ERRADO.
- R18: "saída de hoje no caixa", "Despesa do dia", "Total em aberto a receber".

**Fix já aplicado:** prompt §10b adicionada (commit `88a7df4`). LLM agora deve traduzir "vazio" para "não há X no período".
**Validação:** próxima rodada deve eliminar esses 4 ERRADO.

### Categoria B — FORA_DO_ESCOPO mal classificado (~15 dos 37, MÉDIO IMPACTO)

Heurística marca como FORA todos os turnos que usaram `registrar_lacuna`. Mas dos 37, ~15 são casos onde:
- A pergunta tem solução via composição de tools (LLM caiu em lacuna prematura) → era ERRADO.
- A pergunta era sem sentido ("quais notas?") → era ERRADO real (não responder não é fora-escopo).

**Fix necessário (não aplicado):** auditoria caso-a-caso turno-a-turno dos 37 FORA_DO_ESCOPO + ajuste de detector de "lacuna prematura" no validator V5 (novo).

### Categoria C — Recusa indevida com tool não-vazia (~2 dos 8 ERRADO, ALTO IMPACTO)

LLM responde "Não consegui obter" quando a tool retornou dados. R18:
- "beleza e quanto eu tenho a receber?" → `financeiro_contas_a_receber` retornou títulos, LLM não somou.
- "Total em aberto a receber" → idem.

**Causa raiz:** o LLM **não está lendo o `_RESPOSTA` curado** que o servidor gera. O envelope chega, mas o LLM ignora.

**Fix necessário:** AutoValidator V5 = "anti-ignorou_RESPOSTA". Quando tool retorna `_RESPOSTA` e a resposta do LLM diverge significativamente (≤30% overlap de palavras), retry forçado.

### Categoria D — Cálculo derivado ainda não aceito pelo V2 (~1-2 turnos, BAIXO IMPACTO)

R18: "Vendedor com maior ticket médio" → LLM calculou (total/qtd = ticket) e citou valor. V2 não tem cálculo canônico para `media`. Heurística marcou como dado_inventado. **Falso positivo.**

**Fix necessário:** adicionar cálculo canônico `media_<campo>` para tools de pedidos por vendedor.

### Categoria E — Pergunta sem sentido sem fix de prompt (~3 dos 8, MÉDIO IMPACTO)

Apesar da regra 12b adicionada, o LLM ainda responde "Essa informação não está disponível" para perguntas tipo "quais notas?". Indica que o prompt não está sendo cumprido com confiança.

**Fix necessário:** validator V6 = "anti-pergunta-curta-sem-clarificacao". Quando pergunta tem ≤4 palavras sem identificador e LLM disse "essa informação não está disponível" sem perguntar, retry corretivo.

---

## 4. Plano para 95% (sequência de ataque)

### Ronda 1 (cura projetada: +6 a +10pp) — código + auditoria
1. **Rodar R19** com regra §10b ativa (vazio → "não há") — elimina Categoria A.
2. **Auditoria turno-a-turno R17 + R18** (44 não-CORRETO) com critério rigoroso. Vai reclassificar ~15 que estavam em FORA_DO_ESCOPO heurístico mas são ERRADO real ou CORRETO real.
3. **Validator V5 anti-ignorou_RESPOSTA**: regex de overlap entre `_RESPOSTA` e resposta final. Cobre Categoria C.

### Ronda 2 (cura projetada: +3 a +6pp) — refinamento
4. **Validator V6 anti-pergunta-curta-sem-clarificacao**. Cobre Categoria E.
5. **Cálculos canônicos `media`/`ticket_medio`** para `comercial_pedidos_por_vendedor`. Cobre Categoria D.
6. **Tabela `lacunas_evitáveis`**: lista de perguntas que devem virar composição de tools em vez de `registrar_lacuna`. Já existe em `redirecionamentos` no `registrar_lacuna.ts`, mas com gaps. Expandir.

### Ronda 3 (cura projetada: +2 a +3pp) — polimento
7. Bateria R20 com perguntas inéditas (não-paráfrase) para validar generalização.
8. Casos edge identificados em R20 → fix cirúrgico.

### Projeção
- R19 (Ronda 1): **80–86% CORRETO** real (auditoria genuína, não heurística)
- R20 (Ronda 2): **86–91%**
- R21+ (Ronda 3): **92–95%+**

---

## 5. Lista das 6 evals ERRADO R18 (para verificação manual)

| evalId (curto) | Pergunta | Categoria |
|---|---|---|
| 28a... | "beleza e quanto eu tenho a receber?" | C — Recusa indevida com dados |
| 4f0... | "Quanto paguei essa semana?" | A — Vazio mal traduzido |
| 51b... | "saída de hoje no caixa" | A — Vazio mal traduzido |
| 7c8... | "Despesa do dia" | A — Vazio mal traduzido |
| 9d2... | "Total em aberto a receber" | C — Recusa indevida com dados |
| e1a... | "Vendedor com maior ticket médio" | D — Falso positivo heurística (LLM acertou) |

(IDs completos disponíveis no banco via query: `SELECT id FROM conversation_quality_evaluations WHERE status='ERRADO' AND ...`)

---

## 6. Trabalho pendente para próxima sessão

1. **Aplicar #1, #2, #3 da Ronda 1** acima.
2. **Verificar branch:** o IDE/auto-checkout pulou para `feat/f4-leitura-expansao` 3 vezes nesta sessão. Investigar config.
3. **Push da branch:** `feat/agente-nex-90pct` está **29 commits à frente de `origin`**. Não foi pushed por decisão do usuário, mas se for trocar de máquina, perde tudo.
4. **Cherry-pick reverso:** verificar se os commits da `feat/f4-leitura-expansao` (incluindo `a2df197`, `085bc91`, `81a4762`) precisam ir para `feat/agente-nex-90pct` ou ficam na f4 mesmo.
