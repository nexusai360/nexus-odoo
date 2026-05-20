# F5 — Verificação final e consolidação dos reviews

> Fechamento da F5 (Integração WhatsApp + Agente de IA). Consolida os 3 reviews
> adversariais Opus 4.7, as correções aplicadas e a verificação e2e real.

## 1. Reviews adversariais (Opus 4.7) — por onda

Três agentes Opus revisaram a F5 contra a SPEC v3 e o PLAN v3, com testes e
requisições reais:

| Review | Escopo | Achados |
|---|---|---|
| `2026-05-19-f5-review-ondas-1-2-7.md` | núcleo do agente, multi-LLM, RAG, cadastro WhatsApp | 0 CRÍTICO, 3 ALTO, 6 MÉDIO, 4 BAIXO |
| `2026-05-19-f5-review-ondas-3-5.md` | chat in-app, streaming, consumo, playground | 3 CRÍTICO, 4 ALTO, 5 MÉDIO, 4 BAIXO |
| `2026-05-19-f5-review-ondas-4-6.md` | webhook/WhatsApp, Integrações | 2 CRÍTICO, 3 ALTO, 4 MÉDIO, 3 BAIXO |

## 2. Bugs encontrados em teste e2e real (antes dos reviews)

Durante a verificação e2e contra o ambiente real (Postgres + MCP + worker + dev),
**dois bugs materiais** foram encontrados e corrigidos:
- **Middleware bloqueava o webhook receptor** — `POST /api/integrations/whatsapp/
  inbound` era redirecionado para `/login` (302) pelo NextAuth, tornando-o
  inalcançável pelo n8n. Fix: `aa9a737`.
- **`logUsage` fire-and-forget** — o registro de uso podia ser perdido quando o
  processo encerrava após a resposta. Fix: `0e731bc` (`Promise.allSettled`).

## 3. Correções aplicadas (5 CRÍTICO + 7 ALTO + 9 MÉDIO)

### Críticos
| # | Problema | Fix |
|---|---|---|
| C2 (4-6) | HMAC fail-open — endpoint aceitava POST não assinado sem webhook configurado | fail-closed (503 sem webhook) — `c0ec911` |
| C1 (4-6) | Job de áudio morria sem credenciais Meta | fallback gracioso — `2aee1fe` |
| C1 (3-5) | Streaming token-a-token nunca disparava | cabeado ponta a ponta — `68da4f0` |
| C2 (3-5) | Histórico de conversa nunca exibido na UI | `getConversationMessages` + fetch no ChatPanel — `ad19277` |
| C3 (3-5) | "Ver prompt" do Playground disparava LLM real | endpoint dedicado sem LLM — `c198136` |

### Altos
mcpToolsToProviderTools sanitiza schema p/ Gemini/OpenRouter (`dbcf6d1`);
whisper-1 recebe `durationMs` no `calculateCost` (`2347ed4`); `loadHistory` pega
as últimas 20 (`ad19277`); `sanitizeHistoryPairs` mantém pares tool_use/tool_result
íntegros (`ad19277`); rota SSE com gate de role + canal correto (`ad19277`); teto
diário por `userId` real (`37dfa99`); rate limit no endpoint inbound (`c0ec911`).

### Médios
Trava de drift do BI schema verifica colunas (`eafd955`); `TranscriptionUnavailable`
(`d60986e`); `kbEnabled` default alinhado (`ad19277`); índice HNSW em
`kb_documents.embedding` (`7008321`); fallback do `searchKb` sem perder docs
(`f490935`); `sendViaWebhook` propaga falha + timeout (`2aee1fe`); idempotência
gravada após `queue.add` (`37dfa99`).

Achados BAIXO registrados em `docs/RADAR.md` R5.

## 4. Verificação e2e final (ambiente real)

Ambiente: Postgres+pgvector (porta 5436), MCP F4 (porta 3100), worker BullMQ,
dev server (porta 3000); fatos populados (estoque 3281, NF item 211995, etc.).

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ limpo |
| `npx eslint src/` | ✅ 0 erros |
| `npx jest` (config CI) | ✅ 1076/1076, 133 suites |
| `npx next build` | ✅ compilado; rotas `/agente/*` e `/integracoes/*` registradas |
| e2e onda 1 (`verify-f5-onda1`, MOCK_LLM) | ✅ agente responde, `LlmUsage` gravado (1 row) |
| e2e onda 2 (`verify-f5-onda2`) | ✅ 7/7 — normalização E.164 + resolução ok/inactive/unknown |
| e2e onda 4 (`verify-f5-onda4`, HMAC assinado) | ✅ 8/8 — desconhecido/cadastrado/replay/payload inválido |
| HMAC fail-closed (sem webhook) | ✅ 503 |
| HMAC assinatura inválida | ✅ 401 |
| webhook → resolve → fila BullMQ → worker | ✅ job processado (entrega final exige credenciais Meta reais — config de deploy) |

## 5. Pendências conhecidas (não bloqueiam o merge)

- **Entrega de resposta no WhatsApp** exige credenciais reais da Meta
  (WhatsApp Cloud) — configuração de deploy, feita pela área Integrações →
  Canais → WhatsApp. O caminho completo até o enfileiramento foi verificado.
- **LLM real** — as e2e do agente rodaram com `MOCK_LLM`; uma credencial LLM
  real (Anthropic recomendado) é configurada na UI `/agente/configuracao`.
- Teste de integração F4 `bi_consulta_avancada` é sensível à env
  `MCP_BI_DATABASE_URL` (fragilidade pré-existente da F4) — registrado no RADAR.
- Itens BAIXO em `docs/RADAR.md` R5.

## 6. Veredito

A F5 está **completa e verificada**. Escopo entregue por inteiro (F5a–F5f, 7
ondas): agente de IA por WhatsApp e chat in-app, multi-LLM, persistência de
conversas, menu Integrações (superadmin), MCP consumível de fora, RAG com
pgvector. Todos os achados CRÍTICO e ALTO dos reviews foram corrigidos e
re-verificados. `tsc`/`eslint`/`jest`/`build` verdes. Pronta para PR e validação
humana.
