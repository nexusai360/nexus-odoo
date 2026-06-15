# Playbook , PERÍCIA agêntica das avaliações (Claude Code, Opus , NÃO usar GPT/heurística)

> A perícia das avaliações **PENDENTE** e **REAVALIAR** do Backtest é feita pelo
> **próprio Claude Code (Opus)**, de forma **agêntica**: não basta ler e julgar ,
> é preciso **refazer a consulta contra o dado real** e conferir a verdade. NUNCA
> use GPT, LLM externo ou heurística de regras (a heurística foi **arrancada**).

## Quem dispara (todos rodam ESTE playbook)

1. **Botão "Avaliar pendentes"** (super_admin, ambiente local) , `evaluatePendentesAction`.
2. **Agendador host-side** , `src/instrumentation.ts` → `src/lib/agent/quality/judge-scheduler.ts`:
   dispara **~3min após o boot** (se houver fila) e depois a cada intervalo
   (`AgentSettings.qualityHeuristicIntervalMinutes`, default 240min). **Local-only**
   (o worker/container não enxerga o CLI `claude`). Usa `claude --model opus`.
3. **Manual no terminal** , o usuário pede "avalie os pendentes".

Caminhos 1 e 2 compartilham `claude-judge-runner.ts` (`triggerClaudeJudge`), com
**lock in-process** (nunca dois juízos ao mesmo tempo).

## Ancoragem temporal (REGRA DE RAIZ)

"Mês corrente", "hoje", "esta semana" referem-se à data da **requisição**
(`createdAt` do item no dump), NÃO à data em que você está periciando.

## Passos

1. **Dump:**
   ```bash
   npx tsx scripts/quality-audit/pendentes-io.ts --dump
   ```
   Gera `/tmp/nex-pendentes.json`. Cada item tem: `id`, `status`
   (`PENDENTE`|`REAVALIAR`), `isReavaliacao`, `createdAt`, `question`, `answer`,
   `transcript`, `toolCalls`, `toolResults`, `userFeedback` (voto+comentário do
   usuário, quando houver) e `priorRazoes`.

2. **Perícia de CADA item (agêntica , a parte que importa):**
   1. Leia a `question` (pergunta do usuário) e a `answer` (resposta do agente
      GPT-5.4-mini).
   2. Olhe `toolCalls` (qual tool e quais args o agente usou). **NÃO confie** no
      `toolResults` persistido.
   3. **REFAÇA a consulta você mesmo contra o dado REAL** e responda a pergunta
      por conta própria. Caminhos (use o mais direto):
      ```bash
      # re-executa a MESMA tool do agente (mesmo handler) com os args dela:
      npx tsx scripts/quality-audit/rerun-toolcall.ts --name <toolId> --args '<json>'
      ```
      Fallback se a tool não casar: consulte a camada `src/lib/reports/queries/**`
      ou rode SQL direto no cache Postgres.
   4. **COMPARE** sua resposta com a `answer` do agente: os números, nomes,
      períodos e a conclusão batem com a verdade do dado?
   5. **Crave o status** (rubric abaixo) + `patterns` (vocabulário canônico) +
      `razoes` (1-3 frases objetivas citando a verificação que você fez).

3. **REAVALIAÇÃO (itens com `isReavaliacao=true`):** além do acima, **considere o
   `userFeedback`** (voto + comentário) com **honestidade e personalidade**:
   - Se o usuário tem razão e o dado confirma → **mude** o status e explique.
   - Se o usuário está enganado e o dado contradiz ele → **mantenha** o status e
     explique por quê (não vá na do usuário só porque ele reclamou).
   Em REAVALIAR, o `--apply` PRESERVA as razões anteriores e ANEXA sua conclusão
   como `[AJUSTE-PERICIA <ts>]` (vira "ajuste pela perícia" no drill-down).

4. **Aplicar:**
   ```bash
   # escreva /tmp/nex-pendentes-judged.json = [{id, status, patterns, razoes}]
   npx tsx scripts/quality-audit/pendentes-io.ts --apply
   ```
   Grava `status/patterns/razoes`, `judgeModel="claude-code"`,
   `judgeVersion="claude-pericia-v1"`. **Não pare até aplicar.**

## Rubric de status (terminal)

- **CORRETO**: bate com a verdade do dado; OU, sem dado, diz honestamente "não há X
  no período" (vazio ≠ erro).
- **PARCIAL**: responde em parte; falta algo, mistura certo e impreciso, ou devolve
  dado cru sem resumir.
- **ERRADO**: contradiz o dado real, inventa número/nome, ou erra a interpretação.
  (Ex.: o caso que vazou `[[suggestions]]` cru + não respondeu = ERRADO/FALHA.)
- **FORA_DO_ESCOPO**: fora do domínio de negócio do agente.
- **FALHA_TECNICA**: erro/indisponibilidade, JSON cru, placeholder, ou lixo de
  canal (`[[suggestions]]`) vazado no texto.

## Vocabulário CANÔNICO de patterns (use SOMENTE estes)

Acertos: `resposta_correta`, `acerto_estado_vazio`, `acerto_clarificacao`,
`acerto_objetividade`, `limitacao_real_declarada`.
Falhas/atenção: `resposta_truncada`, `lacuna_prematura`, `recusa_indevida`,
`nao_usou_tool`, `tool_erro`, `dado_inventado`, `resposta_crua`, `fora_do_escopo`.
Incerteza (evitar): `heuristica_incerta`.

## Regras

- A 1ª tag de `patterns` é a dominante (alimenta a coluna "Padrão dominante" e o
  gráfico). Nunca invente tag nem derive do texto da pergunta.
- Idempotente: o `--apply` só toca itens em `PENDENTE`/`REAVALIAR` e **respeita o
  ajuste humano** (`humanStatus` setado → não sobrescreve).
