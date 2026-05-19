# F5 — Review #2 do PLAN v2 → achados para a v3

> Review #2 (de 2), a mais profunda: granularidade, integração, testabilidade.
> Critério da metodologia (`CLAUDE.md §6 [7]`): nenhuma task pode esconder mais
> de uma unidade de trabalho. Se uma task é um épico, é redecomposta.

## Épicos a decompor (decomposição máxima)

**G1 — Task 1.7 "adapters de provedor LLM" é um épico.** Cria 4 adapters +
`get-client` + `get-active-config` numa task só. Cada adapter é uma unidade
testável isolada. v3: quebrar em —
- Task 1.7a — adapter Anthropic + `get-client` (factory).
- Task 1.7b — adapter OpenAI (inclui o caso reasoning).
- Task 1.7c — adapters Gemini e OpenRouter.
- Task 1.7d — `get-active-config` (lê `LlmConfig`/`LlmCredential`).

**G2 — Task 3.3 "componentes de chat" é um épico.** 5 componentes numa task.
v3: quebrar em —
- Task 3.3a — `agent-message` + `suggestions-bar`.
- Task 3.3b — `chat-panel` (consome o SSE).
- Task 3.3c — `audio-recorder` + `audio-player`.

**G3 — Task 3.0 "UI de configuração do agente" é um épico.** Server actions + 3
forms. v3: quebrar em —
- Task 3.0a — Server Actions `agent-config.ts` (AgentSettings + ativar
  LlmConfig transacional) + teste.
- Task 3.0b — `credentials-section` + `llm-config-form` (UI).
- Task 3.0c — `prompt-config-form` + `identity-base-editor` +
  `resources-toggles` (UI) + a página `/agente/configuracao` que os monta.

**G4 — Task 5.2 (consumo) porta um componente de 1059 linhas numa task.** v3:
quebrar em — Task 5.2a (KPIs + wiring de dados), Task 5.2b (gráficos:
custo/dia, donut provider, barras modelo), Task 5.2c (tabela paginada +
drill-down + filtros + a página).

## Achados de integração

**G5 — Tipo `ToolDefinition` precisa existir em `types.ts` (Task 1.3).** O
`mcpToolsToProviderTools` (Task 1.10) produz `ToolDefinition[]`; os `mapTools`
dos adapters (Task 1.7x) consomem. v3: a Task 1.3 deve garantir que o port de
`types.ts` inclui o tipo da definição de tool (no Nex vinha do `tools/`); se não
vier, a Task 1.3 o define. Sem isso as Tasks 1.7 e 1.10 referenciam um tipo
inexistente.

**G6 — Normalização do resultado da tool MCP → mensagem `role:"tool"`.** A Task
1.13 (`runAgent`) recebe o resultado de `session.callTool` (formato MCP:
`content[]`) e precisa convertê-lo em texto para a `ChatMessage` de role `tool`.
v3: a Task 1.13 deve explicitar o passo "normalizar o resultado MCP para string
+ aplicar o guard de tamanho" antes de realimentar no loop.

**G7 — `runAgent` precisa do `PlatformRole` do usuário.** A Task 1.13 injeta
`BI_SCHEMA_REFERENCE` só para admin/super_admin, mas só recebe `userId`. v3: a
Task 1.13 deve carregar o `PlatformRole` do `User` (uma query) para decidir a
injeção.

## Achados de testabilidade

**G8 — Task 3.2 (SSE) — abordagem de teste.** Testar `ReadableStream`/SSE no
jest exige consumir o stream e asserir a sequência de eventos. v3: o Step 1 da
Task 3.2 deve descrever o método (ler o `Response.body` como stream, coletar os
eventos `status`/`text`/`done`, asserir a ordem).

**G9 — Onda 4 precisa de script de verificação e2e.** A Task 4.8 descreve o e2e
do webhook como manual ("POST assinado"). Um POST HMAC-assinado à mão é
frágil. v3: adicionar `scripts/verify-f5-onda4.ts` que assina o payload com o
secret e dispara contra o `/inbound` — análogo ao `verify-f5-onda1.ts`.

## Achados menores
- **G10 — Task 6.4** cita "webhooks vinculados" antes de a Task 6.6 existir —
  resolver mostrando um link para `/integracoes/webhooks` (não duplicar UI).
- **G11 — Task 1.13** é grande mas é **uma** responsabilidade (o orquestrador,
  um arquivo). Aceitável como task única — não é épico, é um componente coeso.

## Veredito
A v2 corrigiu as lacunas de dependência da #1. A #2 encontrou **4 épicos**
(G1–G4) que violam a regra de decomposição máxima e precisam ser quebrados, e
**3 detalhes de integração** (G5–G7) que, sem explicitação, gerariam
inconsistência na execução. A v3 decompõe G1–G4 e detalha G5–G9. Após a v3 —
nenhuma task esconde mais de uma unidade de trabalho — o plano está pronto para
a execução.
