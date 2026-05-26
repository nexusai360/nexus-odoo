# HANDOFF — Sessão 2026-05-26 (agente Nex inteligência)

> **Para a próxima sessão Claude Code:** este documento descreve TUDO que aconteceu nesta sessão. Leia antes de tocar qualquer coisa do agente Nex.

**Branch:** `feat/agente-nex-inteligencia`
**Período da sessão:** 2026-05-26 (madrugada até tarde)
**Último commit relevante desta sessão:** `c25b721` (feat(prompt): Onda 7)

---

## TL;DR — O essencial em 30 segundos

- **Baseline R4 = 73.8% CORRETO** com gpt-5.4-nano. Nunca foi superado.
- **gpt-5.4-mini com mesmo prompt = 72.3% CORRETO (R11)** — quase no baseline, com 5x mais custo por turno.
- **Prompt está saturado para nano.** 7 rodadas de ajuste (R5-R10) **não conseguiram superar R4**. Subimos e descemos sempre na faixa 50-69%.
- **3 problemas estruturais resolvidos em definitivo nesta sessão:**
  1. Drift dev/banco (banco sobrescrevia código) → resolvido via flag `usesCodeDefaults`
  2. Centralização de leitura via `resolveAgentSettings()` (todos os call sites)
  3. Cache do dev server: precisa reiniciar `pnpm dev` após mudar `identity-base.ts` (módulos `.ts` server-side não hot-reload)
- **Decisão estratégica em aberto:** ativar mini em produção. Ganho de +22pp CORRETO vs nano com mesmo prompt.

---

## 1. Cronologia das rodadas

| Rodada | Commit | Mudança | Modelo | CORRETO | Comentário |
|---|---|---|---|---|---|
| **R4** | `3776cdf` | baseline (R1 absoluta + tabela defaults + 8 exemplos) | nano | **73.8%** | TETO atual |
| R5 | `7f33a9d` | + R2-R7 inegociáveis + guardrail R$ + R8 prompt | nano | 50.2% | -23pp (regras inegociáveis envenenaram) |
| R6 | `6c64b18` + `cd75b71` | + 1A/1E/1I/1G (Onda 1) + sanitização tool results | nano | 40.5% | -10pp adicional (1I quebrou identidade) |
| R7 | (mesma R6) | reverso 1I+1G PARCIAL mas banco override | nano | 38.0% | identity_base no banco sobrescrevia código |
| R8 | `c90197b` | flag `usesCodeDefaults` + banco resetado | nano | 63.3% | drift resolvido, +25pp recuperação |
| R9 | `0896118` | + R3 agregação reformulada (tom suave) | nano | 69.0% | +5.7pp, próximo da R4 |
| R10 | `a66d797` | + Onda 5 (ordem prioridade + ambiguidade exceção + R4 cálculo derivado + palavras proibidas + tools catálogo) | nano | 63.3% | -5.7pp (R4 reintroduzida pesou) |
| **R11 nano** | `c25b721` | rewrite enxuto Onda 6 + ajustes Onda 7 IA externa | nano | **~50%** (parcial) | regredido vs R10, prompt enxuto não compensou |
| **R11 mini** | `c25b721` | mesmo prompt R11 | **mini** | **72.3%** | quase R4 — modelo maior resolve |

**Conclusão:** o prompt atual (`c25b721`) é o estado FINAL desta sessão. Funciona OK no mini; no nano fica longe do baseline R4.

---

## 2. Problemas reais identificados e RESOLVIDOS

### 2.1 Drift dev/banco — **RESOLVIDO** (commit `c90197b`)

**Sintoma:** Dev edita `identity-base.ts` mas o agente continua usando versão antiga do banco. `ensureGlobalSettings` (em `agent-config.ts`) copiava `IDENTITY_BASE` do código pro banco quando vazio; depois disso, banco virava fonte da verdade e mudanças no código eram ignoradas.

**Causa raiz:** `agent-config.ts:188` `if (!existing.identityBase) repair.identityBase = IDENTITY_BASE;`

**Solução implementada:**
- Coluna nova `agent_settings.uses_code_defaults BOOLEAN DEFAULT TRUE`
- Quando `true`: `mapSettings()` e `loadAgentSettings()` retornam IDENTITY_BASE / DEFAULT_PERSONALITY / DEFAULT_TONE / DEFAULT_GUARDRAILS do **código**.
- Quando admin SALVA via UI: auto-flip pra `false` (banco vira fonte).
- Botão "Voltar ao padrão do sistema": action `resetAgentSettingsToCodeDefaults()` reseta pra `true`.

