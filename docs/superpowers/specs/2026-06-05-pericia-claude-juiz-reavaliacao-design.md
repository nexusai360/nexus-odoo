# Spec v3 , Perícia agêntica pelo Claude (juiz único) + fluxo de Reavaliação

> Data: 2026-06-05. Branch: `feat/agente-nex-bubble-ux`.
> v3 = após 2 reviews adversariais (`reviews/2026-06-05-pericia-spec-reviews.md`).
> Origem: perícia disparada por relato do usuário (print do Backtest mostrando
> "Correto" numa resposta que vazou `[[suggestions]]` e contrariava o voto
> "Alucinou" do usuário). Requisitos ditados pelo usuário nesta sessão.

## 1. Problema (apurado com evidência do banco)

1. **A perícia de hoje NÃO foi feita pelo Claude.** Das 7 avaliações das últimas
   24h: 5 vieram do **juiz heurístico** (`judgeVersion="heuristica-agente-nex-v1"`,
   regras rasas tipo "tool retornou valores → CORRETO") e 2 do Claude
   (`v2-claude-code`) seguem **PENDENTE** (nunca julgadas). A heurística marcou
   "Correto" a uma resposta claramente furada.
2. **O juiz Claude quase não roda.** O agendador (`judge-scheduler.ts`) só roda
   em runtime local, **não dispara no boot** (só após 240min) e o timer reinicia
   a cada restart do dev → na prática nunca chega a disparar.
3. **A heurística está "aposentada" só na documentação.** O engine
   (`auto-heuristic.ts`), o CLI (`scripts/quality-audit/heuristic-eval-agente-nex-pendentes.ts`),
   o job do worker e a UI de config continuam vivos; o CLI foi rodado hoje e
   produziu os vereditos errados.
4. **O voto do usuário é ignorado.** `MessageFeedback` (voto+comentário) e
   `ConversationQualityEvaluation` (veredito) são tabelas separadas, sem
   reconciliação. Votar/comentar após o veredito não dispara nada.
5. **O juízo do Claude é raso.** O `JUDGE_PROMPT`/playbook manda "ler e julgar",
   não refazer a consulta via MCP nem conferir no banco.
6. **Bug do vazamento `[[suggestions]]`** (JÁ CORRIGIDO nesta sessão): o retry do
   autoValidator substituía a resposta depois dos strippers; adicionado re-strip
   antes de persistir (`run-agent.ts`).

## 2. Objetivo

A perícia de qualidade passa a ser **exclusivamente do Claude Code (Opus 4.8 ou
mais recente), rodando local em background**, de forma **agêntica e verdadeira**,
e o sistema passa a **reconciliar o voto do usuário** via um fluxo de
**Reavaliação**. Nenhuma heurística/script de regras participa do veredito.

## 3. Requisitos (ditados pelo usuário)

- **R1 , Arrancar a heurística.** Remover o engine, o CLI, o job do worker e a
  UI de config da heurística. Nada pode mais gravar `judgeVersion` heurístico nem
  status automático por regras. **Preservar** o campo de intervalo
  (`qualityHeuristicIntervalMinutes`) porque o agendador do Claude o reusa
  (renomear o conceito para "intervalo da perícia", sem migration destrutiva).
- **R2 , Perícia agêntica de verdade.** O Claude, para cada item a julgar:
  1. lê a **pergunta do usuário** e a **resposta do agente** (modelo GPT‑5.4‑mini);
  2. olha as **tool calls/results** daquele turno;
  3. **usa o MCP e refaz ele mesmo a(s) consulta(s)** que respondem a pergunta,
     buscando no nosso banco/cache;
  4. **responde por conta própria** e **compara** com o que o agente respondeu;
  5. crava o **status pela verdade do dado**.
  Implementação: reescrever `JUDGE_PROMPT` + `docs/quality-judge-playbook.md` com
  esses passos (incluindo como chamar o MCP local). Atualizar `judgeVersion` para
  refletir a perícia agêntica (ex.: `claude-pericia-v1`).
- **R3 , Rodar de fato em background.** O agendador deve disparar **logo após o
  boot** (com pequeno atraso, ex.: 2–5min) além do intervalo, e a fila do juiz
  deve incluir tanto `PENDENTE` quanto `REAVALIAR`. Sem automação de tela, sem
  digitação manual.
- **R4 , Status "REAVALIAR" (rótulo "Reavaliação").** Novo status não-terminal,
  distinto de PENDENTE. PENDENTE = nunca periciado; REAVALIAR = usuário
  votou/comentou após o veredito e precisa ser re-julgado. UI: badge/label/cor
  próprios (`EvalStatusBadge`, `EVAL_STATUS_LABEL`, `PERICIA_COLOR`), fora da
  lista de TERMINAL, e incluído na fila do juiz (count + dump).
- **R5 , Gatilho do voto.** Quando o usuário vota/comenta e o eval já está em
  estado **terminal**, `submitMessageFeedback` marca o eval como **REAVALIAR** e
  guarda o contexto (voto + comentário) para a perícia considerar. (Avaliação do
  usuário continua sendo coisa separada do veredito; isto só agenda a re-perícia.)
