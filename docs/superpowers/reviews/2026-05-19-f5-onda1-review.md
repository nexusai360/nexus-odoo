# F5 — Review da Onda 1 (fundação de dados + núcleo do agente)

> Review de bloco (Opus) após a execução da onda 1 por subagente (Sonnet).

## Estado entregue
18 tasks, 18 commits atômicos em `feat/integracao-whatsapp` (`e7533d9`→`1eab80a`).
Migration `f5_agent_core` aplicada (Tasks 1.1+1.2 consolidadas numa migration —
desvio menor aceitável). Verificação: `tsc` limpo; `jest` 939/939 (101 novos em
`src/lib/agent`); `eslint` — 1 warning trivial (import não usado em
`catalog.test.ts`), **corrigido na review**.

## Achados

**O1 — `runAgent` não lê `AgentSettings` (MATERIAL).** `run-agent.ts` usa um
`DEFAULT_PROMPT_CONFIG` hardcoded (identidade/personalidade/tom vazios,
`kbEnabled:false`) com comentário "futuramente virá de AgentSettings". O singleton
`AgentSettings` existe no schema mas não é consumido. Sem isso, a configuração de
prompt feita pela UI não tem efeito. **Resolução:** adicionada a **Task 3.0e** ao
plano — ligar `AgentSettings` ao `runAgent` assim que as actions de
`AgentSettings` existirem (Task 3.0a) + seed do singleton. Não é bloqueio da
onda 1 (o núcleo funciona com defaults); é dívida rastreada.

**O2 — Migrations 1.1 e 1.2 consolidadas (MENOR).** O subagente fez uma migration
só (`f5_agent_core`) cobrindo conversa+LLM+settings+WhatsApp+API keys, em vez de
duas. Sem impacto — a migration aplica e o schema está correto. Aceito.

**O3 — `void start;` vestigial em `run-agent.ts` (COSMÉTICO).** Variável `start`
declarada e só "consumida" por `void start;`. Sem impacto funcional. Pode ser
limpo num passe futuro; não justifica commit isolado agora.

## Veredito
Onda 1 **aprovada**. Núcleo do agente (multi-LLM, orquestrador, cliente MCP,
prompt, conversa, uso) implementado com TDD, tsc/jest verdes. O único achado
material (O1) está rastreado como Task 3.0e — não bloqueia o avanço para a
onda 2. Prosseguir.