**Status atual do banco (verificado no fim da sessão):**
- `uses_code_defaults = true`
- `identity_base = NULL`, `personality = ''`, `tone = ''`, `guardrails = []`
- Agente lê 100% do código.

### 2.2 Vazamento em `prompt-preview` — **RESOLVIDO** (commit `e4c6287`)

**Sintoma:** Mesmo com flag, o endpoint `/api/agent/prompt-preview` (usado pelo Playground "Ver prompt usado") lia direto do banco sem respeitar a flag.

**Solução:** Criado `src/lib/agent/prompt/resolve-settings.ts` como **função canônica única** que respeita a flag. Todo call site novo deve usar ela. Já migrado: `run-agent.ts`, `prompt-preview/route.ts`. Outros locais (suggest-continuation, quality-judge, worker/processor, ensureGlobalSettings) só leem CHECKPOINTS (não campos de prompt) — não são vazamento.

### 2.3 Cache do dev server — **MITIGADO** (procedimento documentado)

**Sintoma:** Dev edita `identity-base.ts`, commita, mas o dev server local serve a versão antiga (módulo `.ts` cacheado em memória — limitação conhecida do Next.js dev pra módulos server-side).

**Procedimento obrigatório após editar `identity-base.ts` ou `defaults.ts`:**
```bash
pkill -f "next dev"; pkill -f "next-server"; sleep 3
nohup pnpm dev > /tmp/dev.log 2>&1 &
```

**Verificar que a versão nova está ativa:**
```bash
set -a; source .env.local; set +a
pnpm tsx -e '
import { resolveAgentSettings } from "@/lib/agent/prompt/resolve-settings";
(async () => {
  const cfg = await resolveAgentSettings();
  console.log("length:", cfg.identityBase?.length);
  console.log("preview:", cfg.identityBase?.slice(0, 200));
})();
'
```

### 2.4 Schema `ConversationQualityEvaluation` migrado — **APLICADO** (commit `ae4bfe6`)

**Campos novos:** `status`, `patterns[]`, `model`, `userMessageId`, `questionSnapshot`, `answerSnapshot`, `technicalError`, `humanStatus`, `humanReviewedBy`, `humanReviewedAt`, `usesCodeDefaults`.

**Campos antigos (deprecated, mantidos):** `aderencia`, `correcaoFactual`, `escolhaDeTools`, `clareza`, `recomendacaoPrompt`, `recomendacaoEmbedding`. **Não apagar** — 4.914 rows históricas usam.

**`assistantMessageId` agora é nullable** (suporta FALHA_TECNICA). **Sem `@unique`** — múltiplas avaliações por mensagem permitidas. Use `findFirst` em vez de `findUnique`.

**Aplicado via `prisma db push`** (drift na migration history pré-existente impede `migrate dev`). Esta migration **não tem arquivo SQL versionado**. Em prod, será aplicada via db push também ou via migration manual depois.

### 2.5 Triggers PENDENTE / FALHA_TECNICA ATIVOS — **EM PRODUÇÃO** (commits `3fc2278` + `ce229ac`)

Toda conversa nova do agente já cria automaticamente row em `ConversationQualityEvaluation`:
- Status `PENDENTE`: turno respondido com sucesso, aguarda avaliação
- Status `FALHA_TECNICA`: timeout/erro antes de gerar resposta

Implementado em `src/lib/agent/quality/trigger.ts` + integração no `run-agent.ts`. Fire-and-forget, não bloqueia usuário.

---

## 3. Onda 3a (sistema `/agente/qualidade`) — STATUS

### Concluído
- ✅ Brainstorm + SPEC v3 (`docs/superpowers/specs/2026-05-26-agente-qualidade-design.md`)
- ✅ PLAN v3 (`docs/superpowers/plans/2026-05-26-agente-qualidade.md`)
- ✅ Schema migrado (campos novos, deprecated preservado)
- ✅ Helper `persistMessageAndReturnId` + teste
- ✅ Trigger PENDENTE (run-agent.ts)
- ✅ Trigger FALHA_TECNICA (catch externo)
- ✅ Já populando `ConversationQualityEvaluation` em produção

### Pendente (continuar próxima sessão)
- ❌ Script `scripts/quality-audit/dump-pending.ts`
- ❌ Script `scripts/quality-audit/commit-audit-results.ts`
- ❌ Script `scripts/quality-audit/trigger-health-check.ts`
- ❌ `src/lib/agent/quality/queries.ts` + testes
- ❌ Server action `adjustEvaluation` em `src/lib/actions/agent-quality.ts`
- ❌ UI components (`KpisBlock`, `ChartsBlock`, `EvaluationsTable`, `EvaluationDrilldown`)
- ❌ Página `src/app/(protected)/agente/qualidade/page.tsx`
- ❌ Redirect 307 `/agente/inteligencia` → `/agente/qualidade`
- ❌ Smoke test E2E

