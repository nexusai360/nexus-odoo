# PLAN , Nex Arquitetura 3.0, Onda M (memória)

> **Versão: v3** (2 reviews aplicadas , workflow stallou, auditoria refeita INLINE com verificação dirigida; achados em `2026-06-12-onda-m-reviews-inline.md`)
> Spec: `specs/2026-06-12-nex-arquitetura-3-design.md` (v3). Research: os 4 docs
> `research/2026-06-12-*.md`. Nomes REAIS confirmados no schema: `Conversation`
> (tabela `conversations`, tem `reasoningHistory`, `topicTags`), `Message`
> (tabela `messages`, campos `toolCalls Json?`, `toolResults Json?` , JÁ
> persiste resultados), R2-ctx = `src/lib/agent/router/contextualize.ts`
> (`reformulateQuestion`).
>
> Regras de execução: TDD por task (teste primeiro), commit atômico por task,
> tsc+jest no fim de cada task, golden 171 intocado, subida só via `ship.py`.
> Validação E2E paga: manual no fim da onda (bateria 30 turnos ~US$0,50).

## Tarefas (ordem de execução)

### M.0 , Harness (gate de tudo, vem primeiro)

- **T0.1** `src/lib/agent/memoria/__fixtures__/conversa-30-turnos.ts`
  Fixture determinística: 30 turnos sintéticos (user/assistant) com
  `toolResults` realistas (faturamento, estoque, cliente) e números
  conhecidos por turno (ex.: turno 3 = "R$ 123.456,78 estoque da esteira X").
  Verificação: arquivo exporta `CONVERSA_30_TURNOS: Array<{role, content,
  toolCalls?, toolResults?}>` e constantes `NUMERO_TURNO_3` etc.
- **T0.2** `scripts/ab-cerebro.ts`: suportar `expectativasPorTurno?:
  Array<{turno: number; deveConter: string[]}>` no caso (asserção da resposta
  de turnos intermediários, não só do final). Verificação: jest do harness
  (se houver) + dry-run sem LLM (parse do caso).

### M.1 , toolDigest (deriva do que JÁ está no banco)

- **T1.1** `prisma/schema.prisma`: `Message.toolDigest String? @map("tool_digest") @db.Text`
  + migration `add_tool_digest`. Verificação: `prisma migrate dev` local +
  `tsc`.
- **T1.2** `src/lib/agent/memoria/tool-digest.ts` (NOVO, puro):
  `derivarToolDigest(toolResults: ToolResultCanonico[]): string | null`.
  Formato (1-3 linhas): `"[tool] dominio=X args-chave: ...; numeros: _DESTAQUE
  serializado curto / _agregado"`. Inclui `dominio` da tool (lookup no
  catálogo snapshot `src/lib/mcp-catalog-snapshot.json` por id). Cap 400
  chars. TDD: `tool-digest.test.ts` com casos de faturamento/estoque/vazio/
  null.
- **T1.3** Persistência: no ponto do `run-agent.ts` onde a mensagem assistant
  final é gravada com `toolResults`, gravar também `toolDigest` (derivação
  síncrona). Verificação: teste de integração leve (mock prisma) + E2E dev
  1 pergunta e SELECT do digest.
- **T1.4** `scripts/backfill-tool-digest.ts`: lotes de 500, idempotente
  (`WHERE tool_results IS NOT NULL AND tool_digest IS NULL`), log de
  progresso. Rodar em dev; em prod roda após o ship da onda (via Portainer
  exec, rota conhecida). Verificação: contagem antes/depois em dev.

### M.2 , Janela por TURNOS com síntese textual (o coração)

- **T2.1** `src/lib/agent/conversation.ts`: nova função `loadHistoryTurnos(
  conversationId, maxTurnos=10)`: carrega mensagens suficientes (take maior,
  ex. 60 linhas), agrupa em turnos (turno = user + assistants até o próximo
  user), corta pelos últimos `maxTurnos` TURNOS. TDD com fixture T0.1.
- **T2.2** Síntese textual no replay (mesmo arquivo): assistant com
  `toolCalls` NÃO é descartado nem replayado cru , vira UMA mensagem
  assistant com `content = content final + "\n\n[consultas do turno: " +
  toolDigest + "]"`. `sanitizeHistoryPairs` deixa de existir para esse fim
  (mantida só para o que ainda precisar). GARANTIA multi-provider: o array
  retornado NUNCA contém `toolCalls`/`role:"tool"` órfãos. TDD: teste
  explícito de shape para OpenAI/Anthropic adapters.
- **T2.3** `src/lib/agent/prompt/montar-conversa.ts`: usar a janela por
  turnos; RBAC , digest de domínio fora de `userAllowedDomains` é redigido
  para `"[dado de domínio sem acesso]"`. TDD: `montar-conversa.memoria.test.ts`
  com a fixture (asserta: número do turno 3 PRESENTE no prompt de 30 turnos;
  budget ≤ teto; digest de domínio revogado AUSENTE).