- **R6 , Reconciliação honesta + "ajuste pela perícia".** Na reavaliação, o Claude
  **leva em conta** o comentário do usuário, mas com honestidade/personalidade:
  pode **concordar e mudar** o status, ou **discordar e manter**. O reajuste é
  registrado no **mesmo campo de ajuste** do ajuste manual, porém rotulado
  **"ajuste pela perícia"** (IA) em vez de "humano" (mudar só o rótulo/origem;
  reaproveitar `parseRazoes`/seção de ajustes no `evaluation-drilldown.tsx`).
- **R7 , Re-julgar o passado sujo.** Resetar os vereditos heurísticos
  (`judgeVersion="heuristica-agente-nex-v1"`) para PENDENTE (preservando ajustes
  humanos) para o Claude periciar de verdade. Reusar/atualizar
  `scripts/quality-audit/reset-heuristic-to-pending.ts`.

## 4. Fora de escopo (registrar honestamente)

- **Produção.** O juiz Claude é **local-only** (o container não enxerga o CLI
  `claude`). Em prod não há perícia automática até existir um juiz remoto; isto
  permanece um gap conhecido, fora desta entrega.

## 5. Arquivos impactados (perícia)

- Remoção: `src/lib/agent/quality/auto-heuristic.ts`,
  `scripts/quality-audit/heuristic-eval-agente-nex-pendentes.ts`,
  `src/components/agent/monitoramento/auto-heuristic-config.tsx`,
  `src/lib/actions/quality-heuristic-config.ts`, job no `src/worker/index.ts`
  (`JOB_AUTO_HEURISTIC` + agendamento), uso na
  `monitoramento-content.tsx` / `page.tsx`.
- Juiz: `src/lib/agent/quality/claude-judge-runner.ts` (`JUDGE_PROMPT`, fila
  PENDENTE+REAVALIAR), `judge-scheduler.ts` (boot-fire), `trigger.ts`
  (`JUDGE_VERSION`), `scripts/quality-audit/pendentes-io.ts` (dump inclui voto do
  usuário + tool calls/results; apply grava ajuste-pela-perícia), playbook.
- Status/UI: `prisma/schema.prisma` (semântica do status, sem enum), `queries.ts`,
  `eval-status-badge.tsx`, `evaluation-drilldown.tsx`, helpers de
  label/cor/TERMINAL, `monitoramento-bubble.ts` (perícia buckets).
- Feedback: `src/lib/actions/message-feedback.ts` (gatilho REAVALIAR).

## 6. Decisões já fechadas com o usuário

- Juiz = só Claude Opus (mais recente), local, background, agêntico (R2). Heurística
  destruída (R1).
- Reavaliação no próximo disparo do cron (~240min), considerando o comentário com
  honestidade (R6); reajuste rotulado "ajuste pela perícia".

## 7. Critérios de aceite

1. Nenhuma avaliação nova com `judgeVersion` heurístico; engine/CLI/UI removidos;
   build (tsc/eslint/jest) verde.
2. Item PENDENTE periciado pelo Claude mostra `judgeVersion` da perícia agêntica e
   razões que referenciam a verificação via MCP/banco.
3. Voto/comentário do usuário após veredito terminal → eval vira "Reavaliação" na
   UI; no disparo seguinte o Claude reconcilia e (quando muda) registra "ajuste
   pela perícia".
4. Vereditos heurísticos de hoje resetados e re-periciados.
5. Agendador dispara após o boot (não só após 240min).

## 7.1 Decisões resolvidas nas reviews (v3)

- **D1 (re-fetch):** a perícia re-busca o dado REAL chamando a camada de queries
  (`src/lib/reports/queries/**`, o que as tools MCP encapsulam) , não confia no
  `toolResults` persistido. MCP é opcional/secundário; o que vale é re-executar e
  comparar.
- **D2 (boot-fire guardado):** dispara ~3min após boot só se houver fila E
  `lastJudgeRunAt` (persistido em `AgentSettings`) for mais antigo que o intervalo.
  Não dispara a cada restart de dev.
- **D3 (precedência):** `humanStatus` setado > perícia. Voto do usuário NÃO marca
  REAVALIAR quando há `humanStatus`; a perícia nunca sobrescreve ajuste humano.
- **D4 (gatilho REAVALIAR):** só quando, após veredito terminal e sem `humanStatus`,
  o voto **diverge** do status efetivo OU tem **comentário**.
- **D5 (ajuste pela perícia):** re-perícia grava veredito em `status`, anexa
  `[AJUSTE-PERICIA <ts>] <razão> (voto do usuário considerado: <rating>/"<comment>")`
  em `razoes`; drill-down rotula "ajuste pela perícia"; nunca toca `humanStatus`.
- **D6 (modelo):** juiz headless roda `claude --model opus -p ...` (força Opus).
- **D7 (UI):** card da heurística vira "Perícia (Claude)" mantendo o input de
  intervalo (`qualityHeuristicIntervalMinutes`); remove só o específico da heurística.
- **judgeVersion padronizado:** `claude-pericia-v1` em todo o pipeline novo.

## 8. Próximos passos do workflow

SPEC (este doc) → review #1 → SPEC v2 → review #2 → SPEC v3 → PLAN v1→v3 →
execução em microtarefas → verificação E2E contra dado real → code/UI review.