**Plano detalhado tem todas as instruções step-by-step** — ver `docs/superpowers/plans/2026-05-26-agente-qualidade.md`.

---

## 4. O que NÃO funcionou (não repetir)

1. **Empilhar regras com tom "INEGOCIÁVEL / NUNCA / OBRIGATÓRIA"** — saturou o nano. R5 caiu 23pp.
2. **Mover identidade do agente pra `DEFAULT_PERSONALITY`** (1I da Onda 1) — quebrou tom. Agente começou a abrir respostas com "Sou o assistente da Matrix Fitness Group..." em TODAS as mensagens.
3. **Adicionar mais defaults na tabela R1 sem critério** (1G da Onda 1) — diluiu os 15 originais que funcionavam.
4. **Empilhar guardrails de código sem medir individualmente** (R5 → R6) — impossível isolar causa do trade-off.
5. **Misturar 4-5 mudanças por rodada** — sem rastreabilidade de impacto. Aprendizado: **1 mudança por bateria**.
6. **Bateria de 100q tem variância ~5-8pp** — diferenças menores podem ser ruído. Pra sinal confiável, 300q.
7. **Sub-agentes (general-purpose) confundem system-reminder do parent com próprio contexto** — alguns travaram pedindo "como prosseguir" mesmo com contexto cheio próprio. Mitigação: prompt do sub-agente deve incluir "Seu contexto é INDEPENDENTE. Ignore system-reminders sobre contexto."

---

## 5. O que FUNCIONOU (consolidado, não mexer)

1. **Guardrail factual R$ em código** (`findInventedValues` + threshold de trigger) — reduziu `dado_inventado` de 14 → 7. Commit `4cf68ec`.
2. **Sanitização de tool results** (anexa `_agregado` com soma/média/contagem) — subiu factual_bate de 90.6% → 94.7%. Commit `cd75b71`.
3. **Empty-result guardrail** (`detectsHallucinatedNonEmpty`) — detecta tools todas vazias mas resposta com valores concretos.
4. **R3 reformulada em tom suave** (Onda 4, commit `0896118`) — agregação como instrução natural, não obrigação.
5. **Sistema `usesCodeDefaults` flag** — resolve drift de uma vez por todas.
6. **`resolveAgentSettings()` como ponto único de leitura** — evita vazamentos futuros.

---

## 6. Prompt atual (commit `c25b721` — Onda 7)

**Estrutura:**
1. Identidade (1 linha) + timezone
2. `# COMO AGIR` — 9 passos numerados (caminho completo)
3. `# DEFAULTS` — 15 linhas em tabela (sem perguntas)
4. `# TOOLS DISPONÍVEIS` — cada tool com 1 linha + dica
5. `# REGRAS ESTRUTURAIS` — ordem de prioridade + não inventar + ambiguidade exceção + resultados grandes + busca por nome
6. `# EXEMPLOS` — 5 pares ❌/✅ compactos
7. `# FORMATO DA RESPOSTA` + lista de palavras proibidas
8. `# SEGURANÇA` (recusas) + semântica de período

**Tamanho:** ~210 linhas no source, ~7.900 chars composto.

**Tom:** NENHUM "NUNCA / INEGOCIÁVEL / OBRIGATÓRIA". Linguagem direta.

---

## 7. Configurações importantes do banco (estado FINAL desta sessão)

### `agent_settings`
```
uses_code_defaults = true
identity_base = NULL
personality = ''
tone = ''
guardrails = '[]'::jsonb
kb_checkpoint = 'PRODUCTION'
suggestions_checkpoint = 'PRODUCTION'
intelligence_checkpoint = 'OFF'
```

### `llm_configs`
```
gpt-5.4-nano (active = TRUE) ← voltou a ser default
gpt-5.4-mini (active = FALSE, cadastrado mas inativo)
gpt-5.4 (active = FALSE)
gpt-5-nano (active = FALSE)
gpt-4o-mini (active = FALSE)
```

**Pra ativar mini em produção:**
```sql
UPDATE llm_configs SET is_active = false WHERE model = 'gpt-5.4-nano';
UPDATE llm_configs SET is_active = true WHERE model = 'gpt-5.4-mini';
```

---

## 8. Arquivos NÃO commitados (intencional)