- **T2.4** `context-window.ts`: semântica do `context_window_size` muda de
  linhas para TURNOS (default 10). Atualizar comentário/teste/`agent_settings`
  se houver UI.

### M.3 , focoAtual (working memory determinística)

- **T3.1** `prisma/schema.prisma`: `Conversation.focoAtual Json? @map("foco_atual")`
  + migration. Verificação: migrate + tsc.
- **T3.2** `src/lib/agent/memoria/foco-atual.ts` (NOVO, puro):
  `derivarFocoAtual(prev: FocoAtual|null, turno: {pergunta, toolCalls,
  toolResults, respostaFinal}): FocoAtual` , extrai métrica (id da tool),
  período (args periodoDe/periodoAte ou periodoLabel do _DESTAQUE), entidades
  (args termo/empresaRef/vendedor/documento + nomes do _DESTAQUE), último
  resultado-chave (1 número headline + messageId). Shape da spec §3.1 do
  research de memória. TDD completo (inclui herança: turno sem período mantém
  o anterior).
- **T3.3** Persistir no fim do turno (run-agent) e INJETAR como L4 no
  `montar-conversa.ts` (bloco system curto no FIM do prompt, com RBAC).
  TDD no montar-conversa.memoria.test.ts.
- **T3.4** Unificação R2-ctx: `contextualize.ts#reformulateQuestion` recebe o
  `focoAtual` e o usa como fonte primária (entidade/período em foco) antes do
  comportamento atual. TDD: casos de anáfora do contextualize.test.ts +
  novos ("e do mês passado?" com focoAtual de maio → junho? não: maio-1...).

### M.4 , ConversationEntity + anáfora

- **T4.1** `prisma/schema.prisma`: model `ConversationEntity` (spec research
  §3.2: tipo/chaveCanonica/rotulo/ultimoTurno/mencoes, unique por conversa+
  tipo+chave) + migration.
- **T4.2** `src/lib/agent/memoria/entidades.ts` (NOVO): upsert das entidades
  do turno (das mesmas extrações do T3.2; recência = nº do turno). Chamado no
  fim do turno. TDD.
- **T4.3** Heurística de anáfora no contextualize: pronome/elipse → entidade
  mais recente do tipo compatível; ambiguidade real → pergunta curta de
  clarificação (regra 12b existente). Fallback CQR só se heurística não
  fechar (usa o caminho LLM que o contextualize já tem). TDD.

### M.5 , resumoProgressivo (async)

- **T5.1** `prisma/schema.prisma`: `Conversation.resumoProgressivo String?
  @db.Text`, `resumoAteMensagemId String?`, `resumoAtualizadoEm DateTime?`
  + migration.
- **T5.2** Job BullMQ `agent-resumo-conversa` (padrão do job
  `agent-topic-tagging` existente): dispara no fim do turno quando
  (mensagens desde o último resumo) ≥ 8; re-resume SEMPRE das mensagens
  originais (não resumo-de-resumo) com mini, cap 600 tk, conteúdo factual
  com números+proveniência; grava os 3 campos. TDD da função pura de
  montagem do prompt de resumo; o job em si com mock.
- **T5.3** Injeção L2 no montar-conversa (entre system e janela), com RBAC
  lazy (se `userAllowedDomains` mudou desde o resumo, re-resumir antes de
  injetar , ou redigir). TDD no teste de montagem.

### M.6 , Validadores memory-aware (junto com M.2, NUNCA depois)

- **T6.1** `auto-validator.ts`: `ValidationContext` ganha `fontesMemoria:
  {digests: string[], focoAtual?: string, resumo?: string}` (exatamente o que
  foi injetado no prompt); V2/V5/guardrail incluem números dessas fontes no
  conjunto legítimo. TDD: resposta com número do digest do turno 3 PASSA;
  número inventado segue reprovado.
- **T6.2** Hints de retry citam a fonte ("o número correto está no resumo da
  conversa: R$ X"). TDD dos hints.

### Fechamento da onda

- **TF.1** Suíte completa + golden 171 + teste determinístico de memória.
- **TF.2** Backfill dev + bateria E2E `memoria-30-turnos` via ab-cerebro
  (1 run, ~US$0,50): M1 (turno 28 lembra o turno 3) e M2 (anáfora) verdes.
- **TF.3** Replay da conversa real `a395702f` (10 perguntas) , sem regressão.
- **TF.4** PROGRESSO/HISTORY/STATUS + `python3 scripts/ship.py "feat(nex): onda M memoria"`.
- **TF.5** Pós-deploy: backfill em prod (Portainer exec) + sync-agent-prompt
  se o prompt mudou + smoke em prod.

## Riscos operacionais da onda

- `prisma migrate dev` mexe em schema compartilhado entre worktrees →
  protocolo `agente schema-changed` + avisar; migrations são aditivas
  (colunas nullable + tabela nova), zero risco para o app atual.
- Backfill em prod toca tabela `messages` quente → lotes pequenos, idempotente.
- Mudança de janela aumenta tokens/turno → medir `tokensCachedInput` antes/
  depois (telemetria existente) , budget na spec §2/C1.
