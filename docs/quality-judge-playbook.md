# Playbook , Avaliação de pendentes pelo Claude Code (NÃO usar GPT)

> O juízo das avaliações PENDENTE do Backtest é feito pelo **próprio Claude Code**
> (a assinatura), nunca por chamada a um LLM externo (GPT etc.). Este playbook é
> o que o Claude Code headless executa quando o botão "Avaliar pendentes" é
> clicado (ambiente local), e também o que o Claude desta sessão deve seguir se o
> usuário pedir "avalie os pendentes" no terminal.

## Quem dispara o juízo (3 caminhos, todos rodam ESTE playbook)

1. **Botão "Avaliar pendentes"** (super_admin, ambiente local) , `evaluatePendentesAction`.
2. **Cron automático host-side** , `src/instrumentation.ts` agenda
   `src/lib/agent/quality/judge-scheduler.ts`, que a cada intervalo
   (`AgentSettings.qualityHeuristicIntervalMinutes`, default 240min) dispara o mesmo
   juízo. **Local-only** (o worker/container não enxerga o CLI `claude`; por isso vive
   no processo do Next). Não dispara no boot.
3. **Manual no terminal** , o usuário pede "avalie os pendentes".

Os caminhos 1 e 2 compartilham `src/lib/agent/quality/claude-judge-runner.ts`
(`triggerClaudeJudge`), com **lock in-process** , nunca dois juízos ao mesmo tempo.

> **A heurística sem LLM (`heuristica-agente-nex-v1`) foi APOSENTADA.** Não há mais
> classificação automática por regras. Para re-julgar avaliações que ficaram com aquele
> `judgeVersion`, use `scripts/quality-audit/reset-heuristic-to-pending.ts --apply`
> (volta a PENDENTE, preservando as com ajuste humano) e dispare o juízo.

## Ancoragem temporal (REGRA DE RAIZ ao julgar)

"Mês corrente", "hoje", "esta semana" referem-se à data da **requisição**
(`evaluation.createdAt`), NÃO à data em que você está julgando. Ex.: uma pergunta de
28/05 sobre "mês corrente" = **maio**. Resolver isso errado gera falso-ERRADO.

## Passos

1. Dump dos pendentes:
   ```bash
   npx tsx scripts/quality-audit/pendentes-io.ts --dump
   ```
   Gera `/tmp/nex-pendentes.json` com `[{id, question, answer, transcript}]`.

2. Julgar CADA item (você, Claude Code, lendo o conteúdo). Para cada um, decida:
   - **status** (um de): `CORRETO`, `PARCIAL`, `ERRADO`, `FORA_DO_ESCOPO`, `FALHA_TECNICA`.
   - **patterns**: 1 a 3 tags do VOCABULÁRIO CANÔNICO abaixo (a 1ª é a dominante).
     NUNCA invente tag nem derive do texto da pergunta (ex.: "186 notas" é PROIBIDO).
   - **razoes**: 1-2 frases objetivas.

3. Escreva `/tmp/nex-pendentes-judged.json` = `[{id, status, patterns, razoes}]` e aplique:
   ```bash
   npx tsx scripts/quality-audit/pendentes-io.ts --apply
   ```
   Isso grava `status/patterns/razoes`, `judgeModel="claude-code"`, `judgeVersion="claude-code-v1"`.

## Rubric de status

- **CORRETO**: responde de forma útil e coerente com os dados/tools; OU, quando
  não havia dado, diz honestamente "não há X no período" (vazio != erro).
- **PARCIAL**: responde em parte; falta algo pedido, ou mistura certo e impreciso,
  ou devolve dado cru sem resumir.
- **ERRADO**: contradiz os dados, inventa número/nome, ou erra a interpretação.
- **FORA_DO_ESCOPO**: pergunta fora do domínio de negócio do agente.
- **FALHA_TECNICA**: a resposta é erro/indisponibilidade ("não consegui obter",
  "erro ao", "tente novamente"), JSON cru, ou placeholder ("Xs atrás").

## Vocabulário CANÔNICO de patterns (use SOMENTE estes)

Acertos:
- `resposta_correta` , respondeu certo com dados.
- `acerto_estado_vazio` , disse corretamente que não há dado no período.
- `acerto_clarificacao` , pediu esclarecimento pertinente para um pedido vago.
- `acerto_objetividade` , resposta objetiva, direta e correta.
- `limitacao_real_declarada` , declarou honestamente uma limitação real.

Falhas/atenção:
- `resposta_truncada` , cortou no meio / incompleta.
- `lacuna_prematura` , disse que não sabe / recusou sem tentar a tool.
- `recusa_indevida` , recusou algo que está no escopo.
- `nao_usou_tool` , deveria ter usado tool e respondeu sem dado.
- `tool_erro` , tool falhou ou retornou erro técnico.
- `dado_inventado` , inventou número/nome/código.
- `resposta_crua` , devolveu JSON/estrutura sem formatar.
- `fora_do_escopo` , fora do domínio de negócio.

Incerteza (evitar; só em ambiguidade real):
- `heuristica_incerta`.

## Regras
- A coluna "Padrão dominante" da UI mostra a 1ª tag de `patterns`. Por isso a 1ª
  tag deve ser a mais representativa do veredito.
- O gráfico "top padrões" agrega essas tags , tags livres poluem o gráfico.
- Idempotente: só toca itens em `PENDENTE`.