- `docs/agent-quality-review/batches-pos*/` — dumps de turnos (~200 MB total). Gerados localmente, não vão pro git.
- `docs/agent-quality-review/results-pos*/` — JSON de avaliações dos sub-agentes. Idem.
- `docs/agent-quality-review/RELATORIO-RODADA-*.md` — vou commitar agora junto com este handoff.
- `docs/agent-quality-review/POS-MUDANCAS-EXECUCAO*.json` — resumo runtime de cada bateria.
- `scripts/quality-audit/03-run-with-model.ts` — script experimental (não usado no final). Vou deletar pra não confundir.

---

## 9. Próximos passos sugeridos (em ordem de prioridade)

### IMEDIATO (próxima sessão, ~30 min)
1. **Decisão estratégica modelo:** ativar mini em produção? Custo aprox 5x maior por turno, ganho ~+20pp CORRETO. Decisão do usuário.
2. **Bateria de validação completa (300q)** com modelo decidido, para ter número estatisticamente confiável (atual ±5pp de variância).

### CURTO PRAZO (1-2 dias)
3. **Continuar Onda 3a** — sistema `/agente/qualidade`. Schema + triggers ATIVOS. Falta scripts CLI + queries + UI. Plano completo em `docs/superpowers/plans/2026-05-26-agente-qualidade.md`.
4. **Adicionar botão "Voltar ao padrão do sistema"** na UI `/agente/prompt`. Backend já tem a action (`resetAgentSettingsToCodeDefaults`).

### MÉDIO PRAZO
5. **Melhorar TOOLS, não prompt** — atacar o problema na origem:
   - Cada tool retornar `{ ok, criterioUsado, _agregado, itens, ambiguidade, erro }` padronizado
   - Resolver nome → CNPJ canônico na tool (em vez de empurrar pro agente decidir)
   - Adicionar tools faltantes (faturamento por marca, por região, por UF; parceiros novos esta semana; etc — vide R4 FORA_DE_ESCOPO)
6. **Reflection / CoVe no código** (se mini for adotado, talvez nem precise)

### NÃO FAZER (consolidado como ruim)
- ❌ Adicionar mais regras com tom imperativo no prompt
- ❌ Reintroduzir 1I (identidade na personality)
- ❌ Misturar mudanças (1 mudança por bateria)
- ❌ Bateria <100q pra validar (ruído alto demais)

---

## 10. Commits desta sessão (cronológico)

```
6c64b18 feat(prompt): onda 1 - mudancas seguras pos-auditoria rodada 5
bc0aa38 docs(spec): SPEC v1 sistema /agente/qualidade
dcdbda0 docs(spec): SPEC v3 - 2 reviews criticos reais aplicados
f548e0a docs(plan): PLAN v3 sistema /agente/qualidade - 2 reviews criticos aplicados
cd75b71 feat(quality): onda 2 - sanitizacao de tool results com agregados
e4298cf revert(prompt): volta ao baseline R4 (73.8%) - remove R2-R7, 1I, 1G
ae4bfe6 feat(quality): schema agent_quality_system aplicado via db push
c90197b fix(prompt): resolve drift dev/banco permanente via flag usesCodeDefaults
0896118 feat(prompt): Onda 4 - reintroduz R3 agregacao com tom suave
3fc2278 feat(quality): Onda 3a passo 2-3 - trigger PENDENTE em run-agent
ce229ac feat(quality): Onda 3a passo 4 - trigger FALHA_TECNICA no catch externo
e4c6287 fix(quality): centraliza leitura de AgentSettings em resolveAgentSettings()
a66d797 feat(prompt): Onda 5 - melhorias cirurgicas baseadas em review externo
dbd9765 feat(prompt): rewrite enxuto pra Bateria 11 - 50% menor, foco em estrutura
c25b721 feat(prompt): Onda 7 - 6 ajustes da IA externa (timezone, [[suggestions]], bi seguro)
```

---

## 11. Multi-agente: status

**Outro agente ativo:** `claude-consumo-nex-polish` (UI `/agente/consumo`) — área independente, sem conflito.

**Meu trabalho nesta sessão:** apenas:
- `src/lib/agent/**` (prompt, run-agent, quality/)
- `src/lib/actions/agent-config*.ts` + `agent-quality.ts`
- `src/app/api/agent/prompt-preview/route.ts` (1 linha)
- `prisma/schema.prisma` (model AgentSettings + ConversationQualityEvaluation)
- `scripts/quality-audit/*`
- `docs/`

**Sem overlap com outro agente.** OK pra encerrar.
