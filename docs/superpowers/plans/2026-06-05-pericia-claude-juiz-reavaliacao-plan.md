# Plan v3 , Perícia agêntica + Reavaliação

> Sobre a SPEC v3. Tasks bite-sized. v3 = após 2 reviews (seção final).

## Fase A , Fundação do status REAVALIAR
- **A1** Localizar o local canônico de status (`EVAL_STATUS_LABEL`, `PERICIA_COLOR`,
  `TERMINAL`, `EvalStatus`) e adicionar `REAVALIAR` → label "Reavaliação", cor
  própria (âmbar/azul distinto de PENDENTE), **fora** de TERMINAL.
- **A2** `eval-status-badge.tsx`: renderizar REAVALIAR (ícone/cor).
- **A3** `monitoramento-bubble(-helpers)`: `periciaBucket(REAVALIAR)` = null (não
  entra na acurácia, igual PENDENTE).

## Fase B , Arrancar a heurística
- **B1** Deletar `src/lib/agent/quality/auto-heuristic.ts`.
- **B2** Deletar `scripts/quality-audit/heuristic-eval-agente-nex-pendentes.ts`.
- **B3** `src/worker/index.ts`: remover `JOB_AUTO_HEURISTIC`, handler no-op e
  (re)agendamento; preservar o resto da fila intacto.
- **B4** `auto-heuristic-config.tsx` → renomear para config "Perícia (Claude)"
  mantendo o input de intervalo; `quality-heuristic-config.ts` mantém o campo
  `qualityHeuristicIntervalMinutes` (SEM migration; só relabela na UI).
- **B5** Atualizar referências em `monitoramento-content.tsx` / `page.tsx`.

## Fase C , Pipeline do juiz (perícia agêntica)
- **C1** `claude-judge-runner.ts`: spawn `claude --model opus -p <JUDGE_PROMPT>`;
  novo `JUDGE_PROMPT` agêntico; `triggerClaudeJudge` conta/inclui `PENDENTE` +
  `REAVALIAR`.
- **C2** `judge-scheduler.ts`: boot-fire único ~3min após boot se houver fila
  (lock in-process evita concorrência); mantém ciclo por intervalo.
- **C3** `scripts/quality-audit/pendentes-io.ts`: `--dump` inclui itens
  PENDENTE+REAVALIAR com `userVote`+`comment` (join MessageFeedback) e
  `toolCalls`/`toolResults`; `--apply` grava `judgeVersion="claude-pericia-v1"`,
  e em REAVALIAR anexa `[AJUSTE-PERICIA <ts>]` em `razoes` (preservando o que já
  havia). Nunca toca `humanStatus`.
- **C4** Helper `scripts/quality-audit/rerun-toolcall.ts`: recebe um toolCall
  persistido (name+args) e re-executa a query real, imprimindo o resultado , dá
  base determinística pro Claude "refazer a mesma requisição". Se o mapeamento
  tool→função não for trivial, o playbook orienta re-derivar via camada de queries.
- **C5** Reescrever `docs/quality-judge-playbook.md`: passos agênticos
  (ler pergunta+resposta+toolCalls; **re-executar** via helper/queries; comparar;
  cravar status; em REAVALIAR, considerar voto/comentário com honestidade).
- **C6** `trigger.ts`: `JUDGE_VERSION="claude-pericia-v1"`.

## Fase D , Gatilho do voto → REAVALIAR
- **D1** `message-feedback.ts`: após gravar o voto, buscar eval por
  `assistantMessageId`; se eval **terminal** E `humanStatus` nulo E (voto
  **diverge** do status efetivo OU há comentário) → `status="REAVALIAR"`
  (fire-and-forget, não bloqueia o voto).

## Fase E , UI do "ajuste pela perícia"
- **E1** `evaluation-drilldown.tsx`: `parseRazoes` reconhece `[AJUSTE-PERICIA ...]`
  e renderiza como "ajuste pela perícia" (distinto do humano), sem quebrar o
  parsing do ajuste humano.

## Fase F , Re-julgar o passado sujo
- **F1** Rodar/atualizar `scripts/quality-audit/reset-heuristic-to-pending.ts`:
  vereditos `heuristica-agente-nex-v1` → PENDENTE, preservando `humanStatus`.

## Fase G , Verificação
- **G1** `tsc` + `eslint` (arquivos tocados) + `jest` (suites de quality).
- **G2** Disparar o juiz contra 1 pendente (se `claude` disponível) e inspecionar
  o veredito/razões; conferir reset.

## Reviews do plano (v1→v3)

**Review #1 (v1→v2):**
- `lastJudgeRunAt` exigiria nova coluna (migration). **Resolução:** boot-fire
  único guardado só por "há fila?" + lock in-process; sem coluna nova, sem
  migration (evita o protocolo de schema entre worktrees). [C2]
- Renomear a coluna `qualityHeuristicIntervalMinutes` = migration. **Resolução:**
  manter coluna; relabela só na UI. [B4]
- Remoção do worker não pode derrubar outras jobs. **Resolução:** B3 cirúrgico,
  ler o entorno antes de editar.

**Review #2 (v2→v3):**
- `triggerClaudeJudge` só conta PENDENTE. **Resolução:** incluir REAVALIAR no
  count e no dump. [C1/C3]
- "Refazer via MCP" frágil. **Resolução:** helper `rerun-toolcall.ts` re-executa
  a query real do toolCall persistido (determinístico); MCP é opcional. [C4]
- Parsing de "ajuste pela perícia" não pode quebrar o ajuste humano existente.
  **Resolução:** marcador dedicado `[AJUSTE-PERICIA ...]`, E1 só adiciona um caso. 
- Produção (juiz local-only) permanece gap conhecido, fora de escopo.

**Critério de saída:** cada task é unidade pequena verificável; sem achado
material novo. Pronto para execução.
