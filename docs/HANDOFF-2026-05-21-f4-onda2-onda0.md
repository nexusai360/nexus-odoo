# HANDOFF — F4 Onda 2, Onda 0 (Fundação MCP Escrita)

> Data: 2026-05-21 · Branch: `feat/f4-onda2-mcp-escrita` · Repo: `github.com/nexusai360/nexus-odoo`

## O que é a F4 Onda 2

Capacidade de **escrita** no Odoo Tauga via servidor MCP, cobrindo todos os módulos
de negócio, com gate de segurança por **API Key com capabilities por módulo × ação**.
Entrega faseada em ondas (Onda 0 = fundação; Ondas 1–7 = módulos).

- **Spec:** `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md` (v3)
- **Plano:** `docs/superpowers/plans/2026-05-20-f4-onda2-onda0-fundacao.md` (v3)
- **Reviews:** `docs/superpowers/specs/reviews/` e `docs/superpowers/plans/reviews/`

## Onda 0 — o que foi implementado

| Bloco | Entrega |
|---|---|
| A | Checklist de validação; deps NPM (lru-cache, json-stable-stringify, pino, ioredis-mock) |
| B | Schema: `ApiKey` estendida, `McpAuditLog` estendida, `McpIdempotencyRecord` novo; migration `20260521001439_f4_onda2_mcp_writes` (+ rollback.sql); script `migrate-scopes` |
| C | `OdooClient` estendido: `create/write/unlink/read/searchRead/fieldsGet/searchIrModelData` + `clientFromEnv(mode)` dual-mode + 9 classes de erro |
| D | Auth middleware externo (Bearer = ApiKey), cache LRU, pub/sub invalidation, CORS, logger pino |
| E | Idempotency middleware + lock distribuído Redis + canonicalização |
| F | Capability check, filtro de catálogo, `WriteToolEntry` |
| G | Rate limit por apiKey |
| H | Worker de sync direcionado + cleanup jobs (idempotency + audit) |
| I | Endpoint `GET /api/mcp/health` |
| J | Tools POC: `crm.res_partner.get` (read) + `crm.res_partner.create` (write) |
| K-O | Painel `Integrações → Servidor MCP` (Visão Geral, Chaves de Acesso, Logs, Documentação) + reorganização de menu (Plugar MCPs → Agente Nex; API REST com "Em breve") |
| P | Testes E2E (1519 passed, 1 skipped — poc-happy-path exige credenciais Odoo) |
| P-0 | Integração do pipeline externo no `mcp/server.ts` (`mcp/dispatcher/external-pipeline.ts`) |
| UI | Auditoria de design com `ui-ux-pro-max` — correções de consistência aplicadas |

**Verificação:** `npm test` 1519 passed / 1 skipped · `tsc` limpo · `npm run build` OK.

## O que falta

1. **Cutover teste → produção:** writes apontam para `grupojht.teste.tauga.online` (`ODOO_WRITE_URL`). Migrar para produção é decisão humana — kill switch `MCP_WRITE_ENABLED=false` por default.
2. **Credenciais Odoo de escrita:** preencher `ODOO_WRITE_USER` / `ODOO_WRITE_PASSWORD` em `.env.local` / `.env.test` para os testes E2E reais (`poc-happy-path` skipa sem elas).
3. **Verificação `mcp_nexus`:** rodar `discovery/check-mcp-nexus-module.py` com credenciais para confirmar que o módulo está livre em `ir.model.data`.
4. **Ondas 1–7:** demais módulos (CRM completo, vendas, estoque, financeiro, fiscal, contábil, produção, RH, projeto) — cada onda reusa a fundação.
5. **Merge:** branch `feat/f4-onda2-mcp-escrita` aguarda code review humano + merge na `main`.

## Próxima sessão

1. Ler `STATUS.md` + este handoff + `AGENTS.md` (protocolo multi-agente).
2. Decidir: abrir PR da Onda 0 e mergear, ou seguir direto para Onda 1 (CRM completo) na mesma branch.
3. Para Ondas 1–7: rodar discovery de write paths do módulo, gerar tools `WriteToolEntry`, testes E2E, review.
