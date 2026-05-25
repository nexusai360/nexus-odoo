---
agent: claude-agente-nex-inteligencia
started_at: 2026-05-25T20:10-03:00
branch: feat/agente-nex-inteligencia
target_phase: F5+ (evolucao do Agente Nex: inteligencia, precisao, personalizacao)
status: in_progress
---

## Topico

Evolucao do Agente Nex para maior inteligencia, precisao e personalizacao. Quatro frentes integradas:

1. **Analise retrospectiva de qualidade**: cruzar todas as conversas existentes (>= 6k conversas, >= 10k requisicoes LLM), reproduzir tool calls, avaliar correcao das respostas, identificar padroes de falha. Saida: dataset rotulado + relatorios + propostas de melhoria do prompt-mestre.
2. **Sugestoes iniciais personalizadas por perfil**: as chips de welcome (welcome-suggestions.ts) deixam de ser estaticas e passam a refletir o uso historico de cada usuario (assuntos mais consultados, dominios, palavras-chave).
3. **Sugestoes de continuidade contextual**: as chips pos-resposta consideram os ultimos 5 pares pergunta-resposta da sessao, evitam caminhos ja explorados e seguem o "norte" do usuario.
4. **Bullets-pergunta da resposta viram chips**: quando a IA gera perguntas no corpo da resposta (dissertativo ou bullets), elas sao promovidas para as chips de sugestao (cap subindo de 3 para ate 7 nesse caso, ja existe extrator parcial em `src/lib/agent/suggestions-extractor.ts` e logica de extractBulletQuestions registrada no HISTORY 2026-05-25 04:30).

Trabalho em modo autonomo (CLAUDE.md §6): brainstorm -> SPEC v1 -> review #1 -> SPEC v2 -> review #2 -> SPEC v3 -> PLAN v1 -> review #1 -> review #2 -> PLAN v3 -> execucao em ondas -> verificacao com dado real -> code review + UI review.

## Arquivos que provavelmente vou tocar

**Backend / dados:**
- `prisma/schema.prisma` (novas tabelas: `UserAgentProfile`, `ConversationQualityEvaluation`, `SuggestionInteraction`; possivel coluna `topicTags` em `Conversation` ou `Message`)
- `prisma/migrations/<nova>` (migration correspondente)
- `src/lib/agent/intelligence/*` (NOVOS: perfil de usuario, scorer de qualidade, gerador de sugestoes contextuais)
- `src/lib/agent/welcome-suggestions.ts` (passa a consumir perfil; mantem fallback estatico)
- `src/lib/agent/suggestions-extractor.ts` (revisao: bullets-pergunta + contextuais)
- `src/lib/agent/enhance-chips.ts` (possivel re-uso)
- `src/lib/agent/run-agent.ts` (instrumentacao: registrar topico/tags por conversa; alimentar profile builder; gerar sugestoes contextuais pos-resposta)
- `src/lib/agent/conversation.ts` (helper de "ultimos N pares")
- `src/lib/agent/llm/compose.ts` (eventual ajuste de prompt-mestre baseado em achados da analise)
- `src/lib/agent/llm/identity-base.ts` (idem)

**UI:**
- `src/components/agent/suggestions-bar.tsx` (cap dinamico 3 vs 7; visual)
- `src/components/agent/chat-panel.tsx` (eventual cabeamento de novas sugestoes)
- Pagina/painel novo de "Qualidade do Agente" (admin/super_admin) com relatorios da analise retrospectiva — caminho a definir (provavel `/agente/qualidade` ou `/agente/inteligencia`)

**Scripts e jobs:**
- `scripts/analyze-conversations.ts` (NOVO: rodador batch da analise retrospectiva)
- `scripts/build-user-profiles.ts` (NOVO: builder de perfil por usuario)
- `src/worker/jobs/agent-intelligence.ts` (NOVO: cron de atualizacao incremental de perfis)
- `src/worker/index.ts` (registrar nova queue/cron)

**Specs e plans:**
- `docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md` (v1->v3)
- `docs/superpowers/specs/reviews/2026-05-25-inteligencia-review-{1,2}.md`
- `docs/superpowers/plans/2026-05-25-agente-nex-inteligencia-plan.md` (v1->v3)

## Arquivos compartilhados que VOU modificar (alta probabilidade de conflito)

- `prisma/schema.prisma`
  > Risco: outros agentes podem precisar mexer. Vou minimizar superficie (apenas ADD em novos models + uma coluna scalar opcional, sem alterar models existentes). Migration idempotente com `IF NOT EXISTS`.
- `src/components/agent/` (familia compartilhada)
  > `chat-panel.tsx`: o agente `claude-nex-bubble-storytelling` ja mexeu (auto-scroll v3 em ed32e2e). Se ele estiver ativo quando eu chegar nesse arquivo, vou esperar/coordenar. Atualmente foi ultima edicao registrada.
  > `agent-message.tsx`: NAO pretendo tocar (animacoes da bubble sao do storytelling).
  > `suggestions-bar.tsx`: nao parece tocado pelos outros active agents.
- `src/lib/agent/run-agent.ts`
  > Tocado recentemente (e044025, consumo-polish). Sessao do polish ja registrou e nao parece prever mais edicoes ali. Mas continua ativo na area /consumo. Coordeno via HISTORY antes de commitar.
- `src/lib/agent/suggestions-extractor.ts`
  > Criado pelo storytelling em 0c2e7f1. Vou estender, nao reescrever. Coordenacao com storytelling necessaria.
- Possivel: `src/lib/agent/llm/compose.ts` e `identity-base.ts` se a analise indicar evolucao do prompt-mestre (rare path).

## Decisoes / contexto importante

- **Branch isolada**: trabalho aqui em `feat/agente-nex-inteligencia` (saindo de `feat/f4-leitura-expansao`) para zerar conflito de execucao com os 2 agentes ativos. Merge desta branch volta para a feature branch quando estavel.
- **Escopo grande -> decomposicao em ondas**. A SPEC definira ondas; a primeira entrega contera fundacao (dataset/perfil) + bullets->chips ja existentes consolidados; ondas seguintes entregam analise retrospectiva, sugestoes personalizadas iniciais, sugestoes contextuais.
- **Privacidade**: dados de conversa do Agente Nex sao do tenant do usuario. Perfil agregado fica no mesmo tenant. Nao cruza tenant.
- **LLM judge para qualidade**: a avaliacao automatica das 6k+ conversas usara um modelo forte (provavelmente Claude Opus 4.7 ou Gemini 2.5 Pro thinking) como juiz; custo controlado por amostragem estratificada na onda 1 e expansao gradual.
- **Re-execucao de tool calls**: a analise retrospectiva precisa rodar as tools de leitura (MCP semantico) novamente para validar se a resposta da IA era de fato suportada pelos dados. Read-only por construcao (nunca dispara `write:*`).

## Bloqueios

- (vazio inicialmente — vou registrar aqui se aparecerem coordenacoes necessarias com os outros 2 agentes ativos)
